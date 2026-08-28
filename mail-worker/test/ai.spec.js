import { env } from 'cloudflare:test';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import aiRouter from '../src/service/ai';
import { aiDrivers, listAiDrivers } from '../src/service/ai/providers';
import { getTask, listTasks, extractJson } from '../src/service/ai/tasks';
import '../src/service/ai/task-defs';
import { dbInit } from '../src/init/init';
import dayjs from 'dayjs';

const c = { env };

// Match the router's own notion of "today" - it formats in local time, so a
// UTC-derived date silently disagrees for part of every day.
const todayStr = () => dayjs().format('YYYY-MM-DD');

// The Workers AI binding cannot start under local miniflare, so stub it where a
// test needs to observe the "fall back to Workers AI" path.
const withAiBinding = { env: new Proxy(env, { get: (t, p) => (p === 'ai' ? {} : t[p]) }) };

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

/** Replace a driver's transport so tests never reach the network. */
function stubDriver(key, chat, extra = {}) {
	aiDrivers[key] = { key, label: key, defaultModel: 'stub', needsApiKey: false, chat, ...extra };
}

describe('ai task catalogue', () => {

	it('exposes every group the UI offers', () => {
		const groups = new Set(listTasks().map(t => t.group));
		expect([...groups].sort()).toEqual(['agent', 'reading', 'security', 'writing']);
	});

	it('parses JSON even when the model wraps it in prose', () => {
		expect(extractJson('Sure! {"code":"1234"} hope that helps')).toEqual({ code: '1234' });
		expect(extractJson('no json here')).toBe(null);
	});

	it('rejects a verification code that is too long or has spaces', () => {
		const task = getTask('extract_code');
		expect(task.parse('{"code":"123456"}')).toBe('123456');
		expect(task.parse('{"code":"123456789"}')).toBe('');
		expect(task.parse('{"code":"12 34"}')).toBe('');
		expect(task.parse('garbage')).toBe('');
	});

	it('clamps a spam score and falls back to a safe verdict', () => {
		const task = getTask('spam_score');
		expect(task.parse('{"score":900,"verdict":"nonsense","reasons":[]}'))
			.toMatchObject({ score: 100, verdict: 'ham' });
		expect(task.parse('{"score":-5,"verdict":"phishing"}'))
			.toMatchObject({ score: 0, verdict: 'phishing' });
	});

	it('normalises an unknown category to "other"', () => {
		expect(getTask('categorize').parse('{"category":"aliens","priority":50}'))
			.toMatchObject({ category: 'other', priority: 50, needsReply: false });
	});

	it('refuses a generated rule that would match every message', () => {
		const task = getTask('rule_from_text');
		expect(task.parse('{"conditions":[],"actions":[{"type":"delete"}]}')).toBe(null);
		expect(task.parse('{"conditions":[{"field":"from","op":"contains","value":"bank"}],"actions":[]}')).toBe(null);
	});

	it('drops unsupported fields and actions from a generated rule', () => {
		const parsed = getTask('rule_from_text').parse(JSON.stringify({
			conditions: [
				{ field: 'from', op: 'contains', value: 'invoice@' },
				{ field: 'attachment', op: 'contains', value: 'pdf' }
			],
			actions: [{ type: 'move', value: 'Finance' }, { type: 'launchMissiles' }]
		}));

		expect(parsed.conditions).toHaveLength(1);
		expect(parsed.actions).toEqual([{ type: 'move', value: 'Finance' }]);
	});

	it('keeps only three reply suggestions', () => {
		const parsed = getTask('reply_suggest').parse('{"replies":["a","b","c","d","e"]}');
		expect(parsed).toEqual(['a', 'b', 'c']);
	});

	it('builds a rewrite prompt that names the requested mode', () => {
		const prompt = getTask('rewrite').user({ text: 'hi there', mode: 'formal' });
		expect(prompt).toContain('formal');
		expect(prompt).toContain('hi there');
	});
});

describe('ai routing', () => {

	beforeAll(async () => {
		await dbInit.init(initContext(env.init_secret));
	});

	beforeEach(async () => {
		await env.db.prepare('DELETE FROM ai_provider').run();
		await env.db.prepare('DELETE FROM ai_task_binding').run();
	});

	it('creates the ai tables', async () => {
		const { results } = await env.db.prepare(
			`SELECT name FROM sqlite_master WHERE name IN ('ai_provider','ai_task_binding')`
		).all();
		expect(results.map(r => r.name).sort()).toEqual(['ai_provider', 'ai_task_binding']);
	});

	it('lists a driver for every provider type the UI offers', () => {
		const keys = listAiDrivers().map(d => d.key);
		expect(keys).toEqual(expect.arrayContaining(['workers-ai', 'openai', 'deepseek', 'anthropic', 'custom']));
	});

	it('falls back to Workers AI when nothing is configured', async () => {
		const row = await aiRouter.resolveProvider(withAiBinding, 'summarize');
		expect(row.type).toBe('workers-ai');
		expect(row.aiId).toBe(0);
	});

	it('reports no provider when nothing is configured and Workers AI is absent', async () => {
		expect(await aiRouter.resolveProvider(c, 'summarize')).toBe(null);

		const outcome = await aiRouter.run(c, 'summarize', { subject: 's', body: 'b' });
		expect(outcome).toMatchObject({ ok: false, error: 'no AI provider available' });
	});

	it('prefers the highest priority provider', async () => {
		await aiRouter.upsertProvider(c, { type: 'openai', apiKey: 'k', priority: 1 });
		await aiRouter.upsertProvider(c, { type: 'deepseek', apiKey: 'k', priority: 9 });

		expect((await aiRouter.resolveProvider(c, 'summarize')).type).toBe('deepseek');
	});

	it('a task binding overrides priority', async () => {
		const low = await aiRouter.upsertProvider(c, { type: 'openai', apiKey: 'k', priority: 1 });
		await aiRouter.upsertProvider(c, { type: 'deepseek', apiKey: 'k', priority: 9 });

		await aiRouter.bindTask(c, 'summarize', low.aiId);

		expect((await aiRouter.resolveProvider(c, 'summarize')).type).toBe('openai');
		// Unbound tasks still follow priority.
		expect((await aiRouter.resolveProvider(c, 'draft')).type).toBe('deepseek');
	});

	it('rejects binding an unknown task', async () => {
		await expect(aiRouter.bindTask(c, 'not_a_task', 1)).rejects.toThrow(/unknown AI task/);
	});

	it('skips a provider that has spent its daily calls', async () => {
		const row = await aiRouter.upsertProvider(c, { type: 'openai', apiKey: 'k', priority: 9, dailyCallLimit: 1 });
		await aiRouter.upsertProvider(c, { type: 'deepseek', apiKey: 'k', priority: 1 });

		await env.db.prepare('UPDATE ai_provider SET used_today = 1, used_date = ? WHERE ai_id = ?')
			.bind(todayStr(), row.aiId).run();

		expect((await aiRouter.resolveProvider(c, 'summarize')).type).toBe('deepseek');
	});

	it('masks api keys when listing but still sends the real one', async () => {
		await aiRouter.upsertProvider(c, { type: 'openai', apiKey: 'sk-supersecretkey', priority: 9 });

		const [listed] = await aiRouter.listProviders(c);
		expect(listed.apiKey).not.toContain('supersecret');

		let seen = null;
		stubDriver('openai', async (_c, row) => {
			seen = row.apiKey;
			return '{"code":"1234"}';
		}, { needsApiKey: true });

		await aiRouter.run(c, 'extract_code', { subject: 's', body: 'b' });
		expect(seen).toBe('sk-supersecretkey');
	});

	it('saving without an api key keeps the stored one', async () => {
		const row = await aiRouter.upsertProvider(c, { type: 'openai', apiKey: 'keep-me' });
		await aiRouter.upsertProvider(c, { aiId: row.aiId, type: 'openai', priority: 5 });

		let seen = null;
		stubDriver('openai', async (_c, r) => { seen = r.apiKey; return 'ok'; }, { needsApiKey: true });

		await aiRouter.run(c, 'translate', { text: 'hi', target: 'de' });
		expect(seen).toBe('keep-me');
	});

	it('returns a failure instead of throwing when the provider errors', async () => {
		await aiRouter.upsertProvider(c, { type: 'openai', apiKey: 'k', priority: 9 });
		stubDriver('openai', async () => { throw new Error('429 rate limited'); }, { needsApiKey: true });

		const outcome = await aiRouter.run(c, 'summarize', { subject: 's', body: 'b' });

		expect(outcome.ok).toBe(false);
		expect(outcome.error).toContain('rate limited');

		// The error is stored so the admin panel can show it.
		const [listed] = await aiRouter.listProviders(c);
		expect(listed.lastError).toContain('rate limited');
	});

	it('counts a successful call against the daily quota', async () => {
		await aiRouter.upsertProvider(c, { type: 'openai', apiKey: 'k', dailyCallLimit: 5 });
		stubDriver('openai', async () => 'bonjour', { needsApiKey: true });

		await aiRouter.run(c, 'translate', { text: 'hello', target: 'fr' });
		await aiRouter.run(c, 'translate', { text: 'hello', target: 'fr' });

		const [listed] = await aiRouter.listProviders(c);
		expect(listed.usedToday).toBe(2);
	});

	it('refuses a provider that needs a key but has none', async () => {
		await env.db.prepare(
			`INSERT INTO ai_provider (name, type, api_key, enabled, priority) VALUES ('x','openai','',1,9)`
		).run();
		stubDriver('openai', async () => 'should not run', { needsApiKey: true });

		const outcome = await aiRouter.run(c, 'translate', { text: 'hi', target: 'fr' });
		expect(outcome.ok).toBe(false);
		expect(outcome.error).toContain('no API key');
	});

	it('reports an unknown task rather than calling a model', async () => {
		const outcome = await aiRouter.run(c, 'nope', {});
		expect(outcome).toMatchObject({ ok: false });
		expect(outcome.error).toContain('unknown AI task');
	});

	it('runs the task pipeline end to end through a stubbed driver', async () => {
		await aiRouter.upsertProvider(c, { type: 'openai', apiKey: 'k', priority: 9 });
		stubDriver('openai', async (_c, _row, prompt) => {
			expect(prompt.system).toContain('summarize');
			return '{"summary":"short","actionItems":["reply"],"deadline":""}';
		}, { needsApiKey: true });

		const outcome = await aiRouter.run(c, 'summarize', { subject: 'hi', body: 'please reply' });

		expect(outcome.ok).toBe(true);
		expect(outcome.result).toMatchObject({ summary: 'short', actionItems: ['reply'] });
		expect(outcome.provider).toBe('openai');
	});
});
