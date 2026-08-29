import app from '../hono/hono';
import userService from '../service/user-service';
import result from '../model/result';
import userContext from '../security/user-context';

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

app.get('/my/barkUrl', async (c) => {
	const barkUrl = await userService.getBarkUrl(c, userContext.getUserId(c));
	return c.json(result.ok({ barkUrl }));
});

app.put('/my/barkUrl', async (c) => {
	await userService.setBarkUrl(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok());
});


