import pushSubscriptionService from './push-subscription-service';

const DEFAULT_GATEWAY = 'https://push.readori.com';
const DISABLED_GATEWAY_VALUES = new Set(['off', 'disabled', 'none', 'false', '0']);

function gatewayURL(c) {
	const configured = String(c.env.cfmail_push_gateway_url ?? '').trim();
	if (DISABLED_GATEWAY_VALUES.has(configured.toLowerCase())) return null;
	const raw = configured || DEFAULT_GATEWAY;
	try {
		const url = new URL(raw);
		const localDev = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
		if (url.protocol !== 'https:' && !(localDev && url.protocol === 'http:')) {
			console.error('CF Mail Push Gateway URL 必须使用 HTTPS');
			return null;
		}
		url.pathname = url.pathname.replace(/\/+$/, '');
		url.search = '';
		url.hash = '';
		return url;
	} catch {
		console.error('CF Mail Push Gateway URL 无效');
		return null;
	}
}

async function parseError(res) {
	try {
		const data = await res.json();
		return String(data?.error || data?.message || '').slice(0, 200);
	} catch {
		return '';
	}
}

function cleanNotificationText(value, max) {
	return String(value || '')
		.replace(/[\u0000-\u001f\u007f]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, max);
}

function notificationFields(subscription, emailRow) {
	const mode = String(subscription?.previewMode || subscription?.preview_mode || 'privateOnly');
	if (mode === 'privateOnly') return {};

	const sender = cleanNotificationText(emailRow?.name || emailRow?.sendEmail, 120);
	if (mode === 'sender') return { sender };

	const subject = cleanNotificationText(emailRow?.subject, 180);
	if (mode === 'senderAndSubject') return { sender, subject };

	const preview = cleanNotificationText(emailRow?.text, 240);
	return { sender, subject, preview };
}

function booleanPreference(subscription, camel, snake, fallback = true) {
	const value = subscription?.[camel] ?? subscription?.[snake];
	if (value === undefined || value === null) return fallback;
	return value === true || value === 1 || value === '1' || value === 'true';
}

function minutePreference(subscription, camel, snake, fallback) {
	const value = Number(subscription?.[camel] ?? subscription?.[snake]);
	return Number.isInteger(value) && value >= 0 && value <= 1439 ? value : fallback;
}

function isQuietHours(subscription, now = new Date()) {
	if (!booleanPreference(subscription, 'quietHoursEnabled', 'quiet_hours_enabled', false)) return false;
	const start = minutePreference(subscription, 'quietStartMinutes', 'quiet_start_minutes', 22 * 60);
	const end = minutePreference(subscription, 'quietEndMinutes', 'quiet_end_minutes', 7 * 60);
	if (start === end) return false;

	let timeZone = String(subscription?.timeZone || subscription?.time_zone || 'UTC').trim() || 'UTC';
	let parts;
	try {
		parts = new Intl.DateTimeFormat('en-GB', {
			timeZone,
			hour: '2-digit',
			minute: '2-digit',
			hourCycle: 'h23'
		}).formatToParts(now);
	} catch {
		timeZone = 'UTC';
		parts = new Intl.DateTimeFormat('en-GB', {
			timeZone,
			hour: '2-digit',
			minute: '2-digit',
			hourCycle: 'h23'
		}).formatToParts(now);
	}
	const hour = Number(parts.find(item => item.type === 'hour')?.value || 0);
	const minute = Number(parts.find(item => item.type === 'minute')?.value || 0);
	const current = hour * 60 + minute;
	return start < end ? (current >= start && current < end) : (current >= start || current < end);
}

function gatewayPayload(subscription, emailRow, unreadCount, event = 'new_mail') {
	return {
		subscriptionId: String(subscription?.subscriptionId || subscription?.subscription_id || '').trim(),
		event,
		emailId: Number(emailRow?.emailId),
		unreadCount: Math.max(0, Number(unreadCount || 0)),
		soundEnabled: booleanPreference(subscription, 'soundEnabled', 'sound_enabled', true),
		badgeEnabled: booleanPreference(subscription, 'badgeEnabled', 'badge_enabled', true),
		...notificationFields(subscription, emailRow)
	};
}

async function postGateway(base, subscription, payload) {
	const id = String(subscription?.subscriptionId || subscription?.subscription_id || '').trim();
	const secret = String(subscription?.pushSecret || subscription?.push_secret || '').trim();
	if (!id || !secret) return { ok: false, skipped: true };
	const endpoint = new URL(`${base.pathname}/v1/push`.replace(/\/+/g, '/'), base.origin);
	const res = await fetch(endpoint.toString(), {
		method: 'POST',
		headers: {
			'authorization': `Bearer ${secret}`,
			'content-type': 'application/json',
			'user-agent': 'CloudMail-Push-Webhook/1.1'
		},
		body: JSON.stringify(payload)
	});
	return { ok: res.ok, res, id };
}

const pushWebhookService = {
	isConfigured(c) {
		return gatewayURL(c) !== null;
	},

	/**
	 * Send a privacy-controlled new-mail event to CF Mail Push Gateway.
	 * Default mode sends no sender/subject/body. Only fields explicitly selected by the user are
	 * transmitted, and the official gateway does not persist those message fields.
	 */
	async pushNewMail(c, subscriptions, emailRow, unreadCount) {
		const base = gatewayURL(c);
		if (!base || !Array.isArray(subscriptions) || subscriptions.length === 0) {
			return { sent: 0, failed: 0, skipped: true };
		}

		let sent = 0;
		let failed = 0;
		const unique = new Map();
		for (const item of subscriptions) {
			const id = String(item?.subscriptionId || item?.subscription_id || '').trim();
			const secret = String(item?.pushSecret || item?.push_secret || '').trim();
			if (!id || !secret || unique.has(id)) continue;
			unique.set(id, item);
			if (unique.size >= 10) break;
		}

		await Promise.all([...unique.values()].map(async item => {
			const quiet = isQuietHours(item);
			const payload = gatewayPayload(item, emailRow, unreadCount, quiet ? 'badge_sync' : 'new_mail');
			if (quiet) delete payload.emailId;
			try {
				const result = await postGateway(base, item, payload);
				if (result.ok) { sent += 1; return; }
				if (result.skipped) return;
				failed += 1;
				const errorText = await parseError(result.res);
				console.error(`CF Mail Push Gateway 失败 status:${result.res.status}${errorText ? ` error:${errorText}` : ''}`);
				if ([401, 404, 410].includes(result.res.status)) {
					await pushSubscriptionService.removeById(c, result.id);
				}
			} catch (error) {
				failed += 1;
				console.error('CF Mail Push Gateway 请求异常:', error?.message || error);
			}
		}));

		console.log(`CF Mail Push Gateway result sent:${sent} failed:${failed} targetCount:${unique.size}`);
		return { sent, failed, skipped: false };
	},

	async syncBadge(c, subscriptions, unreadCount) {
		const base = gatewayURL(c);
		if (!base || !Array.isArray(subscriptions) || subscriptions.length === 0) {
			return { sent: 0, failed: 0, skipped: true };
		}
		const count = Math.max(0, Math.min(99999, Number(unreadCount || 0)));
		const unique = new Map();
		for (const item of subscriptions) {
			const id = String(item?.subscriptionId || item?.subscription_id || '').trim();
			const secret = String(item?.pushSecret || item?.push_secret || '').trim();
			if (!id || !secret || unique.has(id)) continue;
			unique.set(id, item);
			if (unique.size >= 10) break;
		}

		let sent = 0;
		let failed = 0;
		await Promise.all([...unique.values()].map(async item => {
			try {
				const payload = gatewayPayload(item, null, count, 'badge_sync');
				delete payload.emailId;
				delete payload.sender;
				delete payload.subject;
				delete payload.preview;
				const result = await postGateway(base, item, payload);
				if (result.ok) { sent += 1; return; }
				if (result.skipped) return;
				failed += 1;
				if ([401, 404, 410].includes(result.res.status)) await pushSubscriptionService.removeById(c, result.id);
			} catch (error) {
				failed += 1;
				console.error('CF Mail Push Gateway badge sync 请求异常:', error?.message || error);
			}
		}));
		return { sent, failed, skipped: false };
	}
};

export default pushWebhookService;
