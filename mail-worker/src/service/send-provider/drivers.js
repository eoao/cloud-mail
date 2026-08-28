import { Resend } from 'resend';
import { formatFrom, replyHeaders, postJson } from './driver-utils';

// Outbound drivers.
//
// Every driver exposes the same shape:
//   { key, label, credentialFields, needsAttachments, send(ctx, params) }
//
// send() returns { providerMessageId, status } where status is 'sent' when the
// provider only accepted the message, or 'delivered' when it actually handed it
// over. Anything that throws with `retryable !== false` lets the registry try
// the next provider for the same domain.
//
// params is provider-neutral:
//   { name, accountEmail, receiveEmail[], cc[], bcc[], subject, text, html,
//     base64Attachments[], bufferAttachments[], sendType, messageId }

const DELIVERED = 'delivered';
const SENT = 'sent';

/** Cloudflare Email Sending - only reaches addresses verified on the account. */
const cloudflare = {
	key: 'cloudflare',
	label: 'Cloudflare Email Sending',
	credentialFields: [],
	attachmentEncoding: 'buffer',

	available: (c) => !!c.env.email,

	async send(c, params) {

		const form = {
			from: { email: params.accountEmail, name: params.name },
			to: [...params.receiveEmail],
			subject: params.subject
		};

		if (params.cc?.length) form.cc = [...params.cc];
		if (params.bcc?.length) form.bcc = [...params.bcc];
		if (params.text) form.text = params.text;
		if (params.html) form.html = params.html;

		const attachments = (params.bufferAttachments ?? []).map(a => {
			const item = {
				content: a.content,
				filename: a.filename,
				type: a.mimeType || a.contentType || a.type || 'application/octet-stream',
				disposition: a.contentId ? 'inline' : 'attachment'
			};
			if (a.contentId) {
				item.contentId = a.contentId.replace(/^<|>$/g, '');
			}
			return item;
		});

		if (attachments.length) form.attachments = attachments;

		const headers = replyHeaders(params);
		if (headers) form.headers = headers;

		const result = await c.env.email.send(form);

		return { providerMessageId: result.messageId, status: DELIVERED };
	}
};

const resend = {
	key: 'resend',
	label: 'Resend',
	credentialFields: ['apiKey'],
	attachmentEncoding: 'base64',

	async send(c, params, creds) {

		const client = new Resend(creds.apiKey);

		const form = {
			from: formatFrom(params.name, params.accountEmail),
			to: [...params.receiveEmail],
			subject: params.subject,
			text: params.text,
			html: params.html,
			attachments: params.base64Attachments
		};

		if (params.cc?.length) form.cc = [...params.cc];
		if (params.bcc?.length) form.bcc = [...params.bcc];

		const headers = replyHeaders(params);
		if (headers) form.headers = headers;

		const { data, error } = await client.emails.send(form);

		if (error) {
			const e = new Error(`resend: ${error.message}`);
			e.retryable = false;
			throw e;
		}

		return { providerMessageId: data?.id, status: SENT };
	}
};

const postmark = {
	key: 'postmark',
	label: 'Postmark',
	credentialFields: ['serverToken'],
	attachmentEncoding: 'base64',

	async send(c, params, creds) {

		const body = {
			From: formatFrom(params.name, params.accountEmail),
			To: params.receiveEmail.join(','),
			Subject: params.subject,
			TextBody: params.text,
			HtmlBody: params.html,
			MessageStream: creds.messageStream || 'outbound'
		};

		if (params.cc?.length) body.Cc = params.cc.join(',');
		if (params.bcc?.length) body.Bcc = params.bcc.join(',');

		if (params.base64Attachments?.length) {
			body.Attachments = params.base64Attachments.map(a => {
				const item = {
					Name: a.filename,
					Content: a.content,
					ContentType: a.contentType
				};
				if (a.contentId) {
					item.ContentID = `cid:${a.contentId.replace(/^<|>$/g, '')}`;
				}
				return item;
			});
		}

		const headers = replyHeaders(params);
		if (headers) {
			body.Headers = Object.entries(headers).map(([Name, Value]) => ({ Name, Value }));
		}

		const result = await postJson('https://api.postmarkapp.com/email', {
			headers: { 'X-Postmark-Server-Token': creds.serverToken, Accept: 'application/json' },
			body,
			provider: 'postmark'
		});

		return { providerMessageId: result.MessageID, status: SENT };
	}
};

const sendgrid = {
	key: 'sendgrid',
	label: 'SendGrid',
	credentialFields: ['apiKey'],
	attachmentEncoding: 'base64',

	async send(c, params, creds) {

		const personalization = { to: params.receiveEmail.map(email => ({ email })) };
		if (params.cc?.length) personalization.cc = params.cc.map(email => ({ email }));
		if (params.bcc?.length) personalization.bcc = params.bcc.map(email => ({ email }));

		const content = [];
		if (params.text) content.push({ type: 'text/plain', value: params.text });
		if (params.html) content.push({ type: 'text/html', value: params.html });

		const body = {
			personalizations: [personalization],
			from: { email: params.accountEmail, name: params.name },
			subject: params.subject,
			content
		};

		if (params.base64Attachments?.length) {
			body.attachments = params.base64Attachments.map(a => {
				const item = {
					content: a.content,
					filename: a.filename,
					type: a.contentType,
					disposition: a.contentId ? 'inline' : 'attachment'
				};
				if (a.contentId) {
					item.content_id = a.contentId.replace(/^<|>$/g, '');
				}
				return item;
			});
		}

		const headers = replyHeaders(params);
		if (headers) body.headers = headers;

		// SendGrid answers 202 with an empty body; the id is in a response header,
		// which postJson does not surface, so fall back to a synthetic id.
		await postJson('https://api.sendgrid.com/v3/mail/send', {
			headers: { Authorization: `Bearer ${creds.apiKey}` },
			body,
			provider: 'sendgrid'
		});

		return { providerMessageId: null, status: SENT };
	}
};

const brevo = {
	key: 'brevo',
	label: 'Brevo',
	credentialFields: ['apiKey'],
	attachmentEncoding: 'base64',

	async send(c, params, creds) {

		const body = {
			sender: { email: params.accountEmail, name: params.name },
			to: params.receiveEmail.map(email => ({ email })),
			subject: params.subject,
			textContent: params.text,
			htmlContent: params.html
		};

		if (params.cc?.length) body.cc = params.cc.map(email => ({ email }));
		if (params.bcc?.length) body.bcc = params.bcc.map(email => ({ email }));

		if (params.base64Attachments?.length) {
			body.attachment = params.base64Attachments.map(a => ({
				name: a.filename,
				content: a.content
			}));
		}

		const headers = replyHeaders(params);
		if (headers) body.headers = headers;

		const result = await postJson('https://api.brevo.com/v3/smtp/email', {
			headers: { 'api-key': creds.apiKey, Accept: 'application/json' },
			body,
			provider: 'brevo'
		});

		return { providerMessageId: result.messageId, status: SENT };
	}
};

const mailgun = {
	key: 'mailgun',
	label: 'Mailgun',
	credentialFields: ['apiKey', 'domain', 'region'],
	attachmentEncoding: 'buffer',

	async send(c, params, creds) {

		const host = creds.region === 'eu' ? 'api.eu.mailgun.net' : 'api.mailgun.net';
		const mailgunDomain = creds.domain || params.accountEmail.split('@')[1];

		const form = new FormData();
		form.append('from', formatFrom(params.name, params.accountEmail));
		for (const to of params.receiveEmail) form.append('to', to);
		for (const cc of params.cc ?? []) form.append('cc', cc);
		for (const bcc of params.bcc ?? []) form.append('bcc', bcc);
		form.append('subject', params.subject ?? '');
		if (params.text) form.append('text', params.text);
		if (params.html) form.append('html', params.html);

		const headers = replyHeaders(params);
		for (const [key, value] of Object.entries(headers ?? {})) {
			form.append(`h:${key}`, value);
		}

		for (const a of params.bufferAttachments ?? []) {
			const field = a.contentId ? 'inline' : 'attachment';
			const type = a.mimeType || a.contentType || a.type || 'application/octet-stream';
			form.append(field, new Blob([a.content], { type }), a.filename);
		}

		const res = await fetch(`https://${host}/v3/${mailgunDomain}/messages`, {
			method: 'POST',
			headers: { Authorization: `Basic ${btoa(`api:${creds.apiKey}`)}` },
			body: form
		});

		const raw = await res.text();

		if (!res.ok) {
			const e = new Error(`mailgun: ${raw.slice(0, 300) || res.status}`);
			e.retryable = res.status === 429 || res.status >= 500;
			throw e;
		}

		let id = null;
		try {
			id = JSON.parse(raw).id;
		} catch {
			// non-JSON success body
		}

		return { providerMessageId: id, status: SENT };
	}
};

/**
 * Generic SMTP-over-HTTP bridge: point it at any endpoint that accepts the
 * neutral payload. This is the escape hatch for self-hosted relays, since
 * Workers cannot open raw TCP.
 */
const smtpHttp = {
	key: 'smtp-http',
	label: 'SMTP bridge (HTTP)',
	credentialFields: ['endpoint', 'token'],
	attachmentEncoding: 'base64',

	async send(c, params, creds) {

		if (!creds.endpoint) {
			const e = new Error('smtp-http: endpoint is not configured');
			e.retryable = false;
			throw e;
		}

		const result = await postJson(creds.endpoint, {
			headers: creds.token ? { Authorization: `Bearer ${creds.token}` } : {},
			body: {
				from: formatFrom(params.name, params.accountEmail),
				to: params.receiveEmail,
				cc: params.cc ?? [],
				bcc: params.bcc ?? [],
				subject: params.subject,
				text: params.text,
				html: params.html,
				attachments: params.base64Attachments ?? [],
				headers: replyHeaders(params) ?? {}
			},
			provider: 'smtp-http'
		});

		return { providerMessageId: result.messageId ?? result.id ?? null, status: SENT };
	}
};

export const drivers = {
	[cloudflare.key]: cloudflare,
	[resend.key]: resend,
	[postmark.key]: postmark,
	[sendgrid.key]: sendgrid,
	[brevo.key]: brevo,
	[mailgun.key]: mailgun,
	[smtpHttp.key]: smtpHttp
};

export function getDriver(type) {
	return drivers[type] ?? null;
}

export function listDrivers() {
	return Object.values(drivers).map(d => ({
		key: d.key,
		label: d.label,
		credentialFields: d.credentialFields
	}));
}

export default drivers;
