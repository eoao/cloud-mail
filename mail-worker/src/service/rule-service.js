import orm from '../entity/orm';
import { rule, template } from '../entity/rule';
import email from '../entity/email';
import { and, asc, eq } from 'drizzle-orm';
import labelService from './label-service';
import BizError from '../error/biz-error';

// Per-user inbound rules.
//
// The vocabulary is deliberately tiny and validated on write, so evaluation is
// a pure function over known shapes - no user-supplied code, no dynamic field
// lookup, nothing that can reach outside the message being evaluated.

const FIELDS = ['from', 'to', 'subject', 'body', 'category'];
const OPS = ['contains', 'equals', 'startsWith', 'endsWith', 'notContains'];
const ACTIONS = ['label', 'move', 'markRead', 'star', 'delete', 'snooze'];

function fieldValue(message, field) {
	switch (field) {
		case 'from': return message.sendEmail ?? '';
		case 'to': return message.toEmail ?? '';
		case 'subject': return message.subject ?? '';
		case 'body': return message.text ?? message.content ?? '';
		case 'category': return message.category ?? '';
		default: return '';
	}
}

/** Evaluate one condition. Matching is case-insensitive, like every mail client. */
export function testCondition(message, condition) {

	const haystack = String(fieldValue(message, condition.field)).toLowerCase();
	const needle = String(condition.value ?? '').toLowerCase();

	if (!needle) {
		return false;
	}

	switch (condition.op) {
		case 'contains': return haystack.includes(needle);
		case 'notContains': return !haystack.includes(needle);
		case 'equals': return haystack === needle;
		case 'startsWith': return haystack.startsWith(needle);
		case 'endsWith': return haystack.endsWith(needle);
		default: return false;
	}
}

export function testRule(message, ruleRow) {

	const conditions = parseJson(ruleRow.conditions, []);

	// A rule with no conditions would match everything, which is never what the
	// author meant; validation rejects it on write and this is the second guard.
	if (conditions.length === 0) {
		return false;
	}

	return ruleRow.matchAll
		? conditions.every(cond => testCondition(message, cond))
		: conditions.some(cond => testCondition(message, cond));
}

function parseJson(raw, fallback) {
	try {
		const parsed = JSON.parse(raw ?? '');
		return Array.isArray(parsed) ? parsed : fallback;
	} catch {
		return fallback;
	}
}

function validateConditions(conditions) {

	const clean = (Array.isArray(conditions) ? conditions : [])
		.filter(cond => FIELDS.includes(cond?.field) && OPS.includes(cond?.op) && String(cond?.value ?? '').length > 0)
		.slice(0, 10)
		.map(cond => ({ field: cond.field, op: cond.op, value: String(cond.value).slice(0, 200) }));

	if (clean.length === 0) {
		throw new BizError('a rule needs at least one condition', 400);
	}

	return clean;
}

function validateActions(actions) {

	const clean = (Array.isArray(actions) ? actions : [])
		.filter(a => ACTIONS.includes(a?.type))
		.slice(0, 5)
		.map(a => ({ type: a.type, value: a.value === undefined ? '' : String(a.value).slice(0, 200) }));

	if (clean.length === 0) {
		throw new BizError('a rule needs at least one action', 400);
	}

	return clean;
}

const ruleService = {

	testRule,
	testCondition,

	vocabulary() {
		return { fields: FIELDS, ops: OPS, actions: ACTIONS };
	},

	async list(c, userId) {
		const rows = await orm(c).select().from(rule)
			.where(eq(rule.userId, userId))
			.orderBy(asc(rule.sort), asc(rule.ruleId)).all();

		return rows.map(row => ({
			...row,
			conditions: parseJson(row.conditions, []),
			actions: parseJson(row.actions, [])
		}));
	},

	async upsert(c, params, userId) {

		const values = {
			name: String(params.name ?? '').slice(0, 80),
			conditions: JSON.stringify(validateConditions(params.conditions)),
			actions: JSON.stringify(validateActions(params.actions)),
			matchAll: Number(params.matchAll) ? 1 : 0,
			stopOnMatch: Number(params.stopOnMatch) ? 1 : 0,
			enabled: Number(params.enabled ?? 1) ? 1 : 0,
			sort: Number(params.sort) || 0
		};

		if (params.ruleId) {
			const row = await orm(c).update(rule).set(values)
				.where(and(eq(rule.ruleId, Number(params.ruleId)), eq(rule.userId, userId)))
				.returning().get();

			if (!row) {
				throw new BizError('rule not found', 404);
			}

			return row;
		}

		return orm(c).insert(rule).values({ ...values, userId }).returning().get();
	},

	async remove(c, ruleId, userId) {
		const row = await orm(c).delete(rule)
			.where(and(eq(rule.ruleId, Number(ruleId)), eq(rule.userId, userId)))
			.returning().get();

		if (!row) {
			throw new BizError('rule not found', 404);
		}

		return row;
	},

	/**
	 * Run every enabled rule against one received message.
	 *
	 * Called from the queue, not the inbound handler: a rule can touch several
	 * tables and the SMTP transaction should not wait on it.
	 */
	async apply(c, message) {

		const rows = await orm(c).select().from(rule)
			.where(and(eq(rule.userId, message.userId), eq(rule.enabled, 1)))
			.orderBy(asc(rule.sort), asc(rule.ruleId)).all();

		const applied = [];

		for (const ruleRow of rows) {

			if (!testRule(message, ruleRow)) {
				continue;
			}

			for (const action of parseJson(ruleRow.actions, [])) {
				await this.runAction(c, message, action);
				applied.push({ ruleId: ruleRow.ruleId, action: action.type });
			}

			if (ruleRow.stopOnMatch) {
				break;
			}
		}

		return applied;
	},

	async runAction(c, message, action) {

		switch (action.type) {

			case 'label':
			case 'move': {
				const labelId = Number(action.value);
				if (!labelId) return;
				await labelService.assign(c, { emailIds: [message.emailId], labelId }, message.userId);
				return;
			}

			case 'markRead':
				await orm(c).update(email).set({ unread: 1 })
					.where(eq(email.emailId, message.emailId)).run();
				return;

			case 'delete':
				// Soft delete only - a rule must never destroy mail outright.
				await orm(c).update(email).set({ isDel: 1 })
					.where(eq(email.emailId, message.emailId)).run();
				return;

			case 'snooze':
				await orm(c).update(email).set({ snoozeUntil: String(action.value ?? '') })
					.where(eq(email.emailId, message.emailId)).run();
				return;

			case 'star':
				// Starring lives in its own table and is handled by star-service;
				// skipped here rather than half-implemented.
				return;

			default:
				return;
		}
	},

	// ---- templates ------------------------------------------------------

	async listTemplates(c, userId) {
		return orm(c).select().from(template)
			.where(eq(template.userId, userId))
			.orderBy(asc(template.templateId)).all();
	},

	async upsertTemplate(c, params, userId) {

		if (!params.name?.trim()) {
			throw new BizError('name is required', 400);
		}

		const values = {
			name: params.name.trim().slice(0, 80),
			subject: String(params.subject ?? '').slice(0, 300),
			content: String(params.content ?? '').slice(0, 50000)
		};

		if (params.templateId) {
			const row = await orm(c).update(template).set(values)
				.where(and(eq(template.templateId, Number(params.templateId)), eq(template.userId, userId)))
				.returning().get();

			if (!row) {
				throw new BizError('template not found', 404);
			}

			return row;
		}

		return orm(c).insert(template).values({ ...values, userId }).returning().get();
	},

	async removeTemplate(c, templateId, userId) {
		const row = await orm(c).delete(template)
			.where(and(eq(template.templateId, Number(templateId)), eq(template.userId, userId)))
			.returning().get();

		if (!row) {
			throw new BizError('template not found', 404);
		}

		return row;
	}
};

export default ruleService;
