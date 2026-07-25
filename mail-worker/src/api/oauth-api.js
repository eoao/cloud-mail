import app from '../hono/hono';
import result from "../model/result";
import oauthService from "../service/oauth-service";
import constant from '../const/constant';

function setAuthCookie(c, token) {
	const expires = new Date(Date.now() + constant.TOKEN_EXPIRE * 1000);
	c.res.headers.set('Set-Cookie', `${constant.TOKEN_COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Expires=${expires.toUTCString()}`);
}

app.post('/oauth/linuxDo/login', async (c) => {
	const loginInfo = await oauthService.linuxDoLogin(c, await c.req.json());
	if (loginInfo.token) {
		setAuthCookie(c, loginInfo.token);
	}
	return c.json(result.ok(loginInfo))
});

app.put('/oauth/bindUser', async (c) => {
	const loginInfo = await oauthService.bindUser(c, await c.req.json());
	if (loginInfo.token) {
		setAuthCookie(c, loginInfo.token);
	}
	return c.json(result.ok(loginInfo))
})
