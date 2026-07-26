import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

describe('POST /webhooks (A1)', () => {
	it('returns 401 without Svix signature headers', async () => {
		const response = await SELF.fetch('http://example.com/api/webhooks', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ type: 'email.delivered', data: { email_id: 'test' } }),
		});
		expect(response.status).toBe(401);
	});

	it('returns 401 with invalid signature', async () => {
		const response = await SELF.fetch('http://example.com/api/webhooks', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'svix-id': 'test-id',
				'svix-timestamp': '1234567890',
				'svix-signature': 'v1,invalid',
			},
			body: JSON.stringify({ type: 'email.delivered', data: { email_id: 'test' } }),
		});
		expect(response.status).toBe(401);
	});
});

describe('GET /init (A2)', () => {
	it('returns 401 without Authorization header', async () => {
		const response = await SELF.fetch('http://example.com/api/init');
		expect(response.status).toBe(401);
	});

	it('returns 401 with invalid Authorization header', async () => {
		const response = await SELF.fetch('http://example.com/api/init', {
			headers: { Authorization: 'wrong-secret' },
		});
		expect(response.status).toBe(401);
	});
});

// bindUser rejects via BizError, which hono's onError renders as HTTP 200 with the
// status in the JSON envelope. Assert on body.code so the test tracks the actual
// contract; asserting response.status here would pass only if that convention changed.
describe('PUT /api/oauth/bindUser (F1-OAUTH)', () => {
	it('refuses a bind without bindToken', async () => {
		const response = await SELF.fetch('http://example.com/api/oauth/bindUser', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ email: 'test@example.com', code: 'abc' }),
		});
		const body = await response.json();
		expect(body.code).toBe(401);
	});

	it('refuses a bind with an invalid bindToken', async () => {
		const response = await SELF.fetch('http://example.com/api/oauth/bindUser', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ email: 'test@example.com', bindToken: 'invalid.token.here', code: 'abc' }),
		});
		const body = await response.json();
		expect(body.code).toBe(401);
	});
});
