import settingService from './setting-service';
import BizError from '../error/biz-error';

// In-app Cloudflare control panel.
//
// The same ground the setup wizard covers (tools/setup), but available after
// install: it tells the operator which piece of the Cloudflare side is wrong
// and can repair it in one call. The most common silent failure is a catch-all
// rule pointing at an address instead of the worker - mail simply never
// arrives, with no error anywhere.

const BASE = 'https://api.cloudflare.com/client/v4';
const GRAPHQL = 'https://api.cloudflare.com/client/v4/graphql';

async function cfFetch(token, method, path, body) {

	const res = await fetch(`${BASE}${path}`, {
		method,
		headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
		body: body === undefined ? undefined : JSON.stringify(body)
	});

	const json = await res.json().catch(() => null);

	if (!json?.success) {
		const detail = (json?.errors ?? []).map(e => `${e.code}: ${e.message}`).join('; ') || `HTTP ${res.status}`;
		const error = new Error(detail);
		error.status = res.status;
		throw error;
	}

	return json.result;
}

const cfService = {

	async credentials(c) {
		const { cfApiToken, cfAccountId, cfZoneId } = await settingService.query(c);

		if (!cfApiToken) {
			throw new BizError('Cloudflare API token is not configured', 400);
		}

		return { token: cfApiToken, accountId: cfAccountId, zoneId: cfZoneId };
	},

	/** Verify a token and list what it can reach, so the panel can be set up. */
	async probe(c, token) {

		const verified = await cfFetch(token, 'GET', '/user/tokens/verify');

		const [accounts, zones] = await Promise.all([
			cfFetch(token, 'GET', '/accounts?per_page=50').catch(() => []),
			cfFetch(token, 'GET', '/zones?per_page=50').catch(() => [])
		]);

		return {
			status: verified.status,
			accounts: (accounts ?? []).map(a => ({ id: a.id, name: a.name })),
			zones: (zones ?? []).map(z => ({ id: z.id, name: z.name, status: z.status }))
		};
	},

	/**
	 * Full read-only diagnosis. Every finding carries a `fix` key the panel can
	 * post back to /cf/fix, or null when a human has to act.
	 */
	async diagnose(c) {

		const { token, accountId, zoneId } = await this.credentials(c);
		const findings = [];
		const add = (status, label, detail, fix = null) => findings.push({ status, label, detail, fix });

		// --- bindings (local, no API call) ---
		add(c.env.db ? 'ok' : 'fail', 'D1 database binding', c.env.db ? 'bound' : 'missing',
			c.env.db ? null : 'redeploy');
		add(c.env.kv ? 'ok' : 'fail', 'KV namespace binding', c.env.kv ? 'bound' : 'missing',
			c.env.kv ? null : 'redeploy');
		add(c.env.r2 ? 'ok' : 'warn', 'R2 bucket binding', c.env.r2 ? 'bound' : 'not bound - attachments fall back to KV');
		add(c.env.ai ? 'ok' : 'warn', 'Workers AI binding', c.env.ai ? 'bound' : 'not bound - AI needs an external provider');
		add(c.env.JOB_RUNNER ? 'ok' : 'fail', 'Job runner (Durable Object)',
			c.env.JOB_RUNNER ? 'bound' : 'missing - background work runs inline', c.env.JOB_RUNNER ? null : 'redeploy');

		if (!zoneId) {
			add('fail', 'Zone', 'no zone selected', null);
			return { findings, checkedAt: new Date().toISOString() };
		}

		// --- zone ---
		try {
			const zone = await cfFetch(token, 'GET', `/zones/${zoneId}`);
			add(zone.status === 'active' ? 'ok' : 'fail', 'Zone active', `${zone.name} (${zone.status})`);
		} catch (e) {
			add('fail', 'Zone', e.message);
		}

		// --- email routing ---
		let routingEnabled = false;
		try {
			const routing = await cfFetch(token, 'GET', `/zones/${zoneId}/email/routing`);
			routingEnabled = !!routing?.enabled;
			add(routingEnabled ? 'ok' : 'fail', 'Email Routing',
				routingEnabled ? 'enabled' : 'disabled - no mail can arrive',
				routingEnabled ? null : 'enable_routing');
		} catch (e) {
			add('fail', 'Email Routing', e.message, 'enable_routing');
		}

		// --- required MX/SPF records ---
		if (routingEnabled) {
			try {
				const [required, live] = await Promise.all([
					cfFetch(token, 'GET', `/zones/${zoneId}/email/routing/dns`),
					cfFetch(token, 'GET', `/zones/${zoneId}/dns_records?per_page=200`)
				]);

				const missing = (required ?? []).filter(req =>
					!(live ?? []).some(r => r.type === req.type && r.name === req.name && r.content === req.content)
				);

				add(missing.length === 0 ? 'ok' : 'fail', 'Inbound DNS (MX + SPF)',
					missing.length === 0
						? `${(required ?? []).length} records present`
						: `${missing.length} missing: ${missing.map(m => `${m.type} ${m.name}`).join(', ')}`,
					missing.length === 0 ? null : 'write_dns');
			} catch (e) {
				add('warn', 'Inbound DNS', e.message);
			}
		}

		// --- catch-all -> worker ---
		try {
			const catchAll = await cfFetch(token, 'GET', `/zones/${zoneId}/email/routing/rules/catch_all`);
			const target = catchAll?.actions?.find(a => a.type === 'worker')?.value?.[0];
			const workerName = this.workerName(c);

			if (!catchAll?.enabled) {
				add('fail', 'Catch-all rule', 'disabled - mail is not routed anywhere', 'set_catch_all');
			} else if (!target) {
				add('fail', 'Catch-all rule',
					`forwards to ${catchAll.actions?.[0]?.type ?? 'nothing'} instead of the worker`, 'set_catch_all');
			} else if (target !== workerName) {
				add('fail', 'Catch-all rule', `points at worker "${target}", expected "${workerName}"`, 'set_catch_all');
			} else {
				add('ok', 'Catch-all rule', `-> ${workerName}`);
			}
		} catch (e) {
			add('fail', 'Catch-all rule', e.message, 'set_catch_all');
		}

		// --- DMARC (advisory) ---
		try {
			const zone = await cfFetch(token, 'GET', `/zones/${zoneId}`);
			const txt = await cfFetch(token, 'GET', `/zones/${zoneId}/dns_records?type=TXT&per_page=200`);
			const present = (txt ?? []).some(r => r.name === `_dmarc.${zone.name}`);
			add(present ? 'ok' : 'warn', 'DMARC record',
				present ? 'present' : 'missing - mail you send is more likely to be filtered',
				present ? null : 'write_dmarc');
		} catch (e) {
			add('warn', 'DMARC record', e.message);
		}

		if (!accountId) {
			add('warn', 'Account', 'no account selected - usage figures are unavailable');
		}

		return { findings, checkedAt: new Date().toISOString() };
	},

	/** Apply one repair named by a diagnose() finding. */
	async fix(c, action) {

		const { token, zoneId } = await this.credentials(c);

		if (!zoneId) {
			throw new BizError('no zone selected', 400);
		}

		if (action === 'enable_routing') {
			await cfFetch(token, 'POST', `/zones/${zoneId}/email/routing/enable`, {});
			return { done: 'Email Routing enabled' };
		}

		if (action === 'write_dns') {
			const required = await cfFetch(token, 'GET', `/zones/${zoneId}/email/routing/dns`);
			let written = 0;

			for (const rec of required ?? []) {
				const payload = { type: rec.type, name: rec.name, content: rec.content, ttl: rec.ttl ?? 1 };
				if (rec.priority !== undefined) payload.priority = rec.priority;

				const existing = await cfFetch(token, 'GET',
					`/zones/${zoneId}/dns_records?type=${encodeURIComponent(rec.type)}&name=${encodeURIComponent(rec.name)}`);

				const same = (existing ?? []).some(r =>
					r.content === rec.content && (rec.priority === undefined || r.priority === rec.priority));

				if (same) continue;

				await cfFetch(token, 'POST', `/zones/${zoneId}/dns_records`, payload);
				written++;
			}

			return { done: `${written} DNS record(s) written` };
		}

		if (action === 'write_dmarc') {
			const zone = await cfFetch(token, 'GET', `/zones/${zoneId}`);
			await cfFetch(token, 'POST', `/zones/${zoneId}/dns_records`, {
				type: 'TXT',
				name: `_dmarc.${zone.name}`,
				content: `v=DMARC1; p=none; rua=mailto:${c.env.admin || `postmaster@${zone.name}`}`,
				ttl: 1
			});
			return { done: 'DMARC record added' };
		}

		if (action === 'set_catch_all') {
			const workerName = this.workerName(c);
			await cfFetch(token, 'PUT', `/zones/${zoneId}/email/routing/rules/catch_all`, {
				enabled: true,
				name: 'cloud-mail catch-all',
				matchers: [{ type: 'all' }],
				actions: [{ type: 'worker', value: [workerName] }]
			});
			return { done: `Catch-all now routes to ${workerName}` };
		}

		if (action === 'redeploy') {
			throw new BizError('A missing binding can only be fixed by redeploying the worker', 400);
		}

		throw new BizError(`unknown fix "${action}"`, 400);
	},

	/**
	 * Daily usage against the Workers free-plan limits. Numbers come from the
	 * GraphQL analytics API; the limits are the published free-tier ones, so
	 * they are advisory rather than authoritative.
	 */
	async usage(c, days = 7) {

		const { token, accountId } = await this.credentials(c);

		if (!accountId) {
			throw new BizError('no account selected', 400);
		}

		const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
		const until = new Date().toISOString().slice(0, 10);

		const query = `query($accountTag: string!, $since: Date!, $until: Date!) {
			viewer {
				accounts(filter: { accountTag: $accountTag }) {
					workersInvocationsAdaptive(
						limit: 1000,
						filter: { date_geq: $since, date_leq: $until }
					) {
						sum { requests errors subrequests }
						quantiles { cpuTimeP50 cpuTimeP99 }
						dimensions { date scriptName }
					}
				}
			}
		}`;

		const res = await fetch(GRAPHQL, {
			method: 'POST',
			headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({ query, variables: { accountTag: accountId, since, until } })
		});

		const json = await res.json().catch(() => null);

		if (json?.errors?.length) {
			throw new BizError(json.errors.map(e => e.message).join('; '), 502);
		}

		const rows = json?.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive ?? [];
		const workerName = this.workerName(c);

		const byDate = new Map();

		for (const row of rows) {
			if (row.dimensions?.scriptName && row.dimensions.scriptName !== workerName) continue;

			const date = row.dimensions?.date;
			if (!date) continue;

			const entry = byDate.get(date) ?? { date, requests: 0, errors: 0, subrequests: 0, cpuP50: 0, cpuP99: 0 };
			entry.requests += row.sum?.requests ?? 0;
			entry.errors += row.sum?.errors ?? 0;
			entry.subrequests += row.sum?.subrequests ?? 0;
			entry.cpuP50 = Math.max(entry.cpuP50, row.quantiles?.cpuTimeP50 ?? 0);
			entry.cpuP99 = Math.max(entry.cpuP99, row.quantiles?.cpuTimeP99 ?? 0);
			byDate.set(date, entry);
		}

		const series = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
		const todayRow = series[series.length - 1] ?? { requests: 0, errors: 0 };

		return {
			series,
			today: todayRow,
			limits: this.freePlanLimits(),
			projection: this.projectDaily(todayRow.requests)
		};
	},

	freePlanLimits() {
		return {
			requestsPerDay: 100_000,
			cpuMsPerRequest: 10,
			d1RowsReadPerDay: 5_000_000,
			d1RowsWrittenPerDay: 100_000,
			r2StorageGb: 10
		};
	},

	/** "At this rate you exhaust the daily request quota in N hours." */
	projectDaily(requestsSoFar) {

		const limit = this.freePlanLimits().requestsPerDay;
		const hoursElapsed = new Date().getUTCHours() + new Date().getUTCMinutes() / 60;

		if (!requestsSoFar || hoursElapsed < 0.5) {
			return { projected: requestsSoFar ?? 0, willExceed: false, hoursToLimit: null };
		}

		const perHour = requestsSoFar / hoursElapsed;
		const projected = Math.round(perHour * 24);
		const remaining = limit - requestsSoFar;

		return {
			projected,
			willExceed: projected > limit,
			hoursToLimit: perHour > 0 ? Math.max(0, Math.round((remaining / perHour) * 10) / 10) : null
		};
	},

	/** Worker script name, taken from the URL Cloudflare serves us on. */
	workerName(c) {
		return c.env.worker_name || 'cloud-mail';
	},

	async saveCredentials(c, { cfApiToken, cfAccountId, cfZoneId }) {
		const params = { cfAccountId: cfAccountId ?? '', cfZoneId: cfZoneId ?? '' };

		// An omitted token means "keep the stored one" - the UI only ever sees a
		// boolean, never the value.
		if (cfApiToken) {
			params.cfApiToken = cfApiToken;
		}

		await settingService.set(c, params);
	}
};

export default cfService;
