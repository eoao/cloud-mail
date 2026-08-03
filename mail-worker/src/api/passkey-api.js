import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';
import passkeyService from '../service/passkey-service';

app.post('/passkey/auth/options', async (c) => {
	return c.json(result.ok(await passkeyService.authenticationOptions(c)));
});

app.post('/passkey/auth/verify', async (c) => {
	const token = await passkeyService.verifyAuthentication(c, await c.req.json());
	return c.json(result.ok({ token }));
});

app.get('/my/passkey', async (c) => {
	return c.json(result.ok(await passkeyService.status(c, userContext.getUserId(c))));
});

app.post('/my/passkey/reg/options', async (c) => {
	const data = await passkeyService.registrationOptions(c, userContext.getUserId(c), await c.req.json());
	return c.json(result.ok(data));
});

app.post('/my/passkey/reg/verify', async (c) => {
	const data = await passkeyService.verifyRegistration(c, userContext.getUserId(c), await c.req.json());
	return c.json(result.ok(data));
});

app.delete('/my/passkey', async (c) => {
	await passkeyService.delete(c, userContext.getUserId(c), await c.req.json());
	return c.json(result.ok());
});
