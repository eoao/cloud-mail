import app from '../hono/hono';
import result from '../model/result';
import pushWebhookService from '../service/push-webhook-service';

// Optional CF Mail extension advertisement.
// This route is intentionally absent from upstream Cloud-Mail 3.0.0; CF Mail iOS treats a 404
// as the conservative 3.0.0 baseline and keeps all core mail features working.
app.get('/capabilities', async (c) => {
	return c.json(result.ok({
		schemaVersion: 1,
		emailDetail: true,
		extendedRecipients: true,
		pushRegistration: pushWebhookService.isConfigured(c),
		telegramTest: true
	}));
});
