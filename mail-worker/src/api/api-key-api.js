import app from '../hono/hono';
import result from '../model/result';
import apiKeyService from '../service/api-key-service';
import emailService from '../service/email-service';
import contactService from '../service/contact-service';
import searchService from '../service/search-service';
import userContext from '../security/user-context';
import BizError from '../error/biz-error';

// ---- key and webhook management (session-authenticated) -----------------

app.get('/apiKey/scopes', (c) => c.json(result.ok(apiKeyService.scopes())));

app.get('/apiKey/list', async (c) => {
	return c.json(result.ok(await apiKeyService.list(c, userContext.getUserId(c))));
});

// The plaintext key is in this response and nowhere else, ever again.
app.post('/apiKey/create', async (c) => {
	return c.json(result.ok(await apiKeyService.create(c, await c.req.json(), userContext.getUserId(c))));
});

app.put('/apiKey/revoke', async (c) => {
	const { keyId } = await c.req.json();
	return c.json(result.ok(await apiKeyService.revoke(c, keyId, userContext.getUserId(c))));
});

app.get('/webhookOut/list', async (c) => {
	return c.json(result.ok(await apiKeyService.listWebhooks(c, userContext.getUserId(c))));
});

app.post('/webhookOut/set', async (c) => {
	return c.json(result.ok(await apiKeyService.upsertWebhook(c, await c.req.json(), userContext.getUserId(c))));
});

app.delete('/webhookOut/delete', async (c) => {
	return c.json(result.ok(await apiKeyService.removeWebhook(c, c.req.query('webhookId'), userContext.getUserId(c))));
});

app.post('/webhookOut/test', async (c) => {
	const userId = userContext.getUserId(c);
	return c.json(result.ok(await apiKeyService.deliver(c, userId, 'test', { hello: 'world' })));
});

// ---- public API (key-authenticated) -------------------------------------
//
// Everything under /v1 is reached with an API key, and every handler checks the
// scope the key was issued with. A key with mail:read cannot send.

function requireScope(c, scope) {
	const scopes = c.get('apiScopes') ?? [];

	if (!scopes.includes(scope)) {
		throw new BizError(`this key does not have the "${scope}" scope`, 403);
	}
}

app.get('/v1/me', (c) => {
	const user = c.get('user');
	return c.json(result.ok({ userId: user.userId, email: user.email, scopes: c.get('apiScopes') }));
});

app.get('/v1/emails', async (c) => {
	requireScope(c, 'mail:read');
	return c.json(result.ok(await searchService.search(c, c.req.query(), userContext.getUserId(c))));
});

app.post('/v1/emails/send', async (c) => {
	requireScope(c, 'mail:send');
	const body = await c.req.json();
	return c.json(result.ok(await emailService.send(c, body, userContext.getUserId(c))));
});

app.get('/v1/contacts', async (c) => {
	requireScope(c, 'contacts:read');
	return c.json(result.ok(await contactService.list(c, c.req.query(), userContext.getUserId(c))));
});

app.post('/v1/contacts', async (c) => {
	requireScope(c, 'contacts:write');
	return c.json(result.ok(await contactService.upsert(c, await c.req.json(), userContext.getUserId(c))));
});

app.get('/v1/calendar', async (c) => {
	requireScope(c, 'calendar:read');
	return c.json(result.ok(await contactService.listEvents(c, c.req.query(), userContext.getUserId(c))));
});

app.post('/v1/tasks', async (c) => {
	requireScope(c, 'tasks:write');
	return c.json(result.ok(await contactService.upsertTask(c, await c.req.json(), userContext.getUserId(c))));
});
