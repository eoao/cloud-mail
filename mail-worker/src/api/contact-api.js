import app from '../hono/hono';
import result from '../model/result';
import contactService from '../service/contact-service';
import userContext from '../security/user-context';

// Address book, calendar and tasks - all per-user.

app.get('/contact/list', async (c) => {
	return c.json(result.ok(await contactService.list(c, c.req.query(), userContext.getUserId(c))));
});

app.post('/contact/set', async (c) => {
	return c.json(result.ok(await contactService.upsert(c, await c.req.json(), userContext.getUserId(c))));
});

app.delete('/contact/delete', async (c) => {
	return c.json(result.ok(await contactService.remove(c, c.req.query('contactId'), userContext.getUserId(c))));
});

app.get('/calendar/list', async (c) => {
	return c.json(result.ok(await contactService.listEvents(c, c.req.query(), userContext.getUserId(c))));
});

// Import the invitation attached to a message.
app.post('/calendar/import', async (c) => {
	const { ics, emailId } = await c.req.json();
	return c.json(result.ok(await contactService.importIcs(c, ics, userContext.getUserId(c), Number(emailId) || 0)));
});

app.put('/calendar/respond', async (c) => {
	const { eventId, response } = await c.req.json();
	return c.json(result.ok(await contactService.respondToEvent(c, eventId, response, userContext.getUserId(c))));
});

app.delete('/calendar/delete', async (c) => {
	return c.json(result.ok(await contactService.removeEvent(c, c.req.query('eventId'), userContext.getUserId(c))));
});

app.get('/task/list', async (c) => {
	return c.json(result.ok(await contactService.listTasks(c, c.req.query(), userContext.getUserId(c))));
});

app.post('/task/set', async (c) => {
	return c.json(result.ok(await contactService.upsertTask(c, await c.req.json(), userContext.getUserId(c))));
});

app.delete('/task/delete', async (c) => {
	return c.json(result.ok(await contactService.removeTask(c, c.req.query('taskId'), userContext.getUserId(c))));
});
