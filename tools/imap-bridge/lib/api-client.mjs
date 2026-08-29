// Talks to a cloud-mail deployment over its public /api/v1 surface.
//
// The bridge holds no database of its own: it is a protocol translator, so
// every piece of state lives in the worker. That means an API key is the only
// credential it needs, and revoking that key cuts off the bridge immediately.

export class ApiError extends Error {
	constructor(message, status) {
		super(message);
		this.name = 'ApiError';
		this.status = status;
	}
}

export class ApiClient {

	constructor(baseUrl, apiKey) {
		this.baseUrl = String(baseUrl).replace(/\/+$/, '');
		this.apiKey = apiKey;
	}

	async request(method, path, body) {

		const res = await fetch(`${this.baseUrl}/api/v1${path}`, {
			method,
			headers: {
				Authorization: `Bearer ${this.apiKey}`,
				'Content-Type': 'application/json'
			},
			body: body === undefined ? undefined : JSON.stringify(body)
		});

		const json = await res.json().catch(() => null);

		if (!res.ok || (json && json.code && json.code !== 200)) {
			throw new ApiError(json?.message ?? `HTTP ${res.status}`, res.status);
		}

		// The worker wraps everything as {code, message, data}.
		return json?.data ?? json;
	}

	/** Verifies the key and returns the account it belongs to. */
	whoami() {
		return this.request('GET', '/me');
	}

	listEmails(params = {}) {
		const query = new URLSearchParams(
			Object.entries(params).filter(([, v]) => v !== undefined && v !== '')
		);
		return this.request('GET', `/emails?${query}`);
	}

	sendEmail(payload) {
		return this.request('POST', '/emails/send', payload);
	}
}

export default ApiClient;
