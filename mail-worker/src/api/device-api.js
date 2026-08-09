import app from '../hono/hono';
import pushSubscriptionService from '../service/push-subscription-service';
import pushWebhookService from '../service/push-webhook-service';
import userContext from '../security/user-context';
import result from '../model/result';
import emailService from '../service/email-service';

// Compatibility route name retained for existing CF Mail clients. The payload no longer contains
// an APNs device token. CloudMail stores only a scoped Push Gateway subscription credential.
app.post('/device/register', async (c) => {
	if (!pushWebhookService.isConfigured(c)) {
		return c.json(result.fail('CF Mail Push Gateway 未配置', 503), 503);
	}
	const body = await c.req.json();
	const { subscriptionId, pushSecret, accountId } = body;
	const userId = userContext.getUserId(c);
	await pushSubscriptionService.register(c, userId, subscriptionId, pushSecret, accountId, body);
	const [subscriptions, unreadCount] = await Promise.all([
		pushSubscriptionService.listByUserId(c, userId),
		emailService.unreadCount(c, userId)
	]);
	if (subscriptions.length) await pushWebhookService.syncBadge(c, subscriptions, unreadCount);
	return c.json(result.ok());
});

app.delete('/device/unregister', async (c) => {
	const subscriptionId = c.req.query('subscriptionId');
	if (subscriptionId) await pushSubscriptionService.unregister(c, userContext.getUserId(c), subscriptionId);
	else await pushSubscriptionService.unregisterAllByUserId(c, userContext.getUserId(c));
	return c.json(result.ok());
});
