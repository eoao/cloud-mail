import app from '../hono/hono';
import userService from '../service/user-service';
import result from '../model/result';
import userContext from '../security/user-context';
import oauthService from '../service/oauth-service';
import userOAuthService from '../service/user-oauth-service';

app.get('/my/loginUserInfo', async (c) => {
	const user = await userService.loginUserInfo(c, userContext.getUserId(c));
	return c.json(result.ok(user));
});

app.put('/my/resetPassword', async (c) => {
	await userService.resetPassword(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok());
});

app.delete('/my/delete', async (c) => {
        await userService.delete(c, userContext.getUserId(c));
        return c.json(result.ok());
});

app.get('/my/oauth/:provider/authorize', async (c) => {
        const { provider } = c.req.param();
        const data = await oauthService.authorize(c, provider, { mode: 'bind', userId: userContext.getUserId(c) });
        return c.json(result.ok(data));
});

app.post('/my/oauth/:provider/callback', async (c) => {
        const { provider } = c.req.param();
        const data = await oauthService.callback(c, provider, await c.req.json());
        return c.json(result.ok(data));
});

app.delete('/my/oauth/:provider', async (c) => {
        const { provider } = c.req.param();
        await userOAuthService.unbind(c, userContext.getUserId(c), provider);
        return c.json(result.ok());
});


