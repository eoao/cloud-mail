import resendService from '../service/resend-service';
import app from '../hono/hono';

const encoder = new TextEncoder();
const TOLERANCE_SECONDS = 300;

function base64ToBytes(b64) {
	const bin = atob(b64);
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) {
		bytes[i] = bin.charCodeAt(i);
	}
	return bytes;
}

function bytesToBase64(bytes) {
	return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

function timingSafeEqual(a, b) {
	if (a.length !== b.length) return false;
	let result = 0;
	for (let i = 0; i < a.length; i++) {
		result |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return result === 0;
}

async function verifySvixSignature(c) {
	const body = await c.req.raw.text();

	const svixId = c.req.header('svix-id');
	const svixTimestamp = c.req.header('svix-timestamp');
	const svixSignature = c.req.header('svix-signature');

	if (!svixId || !svixTimestamp || !svixSignature) {
		return { valid: false, body };
	}

	const secret = c.env.resend_signing_secret;
	if (!secret) {
		return { valid: false, body };
	}

	const timestampSeconds = parseInt(svixTimestamp, 10);
	const nowSeconds = Math.floor(Date.now() / 1000);
	if (!Number.isFinite(timestampSeconds) || Math.abs(nowSeconds - timestampSeconds) > TOLERANCE_SECONDS) {
		return { valid: false, body };
	}

	const signedContent = `${svixId}.${svixTimestamp}.${body}`;

	const secretBytes = base64ToBytes(secret.replace(/^whsec_/, ''));

	const key = await crypto.subtle.importKey(
		'raw',
		secretBytes,
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);

	const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(signedContent));
	const expectedSig = `v1,${bytesToBase64(signature)}`;

	const valid = svixSignature.split(' ').some(s => timingSafeEqual(s, expectedSig));

	return { valid, body };
}

app.post('/webhooks', async (c) => {
	const { valid, body } = await verifySvixSignature(c);

	if (!valid) {
		return c.text('Unauthorized', 401);
	}

	try {
		await resendService.webhooks(c, JSON.parse(body));
		return c.text('success', 200);
	} catch (e) {
		return c.text(e.message, 500);
	}
});
