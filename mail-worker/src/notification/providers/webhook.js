import NotificationProvider from '../notification-provider.js';
import emailUtils from '../../utils/email-utils.js';

function getRecipientName(emailData) {
	try {
		const list = JSON.parse(emailData.recipient || '[]');
		if (list.length > 0) {
			const r = list[0];
			return r.name ? `${r.name} <${r.address}>` : (r.address || '');
		}
	} catch {}
	return emailData.toEmail || '';
}

function getRecipientAddress(emailData) {
	try {
		const list = JSON.parse(emailData.recipient || '[]');
		if (list.length > 0) return list[0].address || '';
	} catch {}
	return emailData.toEmail || '';
}

class WebhookProvider extends NotificationProvider {
	name = 'webhook';

	static schema() {
		return {
			type: 'webhook',
			label: 'notifyWebhook',
			fields: [
				{ key: 'url', type: 'input', label: 'webhookUrl', default: '' },
				{ key: 'method', type: 'select', label: 'webhookMethod', default: 'POST', options: [
					{ value: 'POST', label: 'POST' },
					{ value: 'GET', label: 'GET' },
					{ value: 'PUT', label: 'PUT' },
				]},
				{ key: 'contentType', type: 'select', label: 'webhookContentType', default: 'json', options: [
					{ value: 'json', label: 'json' },
					{ value: 'form-data', label: 'formData' },
					{ value: 'custom', label: 'customBody' },
				]},
				{ key: 'headers', type: 'textarea', label: 'webhookHeaders', default: '' },
				{ key: 'bodyTemplate', type: 'textarea', label: 'webhookBodyTemplate', desc: 'webhookBodyTemplateDesc', default: '' },
			],
		};
	}

	async send(notification, emailData, env) {
		const { url, method, headers, bodyTemplate, contentType } = notification;
		if (!url) return;

		const httpMethod = (method || 'POST').toLowerCase();
		const subject = emailData.subject || '';
		const from = emailData.name
			? `${emailData.name} <${emailData.sendEmail || ''}>`
			: (emailData.sendEmail || '');
		const to = getRecipientName(emailData);
		const toAddress = getRecipientAddress(emailData);
		const content = emailData.text || emailUtils.htmlToText(emailData.content) || '';
		const message = `📧 新邮件\n发件人: ${from}\n收件人: ${to}\n主题: ${subject}\n内容: ${content}`;
		const timestamp = emailData.createTime || new Date().toISOString();

		let data = { subject, from, to, toAddress, content, message, timestamp };
		let config = { headers: {} };

		if (httpMethod === 'get') {
			const params = { subject, from, to, toAddress, content, message, timestamp };
			const searchParams = new URLSearchParams(params).toString();
			const separator = url.includes('?') ? '&' : '?';
			const res = await fetch(`${url}${separator}${searchParams}`, {
				method: 'GET',
				...this.parseHeaders(headers, config.headers),
			});
			if (!res.ok) {
				console.error(`[Webhook] GET failed: ${res.status}`);
			}
			return;
		} else if (contentType === 'form-data') {
			const form = new FormData();
			form.append('data', JSON.stringify(data));
			config.headers = { ...config.headers, ...Object.fromEntries(form.headers) };
			data = form;
		} else if (contentType === 'custom') {
			data = (bodyTemplate || '')
				.replace(/\{\{subject\}\}/g, subject)
				.replace(/\{\{from\}\}/g, from)
				.replace(/\{\{to\}\}/g, to)
				.replace(/\{\{toAddress\}\}/g, toAddress)
				.replace(/\{\{content\}\}/g, content)
				.replace(/\{\{message\}\}/g, message)
				.replace(/\{\{timestamp\}\}/g, timestamp);
		}

		config.headers = this.parseHeaders(headers, config.headers);

		if (contentType !== 'form-data') {
			config.headers['Content-Type'] = contentType === 'custom' ? 'text/plain' : 'application/json';
		}

		const res = await fetch(url, {
			method: httpMethod.toUpperCase(),
			headers: config.headers,
			body: httpMethod === 'post' || httpMethod === 'put' ? data : undefined,
		});

		if (!res.ok) {
			console.error(`[Webhook] ${httpMethod.toUpperCase()} failed: ${res.status}`);
		}
	}

	parseHeaders(headers, base = {}) {
		if (!headers) return { ...base };
		try {
			const parsed = typeof headers === 'string' ? JSON.parse(headers) : headers;
			return { ...base, ...parsed };
		} catch {
			return { ...base };
		}
	}
}

export default WebhookProvider;
