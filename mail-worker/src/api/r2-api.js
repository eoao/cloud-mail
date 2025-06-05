import r2Service from '../service/r2-service';
import app from '../hono/hono';


app.get('/file/*', async (c) => {
	const key = c.req.path.split('/file/')[1];
	const obj = await r2Service.getObj(c, key);
	return new Response(obj.body, {
		headers: {
			'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
			'Content-Disposition': obj.httpMetadata?.contentDisposition || null
		}
	});
});


