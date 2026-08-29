import { Hono } from 'hono';
const app = new Hono();

import result from '../model/result';
import { cors } from 'hono/cors';

app.use('*', cors());

/**
 * The app's own frontend reads the failure code out of the body and expects
 * HTTP 200, so that contract is preserved. The public /v1 API cannot: a script
 * checking `res.ok`, a proxy, or any monitoring tool treats 200 as success and
 * would sail straight past an auth failure. So /v1 gets the real HTTP status.
 */
function failure(c, message, code) {
	const body = result.fail(message, code);
	const isPublicApi = c.req.path.startsWith('/v1');
	const status = Number(body.code);

	if (isPublicApi && Number.isInteger(status) && status >= 400 && status <= 599) {
		return c.json(body, status);
	}

	return c.json(body);
}

app.onError((err, c) => {
	if (err.name === 'BizError') {
		console.log(err.message);
	} else {
		console.error(err);
	}

	if (err.message === `Cannot read properties of undefined (reading 'get')`) {
		return failure(c, 'KV数据库未绑定 KV database not bound', 502);
	}

	if (err.message === `Cannot read properties of undefined (reading 'put')`) {
		return failure(c, 'KV数据库未绑定 KV database not bound', 502);
	}

	if (err.message === `Cannot read properties of undefined (reading 'prepare')`) {
		return failure(c, 'D1数据库未绑定 D1 database not bound', 502);
	}

	return failure(c, err.message, err.code);
});

export default app;


