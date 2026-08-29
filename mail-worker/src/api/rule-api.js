import app from '../hono/hono';
import result from '../model/result';
import ruleService from '../service/rule-service';
import emailService from '../service/email-service';
import userContext from '../security/user-context';

// Inbound rules, templates, and the send-timing controls (schedule, undo,
// snooze). All per-user and scoped inside the services.

app.get('/rule/vocabulary', (c) => c.json(result.ok(ruleService.vocabulary())));

app.get('/rule/list', async (c) => {
	return c.json(result.ok(await ruleService.list(c, userContext.getUserId(c))));
});

app.post('/rule/set', async (c) => {
	return c.json(result.ok(await ruleService.upsert(c, await c.req.json(), userContext.getUserId(c))));
});

app.delete('/rule/delete', async (c) => {
	return c.json(result.ok(await ruleService.remove(c, c.req.query('ruleId'), userContext.getUserId(c))));
});

app.get('/template/list', async (c) => {
	return c.json(result.ok(await ruleService.listTemplates(c, userContext.getUserId(c))));
});

app.post('/template/set', async (c) => {
	return c.json(result.ok(await ruleService.upsertTemplate(c, await c.req.json(), userContext.getUserId(c))));
});

app.delete('/template/delete', async (c) => {
	return c.json(result.ok(await ruleService.removeTemplate(c, c.req.query('templateId'), userContext.getUserId(c))));
});

// Undo send: only succeeds while the message is still parked as SCHEDULED.
app.put('/email/cancelSend', async (c) => {
	const { emailId } = await c.req.json();
	return c.json(result.ok(await emailService.cancelScheduled(c, emailId, userContext.getUserId(c))));
});

app.put('/email/snooze', async (c) => {
	const { emailIds, until } = await c.req.json();
	return c.json(result.ok(await emailService.snooze(c, emailIds, until, userContext.getUserId(c))));
});
