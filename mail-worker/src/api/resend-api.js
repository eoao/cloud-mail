import resendService from '../service/resend-service';
import app from '../hono/hono';

const encoder = new TextEncoder();

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

	const signedContent = `${svixId}.${svixTimestamp}.${body}`;

	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);

	const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(signedContent));
	const sigHex = Array.from(new Uint8Array(signature))
		.map(b => b.toString(16).padStart(2, '0'))
		.join('');

	const expectedSig = `v1,${sigHex}`;
	const valid = svixSignature.split(' ').some(s => s === expectedSig);

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
