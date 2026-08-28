import resendService from '../service/resend-service';
import webhookUtils from '../utils/webhook-utils';
import app from '../hono/hono';

// Delivery-status webhooks.
//
// Fail closed: an unverified webhook can rewrite any email's delivery status by
// provider message id, so a signing secret is required before anything is
// applied. Configure `webhook_secret` with `wrangler secret put`.

async function handle(c, provider) {

	const rawBody = await c.req.text();

	const verified = await webhookUtils.verifySvix(c.env.webhook_secret, c.req.raw.headers, rawBody);

	if (!verified.ok) {
		console.warn(`webhook rejected (${provider}):`, verified.reason);
		return c.text('unauthorized', 401);
	}

	try {
		const applied = await resendService.webhooks(c, JSON.parse(rawBody), provider);
		return c.text(`success:${applied}`, 200);
	} catch (e) {
		return c.text(e.message, 500);
	}
}

// Legacy path, kept so existing Resend webhook configurations keep working.
app.post('/webhooks', (c) => handle(c, 'resend'));

app.post('/webhooks/:provider', (c) => handle(c, c.req.param('provider')));
