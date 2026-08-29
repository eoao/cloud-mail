import { env } from 'cloudflare:test';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import apiKeyService from '../src/service/api-key-service';
import webhookUtils from '../src/utils/webhook-utils';
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

describe('api keys', () => {

	beforeAll(async () => {
		await dbInit.init(initContext(env.init_secret));
	});

	beforeEach(async () => {
		await env.db.prepare('DELETE FROM api_key').run();
		await env.db.prepare('DELETE FROM webhook').run();
	});

	it('creates the tables', async () => {
		const { results } = await env.db.prepare(
			`SELECT name FROM sqlite_master WHERE name IN ('api_key','webhook')`
		).all();
		expect(results.map(r => r.name).sort()).toEqual(['api_key', 'webhook']);
	});

	it('refuses a key with no scope', async () => {
		await expect(apiKeyService.create(c, { name: 'x', scopes: [] }, USER)).rejects.toThrow(/at least one scope/);
		await expect(apiKeyService.create(c, { name: 'x', scopes: ['make:coffee'] }, USER))
			.rejects.toThrow(/at least one scope/);
	});

	it('returns the plaintext key once and never stores it', async () => {
		const created = await apiKeyService.create(c, { name: 'CI', scopes: ['mail:read'] }, USER);

		expect(created.key).toMatch(/^cm_[0-9a-f]{48}$/);

		// The stored row holds only a hash, and the listing exposes neither.
		const stored = await env.db.prepare('SELECT hash FROM api_key WHERE key_id = ?').bind(created.keyId).first();
		expect(stored.hash).not.toBe(created.key);
		expect(stored.hash).toBe(await apiKeyService.hashKey(created.key));

		const [listed] = await apiKeyService.list(c, USER);
		expect(listed.hash).toBeUndefined();
		expect(listed.key).toBeUndefined();
		expect(listed.prefix).toBe(created.key.slice(0, 11));
	});

	it('verifies a real key and rejects a near miss', async () => {
		const created = await apiKeyService.create(c, { scopes: ['mail:read', 'mail:send'] }, USER);

		const identity = await apiKeyService.verify(c, created.key);
		expect(identity).toMatchObject({ userId: USER, scopes: ['mail:read', 'mail:send'] });

		// Right prefix, wrong body - the prefix alone must not authenticate.
		const forged = created.key.slice(0, 11) + 'f'.repeat(48 - 8);
		expect(await apiKeyService.verify(c, forged)).toBe(null);

		expect(await apiKeyService.verify(c, 'not-a-key')).toBe(null);
		expect(await apiKeyService.verify(c, '')).toBe(null);
		expect(await apiKeyService.verify(c, undefined)).toBe(null);
	});

	it('stops accepting a revoked key', async () => {
		const created = await apiKeyService.create(c, { scopes: ['mail:read'] }, USER);

		expect(await apiKeyService.verify(c, created.key)).toBeTruthy();

		await apiKeyService.revoke(c, created.keyId, USER);

		expect(await apiKeyService.verify(c, created.key)).toBe(null);
	});

	it('stops accepting an expired key', async () => {
		const created = await apiKeyService.create(c, {
			scopes: ['mail:read'],
			expiresAt: dayjs().subtract(1, 'day').format('YYYY-MM-DD HH:mm:ss')
		}, USER);

		expect(await apiKeyService.verify(c, created.key)).toBe(null);
	});

	it('records when a key was last used', async () => {
		const created = await apiKeyService.create(c, { scopes: ['mail:read'] }, USER);
		await apiKeyService.verify(c, created.key);

		const [listed] = await apiKeyService.list(c, USER);
		expect(listed.lastUsed).not.toBe('');
	});

	it('will not let one user revoke another\'s key', async () => {
		const created = await apiKeyService.create(c, { scopes: ['mail:read'] }, USER);
		await expect(apiKeyService.revoke(c, created.keyId, OTHER)).rejects.toThrow(/not found/);
		expect(await apiKeyService.verify(c, created.key)).toBeTruthy();
	});
});

describe('outgoing webhooks', () => {

	beforeAll(async () => {
		await dbInit.init(initContext(env.init_secret));
	});

	beforeEach(async () => {
		await env.db.prepare('DELETE FROM webhook').run();
	});

	it('rejects a url that is not http(s)', async () => {
		await expect(apiKeyService.upsertWebhook(c, { url: 'not a url' }, USER)).rejects.toThrow(/not valid/);
		// file: and data: would be a way to reach schemes the worker should not.
		await expect(apiKeyService.upsertWebhook(c, { url: 'file:///etc/passwd' }, USER))
			.rejects.toThrow(/http or https/);
	});

	it('generates a signing secret when none is given', async () => {
		const row = await apiKeyService.upsertWebhook(c, { url: 'https://example.com/hook' }, USER);
		expect(row.secret.length).toBeGreaterThan(20);
	});

	it('masks the secret when listing', async () => {
		await apiKeyService.upsertWebhook(c, { url: 'https://example.com/hook', secret: 'supersecretvalue' }, USER);

		const [listed] = await apiKeyService.listWebhooks(c, USER);
		expect(listed.secret).not.toContain('secretvalue');
	});

	it('will not let one user edit or delete another\'s webhook', async () => {
		const row = await apiKeyService.upsertWebhook(c, { url: 'https://example.com/a' }, USER);

		await expect(apiKeyService.upsertWebhook(c, { webhookId: row.webhookId, url: 'https://evil.com' }, OTHER))
			.rejects.toThrow(/not found/);
		await expect(apiKeyService.removeWebhook(c, row.webhookId, OTHER)).rejects.toThrow(/not found/);
	});

	it('delivers only to endpoints subscribed to the event', async () => {
		const hits = [];
		globalThis.fetch = async (url) => {
			hits.push(String(url));
			return new Response('ok', { status: 200 });
		};

		await apiKeyService.upsertWebhook(c, { url: 'https://example.com/mail', events: ['mail.received'] }, USER);
		await apiKeyService.upsertWebhook(c, { url: 'https://example.com/other', events: ['mail.sent'] }, USER);
		// An empty event list means "everything".
		await apiKeyService.upsertWebhook(c, { url: 'https://example.com/all', events: [] }, USER);

		const out = await apiKeyService.deliver(c, USER, 'mail.received', { emailId: 1 });

		expect(out).toMatchObject({ targets: 2, delivered: 2 });
		expect(hits.sort()).toEqual(['https://example.com/all', 'https://example.com/mail']);
	});

	it('signs a delivery so the receiver can verify it came from here', async () => {
		let captured = null;
		globalThis.fetch = async (url, init) => {
			captured = { headers: init.headers, body: init.body };
			return new Response('ok', { status: 200 });
		};

		const row = await apiKeyService.upsertWebhook(c, { url: 'https://example.com/hook' }, USER);
		await apiKeyService.deliver(c, USER, 'test', { a: 1 });

		const headers = new Headers(captured.headers);
		const verified = await webhookUtils.verifySvix(row.secret, headers, captured.body);

		expect(verified.ok).toBe(true);
	});

	it('records a failed delivery instead of throwing', async () => {
		globalThis.fetch = async () => new Response('nope', { status: 500 });

		await apiKeyService.upsertWebhook(c, { url: 'https://example.com/hook' }, USER);
		const out = await apiKeyService.deliver(c, USER, 'test', {});

		expect(out).toMatchObject({ targets: 1, delivered: 0 });

		const [listed] = await apiKeyService.listWebhooks(c, USER);
		expect(listed.lastError).toContain('500');
	});

	it('skips a disabled webhook', async () => {
		globalThis.fetch = async () => new Response('ok', { status: 200 });

		await apiKeyService.upsertWebhook(c, { url: 'https://example.com/hook', enabled: 0 }, USER);

		expect(await apiKeyService.deliver(c, USER, 'test', {})).toMatchObject({ targets: 0 });
	});
});
