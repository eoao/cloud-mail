import app from '../hono/hono';
import result from '../model/result';
import providerService from '../service/send-provider';

// Admin management of outbound providers. Auth and permissions are enforced
// centrally in src/security/security.js.

app.get('/sendProvider/drivers', (c) => {
	return c.json(result.ok(providerService.listDrivers()));
});

app.get('/sendProvider/list', async (c) => {
	return c.json(result.ok(await providerService.listAll(c)));
});

app.post('/sendProvider/set', async (c) => {
	const body = await c.req.json();
	return c.json(result.ok(await providerService.upsert(c, body)));
});

app.delete('/sendProvider/delete', async (c) => {
	const providerId = Number(c.req.query('providerId'));
	return c.json(result.ok(await providerService.remove(c, providerId)));
});

// DNS records the operator still has to add for this provider to be trusted.
app.get('/sendProvider/dns', async (c) => {
	const { type, domain } = c.req.query();
	return c.json(result.ok(providerService.dnsAdvice(type, domain, c.env.admin)));
});

/**
 * Send a real message through one provider. This is the only honest way to know
 * a provider works - credentials can be valid while the domain is unverified.
 */
app.post('/sendProvider/test', async (c) => {

	const { providerId, to } = await c.req.json();
	const rows = await providerService.listAll(c);
	const row = rows.find(r => r.providerId === Number(providerId));

	if (!row) {
		return c.json(result.fail('provider not found', 404));
	}

	const recipient = to || c.env.admin;

	try {
		await providerService.send(c, row.domain, {
			name: 'cloud-mail',
			accountEmail: `postmaster@${row.domain}`,
			receiveEmail: [recipient],
			subject: 'cloud-mail provider test',
			text: `This test message was sent through ${row.type} for ${row.domain}.`,
			html: `<p>This test message was sent through <b>${row.type}</b> for <b>${row.domain}</b>.</p>`,
			sendType: 'test'
		}, () => []);

		return c.json(result.ok({ sent: true, to: recipient, type: row.type }));
	} catch (e) {
		return c.json(result.ok({ sent: false, to: recipient, type: row.type, error: e.message }));
	}
});
