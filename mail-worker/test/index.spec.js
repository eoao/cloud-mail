import { describe, it, expect } from 'vitest';
import { createExecutionContext, env, SELF, waitOnExecutionContext } from 'cloudflare:test';
import worker from '../src';

describe('Cloud Mail worker', () => {
	it('serves the Cloud Mail application in unit style', async () => {
		const request = new Request('http://example.com');
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(200);
		expect(await response.text()).toContain('<title>Cloud Mail</title>');
	});

	it('serves the Cloud Mail application in integration style', async () => {
		const response = await SELF.fetch('http://example.com');
		expect(response.status).toBe(200);
		expect(await response.text()).toContain('<title>Cloud Mail</title>');
	});
});
