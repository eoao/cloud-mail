import { Hono } from 'hono';
const app = new Hono();

import result from '../model/result';
import { cors } from 'hono/cors';

app.use('*', cors());

app.onError((err, c) => {
	if (err.name === 'BizError') {
		console.log(err.message);
	}else {
		console.error(err);
	}
	return c.json(result.fail(err.message, err.code));
});

export default app;


