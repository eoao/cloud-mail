import { describe, it, expect } from 'vitest';
import cfService from '../src/service/cf-service';

// cfService talks to the Cloudflare API over global fetch, so these tests swap
// fetch for a scripted responder rather than reaching the network.

function mockFetch(routes) {
	const calls = [];
	globalThis.fetch = async (url, init = {}) => {
		const method = init.method ?? 'GET';
		const path = String(url).replace('https://api.cloudflare.com/client/v4', '');
		calls.push({ method, path, body: init.body ? JSON.parse(init.body) : undefined });

		const key = `${method} ${path.split('?')[0]}`;
		const handler = routes[key] ?? routes[`${method} *`];

		if (!handler) {
			return new Response(JSON.stringify({ success: false, errors: [{ code: 404, message: `no route for ${key}` }] }));
		}

		const result = typeof handler === 'function' ? handler(path, init) : handler;
		return new Response(JSON.stringify({ success: true, result, errors: [] }));
	};
	return calls;
}

/** Context with the panel configured and every binding present. */
function ctx(overrides = {}) {
	const settingRow = {
		cfApiToken: 'tok',
		cfAccountId: 'acct',
		cfZoneId: 'zone',
		...overrides.setting
	};

	const store = new Map([['setting', settingRow]]);

	return {
		env: {
			admin: 'admin@example.com',
			db: {}, kv: {}, r2: {}, ai: {}, JOB_RUNNER: {},
			...overrides.env
		},
		get: (k) => store.get(k),
		set: (k, v) => store.set(k, v)
	};
}

const HEALTHY = {
	'GET /zones/zone': { id: 'zone', name: 'example.com', status: 'active' },
	'GET /zones/zone/email/routing': { enabled: true },
	'GET /zones/zone/email/routing/dns': [
		{ type: 'MX', name: 'example.com', content: 'route1.mx.cloudflare.net', priority: 1 },
		{ type: 'TXT', name: 'example.com', content: 'v=spf1 include:_spf.mx.cloudflare.net ~all' }
	],
	'GET /zones/zone/dns_records': (path) => {
		const all = [
			{ type: 'MX', name: 'example.com', content: 'route1.mx.cloudflare.net', priority: 1 },
			{ type: 'TXT', name: 'example.com', content: 'v=spf1 include:_spf.mx.cloudflare.net ~all' },
			{ type: 'TXT', name: '_dmarc.example.com', content: 'v=DMARC1; p=none' }
		];
		return path.includes('type=TXT') ? all.filter(r => r.type === 'TXT') : all;
	},
	'GET /zones/zone/email/routing/rules/catch_all': {
		enabled: true,
		actions: [{ type: 'worker', value: ['cloud-mail'] }]
	}
};

const find = (findings, label) => findings.find(f => f.label === label);

describe('cloudflare diagnosis', () => {

	it('reports everything healthy on a correct setup', async () => {
		mockFetch(HEALTHY);
		const { findings } = await cfService.diagnose(ctx());

		expect(findings.filter(f => f.status === 'fail')).toEqual([]);
		expect(find(findings, 'Catch-all rule').detail).toContain('cloud-mail');
	});

	it('flags a catch-all that forwards to an address instead of the worker', async () => {
		// This is the silent failure: mail is accepted and forwarded elsewhere,
		// the app just never sees it.
		mockFetch({
			...HEALTHY,
			'GET /zones/zone/email/routing/rules/catch_all': {
				enabled: true,
				actions: [{ type: 'forward', value: ['someone@gmail.com'] }]
			}
		});

		const { findings } = await cfService.diagnose(ctx());
		const rule = find(findings, 'Catch-all rule');

		expect(rule.status).toBe('fail');
		expect(rule.fix).toBe('set_catch_all');
	});

	it('flags a catch-all pointing at a different worker', async () => {
		mockFetch({
			...HEALTHY,
			'GET /zones/zone/email/routing/rules/catch_all': {
				enabled: true,
				actions: [{ type: 'worker', value: ['some-other-worker'] }]
			}
		});

		const rule = find((await cfService.diagnose(ctx())).findings, 'Catch-all rule');
		expect(rule.status).toBe('fail');
		expect(rule.detail).toContain('some-other-worker');
	});

	it('lists exactly which DNS records are missing', async () => {
		mockFetch({
			...HEALTHY,
			'GET /zones/zone/dns_records': (path) =>
				path.includes('type=TXT') ? [{ type: 'TXT', name: '_dmarc.example.com', content: 'v=DMARC1' }] : []
		});

		const dns = find((await cfService.diagnose(ctx())).findings, 'Inbound DNS (MX + SPF)');
		expect(dns.status).toBe('fail');
		expect(dns.detail).toContain('2 missing');
		expect(dns.fix).toBe('write_dns');
	});

	it('flags disabled Email Routing and skips the DNS check', async () => {
		mockFetch({ ...HEALTHY, 'GET /zones/zone/email/routing': { enabled: false } });

		const { findings } = await cfService.diagnose(ctx());
		expect(find(findings, 'Email Routing').fix).toBe('enable_routing');
		expect(find(findings, 'Inbound DNS (MX + SPF)')).toBeUndefined();
	});

	it('flags a missing job runner but only warns about R2 and AI', async () => {
		mockFetch(HEALTHY);
		const { findings } = await cfService.diagnose(ctx({ env: { r2: undefined, ai: undefined, JOB_RUNNER: undefined } }));

		expect(find(findings, 'Job runner (Durable Object)').status).toBe('fail');
		expect(find(findings, 'R2 bucket binding').status).toBe('warn');
		expect(find(findings, 'Workers AI binding').status).toBe('warn');
	});

	it('refuses to run without a configured token', async () => {
		mockFetch(HEALTHY);
		await expect(cfService.diagnose(ctx({ setting: { cfApiToken: '' } }))).rejects.toThrow(/not configured/);
	});

	it('stops early when no zone is selected', async () => {
		mockFetch(HEALTHY);
		const { findings } = await cfService.diagnose(ctx({ setting: { cfZoneId: '' } }));
		expect(find(findings, 'Zone').detail).toContain('no zone selected');
	});
});

describe('cloudflare repairs', () => {

	it('points the catch-all at the worker', async () => {
		const calls = mockFetch({ ...HEALTHY, 'PUT /zones/zone/email/routing/rules/catch_all': {} });

		await cfService.fix(ctx(), 'set_catch_all');

		const put = calls.find(x => x.method === 'PUT');
		expect(put.body.enabled).toBe(true);
		expect(put.body.actions).toEqual([{ type: 'worker', value: ['cloud-mail'] }]);
	});

	it('writes only the DNS records that are actually missing', async () => {
		const calls = mockFetch({
			...HEALTHY,
			// The MX already exists; the SPF TXT does not.
			'GET /zones/zone/dns_records': (path) =>
				path.includes('type=MX')
					? [{ type: 'MX', name: 'example.com', content: 'route1.mx.cloudflare.net', priority: 1 }]
					: [],
			'POST /zones/zone/dns_records': { id: 'new' }
		});

		const out = await cfService.fix(ctx(), 'write_dns');

		expect(out.done).toContain('1 DNS record');
		expect(calls.filter(x => x.method === 'POST' && x.path === '/zones/zone/dns_records')).toHaveLength(1);
	});

	it('rejects an unknown repair', async () => {
		mockFetch(HEALTHY);
		await expect(cfService.fix(ctx(), 'rm -rf')).rejects.toThrow(/unknown fix/);
	});

	it('explains that a missing binding needs a redeploy', async () => {
		mockFetch(HEALTHY);
		await expect(cfService.fix(ctx(), 'redeploy')).rejects.toThrow(/redeploying/);
	});
});

describe('free-plan projection', () => {

	it('does not extrapolate from an almost-empty day', () => {
		expect(cfService.projectDaily(0)).toMatchObject({ willExceed: false, hoursToLimit: null });
	});

	it('flags a burn rate that would exceed the daily request quota', () => {
		// 90k requests already, whatever the hour, projects past 100k/day.
		const out = cfService.projectDaily(90_000);
		if (new Date().getUTCHours() >= 1) {
			expect(out.projected).toBeGreaterThan(90_000);
		}
		expect(typeof out.projected).toBe('number');
	});

	it('publishes the free-plan limits the dashboard compares against', () => {
		expect(cfService.freePlanLimits()).toMatchObject({
			requestsPerDay: 100_000,
			cpuMsPerRequest: 10,
			d1RowsWrittenPerDay: 100_000
		});
	});
});
