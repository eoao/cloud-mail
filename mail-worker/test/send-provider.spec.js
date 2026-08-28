import { env } from 'cloudflare:test';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import providerService from '../src/service/send-provider';
import { drivers, getDriver, listDrivers } from '../src/service/send-provider/drivers';
import { normalizeWebhook } from '../src/service/resend-service';
import { emailConst } from '../src/const/entity-const';
import { dbInit } from '../src/init/init';

const c = { env };

function initContext(secret) {
	const store = new Map();
	return {
		env,
		req: { param: () => secret },
		set: (k, v) => store.set(k, v),
		get: (k) => store.get(k),
		text: (body, status = 200) => ({ body, status })
	};
}

/** Swap in a fake driver so tests never touch the network. */
function stubDriver(key, impl, { encoding = 'base64' } = {}) {
	drivers[key] = { key, label: key, credentialFields: [], attachmentEncoding: encoding, send: impl };
}

describe('send provider registry', () => {

	beforeAll(async () => {
		await dbInit.init(initContext(env.init_secret));
	});

	beforeEach(async () => {
		await env.db.prepare('DELETE FROM send_provider').run();
	});

	it('creates the send_provider table', async () => {
		const row = await env.db.prepare(
			`SELECT name FROM sqlite_master WHERE name = 'send_provider'`
		).first();
		expect(row?.name).toBe('send_provider');
	});

	it('ships a driver for every provider the UI offers', () => {
		const keys = listDrivers().map(d => d.key);
		expect(keys).toContain('resend');
		expect(keys).toContain('cloudflare');
		expect(keys).toContain('postmark');
		expect(keys).toContain('sendgrid');
		expect(keys).toContain('brevo');
		expect(keys).toContain('mailgun');
		expect(keys).toContain('smtp-http');
		for (const key of keys) {
			expect(typeof getDriver(key).send).toBe('function');
		}
	});

	it('rejects an unknown provider type on save', async () => {
		await expect(providerService.upsert(c, { domain: 'a.com', type: 'nope' })).rejects.toThrow(/unknown provider/);
	});

	it('masks credentials when listing, but keeps them for sending', async () => {
		await providerService.upsert(c, {
			domain: 'a.com',
			type: 'resend',
			credentials: { apiKey: 're_supersecretvalue' }
		});

		const [listed] = await providerService.listAll(c);
		expect(listed.credentials.apiKey).not.toContain('supersecret');
		expect(listed.credentials.apiKey.startsWith('re_s')).toBe(true);

		let seen = null;
		stubDriver('resend', async (_c, _p, creds) => {
			seen = creds.apiKey;
			return { providerMessageId: 'id', status: 'sent' };
		});

		await providerService.send(c, 'a.com', { receiveEmail: ['x@y.com'] }, () => []);
		expect(seen).toBe('re_supersecretvalue');
	});

	it('omitting credentials on update keeps the stored secret', async () => {
		const row = await providerService.upsert(c, {
			domain: 'a.com', type: 'resend', credentials: { apiKey: 'keep-me' }
		});

		await providerService.upsert(c, { providerId: row.providerId, domain: 'a.com', type: 'resend', priority: 5 });

		let seen = null;
		stubDriver('resend', async (_c, _p, creds) => {
			seen = creds.apiKey;
			return { providerMessageId: 'id', status: 'sent' };
		});

		await providerService.send(c, 'a.com', { receiveEmail: ['x@y.com'] }, () => []);
		expect(seen).toBe('keep-me');
	});

	it('picks the highest priority provider first', async () => {
		await providerService.upsert(c, { domain: 'a.com', type: 'resend', credentials: {}, priority: 1 });
		await providerService.upsert(c, { domain: 'a.com', type: 'brevo', credentials: {}, priority: 9 });

		const used = [];
		stubDriver('resend', async () => { used.push('resend'); return { providerMessageId: 'r', status: 'sent' }; });
		stubDriver('brevo', async () => { used.push('brevo'); return { providerMessageId: 'b', status: 'sent' }; });

		const out = await providerService.send(c, 'a.com', { receiveEmail: ['x@y.com'] }, () => []);

		expect(used).toEqual(['brevo']);
		expect(out.type).toBe('brevo');
	});

	it('fails over to the next provider on a transport error', async () => {
		await providerService.upsert(c, { domain: 'a.com', type: 'brevo', credentials: {}, priority: 9 });
		await providerService.upsert(c, { domain: 'a.com', type: 'resend', credentials: {}, priority: 1 });

		stubDriver('brevo', async () => {
			const e = new Error('brevo: 503 upstream down');
			e.retryable = true;
			throw e;
		});
		stubDriver('resend', async () => ({ providerMessageId: 'fallback', status: 'sent' }));

		const out = await providerService.send(c, 'a.com', { receiveEmail: ['x@y.com'] }, () => []);

		expect(out.type).toBe('resend');
		expect(out.providerMessageId).toBe('fallback');

		// The failure is recorded so the admin panel can show why.
		const failed = (await providerService.listAll(c)).find(p => p.type === 'brevo');
		expect(failed.lastError).toContain('503');
	});

	it('does not fail over when the message itself was rejected', async () => {
		await providerService.upsert(c, { domain: 'a.com', type: 'brevo', credentials: {}, priority: 9 });
		await providerService.upsert(c, { domain: 'a.com', type: 'resend', credentials: {}, priority: 1 });

		let resendCalled = false;
		stubDriver('brevo', async () => {
			const e = new Error('brevo: domain not verified');
			e.retryable = false;
			throw e;
		});
		stubDriver('resend', async () => { resendCalled = true; return { providerMessageId: 'x', status: 'sent' }; });

		await expect(providerService.send(c, 'a.com', { receiveEmail: ['x@y.com'] }, () => []))
			.rejects.toThrow(/not verified/);
		expect(resendCalled).toBe(false);
	});

	it('reports "no provider" distinctly so the UI can explain it', async () => {
		await expect(providerService.send(c, 'nothing.com', { receiveEmail: ['x@y.com'] }, () => []))
			.rejects.toMatchObject({ noProvider: true });
	});

	it('skips a provider that has hit its daily limit', async () => {
		const row = await providerService.upsert(c, {
			domain: 'a.com', type: 'brevo', credentials: {}, priority: 9, dailyLimit: 2
		});
		await providerService.upsert(c, { domain: 'a.com', type: 'resend', credentials: {}, priority: 1 });

		const todayStr = new Date().toISOString().slice(0, 10);
		await env.db.prepare('UPDATE send_provider SET sent_today = 2, sent_date = ? WHERE provider_id = ?')
			.bind(todayStr, row.providerId).run();

		stubDriver('brevo', async () => { throw new Error('should not be used'); });
		stubDriver('resend', async () => ({ providerMessageId: 'ok', status: 'sent' }));

		const out = await providerService.send(c, 'a.com', { receiveEmail: ['x@y.com'] }, () => []);
		expect(out.type).toBe('resend');
	});

	it('counts every recipient against the daily quota', async () => {
		await providerService.upsert(c, { domain: 'a.com', type: 'resend', credentials: {}, dailyLimit: 10 });
		stubDriver('resend', async () => ({ providerMessageId: 'ok', status: 'sent' }));

		await providerService.send(c, 'a.com', { receiveEmail: ['a@x.com', 'b@x.com', 'c@x.com'] }, () => []);

		const [row] = await providerService.listAll(c);
		expect(row.sentToday).toBe(3);
	});

	it('encodes attachments once per encoding, not once per attempt', async () => {
		await providerService.upsert(c, { domain: 'a.com', type: 'brevo', credentials: {}, priority: 9 });
		await providerService.upsert(c, { domain: 'a.com', type: 'resend', credentials: {}, priority: 1 });

		let builds = 0;
		const build = async () => { builds++; return [{ filename: 'a.txt', content: 'x' }]; };

		stubDriver('brevo', async () => {
			const e = new Error('transient');
			e.retryable = true;
			throw e;
		}, { encoding: 'base64' });
		stubDriver('resend', async () => ({ providerMessageId: 'ok', status: 'sent' }), { encoding: 'base64' });

		await providerService.send(c, 'a.com', { receiveEmail: ['x@y.com'] }, build);
		expect(builds).toBe(1);
	});

	it('imports legacy resend_tokens exactly once', async () => {
		expect(await providerService.importResendTokens(c, { 'a.com': 're_1', 'b.com': 're_2' })).toBe(2);
		expect(await providerService.importResendTokens(c, { 'a.com': 're_1', 'b.com': 're_2' })).toBe(0);
		expect((await providerService.listAll(c)).length).toBe(2);
	});

	it('suggests SPF and DMARC records per provider', () => {
		const records = providerService.dnsAdvice('resend', 'a.com', 'admin@a.com');
		expect(records.some(r => r.content.includes('amazonses.com'))).toBe(true);
		expect(records.some(r => r.name === '_dmarc.a.com')).toBe(true);
	});
});

describe('webhook normalisation', () => {

	it('maps resend events', () => {
		expect(normalizeWebhook('resend', { type: 'email.delivered', data: { email_id: 'e1' } }))
			.toMatchObject({ providerMessageId: 'e1', status: emailConst.status.DELIVERED });

		expect(normalizeWebhook('resend', { type: 'email.failed', data: { email_id: 'e2', failed: { reason: 'nope' } } }))
			.toMatchObject({ status: emailConst.status.FAILED, message: 'nope' });
	});

	it('maps postmark events', () => {
		expect(normalizeWebhook('postmark', { RecordType: 'Bounce', MessageID: 'p1', Description: 'hard bounce' }))
			.toMatchObject({ providerMessageId: 'p1', status: emailConst.status.BOUNCED, message: 'hard bounce' });
	});

	it('maps sendgrid events and strips the id suffix', () => {
		expect(normalizeWebhook('sendgrid', { event: 'delivered', sg_message_id: 'abc.filter0001' }))
			.toMatchObject({ providerMessageId: 'abc', status: emailConst.status.DELIVERED });
	});

	it('ignores event types it does not model', () => {
		expect(normalizeWebhook('resend', { type: 'email.opened', data: { email_id: 'e' } })).toBe(null);
		expect(normalizeWebhook('sendgrid', { event: 'open' })).toBe(null);
		expect(normalizeWebhook('unknown-provider', {})).toBe(null);
	});
});
