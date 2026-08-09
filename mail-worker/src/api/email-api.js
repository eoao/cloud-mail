import app from '../hono/hono';
import emailService from '../service/email-service';
import result from '../model/result';
import userContext from '../security/user-context';
import attService from '../service/att-service';
import pushSubscriptionService from '../service/push-subscription-service';
import pushWebhookService from '../service/push-webhook-service';

app.get('/email/list', async (c) => {
	const data = await emailService.list(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.get('/email/latest', async (c) => {
	const list = await emailService.latest(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok(list));
});

app.delete('/email/delete', async (c) => {
	const userId = userContext.getUserId(c);
	await emailService.delete(c, c.req.query(), userId);
	if (pushWebhookService.isConfigured(c)) {
		const [subscriptions, unreadCount] = await Promise.all([
			pushSubscriptionService.listByUserId(c, userId),
			emailService.unreadCount(c, userId)
		]);
		if (subscriptions.length) await pushWebhookService.syncBadge(c, subscriptions, unreadCount);
	}
	return c.json(result.ok());
});

app.get('/email/attList', async (c) => {
	const attList = await attService.list(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok(attList));
});

app.post('/email/send', async (c) => {
	const email = await emailService.send(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(email));
});

app.put('/email/read', async (c) => {
	const userId = userContext.getUserId(c);
	await emailService.read(c, await c.req.json(), userId);
	if (pushWebhookService.isConfigured(c)) {
		const [subscriptions, unreadCount] = await Promise.all([
			pushSubscriptionService.listByUserId(c, userId),
			emailService.unreadCount(c, userId)
		]);
		if (subscriptions.length) await pushWebhookService.syncBadge(c, subscriptions, unreadCount);
	}
	return c.json(result.ok());
})

// 原来的接口都是列表查询，没有"按 id 查单封邮件"的能力。iOS App 点了推送通知
// 跳转到具体那封邮件时需要这个。
app.get('/email/detail', async (c) => {
	const data = await emailService.detail(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok(data));
});

// Optional enhanced endpoint. New received mail stores its original RFC822 source in object storage.
// Old enhanced rows return 204 (no stored source); untouched Cloud-Mail 3.0.0 has no route and returns 404. iOS falls back safely in both cases.
app.get('/email/raw', async (c) => {
	const response = await attService.rawSourceResponse(c, c.req.query('emailId'), userContext.getUserId(c));
	return response || c.body(null, 204);
});

