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
				]},
				{ key: 'contentType', type: 'select', label: 'webhookContentType', default: 'json', options: [
					{ value: 'json', label: 'json' },
					{ value: 'form-data', label: 'formData' },
					{ value: 'custom', label: 'customBody' },
				]},
				{ key: 'headers', type: 'input', label: 'webhookHeaders', default: '' },
				{ key: 'bodyTemplate', type: 'input', label: 'webhookBodyTemplate', default: '' },
			],
		};
	}

	async send(notification, emailData, env) {
		const { url, method, headers, contentType } = notification;
		if (!url) return;

		const httpMethod = (method || 'POST').toLowerCase();
		const subject = emailData.subject || '';
		const from = emailData.name
			? `${emailData.name} <${emailData.sendEmail || ''}>`
			: (emailData.sendEmail || '');
		const to = getRecipientName(emailData);
		const toAddress = getRecipientAddress(emailData);
		const content = emailData.text || emailUtils.htmlToText(emailData.content) || '';
		const tz = env.TIMEZONE || 'Asia/Shanghai';
		const ts = emailData.createTime ? new Date(emailData.createTime) : new Date();
		const timestamp = ts.toLocaleString('zh-CN', { timeZone: tz, hour12: false });
		const message = `📧 新邮件\n发件人: ${from}\n收件人: ${to}\n主题: ${subject}\n时间: ${timestamp}\n内容: ${content}`;

		const defaultData = { subject, from, to, toAddress, content, message, timestamp };

		const requestHeaders = {};
		if (headers) {
			Object.assign(requestHeaders, this.parseHeaders(headers));
		}

		if (httpMethod === 'get') {
			const searchParams = new URLSearchParams(data).toString();
			const separator = url.includes('?') ? '&' : '?';
			const res = await fetch(`${url}${separator}${searchParams}`, {
				method: 'GET',
				headers: requestHeaders,
			});
			if (!res.ok) {
				console.error(`[Webhook] GET failed: ${res.status}`);
			}
			return;
		}

		let body;
		const rawBody = notification.body || {};
		const bodyObj = typeof rawBody === 'string' ? (() => { try { return JSON.parse(rawBody); } catch { return {}; } })() : rawBody;

		if (contentType === 'multipart/form-data') {
			const form = new FormData();
			form.append('data', JSON.stringify(bodyObj));
			Object.assign(requestHeaders, Object.fromEntries(form.headers));
			body = form;
		} else {
			const rendered = this.renderObject(bodyObj, defaultData);
			body = JSON.stringify(rendered);
			if (!requestHeaders['Content-Type'] && !requestHeaders['content-type']) {
				requestHeaders['Content-Type'] = 'application/json';
			}
		}

		const res = await fetch(url, {
			method: 'POST',
			headers: requestHeaders,
			body,
		});

		if (!res.ok) {
			console.error(`[Webhook] POST failed: ${res.status}`);
		}
	}

	renderTemplate(template, data) {
		return template
			.replace(/\{\{subject\}\}/g, data.subject)
			.replace(/\{\{from\}\}/g, data.from)
			.replace(/\{\{to\}\}/g, data.to)
			.replace(/\{\{toAddress\}\}/g, data.toAddress)
			.replace(/\{\{content\}\}/g, data.content)
			.replace(/\{\{message\}\}/g, data.message)
			.replace(/\{\{timestamp\}\}/g, data.timestamp);
	}

	renderObject(obj, data) {
		if (typeof obj === 'string') return this.renderTemplate(obj, data);
		if (Array.isArray(obj)) return obj.map(item => this.renderObject(item, data));
		if (obj && typeof obj === 'object') {
			const result = {};
			for (const [key, value] of Object.entries(obj)) {
				result[key] = this.renderObject(value, data);
			}
			return result;
		}
		return obj;
	}

	parseHeaders(headers) {
		if (!headers) return {};
		try {
			return typeof headers === 'string' ? JSON.parse(headers) : headers;
		} catch {
			return {};
		}
	}
}

export default WebhookProvider;
