import app from '../hono/hono';
import initService from '../service/init-service';

app.get('/init/:secret', (c) => {
	return initService.init(c);
})
