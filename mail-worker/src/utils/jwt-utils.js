const encoder = new TextEncoder();
const decoder = new TextDecoder();

const base64url = (input) => {
	const str = btoa(String.fromCharCode(...new Uint8Array(input)));
	return str.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
};

const base64urlDecode = (str) => {
	str = str.replace(/-/g, '+').replace(/_/g, '/');
	while (str.length % 4) str += '=';
	return Uint8Array.from(atob(str), c => c.charCodeAt(0));
};

const jwtUtils = {
	async generateToken(c, payload, expiresInSeconds) {
		const header = {
			alg: 'HS256',
			typ: 'JWT'
		};

		const now = Math.floor(Date.now() / 1000);
		const exp = expiresInSeconds ? now + expiresInSeconds : undefined;

		const fullPayload = {
			...payload,
			iat: now,
			...(exp ? { exp } : {})
		};

		const headerStr = base64url(encoder.encode(JSON.stringify(header)));
		const payloadStr = base64url(encoder.encode(JSON.stringify(fullPayload)));
		const data = `${headerStr}.${payloadStr}`;

		const key = await crypto.subtle.importKey(
			'raw',
			encoder.encode(c.env.jwt_secret),
			{ name: 'HMAC', hash: 'SHA-256' },
			false,
			['sign']
		);

		const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
		const signatureStr = base64url(signature);

		return `${data}.${signatureStr}`;
	},

	async verifyToken(c, token) {
		if (!token) return null;
		try {
			const [headerB64, payloadB64, signatureB64] = token.split('.');

			if (!headerB64 || !payloadB64 || !signatureB64) return null;

			const data = `${headerB64}.${payloadB64}`;
			const key = await crypto.subtle.importKey(
				'raw',
				encoder.encode(c.env.jwt_secret),
				{ name: 'HMAC', hash: 'SHA-256' },
				false,
				['verify']
			);

			const valid = await crypto.subtle.verify(
				'HMAC',
				key,
				base64urlDecode(signatureB64),
				encoder.encode(data)
			);

			if (!valid) return null;

			const payloadJson = decoder.decode(base64urlDecode(payloadB64));
			const payload = JSON.parse(payloadJson);

			const now = Math.floor(Date.now() / 1000);
			if (payload.exp && payload.exp < now) return null;

			return payload;

		} catch (err) {
			console.log(err)
			return null;
		}
	}
};

export default jwtUtils;
