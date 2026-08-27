import app from '../hono/hono';
import result from '../model/result';
import applyService from '../service/apply-service';
import userContext from '../security/user-context';

app.post('/oauth/apply/add', async (c) => {
	await applyService.submit(c, await c.req.json());
	return c.json(result.ok());
});

app.get('/oauth/apply/mine', async (c) => {
	const data = await applyService.mine(c, { token: c.req.header('Authorization') });
	return c.json(result.ok(data));
});

app.get('/apply/list', async (c) => {
	const data = await applyService.list(c, c.req.query());
	return c.json(result.ok(data));
});

app.put('/apply/approve', async (c) => {
	await applyService.approve(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok());
});

app.put('/apply/reject', async (c) => {
	await applyService.reject(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok());
});
