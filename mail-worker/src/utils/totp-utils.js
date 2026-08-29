// RFC 6238 time-based one-time passwords, using WebCrypto.
//
// Authenticator apps are universally HMAC-SHA1 / 6 digits / 30 seconds, so
// those are the defaults; the parameters exist because the URI carries them and
// a mismatch is silently unverifiable otherwise.

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateSecret(bytes = 20) {
	const random = crypto.getRandomValues(new Uint8Array(bytes));
	return base32Encode(random);
}

export function base32Encode(bytes) {
	let bits = 0;
	let value = 0;
	let out = '';

	for (const byte of bytes) {
		value = (value << 8) | byte;
		bits += 8;

		while (bits >= 5) {
			out += BASE32[(value >>> (bits - 5)) & 31];
			bits -= 5;
		}
	}

	if (bits > 0) {
		out += BASE32[(value << (5 - bits)) & 31];
	}

	return out;
}

export function base32Decode(input) {
	// Authenticator apps show the secret in spaced, lower-case groups and users
	// paste it back that way, so normalise before decoding.
	const clean = String(input ?? '').toUpperCase().replace(/[\s=-]/g, '');

	let bits = 0;
	let value = 0;
	const out = [];

	for (const char of clean) {
		const index = BASE32.indexOf(char);

		if (index === -1) {
			throw new Error('secret is not valid base32');
		}

		value = (value << 5) | index;
		bits += 5;

		if (bits >= 8) {
			out.push((value >>> (bits - 8)) & 255);
			bits -= 8;
		}
	}

	return new Uint8Array(out);
}

/** The code for one time step. */
export async function generateCode(secret, counter, digits = 6) {

	const key = await crypto.subtle.importKey(
		'raw',
		base32Decode(secret),
		{ name: 'HMAC', hash: 'SHA-1' },
		false,
		['sign']
	);

	// The counter is a 64-bit big-endian integer.
	const buffer = new ArrayBuffer(8);
	const view = new DataView(buffer);
	view.setUint32(0, Math.floor(counter / 2 ** 32));
	view.setUint32(4, counter >>> 0);

	const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, buffer));

	// Dynamic truncation (RFC 4226 §5.3).
	const offset = mac[mac.length - 1] & 0x0f;
	const binary =
		((mac[offset] & 0x7f) << 24) |
		((mac[offset + 1] & 0xff) << 16) |
		((mac[offset + 2] & 0xff) << 8) |
		(mac[offset + 3] & 0xff);

	return String(binary % 10 ** digits).padStart(digits, '0');
}

/**
 * Check a code against the current step and its neighbours.
 *
 * The window exists because phone and server clocks drift; one step either side
 * is the usual tolerance and costs an attacker only a factor of three.
 */
export async function verifyCode(secret, code, { window = 1, step = 30, digits = 6, now = Date.now() } = {}) {

	const presented = String(code ?? '').replace(/\s/g, '');

	if (!/^\d+$/.test(presented) || presented.length !== digits) {
		return false;
	}

	const counter = Math.floor(now / 1000 / step);

	for (let drift = -window; drift <= window; drift++) {
		const expected = await generateCode(secret, counter + drift, digits);

		// Constant-time compare: both strings are the same length by construction.
		let diff = 0;
		for (let i = 0; i < digits; i++) {
			diff |= expected.charCodeAt(i) ^ presented.charCodeAt(i);
		}

		if (diff === 0) {
			return true;
		}
	}

	return false;
}

/** otpauth:// URI for the QR code an authenticator app scans. */
export function otpauthUri({ secret, account, issuer = 'cloud-mail' }) {
	const label = encodeURIComponent(`${issuer}:${account}`);
	const params = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: '6', period: '30' });
	return `otpauth://totp/${label}?${params.toString()}`;
}

export default { generateSecret, generateCode, verifyCode, otpauthUri, base32Encode, base32Decode };
