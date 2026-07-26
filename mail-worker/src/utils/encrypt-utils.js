const encoder = new TextEncoder();
const decoder = new TextDecoder();

const AES_PREFIX = '$aes$';

async function getKey(c) {
	const raw = c.env.settings_encryption_key;
	if (!raw) return null;
	return await crypto.subtle.importKey(
		'raw',
		encoder.encode(raw),
		{ name: 'AES-GCM' },
		false,
		['encrypt', 'decrypt']
	);
}

export async function encryptSetting(c, plaintext) {
	if (!plaintext || plaintext.includes('******')) return plaintext;
	const key = await getKey(c);
	if (!key) return plaintext;

	const iv = crypto.getRandomValues(new Uint8Array(12));
	const encoded = encoder.encode(plaintext);
	const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);

	const combined = new Uint8Array(iv.length + ciphertext.byteLength);
	combined.set(iv);
	combined.set(new Uint8Array(ciphertext), iv.length);

	return AES_PREFIX + btoa(String.fromCharCode(...combined));
}

export async function decryptSetting(c, value) {
	if (!value || !value.startsWith(AES_PREFIX)) return value;
	const key = await getKey(c);
	if (!key) return value;

	try {
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
