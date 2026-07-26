import { SELF } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';

// Runs the real migration routine against the test D1/KV so the assertions below
// exercise a provisioned instance rather than the "database not initialized" path.
beforeAll(async () => {
	const response = await SELF.fetch('http://example.com/api/init', {
		headers: { Authorization: 'test-init-secret' },
	});
	expect(response.status).toBe(200);
});

describe('Worker smoke test', () => {
	it('serves website config endpoint', async () => {
		const response = await SELF.fetch('http://example.com/api/setting/websiteConfig');
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.code).toBe(200);
	});

	// BizError surfaces through hono's onError as HTTP 200 with the status carried in
	// the JSON envelope; the frontend axios interceptor branches on body.code.
	it('refuses a protected endpoint without auth', async () => {
		const response = await SELF.fetch('http://example.com/api/my/info');
		const body = await response.json();
		expect(body.code).toBe(401);
	});

	it('serves the SPA entrypoint', async () => {
		const response = await SELF.fetch('http://example.com/');
		expect(response.status).toBe(200);
	});
});
