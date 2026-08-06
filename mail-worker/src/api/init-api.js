import app from '../hono/hono';
import { dbInit } from '../init/init';

app.post('/init', async (c) => {
	return dbInit.init(c, c.req.header('X-Init-Secret'));
});

app.get('/init/:secret', async (c) => {
	return dbInit.init(c, c.req.param('secret'), true);
});
