import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { dbInit } from '../src/init/init';

// The migration chain is the worst thing to get wrong: a broken fresh install
// leaves an operator with no app and no obvious cause, and a chain that is not
// safe to re-run breaks every upgrade, because /api/init is exactly what you
// call after deploying a new version.

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

async function tableNames() {
	const { results } = await env.db.prepare(
		`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`
	).all();
	return results.map(r => r.name).sort();
}

async function columnsOf(table) {
	const { results } = await env.db.prepare(`PRAGMA table_info(${table})`).all();
	return results.map(r => r.name).sort();
}

describe('migration chain', () => {

	it('runs to completion and reports success', async () => {
		const res = await dbInit.init(initContext(env.init_secret));
		expect(res.body).toBe('success');
	});

	it('is safe to run again, which is what every upgrade does', async () => {
		// Each version step swallows "duplicate column" so a re-run is a no-op.
		// If one ever throws outside that guard, upgrades break silently.
		const before = await tableNames();

		for (let i = 0; i < 3; i++) {
			const res = await dbInit.init(initContext(env.init_secret));
			expect(res.body, `run ${i + 2}`).toBe('success');
		}

		expect(await tableNames()).toEqual(before);
	});

	it('creates every table the code queries', async () => {
		const names = await tableNames();

		for (const table of [
			'account', 'ai_provider', 'ai_task_binding', 'api_key', 'attachments',
			'calendar_event', 'contact', 'email', 'email_label', 'job', 'label',
			'perm', 'reg_key', 'role', 'role_perm', 'rule', 'send_provider',
			'setting', 'star', 'task', 'template', 'user', 'verify_record', 'webhook'
		]) {
			expect(names, `missing table ${table}`).toContain(table);
		}
	});

	it('adds every column the later phases introduced', async () => {
		const emailColumns = await columnsOf('email');

		for (const column of [
			'thread_id', 'spam_score', 'spam_verdict', 'category', 'priority',
			'scheduled_at', 'snooze_until', 'cc', 'bcc'
		]) {
			expect(emailColumns, `email.${column}`).toContain(column);
		}

		expect(await columnsOf('account')).toContain('signature');

		const userColumns = await columnsOf('user');
		expect(userColumns).toContain('totp_secret');
		expect(userColumns).toContain('totp_enabled');

		const settingColumns = await columnsOf('setting');
		for (const column of ['cf_api_token', 'cf_account_id', 'cf_zone_id']) {
			expect(settingColumns, `setting.${column}`).toContain(column);
		}
	});

	it('builds the full-text index and keeps its triggers', async () => {
		const { results } = await env.db.prepare(
			`SELECT name, type FROM sqlite_master
			  WHERE name LIKE 'email_fts%'`
		).all();

		const triggers = results.filter(r => r.type === 'trigger').map(r => r.name).sort();

		expect(results.some(r => r.name === 'email_fts')).toBe(true);
		expect(triggers).toEqual(['email_fts_ad', 'email_fts_ai', 'email_fts_au']);
	});

	it('seeds exactly one settings row, however many times it runs', async () => {
		const row = await env.db.prepare('SELECT COUNT(*) AS n FROM setting').first();
		expect(row.n).toBe(1);
	});

	it('seeds the permission and role tables', async () => {
		const perms = await env.db.prepare('SELECT COUNT(*) AS n FROM perm').first();
		const roles = await env.db.prepare('SELECT COUNT(*) AS n FROM role').first();

		expect(perms.n).toBeGreaterThan(0);
		expect(roles.n).toBeGreaterThan(0);
	});

	it('creates the indexes the hot queries rely on', async () => {
		const { results } = await env.db.prepare(
			`SELECT name FROM sqlite_master WHERE type = 'index'`
		).all();

		const names = results.map(r => r.name);

		// Without these the free-tier D1 read budget goes on full scans.
		for (const index of [
			'idx_job_claim', 'idx_send_provider_pick', 'idx_ai_provider_pick',
			'idx_email_thread', 'idx_label_user', 'idx_api_key_lookup'
		]) {
			expect(names, `missing index ${index}`).toContain(index);
		}
	});
});
