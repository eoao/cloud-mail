import app from '../hono/hono';
import result from '../model/result';
import searchService from '../service/search-service';
import threadService from '../service/thread-service';
import labelService from '../service/label-service';
import userContext from '../security/user-context';

// Search, conversations and labels. All of these are per-user and scoped by
// userId inside the services - never by a client-supplied id.

app.get('/search/email', async (c) => {
	const userId = userContext.getUserId(c);
	const rows = await searchService.search(c, c.req.query(), userId);

	// Attach label chips in one extra query rather than one per row.
	const labels = await labelService.forEmails(c, rows.map(r => r.emailId), userId);

	return c.json(result.ok(rows.map(row => ({ ...row, labels: labels[row.emailId] ?? [] }))));
});

app.get('/thread/messages', async (c) => {
	const userId = userContext.getUserId(c);
	return c.json(result.ok(await threadService.messages(c, c.req.query('threadId'), userId)));
});

app.put('/thread/read', async (c) => {
	const { threadId } = await c.req.json();
	await threadService.markRead(c, threadId, userContext.getUserId(c));
	return c.json(result.ok(true));
});

app.delete('/thread/delete', async (c) => {
	const threadIds = (c.req.query('threadIds') ?? '').split(',').filter(Boolean);
	return c.json(result.ok(await threadService.deleteThreads(c, threadIds, userContext.getUserId(c))));
});

app.get('/label/list', async (c) => {
	return c.json(result.ok(await labelService.list(c, userContext.getUserId(c))));
});

app.post('/label/set', async (c) => {
	return c.json(result.ok(await labelService.upsert(c, await c.req.json(), userContext.getUserId(c))));
});

app.delete('/label/delete', async (c) => {
	return c.json(result.ok(await labelService.remove(c, c.req.query('labelId'), userContext.getUserId(c))));
});

app.post('/label/assign', async (c) => {
	return c.json(result.ok(await labelService.assign(c, await c.req.json(), userContext.getUserId(c))));
});
