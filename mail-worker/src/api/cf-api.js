import app from '../hono/hono';
import result from '../model/result';
import cfService from '../service/cf-service';

// In-app Cloudflare control panel. Admin-only; see src/security/security.js.

app.get('/cf/status', async (c) => {
	return c.json(result.ok(await cfService.diagnose(c)));
});

app.post('/cf/fix', async (c) => {
	const { action } = await c.req.json();
	return c.json(result.ok(await cfService.fix(c, action)));
});

app.get('/cf/usage', async (c) => {
	const days = Number(c.req.query('days')) || 7;
	return c.json(result.ok(await cfService.usage(c, days)));
});

// Verify a token and list the accounts/zones it can reach, so the operator can
// pick them without leaving the app.
app.post('/cf/probe', async (c) => {
	const { cfApiToken } = await c.req.json();
	const token = cfApiToken || (await cfService.credentials(c)).token;
	return c.json(result.ok(await cfService.probe(c, token)));
});

app.post('/cf/credentials', async (c) => {
	await cfService.saveCredentials(c, await c.req.json());
	return c.json(result.ok(true));
});
