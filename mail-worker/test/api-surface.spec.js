import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import apiKeyService from '../src/service/api-key-service';
import { dbInit } from '../src/init/init';

// End-to-end checks on the public /api/v1 surface, driven through the real
// worker rather than by calling services directly. The properties here are the
// ones a mistake in the middleware would quietly break.

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

const call = (path, init = {}) => SELF.fetch(`http://mail.test/api${path}`, init);
const withKey = (key) => ({ headers: { Authorization: `Bearer ${key}` } });

let readKey;
let sendKey;

describe('public API surface', () => {

	beforeAll(async () => {
		await dbInit.init(initContext(env.init_secret));
		await env.db.prepare('DELETE FROM api_key').run();
		await env.db.prepare('DELETE FROM user').run();

		// The middleware resolves the key to a real, active user.
		await env.db.prepare(
			`INSERT INTO user (user_id, email, password, salt, type, status, is_del)
			 VALUES (1, 'me@test.local', 'x', 'y', 1, 0, 0)`
		).run();

		readKey = (await apiKeyService.create({ env }, { name: 'read', scopes: ['mail:read'] }, 1)).key;
		sendKey = (await apiKeyService.create({ env }, { name: 'send', scopes: ['mail:send'] }, 1)).key;
	});

	it('rejects a request with no credentials, with a real HTTP status', async () => {
		// A script checking res.ok, a proxy, or a monitor all treat 200 as
		// success - the public API must not report an auth failure as one.
		const res = await call('/v1/me');

		expect(res.status).toBe(401);
		expect((await res.json()).code).toBe(401);
	});

	it('rejects a made-up key', async () => {
		const res = await call('/v1/me', withKey('cm_' + '0'.repeat(48)));

		expect(res.status).toBe(401);
		expect((await res.json()).data).toBeFalsy();
	});

	it('reports a scope refusal as 403, not as success', async () => {
		const res = await call('/v1/emails', withKey(sendKey));
		expect(res.status).toBe(403);
	});

	it('leaves the app\'s own routes on HTTP 200 with the code in the body', async () => {
		// The frontend's axios interceptor reads data.code and expects 200, so
		// widening the status change beyond /v1 would break every error toast.
		const res = await call('/setting/query');

		expect(res.status).toBe(200);
		expect((await res.json()).code).toBe(401);
	});

	it('accepts a real key and reports who it belongs to', async () => {
		const res = await call('/v1/me', withKey(readKey));
		const body = await res.json();

		expect(body.data).toMatchObject({ userId: 1, email: 'me@test.local' });
		expect(body.data.scopes).toEqual(['mail:read']);
	});

	it('enforces the scope the key was issued with', async () => {
		// A read key must not be able to send, and a send key must not be able to
		// read - otherwise scoping is decoration.
		const send = await call('/v1/emails/send', {
			method: 'POST',
			headers: { Authorization: `Bearer ${readKey}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({ receiveEmail: ['x@y.com'], subject: 's' })
		});
		expect((await send.json()).message).toMatch(/mail:send/);

		const read = await call('/v1/emails', withKey(sendKey));
		expect((await read.json()).message).toMatch(/mail:read/);
	});

	it('stops accepting a key once it is revoked', async () => {
		const created = await apiKeyService.create({ env }, { name: 'temp', scopes: ['mail:read'] }, 1);

		expect((await (await call('/v1/me', withKey(created.key))).json()).data).toBeTruthy();

		await apiKeyService.revoke({ env }, created.keyId, 1);

		const after = await (await call('/v1/me', withKey(created.key))).json();
		expect(after.data).toBeFalsy();
	});

	it('does not let an API key reach the admin surface', async () => {
		// /v1 is the only path a key can use. Admin routes expect a session token
		// in a different header, so a key must get nowhere near them.
		for (const path of ['/setting/query', '/user/list', '/cf/status', '/job/list']) {
			const res = await call(path, withKey(readKey));
			const body = await res.json().catch(() => ({}));
			expect(body.data, path).toBeFalsy();
		}
	});

	it('refuses a key belonging to a banned or deleted user', async () => {
		await env.db.prepare('UPDATE user SET status = 1 WHERE user_id = 1').run();
		expect((await (await call('/v1/me', withKey(readKey))).json()).data).toBeFalsy();

		await env.db.prepare('UPDATE user SET status = 0, is_del = 1 WHERE user_id = 1').run();
		expect((await (await call('/v1/me', withKey(readKey))).json()).data).toBeFalsy();

		await env.db.prepare('UPDATE user SET is_del = 0 WHERE user_id = 1').run();
	});

	it('still rejects an unsigned delivery webhook', async () => {
		// The one unauthenticated route: it must stay closed without a signature.
		const res = await call('/webhooks/resend', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ type: 'email.delivered', data: { email_id: 'x' } })
		});

		expect(res.status).toBe(401);
	});
});
