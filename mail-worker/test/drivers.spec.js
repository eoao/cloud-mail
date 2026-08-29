import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDriver } from '../src/service/send-provider/drivers';

// Only Resend and the failover logic were covered before. The other drivers
// were written from each provider's documented shape and never executed, and a
// wrong field name there fails silently for that provider alone - the kind of
// bug that only shows up as "mail doesn't send" for one operator.

let calls;
let respondWith;
const realFetch = globalThis.fetch;

beforeEach(() => {
	calls = [];
	respondWith = () => new Response(JSON.stringify({ MessageID: 'pm-1', messageId: 'brevo-1', id: 'mg-1' }), {
		status: 200,
		headers: { 'Content-Type': 'application/json' }
	});

	globalThis.fetch = async (url, init = {}) => {
		calls.push({
			url: String(url),
			method: init.method,
			headers: new Headers(init.headers ?? {}),
			body: init.body,
			json: typeof init.body === 'string' ? JSON.parse(init.body) : null
		});
		return respondWith();
	};
});

afterEach(() => {
	globalThis.fetch = realFetch;
});

const params = {
	name: 'Alice',
	accountEmail: 'alice@example.com',
	receiveEmail: ['bob@example.com', 'carol@example.com'],
	cc: ['cc@example.com'],
	bcc: ['bcc@example.com'],
	subject: 'Quarterly report',
	text: 'plain body',
	html: '<p>rich body</p>',
	sendType: 'reply',
	messageId: '<parent@example.com>',
	base64Attachments: [{ filename: 'a.pdf', content: 'AAAA', contentType: 'application/pdf' }],
	bufferAttachments: [{ filename: 'a.pdf', content: new Uint8Array([1, 2, 3]), mimeType: 'application/pdf' }]
};

describe('postmark driver', () => {

	it('sends the fields Postmark actually reads', async () => {
		await getDriver('postmark').send({}, params, { serverToken: 'tok' });

		const [call] = calls;
		expect(call.url).toBe('https://api.postmarkapp.com/email');
		expect(call.headers.get('X-Postmark-Server-Token')).toBe('tok');

		// Postmark takes comma-joined strings, not arrays - an array would be
		// serialised as JSON and rejected.
		expect(call.json.To).toBe('bob@example.com,carol@example.com');
		expect(call.json.Cc).toBe('cc@example.com');
		expect(call.json.Bcc).toBe('bcc@example.com');
		expect(call.json.From).toBe('Alice <alice@example.com>');
		expect(call.json.Subject).toBe('Quarterly report');
		expect(call.json.TextBody).toBe('plain body');
		expect(call.json.HtmlBody).toBe('<p>rich body</p>');
		expect(call.json.MessageStream).toBe('outbound');
	});

	it('carries reply headers in Postmark\'s name/value form', async () => {
		await getDriver('postmark').send({}, params, { serverToken: 'tok' });

		expect(calls[0].json.Headers).toEqual([
			{ Name: 'in-reply-to', Value: '<parent@example.com>' },
			{ Name: 'references', Value: '<parent@example.com>' }
		]);
	});

	it('attaches base64 content under the keys Postmark expects', async () => {
		await getDriver('postmark').send({}, params, { serverToken: 'tok' });

		expect(calls[0].json.Attachments).toEqual([
			{ Name: 'a.pdf', Content: 'AAAA', ContentType: 'application/pdf' }
		]);
	});

	it('returns the provider message id', async () => {
		const out = await getDriver('postmark').send({}, params, { serverToken: 'tok' });
		expect(out).toMatchObject({ providerMessageId: 'pm-1', status: 'sent' });
	});
});

describe('sendgrid driver', () => {

	it('builds a personalization block rather than top-level recipients', async () => {
		await getDriver('sendgrid').send({}, params, { apiKey: 'sg-key' });

		const [call] = calls;
		expect(call.url).toBe('https://api.sendgrid.com/v3/mail/send');
		expect(call.headers.get('Authorization')).toBe('Bearer sg-key');

		const [personalization] = call.json.personalizations;
		expect(personalization.to).toEqual([{ email: 'bob@example.com' }, { email: 'carol@example.com' }]);
		expect(personalization.cc).toEqual([{ email: 'cc@example.com' }]);
		expect(personalization.bcc).toEqual([{ email: 'bcc@example.com' }]);
		expect(call.json.from).toEqual({ email: 'alice@example.com', name: 'Alice' });
	});

	it('orders content plain-then-html, which SendGrid requires', async () => {
		await getDriver('sendgrid').send({}, params, { apiKey: 'sg-key' });

		expect(calls[0].json.content.map(c => c.type)).toEqual(['text/plain', 'text/html']);
	});

	it('omits a content part that has no body', async () => {
		await getDriver('sendgrid').send({}, { ...params, text: '' }, { apiKey: 'sg-key' });

		expect(calls[0].json.content.map(c => c.type)).toEqual(['text/html']);
	});
});

describe('brevo driver', () => {

	it('uses sender/to objects and Brevo\'s api-key header', async () => {
		await getDriver('brevo').send({}, params, { apiKey: 'brevo-key' });

		const [call] = calls;
		expect(call.url).toBe('https://api.brevo.com/v3/smtp/email');
		// Brevo uses api-key, not Authorization - a bearer token is ignored.
		expect(call.headers.get('api-key')).toBe('brevo-key');
		expect(call.headers.get('Authorization')).toBe(null);

		expect(call.json.sender).toEqual({ email: 'alice@example.com', name: 'Alice' });
		expect(call.json.to).toEqual([{ email: 'bob@example.com' }, { email: 'carol@example.com' }]);
		expect(call.json.textContent).toBe('plain body');
		expect(call.json.htmlContent).toBe('<p>rich body</p>');
	});

	it('names attachments with Brevo\'s lowercase keys', async () => {
		await getDriver('brevo').send({}, params, { apiKey: 'k' });
		expect(calls[0].json.attachment).toEqual([{ name: 'a.pdf', content: 'AAAA' }]);
	});
});

describe('mailgun driver', () => {

	it('posts multipart form data with basic auth', async () => {
		await getDriver('mailgun').send({}, params, { apiKey: 'key-123', domain: 'mg.example.com' });

		const [call] = calls;
		expect(call.url).toBe('https://api.mailgun.net/v3/mg.example.com/messages');
		expect(call.headers.get('Authorization')).toBe(`Basic ${btoa('api:key-123')}`);

		// Mailgun takes form fields, one per recipient - not a JSON body.
		expect(call.body).toBeInstanceOf(FormData);
		expect(call.body.getAll('to')).toEqual(['bob@example.com', 'carol@example.com']);
		expect(call.body.get('from')).toBe('Alice <alice@example.com>');
		expect(call.body.get('subject')).toBe('Quarterly report');
		expect(call.body.get('h:in-reply-to')).toBe('<parent@example.com>');
	});

	it('uses the EU host when the region says so', async () => {
		await getDriver('mailgun').send({}, params, { apiKey: 'k', domain: 'd.com', region: 'eu' });
		expect(calls[0].url).toContain('api.eu.mailgun.net');
	});

	it('falls back to the sender domain when none is configured', async () => {
		await getDriver('mailgun').send({}, params, { apiKey: 'k' });
		expect(calls[0].url).toContain('/v3/example.com/messages');
	});
});

describe('smtp-http driver', () => {

	it('refuses to send with no endpoint, and does not retry it elsewhere', async () => {
		const error = await getDriver('smtp-http').send({}, params, {}).catch(e => e);

		expect(error.message).toMatch(/endpoint is not configured/);
		// Misconfiguration is not transient - failing over would burn the next
		// provider's quota for nothing.
		expect(error.retryable).toBe(false);
		expect(calls).toHaveLength(0);
	});

	it('posts the neutral payload to the configured endpoint', async () => {
		await getDriver('smtp-http').send({}, params, { endpoint: 'https://relay.example.com/send', token: 'tk' });

		const [call] = calls;
		expect(call.url).toBe('https://relay.example.com/send');
		expect(call.headers.get('Authorization')).toBe('Bearer tk');
		expect(call.json.to).toEqual(params.receiveEmail);
		expect(call.json.headers).toMatchObject({ 'in-reply-to': '<parent@example.com>' });
	});
});

describe('driver error handling', () => {

	it('marks a 4xx as final and a 5xx or 429 as retryable', async () => {
		const cases = [
			[400, false], [401, false], [422, false],
			[429, true], [500, true], [503, true]
		];

		for (const [status, retryable] of cases) {
			respondWith = () => new Response(JSON.stringify({ message: 'nope' }), { status });

			const error = await getDriver('postmark').send({}, params, { serverToken: 't' }).catch(e => e);

			expect(error.retryable, `status ${status}`).toBe(retryable);
			expect(error.message).toContain('postmark');
		}
	});

	it('does not choke on a success with an empty body', async () => {
		// SendGrid answers 202 with no content.
		respondWith = () => new Response('', { status: 202 });

		const out = await getDriver('sendgrid').send({}, params, { apiKey: 'k' });
		expect(out).toMatchObject({ status: 'sent' });
	});

	it('surfaces a non-JSON error body instead of swallowing it', async () => {
		respondWith = () => new Response('<html>Bad Gateway</html>', { status: 502 });

		const error = await getDriver('brevo').send({}, params, { apiKey: 'k' }).catch(e => e);
		expect(error.message).toContain('Bad Gateway');
	});
});
