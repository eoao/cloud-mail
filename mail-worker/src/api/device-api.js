import app from '../hono/hono';
import pushSubscriptionService from '../service/push-subscription-service';
import pushWebhookService from '../service/push-webhook-service';
import userContext from '../security/user-context';
import result from '../model/result';

// Compatibility route name retained for existing CF Mail clients. The payload no longer contains
// an APNs device token. CloudMail stores only a scoped Push Gateway subscription credential.
app.post('/device/register', async (c) => {
	if (!pushWebhookService.isConfigured(c)) {
		return c.json(result.fail('CF Mail Push Gateway 未配置', 503), 503);
	}
	const { subscriptionId, pushSecret, accountId } = await c.req.json();
	await pushSubscriptionService.register(c, userContext.getUserId(c), subscriptionId, pushSecret, accountId);
	return c.json(result.ok());
});

app.delete('/device/unregister', async (c) => {
	const subscriptionId = c.req.query('subscriptionId');
	if (subscriptionId) await pushSubscriptionService.unregister(c, userContext.getUserId(c), subscriptionId);
	else await pushSubscriptionService.unregisterAllByUserId(c, userContext.getUserId(c));
	return c.json(result.ok());
});
