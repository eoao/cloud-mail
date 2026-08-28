// Thin Cloudflare REST API v4 client.
//
// Every helper is written to be idempotent: "find or create" rather than
// "create", so re-running the wizard on a half-finished account completes it
// instead of erroring or duplicating resources.

const BASE = 'https://api.cloudflare.com/client/v4';

export class CloudflareError extends Error {
	constructor(message, { status, errors, path } = {}) {
		super(message);
		this.name = 'CloudflareError';
		this.status = status;
		this.errors = errors ?? [];
		this.path = path;
	}
}

export class CloudflareApi {

	constructor(token) {
		this.token = token;
	}

	async request(method, path, body) {

		const res = await fetch(`${BASE}${path}`, {
			method,
			headers: {
				Authorization: `Bearer ${this.token}`,
				'Content-Type': 'application/json'
			},
			body: body === undefined ? undefined : JSON.stringify(body)
		});

		let json;
		try {
			json = await res.json();
		} catch {
			throw new CloudflareError(`${method} ${path} returned ${res.status} with a non-JSON body`, {
				status: res.status,
				path
			});
		}

		if (!json.success) {
			const detail = (json.errors ?? []).map(e => `${e.code}: ${e.message}`).join('; ') || `HTTP ${res.status}`;
			throw new CloudflareError(detail, { status: res.status, errors: json.errors, path });
		}

		return json.result;
	}

	get(path) { return this.request('GET', path); }
	post(path, body) { return this.request('POST', path, body); }
	put(path, body) { return this.request('PUT', path, body); }
	patch(path, body) { return this.request('PATCH', path, body); }

	/** Same as request(), but returns null instead of throwing on 404/1000-class misses. */
	async tryGet(path) {
		try {
			return await this.get(path);
		} catch (e) {
			if (e instanceof CloudflareError && (e.status === 404 || e.status === 400)) {
				return null;
			}
			throw e;
		}
	}

	// ---- identity -------------------------------------------------------

	verifyToken() {
		return this.get('/user/tokens/verify');
	}

	listAccounts() {
		return this.get('/accounts?per_page=50');
	}

	listZones() {
		return this.get('/zones?per_page=50');
	}

	getZoneByName(name) {
		return this.get(`/zones?name=${encodeURIComponent(name)}`).then(zones => zones[0] ?? null);
	}

	// ---- storage --------------------------------------------------------

	async findOrCreateD1(accountId, name) {
		const existing = await this.get(`/accounts/${accountId}/d1/database?name=${encodeURIComponent(name)}`);
		const match = (existing ?? []).find(db => db.name === name);
		if (match) {
			return { ...match, created: false };
		}
		const created = await this.post(`/accounts/${accountId}/d1/database`, { name });
		return { ...created, created: true };
	}

	async findOrCreateKv(accountId, title) {
		const existing = await this.get(`/accounts/${accountId}/storage/kv/namespaces?per_page=100`);
		const match = (existing ?? []).find(ns => ns.title === title);
		if (match) {
			return { ...match, created: false };
		}
		const created = await this.post(`/accounts/${accountId}/storage/kv/namespaces`, { title });
		return { ...created, created: true };
	}

	async findOrCreateR2(accountId, name) {
		const existing = await this.tryGet(`/accounts/${accountId}/r2/buckets/${encodeURIComponent(name)}`);
		if (existing) {
			return { ...existing, created: false };
		}
		const created = await this.post(`/accounts/${accountId}/r2/buckets`, { name });
		return { ...created, created: true };
	}

	// ---- email routing --------------------------------------------------

	emailRoutingSettings(zoneId) {
		return this.tryGet(`/zones/${zoneId}/email/routing`);
	}

	/** Records Cloudflare requires for Email Routing (MX set + SPF TXT). */
	emailRoutingRequiredDns(zoneId) {
		return this.get(`/zones/${zoneId}/email/routing/dns`);
	}

	enableEmailRouting(zoneId) {
		return this.post(`/zones/${zoneId}/email/routing/enable`, {});
	}

	getCatchAll(zoneId) {
		return this.tryGet(`/zones/${zoneId}/email/routing/rules/catch_all`);
	}

	/** Point the catch-all rule at a Worker script, which is how mail reaches us. */
	setCatchAllToWorker(zoneId, workerName) {
		return this.put(`/zones/${zoneId}/email/routing/rules/catch_all`, {
			enabled: true,
			name: 'cloud-mail catch-all',
			matchers: [{ type: 'all' }],
			actions: [{ type: 'worker', value: [workerName] }]
		});
	}

	// ---- dns ------------------------------------------------------------

	listDnsRecords(zoneId, params = '') {
		return this.get(`/zones/${zoneId}/dns_records?per_page=200${params}`);
	}

	/**
	 * Create a record, or update it in place when one with the same type+name
	 * already exists. Never creates a duplicate.
	 */
	async upsertDnsRecord(zoneId, record) {
		const existing = await this.listDnsRecords(
			zoneId,
			`&type=${encodeURIComponent(record.type)}&name=${encodeURIComponent(record.name)}`
		);

		const same = (existing ?? []).find(r =>
			r.content === record.content && (record.priority === undefined || r.priority === record.priority)
		);

		if (same) {
			return { ...same, action: 'unchanged' };
		}

		// For MX several records legitimately coexist, so only TXT/CNAME are replaced.
		const replaceable = record.type !== 'MX' ? (existing ?? [])[0] : null;

		if (replaceable) {
			const updated = await this.put(`/zones/${zoneId}/dns_records/${replaceable.id}`, record);
			return { ...updated, action: 'updated' };
		}

		const created = await this.post(`/zones/${zoneId}/dns_records`, record);
		return { ...created, action: 'created' };
	}

	// ---- workers --------------------------------------------------------

	async workerExists(accountId, name) {
		const scripts = await this.get(`/accounts/${accountId}/workers/scripts`);
		return (scripts ?? []).some(s => s.id === name);
	}
}

export default CloudflareApi;
