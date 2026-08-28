import orm from '../../entity/orm';
import { aiProvider, aiTaskBinding } from '../../entity/ai-provider';
import { and, asc, desc, eq } from 'drizzle-orm';
import dayjs from 'dayjs';
import { getAiDriver, listAiDrivers } from './providers';
import { getTask, listTasks } from './tasks';
import './task-defs';

// AI routing.
//
// A task is bound to a provider (ai_task_binding), falling back to the highest
// priority enabled provider, falling back again to Workers AI - which is on the
// Cloudflare free plan, so every feature works before any external key exists.
//
// Callers on the request path should NOT use run() directly for anything slow;
// enqueue an ai job instead (src/job/handlers.js) so the 10ms CPU budget and
// the daily neuron quota are not spent inside a user's request.

const today = () => dayjs().format('YYYY-MM-DD');

const WORKERS_AI_FALLBACK = {
	aiId: 0,
	name: 'Workers AI (default)',
	type: 'workers-ai',
	baseUrl: '',
	apiKey: '',
	model: '',
	enabled: 1,
	priority: -100,
	dailyCallLimit: 0,
	usedToday: 0,
	usedDate: ''
};

const aiRouter = {

	listDrivers: listAiDrivers,
	listTasks,

	async listProviders(c) {
		const rows = await orm(c).select().from(aiProvider)
			.orderBy(desc(aiProvider.priority), asc(aiProvider.aiId)).all();

		// Never return a key to the browser.
		return rows.map(row => ({ ...row, apiKey: mask(row.apiKey) }));
	},

	async upsertProvider(c, params) {
		const { aiId, name, type, baseUrl = '', apiKey, model = '', enabled = 1, priority = 0, dailyCallLimit = 0 } = params;

		const driver = getAiDriver(type);

		if (!driver) {
			throw new Error(`unknown AI provider type "${type}"`);
		}

		const values = {
			name: name || driver.label,
			type,
			baseUrl,
			model,
			enabled: Number(enabled) ? 1 : 0,
			priority: Number(priority) || 0,
			dailyCallLimit: Number(dailyCallLimit) || 0
		};

		// An omitted key means "keep the stored one", so the UI can save a row it
		// only ever saw masked.
		if (apiKey) {
			values.apiKey = apiKey;
		}

		if (aiId) {
			return orm(c).update(aiProvider).set(values).where(eq(aiProvider.aiId, Number(aiId))).returning().get();
		}

		return orm(c).insert(aiProvider).values({ apiKey: '', ...values }).returning().get();
	},

	async removeProvider(c, aiId) {
		await orm(c).delete(aiTaskBinding).where(eq(aiTaskBinding.aiId, Number(aiId))).run();
		return orm(c).delete(aiProvider).where(eq(aiProvider.aiId, Number(aiId))).returning().get();
	},

	async listBindings(c) {
		return orm(c).select().from(aiTaskBinding).all();
	},

	async bindTask(c, task, aiId) {

		if (!getTask(task)) {
			throw new Error(`unknown AI task "${task}"`);
		}

		await orm(c).delete(aiTaskBinding).where(eq(aiTaskBinding.task, task)).run();

		if (!aiId) {
			return null;
		}

		return orm(c).insert(aiTaskBinding).values({ task, aiId: Number(aiId) }).returning().get();
	},

	/** Provider to use for a task, honouring the binding then priority then quota. */
	async resolveProvider(c, task) {

		const binding = await orm(c).select().from(aiTaskBinding).where(eq(aiTaskBinding.task, task)).get();

		if (binding) {
			const bound = await orm(c).select().from(aiProvider)
				.where(and(eq(aiProvider.aiId, binding.aiId), eq(aiProvider.enabled, 1))).get();

			if (bound && hasQuota(bound)) {
				return bound;
			}
		}

		const rows = await orm(c).select().from(aiProvider)
			.where(eq(aiProvider.enabled, 1))
			.orderBy(desc(aiProvider.priority), asc(aiProvider.aiId)).all();

		const usable = rows.find(hasQuota);

		if (usable) {
			return usable;
		}

		// Nothing configured (or everything exhausted): fall back to the free
		// Workers AI binding when it exists.
		return c.env.ai ? WORKERS_AI_FALLBACK : null;
	},

	/**
	 * Run one task. Returns { ok, result, provider } - it never throws for a
	 * provider failure, because AI is an enhancement and must not break mail
	 * delivery or a user's send.
	 */
	async run(c, taskName, input = {}) {

		const task = getTask(taskName);

		if (!task) {
			return { ok: false, error: `unknown AI task "${taskName}"` };
		}

		const row = await this.resolveProvider(c, taskName);

		if (!row) {
			return { ok: false, error: 'no AI provider available' };
		}

		const driver = getAiDriver(row.type);

		if (!driver) {
			return { ok: false, error: `unknown AI provider type "${row.type}"` };
		}

		if (driver.available && !driver.available(c)) {
			return { ok: false, error: `${row.type} is configured but unavailable` };
		}

		if (driver.needsApiKey && !row.apiKey) {
			return { ok: false, error: `${row.type} has no API key` };
		}

		try {
			const text = await driver.chat(c, row, {
				system: task.system,
				user: task.user(input),
				maxTokens: task.maxTokens,
				temperature: task.temperature,
				json: task.json === true
			});

			await this.recordUse(c, row);

			const result = task.parse ? task.parse(text) : text;

			return { ok: true, result, provider: row.type, model: row.model || driver.defaultModel };
		} catch (e) {
			await this.recordError(c, row, e.message);
			console.warn(`ai task ${taskName} failed on ${row.type}:`, e.message);
			return { ok: false, error: e.message, provider: row.type };
		}
	},

	async recordUse(c, row) {
		if (!row.aiId) return; // the built-in fallback has no row to update

		const date = today();
		const usedToday = row.usedDate === date ? row.usedToday + 1 : 1;

		await orm(c).update(aiProvider)
			.set({ usedToday, usedDate: date, lastError: '' })
			.where(eq(aiProvider.aiId, row.aiId)).run();
	},

	async recordError(c, row, message) {
		if (!row.aiId) return;

		await orm(c).update(aiProvider)
			.set({ lastError: String(message).slice(0, 500) })
			.where(eq(aiProvider.aiId, row.aiId)).run();
	}
};

function hasQuota(row) {
	if (!row.dailyCallLimit) return true;
	if (row.usedDate !== today()) return true;
	return row.usedToday < row.dailyCallLimit;
}

function mask(value) {
	if (!value) return '';
	return `${value.slice(0, 4)}${'*'.repeat(Math.max(0, Math.min(value.length - 4, 12)))}`;
}

export default aiRouter;
