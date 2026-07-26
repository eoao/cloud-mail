import app from '../hono/hono';
import { dbInit } from '../init/init';
import result from '../model/result';

app.get('/init', async (c) => {
	const secret = c.req.header('Authorization');
	const resultRes = await dbInit.init(c, secret);
	if (!resultRes.success) {
		return c.json(result.fail(resultRes.message, 401), 401);
	}
	return c.json(result.ok(resultRes.message));
});
