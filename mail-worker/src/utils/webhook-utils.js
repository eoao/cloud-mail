const encoder = new TextEncoder();

// Svix/Standard-Webhooks signature verification.
// Resend (and Postmark/Brevo via Svix) sign with headers:
//   svix-id, svix-timestamp, svix-signature ("v1,<base64> v1,<base64> ...")
// signed content = `${id}.${timestamp}.${rawBody}`
// secret = "whsec_<base64 key>"
const DEFAULT_TOLERANCE_SECONDS = 5 * 60;

function base64ToBytes(b64) {
	const bin = atob(b64);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) {
		out[i] = bin.charCodeAt(i);
	}
	return out;
}

function bytesToBase64(bytes) {
	let bin = '';
	for (const b of bytes) {
		bin += String.fromCharCode(b);
	}
	return btoa(bin);
}

function timingSafeEqual(a, b) {
	if (a.length !== b.length) {
		return false;
	}
	let diff = 0;
	for (let i = 0; i < a.length; i++) {
		diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return diff === 0;
}

async function hmacBase64(secret, message) {
	const keyB64 = secret.startsWith('whsec_') ? secret.slice(6) : secret;

	let keyBytes;
	try {
		keyBytes = base64ToBytes(keyB64);
	} catch {
		// A secret we generated ourselves is hex, not base64 - use it as raw bytes.
		keyBytes = encoder.encode(keyB64);
	}

	const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(message));

	return bytesToBase64(new Uint8Array(mac));
}

const webhookUtils = {

	timingSafeEqual,

	/** Sign an outgoing delivery the same way we require of inbound ones. */
	async signSvix(secret, id, timestamp, rawBody) {
		return `v1,${await hmacBase64(secret, `${id}.${timestamp}.${rawBody}`)}`;
	},

	async verifySvix(secret, headers, rawBody, tolerance = DEFAULT_TOLERANCE_SECONDS) {

		if (!secret) {
			return { ok: false, reason: 'webhook secret not configured' };
		}

		const id = headers.get('svix-id') || headers.get('webhook-id');
		const timestamp = headers.get('svix-timestamp') || headers.get('webhook-timestamp');
		const signature = headers.get('svix-signature') || headers.get('webhook-signature');

		if (!id || !timestamp || !signature) {
			return { ok: false, reason: 'missing signature headers' };
		}

		const ts = Number(timestamp);
		if (!Number.isFinite(ts)) {
			return { ok: false, reason: 'invalid timestamp' };
		}

		const skew = Math.abs(Math.floor(Date.now() / 1000) - ts);
		if (skew > tolerance) {
			return { ok: false, reason: 'timestamp outside tolerance' };
		}

		const keyB64 = secret.startsWith('whsec_') ? secret.slice(6) : secret;

		let keyBytes;
		try {
			keyBytes = base64ToBytes(keyB64);
		} catch {
			return { ok: false, reason: 'malformed webhook secret' };
		}

		const key = await crypto.subtle.importKey(
			'raw',
			keyBytes,
			{ name: 'HMAC', hash: 'SHA-256' },
			false,
			['sign']
		);

		const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(`${id}.${timestamp}.${rawBody}`));
		const expected = bytesToBase64(new Uint8Array(mac));

		for (const part of signature.split(' ')) {
			const [version, value] = part.split(',');
			if (version !== 'v1' || !value) {
				continue;
			}
			if (timingSafeEqual(value, expected)) {
				return { ok: true };
			}
		}

		return { ok: false, reason: 'signature mismatch' };
	}
};

export default webhookUtils;
