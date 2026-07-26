import r2Service from '../service/r2-service';
import app from '../hono/hono';

const SAFE_KEY_RE = /^[a-zA-Z0-9._\-\/]+$/;

app.get('/oss/*', async (c) => {
	const key = c.req.path.split('/oss/')[1];

	if (!key || key.includes('..') || !SAFE_KEY_RE.test(key)) {
		return c.text('Bad request', 400);
	}

	const obj = await r2Service.getObj(c, key);
	return new Response(obj.body, {
		headers: {
			'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
			'Content-Disposition': obj.httpMetadata?.contentDisposition || null
		}
	});
});


