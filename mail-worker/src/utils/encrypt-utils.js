const encoder = new TextEncoder();
const decoder = new TextDecoder();

const AES_PREFIX = '$aes$';
const HKDF_SALT = 'cloud-mail-settings-encryption-v1';
const HKDF_INFO = 'settings-aes-gcm-key';

async function deriveKey(c) {
	const jwtSecret = c.env.jwt_secret;
	if (!jwtSecret) return null;

	const hkdfKey = await crypto.subtle.importKey(
		'raw',
		encoder.encode(jwtSecret),
		'HKDF',
		false,
		['deriveKey']
	);

	return await crypto.subtle.deriveKey(
		{
			name: 'HKDF',
			hash: 'SHA-256',
			salt: encoder.encode(HKDF_SALT),
			info: encoder.encode(HKDF_INFO),
		},
		hkdfKey,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt', 'decrypt']
	);
}

export async function encryptSetting(c, plaintext) {
	if (!plaintext || plaintext.includes('******')) return plaintext;

	try {
		const key = await deriveKey(c);
		if (!key) return plaintext;

		const iv = crypto.getRandomValues(new Uint8Array(12));
		const encoded = encoder.encode(plaintext);
		const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);

		const combined = new Uint8Array(iv.length + ciphertext.byteLength);
		combined.set(iv);
		combined.set(new Uint8Array(ciphertext), iv.length);

		return AES_PREFIX + btoa(String.fromCharCode(...combined));
	} catch {
		return plaintext;
	}
}

export async function decryptSetting(c, value) {
	if (!value || !value.startsWith(AES_PREFIX)) return value;

	try {
		const key = await deriveKey(c);
		if (!key) return value;

		const encoded = value.slice(AES_PREFIX.length);
		const combined = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
		const iv = combined.slice(0, 12);
		const data = combined.slice(12);

		const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
		return decoder.decode(decrypted);
	} catch {
		return value;
	}
}

export async function encryptJsonSetting(c, value) {
	if (!value) return value;
	if (typeof value === 'object') {
		value = JSON.stringify(value);
	}
	return encryptSetting(c, value);
}

export async function decryptJsonSetting(c, value) {
	const decrypted = await decryptSetting(c, value);
	if (!decrypted) return decrypted;
	try {
		return JSON.parse(decrypted);
	} catch {
		return decrypted;
	}
}
