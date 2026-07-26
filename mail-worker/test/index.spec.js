import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

describe('Worker smoke test', () => {
	it('serves website config endpoint', async () => {
		const response = await SELF.fetch('http://example.com/api/setting/websiteConfig');
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.code).toBe(200);
	});

	it('returns 401 on protected endpoint without auth', async () => {
		const response = await SELF.fetch('http://example.com/api/my/info');
		expect(response.status).toBe(401);
	});

	it('returns 200 on login page', async () => {
		const response = await SELF.fetch('http://example.com/');
		expect(response.status).toBe(200);
	});
});
