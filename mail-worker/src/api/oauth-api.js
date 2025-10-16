import app from '../hono/hono';
import oauthService from '../service/oauth-service';
import result from '../model/result';

app.get('/oauth/:provider/authorize', async (c) => {
        const { provider } = c.req.param();
        const data = await oauthService.authorize(c, provider);
        return c.json(result.ok(data));
});

app.post('/oauth/:provider/callback', async (c) => {
        const { provider } = c.req.param();
        const data = await oauthService.callback(c, provider, await c.req.json());
        return c.json(result.ok(data));
});
