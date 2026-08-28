// Shared helpers for the outbound drivers.

export function formatFrom(name, address) {
	return name ? `${name} <${address}>` : address;
}

export function replyHeaders(params) {
	if (params.sendType !== 'reply' || !params.messageId) {
		return undefined;
	}
	return {
		'in-reply-to': params.messageId,
		'references': params.messageId
	};
}

/**
 * POST JSON and normalise the failure into one Error shape, so the registry can
 * decide about failover without knowing which provider it was talking to.
 */
export async function postJson(url, { headers = {}, body, provider }) {

	const res = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', ...headers },
		body: JSON.stringify(body)
	});

	const raw = await res.text();

	let parsed = null;
	try {
		parsed = raw ? JSON.parse(raw) : null;
	} catch {
		// Some providers answer 202 with an empty or non-JSON body.
	}

	if (!res.ok) {
		const detail = parsed?.message
			?? parsed?.error?.message
			?? parsed?.errors?.[0]?.message
			?? raw.slice(0, 300)
			?? `HTTP ${res.status}`;

		const error = new Error(`${provider}: ${detail}`);
		error.status = res.status;
		// 4xx other than 429 will fail the same way on a retry, so do not fail over
		// to the next provider for a malformed message - only for transport faults.
		error.retryable = res.status === 429 || res.status >= 500;
		throw error;
	}

	return parsed ?? {};
}
