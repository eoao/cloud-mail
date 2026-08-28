import resendService from '../service/resend-service';
import webhookUtils from '../utils/webhook-utils';
import app from '../hono/hono';

app.post('/webhooks', async (c) => {

	const rawBody = await c.req.text();

	// Fail closed: an unsigned/unverified webhook can rewrite any email's delivery
	// status by resend_email_id, so refuse until `webhook_secret` is configured.
	const verified = await webhookUtils.verifySvix(c.env.webhook_secret, c.req.raw.headers, rawBody);

	if (!verified.ok) {
		console.warn('webhook rejected:', verified.reason);
		return c.text('unauthorized', 401);
	}

	try {
		await resendService.webhooks(c, JSON.parse(rawBody));
		return c.text('success', 200);
	} catch (e) {
		return c.text(e.message, 500);
	}
});
