import app from '../hono/hono';
import loginService from '../service/login-service';
import result from '../model/result';
import userContext from '../security/user-context';
import constant from '../const/constant';

function setAuthCookie(c, token) {
	const expires = new Date(Date.now() + constant.TOKEN_EXPIRE * 1000);
	c.res.headers.set('Set-Cookie', `${constant.TOKEN_COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Expires=${expires.toUTCString()}`);
}

function clearAuthCookie(c) {
	c.res.headers.set('Set-Cookie', `${constant.TOKEN_COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`);
}

app.post('/login', async (c) => {
	const token = await loginService.login(c, await c.req.json());
	setAuthCookie(c, token);
	return c.json(result.ok({ token: token }));
});

app.post('/register', async (c) => {
	const jwt = await loginService.register(c, await c.req.json());
	return c.json(result.ok(jwt));
});

app.delete('/logout', async (c) => {
	await loginService.logout(c, userContext.getUserId(c));
	clearAuthCookie(c);
	return c.json(result.ok());
});

