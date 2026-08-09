import pushSubscriptionService from './push-subscription-service';

function gatewayURL(c) {
	const raw = String(c.env.cfmail_push_gateway_url || '').trim();
	if (!raw) return null;
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

const pushWebhookService = {
	isConfigured(c) {
		return gatewayURL(c) !== null;
	},

	/**
	 * Send a privacy-minimized new-mail event to CF Mail Push Gateway.
	 * CloudMail never sends sender/subject/body/attachments and never talks to APNs directly.
	 */
	async pushNewMail(c, subscriptions, emailRow) {
		const base = gatewayURL(c);
		if (!base || !Array.isArray(subscriptions) || subscriptions.length === 0) {
			return { sent: 0, failed: 0, skipped: true };
		}

		let sent = 0;
		let failed = 0;
		const unique = new Map();
		for (const item of subscriptions) {
			const id = String(item?.subscriptionId || '').trim();
			const secret = String(item?.pushSecret || '').trim();
			if (!id || !secret || unique.has(id)) continue;
			unique.set(id, { id, secret });
			if (unique.size >= 10) break;
		}

		const endpoint = new URL(`${base.pathname}/v1/push`.replace(/\/+/g, '/'), base.origin);
		await Promise.all([...unique.values()].map(async ({ id, secret }) => {
			try {
				const res = await fetch(endpoint.toString(), {
					method: 'POST',
					headers: {
						'authorization': `Bearer ${secret}`,
						'content-type': 'application/json',
						'user-agent': 'CloudMail-Push-Webhook/1.0'
					},
					body: JSON.stringify({
						subscriptionId: id,
						event: 'new_mail',
						emailId: Number(emailRow.emailId)
					})
				});

				if (res.ok) {
					sent += 1;
					return;
				}

				failed += 1;
				const errorText = await parseError(res);
				console.error(`CF Mail Push Gateway 失败 status:${res.status}${errorText ? ` error:${errorText}` : ''}`);

				// A scoped subscription that no longer exists / authenticates is stale locally too.
				if ([401, 404, 410].includes(res.status)) {
					await pushSubscriptionService.removeById(c, id);
				}
			} catch (error) {
				failed += 1;
				console.error('CF Mail Push Gateway 请求异常:', error?.message || error);
			}
		}));

		console.log(`CF Mail Push Gateway result sent:${sent} failed:${failed} targetCount:${unique.size}`);
		return { sent, failed, skipped: false };
	}
};

export default pushWebhookService;
