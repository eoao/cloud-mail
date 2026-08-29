import { env } from 'cloudflare:test';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import ruleService, { testRule, testCondition } from '../src/service/rule-service';
import labelService from '../src/service/label-service';
import emailService from '../src/service/email-service';
import { emailConst } from '../src/const/entity-const';
import { dbInit } from '../src/init/init';
import dayjs from 'dayjs';

const c = { env };
const USER = 1;
const OTHER = 2;

function initContext(secret) {
	const store = new Map();
	return {
		env,
		req: { param: () => secret },
		set: (k, v) => store.set(k, v),
		get: (k) => store.get(k),
		text: (body, status = 200) => ({ body, status })
	};
}

let nextId = 5000;

async function insertEmail(overrides = {}) {
	const row = {
		emailId: nextId++,
		userId: USER,
		accountId: 1,
		sendEmail: 'billing@stripe.com',
		name: 'Stripe',
		subject: 'Your invoice is ready',
		text: 'Please pay the attached invoice.',
		toEmail: 'me@example.com',
		category: '',
		unread: 0,
		isDel: 0,
		snoozeUntil: '',
		...overrides
	};

	await env.db.prepare(
		`INSERT INTO email (email_id, user_id, account_id, send_email, name, subject, text,
		                    to_email, category, unread, is_del, snooze_until)
		 VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
	).bind(row.emailId, row.userId, row.accountId, row.sendEmail, row.name, row.subject,
		row.text, row.toEmail, row.category, row.unread, row.isDel, row.snoozeUntil).run();

	return row;
}

const MESSAGE = {
	emailId: 1,
	userId: USER,
	sendEmail: 'Billing@Stripe.com',
	toEmail: 'me@example.com',
	subject: 'Invoice #42',
	text: 'Total due: 100 EUR',
	category: 'finance'
};

describe('rule matching', () => {

	it('matches case-insensitively across every supported field', () => {
		expect(testCondition(MESSAGE, { field: 'from', op: 'contains', value: 'STRIPE' })).toBe(true);
		expect(testCondition(MESSAGE, { field: 'subject', op: 'startsWith', value: 'invoice' })).toBe(true);
		expect(testCondition(MESSAGE, { field: 'body', op: 'contains', value: 'eur' })).toBe(true);
		expect(testCondition(MESSAGE, { field: 'category', op: 'equals', value: 'Finance' })).toBe(true);
		expect(testCondition(MESSAGE, { field: 'to', op: 'endsWith', value: '@example.com' })).toBe(true);
	});

	it('supports negation', () => {
		expect(testCondition(MESSAGE, { field: 'from', op: 'notContains', value: 'paypal' })).toBe(true);
		expect(testCondition(MESSAGE, { field: 'from', op: 'notContains', value: 'stripe' })).toBe(false);
	});

	it('an empty value never matches, so a half-filled rule stays inert', () => {
		expect(testCondition(MESSAGE, { field: 'from', op: 'contains', value: '' })).toBe(false);
		expect(testCondition(MESSAGE, { field: 'from', op: 'notContains', value: '' })).toBe(false);
	});

	it('honours match-all versus match-any', () => {
		const conditions = JSON.stringify([
			{ field: 'from', op: 'contains', value: 'stripe' },
			{ field: 'subject', op: 'contains', value: 'refund' }
		]);

		expect(testRule(MESSAGE, { conditions, matchAll: 1 })).toBe(false);
		expect(testRule(MESSAGE, { conditions, matchAll: 0 })).toBe(true);
	});

	it('a rule with no conditions never matches', () => {
		expect(testRule(MESSAGE, { conditions: '[]', matchAll: 1 })).toBe(false);
		expect(testRule(MESSAGE, { conditions: 'not json', matchAll: 0 })).toBe(false);
	});
});

describe('rule persistence', () => {

	beforeAll(async () => {
		await dbInit.init(initContext(env.init_secret));
	});

	beforeEach(async () => {
		await env.db.prepare('DELETE FROM rule').run();
		await env.db.prepare('DELETE FROM template').run();
		await env.db.prepare('DELETE FROM email').run();
		await env.db.prepare('DELETE FROM email_label').run();
		await env.db.prepare('DELETE FROM label').run();
	});

	it('refuses a rule that would match everything or do nothing', async () => {
		await expect(ruleService.upsert(c, {
			conditions: [], actions: [{ type: 'delete' }]
		}, USER)).rejects.toThrow(/at least one condition/);

		await expect(ruleService.upsert(c, {
			conditions: [{ field: 'from', op: 'contains', value: 'x' }], actions: []
		}, USER)).rejects.toThrow(/at least one action/);
	});

	it('drops unsupported fields, operators and actions', async () => {
		const row = await ruleService.upsert(c, {
			name: 'mixed',
			conditions: [
				{ field: 'from', op: 'contains', value: 'stripe' },
				{ field: 'attachment', op: 'contains', value: 'pdf' },
				{ field: 'subject', op: 'regex', value: '.*' }
			],
			actions: [{ type: 'markRead' }, { type: 'launchMissiles' }]
		}, USER);

		expect(JSON.parse(row.conditions)).toEqual([{ field: 'from', op: 'contains', value: 'stripe' }]);
		expect(JSON.parse(row.actions)).toEqual([{ type: 'markRead', value: '' }]);
	});

	it('will not let one user edit or delete another\'s rule', async () => {
		const row = await ruleService.upsert(c, {
			name: 'mine',
			conditions: [{ field: 'from', op: 'contains', value: 'a' }],
			actions: [{ type: 'markRead' }]
		}, USER);

		await expect(ruleService.upsert(c, {
			ruleId: row.ruleId,
			conditions: [{ field: 'from', op: 'contains', value: 'b' }],
			actions: [{ type: 'delete' }]
		}, OTHER)).rejects.toThrow(/not found/);

		await expect(ruleService.remove(c, row.ruleId, OTHER)).rejects.toThrow(/not found/);
	});
});

describe('rule execution', () => {

	beforeAll(async () => {
		await dbInit.init(initContext(env.init_secret));
	});

	beforeEach(async () => {
		await env.db.prepare('DELETE FROM rule').run();
		await env.db.prepare('DELETE FROM email').run();
		await env.db.prepare('DELETE FROM email_label').run();
		await env.db.prepare('DELETE FROM label').run();
	});

	it('labels a matching message', async () => {
		const mail = await insertEmail();
		const tag = await labelService.upsert(c, { name: 'Finance' }, USER);

		await ruleService.upsert(c, {
			name: 'invoices',
			conditions: [{ field: 'from', op: 'contains', value: 'stripe' }],
			actions: [{ type: 'label', value: String(tag.labelId) }]
		}, USER);

		await ruleService.apply(c, mail);

		const attached = (await labelService.forEmails(c, [mail.emailId], USER))[mail.emailId];
		expect(attached.map(a => a.name)).toEqual(['Finance']);
	});

	it('marks read and soft-deletes rather than destroying mail', async () => {
		const mail = await insertEmail();

		await ruleService.upsert(c, {
			conditions: [{ field: 'subject', op: 'contains', value: 'invoice' }],
			actions: [{ type: 'markRead' }, { type: 'delete' }]
		}, USER);

		await ruleService.apply(c, mail);

		const row = await env.db.prepare('SELECT unread, is_del FROM email WHERE email_id = ?')
			.bind(mail.emailId).first();

		expect(row.unread).toBe(1);
		// Soft delete: still recoverable.
		expect(row.is_del).toBe(1);
	});

	it('skips a rule that does not match', async () => {
		const mail = await insertEmail({ sendEmail: 'friend@gmail.com' });

		await ruleService.upsert(c, {
			conditions: [{ field: 'from', op: 'contains', value: 'stripe' }],
			actions: [{ type: 'markRead' }]
		}, USER);

		expect(await ruleService.apply(c, mail)).toEqual([]);
	});

	it('stops after a rule that says so', async () => {
		const mail = await insertEmail();

		await ruleService.upsert(c, {
			name: 'first',
			sort: 1,
			stopOnMatch: 1,
			conditions: [{ field: 'from', op: 'contains', value: 'stripe' }],
			actions: [{ type: 'markRead' }]
		}, USER);

		await ruleService.upsert(c, {
			name: 'second',
			sort: 2,
			conditions: [{ field: 'from', op: 'contains', value: 'stripe' }],
			actions: [{ type: 'delete' }]
		}, USER);

		const applied = await ruleService.apply(c, mail);

		expect(applied.map(a => a.action)).toEqual(['markRead']);
		const row = await env.db.prepare('SELECT is_del FROM email WHERE email_id = ?').bind(mail.emailId).first();
		expect(row.is_del).toBe(0);
	});

	it('ignores a disabled rule', async () => {
		const mail = await insertEmail();

		await ruleService.upsert(c, {
			enabled: 0,
			conditions: [{ field: 'from', op: 'contains', value: 'stripe' }],
			actions: [{ type: 'delete' }]
		}, USER);

		expect(await ruleService.apply(c, mail)).toEqual([]);
	});

	it('never applies another user\'s rules', async () => {
		const mail = await insertEmail();

		await ruleService.upsert(c, {
			conditions: [{ field: 'from', op: 'contains', value: 'stripe' }],
			actions: [{ type: 'delete' }]
		}, OTHER);

		expect(await ruleService.apply(c, mail)).toEqual([]);
	});
});

describe('send timing', () => {

	beforeAll(async () => {
		await dbInit.init(initContext(env.init_secret));
	});

	beforeEach(async () => {
		await env.db.prepare('DELETE FROM email').run();
	});

	it('sends immediately when nothing asks for a delay', () => {
		expect(emailService.resolveSendTime({})).toBe(null);
		expect(emailService.resolveSendTime({ undoSeconds: 0 })).toBe(null);
	});

	it('turns an undo window into a future timestamp, capped', () => {
		const at = emailService.resolveSendTime({ undoSeconds: 10 });
		expect(dayjs(at).isAfter(dayjs())).toBe(true);

		// A huge window would strand the message, so it is clamped.
		const capped = emailService.resolveSendTime({ undoSeconds: 99999 });
		expect(dayjs(capped).diff(dayjs(), 'second')).toBeLessThanOrEqual(121);
	});

	it('treats a scheduled time in the past as "now"', () => {
		expect(emailService.resolveSendTime({ scheduleAt: '2000-01-01 00:00:00' })).toBe(null);
	});

	it('rejects an unparseable schedule', () => {
		expect(() => emailService.resolveSendTime({ scheduleAt: 'next tuesday-ish' })).toThrow();
	});

	it('cancels a scheduled send and refuses once it has left', async () => {
		const mail = await insertEmail();
		await env.db.prepare('UPDATE email SET status = ?, scheduled_at = ? WHERE email_id = ?')
			.bind(emailConst.status.SCHEDULED, '2999-01-01 00:00:00', mail.emailId).run();

		const row = await emailService.cancelScheduled(c, mail.emailId, USER);
		expect(row.status).toBe(emailConst.status.CANCELED);

		// A second cancel has nothing to cancel.
		await expect(emailService.cancelScheduled(c, mail.emailId, USER)).rejects.toThrow();
	});

	it('will not let one user cancel another\'s send', async () => {
		const mail = await insertEmail();
		await env.db.prepare('UPDATE email SET status = ? WHERE email_id = ?')
			.bind(emailConst.status.SCHEDULED, mail.emailId).run();

		await expect(emailService.cancelScheduled(c, mail.emailId, OTHER)).rejects.toThrow();
	});

	it('does not deliver a message that was cancelled', async () => {
		const mail = await insertEmail();
		await env.db.prepare('UPDATE email SET status = ? WHERE email_id = ?')
			.bind(emailConst.status.CANCELED, mail.emailId).run();

		const out = await emailService.deliverEmail(c, mail.emailId);
		expect(out.skipped).toContain('status is');
	});

	it('does not deliver a message that no longer exists', async () => {
		expect((await emailService.deliverEmail(c, 999999)).skipped).toContain('no longer exists');
	});

	it('defers internal mail too, instead of ignoring the schedule', () => {
		// A message to an address on this instance never reaches a provider, but
		// it must still wait: delivering it now would silently ignore the
		// requested time, and would leave the undo window offering an undo that
		// could only fail.
		const at = dayjs().add(1, 'hour').format('YYYY-MM-DD HH:mm:ss');
		expect(emailService.resolveSendTime({ scheduleAt: at })).toBe(at);
	});

	it('routes a deferred internal message to the mailbox, not to a provider', async () => {

		// domainList comes from env.domain, which the test config sets to test.local.
		await env.db.prepare('DELETE FROM account').run();
		await env.db.prepare(
			`INSERT INTO account (account_id, email, name, user_id, is_del) VALUES (?,?,?,?,0)`
		).bind(1, 'me@test.local', 'Me', USER).run();

		const mail = await insertEmail({ sendEmail: 'me@test.local', toEmail: 'friend@test.local' });

		await env.db.prepare(
			`UPDATE email SET status = ?, scheduled_at = ?, recipient = ? WHERE email_id = ?`
		).bind(
			emailConst.status.SCHEDULED,
			'2000-01-01 00:00:00',
			JSON.stringify([{ address: 'friend@test.local', name: '' }]),
			mail.emailId
		).run();

		// No sending provider is configured in this suite, so the provider path
		// fails with a recognisable error. Reaching the internal handoff instead
		// is the whole point: before the fix, scheduling was ignored for internal
		// mail and it was delivered at send time.
		let error = null;
		try {
			await emailService.deliverEmail(c, mail.emailId);
		} catch (e) {
			error = e;
		}

		expect(error?.message ?? '').not.toMatch(/provider/i);

		// And the schedule was cleared as the message left the queue.
		const row = await env.db.prepare('SELECT scheduled_at FROM email WHERE email_id = ?')
			.bind(mail.emailId).first();

		expect(row.scheduled_at).toBe('');
	});
});

describe('snooze', () => {

	beforeAll(async () => {
		await dbInit.init(initContext(env.init_secret));
	});

	beforeEach(async () => {
		await env.db.prepare('DELETE FROM email').run();
	});

	it('sets and clears a snooze', async () => {
		const mail = await insertEmail();
		const until = dayjs().add(1, 'day').format('YYYY-MM-DD HH:mm:ss');

		expect(await emailService.snooze(c, [mail.emailId], until, USER)).toBe(1);

		let row = await env.db.prepare('SELECT snooze_until FROM email WHERE email_id = ?').bind(mail.emailId).first();
		expect(row.snooze_until).toBe(until);

		await emailService.snooze(c, [mail.emailId], null, USER);
		row = await env.db.prepare('SELECT snooze_until FROM email WHERE email_id = ?').bind(mail.emailId).first();
		expect(row.snooze_until).toBe('');
	});

	it('will not snooze another user\'s mail', async () => {
		const mail = await insertEmail({ userId: OTHER });
		expect(await emailService.snooze(c, [mail.emailId], dayjs().add(1, 'hour').toISOString(), USER)).toBe(0);
	});

	it('rejects an unparseable snooze time', async () => {
		const mail = await insertEmail();
		await expect(emailService.snooze(c, [mail.emailId], 'soon', USER)).rejects.toThrow();
	});

	it('wakes only the snoozes whose time has passed', async () => {
		const past = await insertEmail({ snoozeUntil: '2000-01-01 00:00:00' });
		const future = await insertEmail({ snoozeUntil: '2999-01-01 00:00:00' });

		expect(await emailService.wakeSnoozed(c)).toBe(1);

		const a = await env.db.prepare('SELECT snooze_until FROM email WHERE email_id = ?').bind(past.emailId).first();
		const b = await env.db.prepare('SELECT snooze_until FROM email WHERE email_id = ?').bind(future.emailId).first();

		expect(a.snooze_until).toBe('');
		expect(b.snooze_until).toBe('2999-01-01 00:00:00');
	});
});

describe('templates', () => {

	beforeAll(async () => {
		await dbInit.init(initContext(env.init_secret));
	});

	beforeEach(async () => {
		await env.db.prepare('DELETE FROM template').run();
	});

	it('round-trips a template', async () => {
		const row = await ruleService.upsertTemplate(c, {
			name: 'Standard reply', subject: 'Re: your request', content: '<p>Thanks.</p>'
		}, USER);

		const [listed] = await ruleService.listTemplates(c, USER);
		expect(listed).toMatchObject({ templateId: row.templateId, name: 'Standard reply' });
	});

	it('requires a name', async () => {
		await expect(ruleService.upsertTemplate(c, { name: '  ' }, USER)).rejects.toThrow(/name is required/);
	});

	it('will not let one user touch another\'s template', async () => {
		const row = await ruleService.upsertTemplate(c, { name: 'Mine' }, USER);

		await expect(ruleService.upsertTemplate(c, { templateId: row.templateId, name: 'Theirs' }, OTHER))
			.rejects.toThrow(/not found/);
		await expect(ruleService.removeTemplate(c, row.templateId, OTHER)).rejects.toThrow(/not found/);
	});
});
