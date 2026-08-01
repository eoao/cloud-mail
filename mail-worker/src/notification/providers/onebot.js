import NotificationProvider from '../notification-provider.js';

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

class OneBotProvider extends NotificationProvider {
	name = 'onebot';

	static schema() {
		return {
			type: 'onebot',
			label: 'notifyOneBot',
			fields: [
				{ key: 'url', type: 'input', label: 'onebotApiUrl', default: '' },
				{ key: 'token', type: 'input', label: 'onebotToken', default: '' },
				{ key: 'targetIds', type: 'input', label: 'onebotTargetIds', default: '' },
				{ key: 'msgType', type: 'select', label: 'messageType', default: 'private', options: [
					{ value: 'private', label: 'private' },
					{ value: 'group', label: 'group' },
				]},
			],
		};
	}

	async send(notification, emailData, env) {
		const { url, token, targetIds, msgType } = notification;
		if (!url || !targetIds) return;

		const message = this.buildMessage(emailData);
		const idList = targetIds.split(',').map(s => s.trim()).filter(Boolean);
		const isGroup = (msgType || 'private') === 'group';

		const headers = { 'Content-Type': 'application/json' };
		if (token) {
			headers['Authorization'] = `Bearer ${token}`;
		}

		let endpoint = url;
		if (!endpoint.startsWith('http')) {
			endpoint = 'http://' + endpoint;
		}
		if (!endpoint.endsWith('/')) {
			endpoint += '/';
		}
		endpoint += 'send_msg';

		await Promise.all(idList.map(async targetId => {
			try {
				const body = {
					auto_escape: true,
					message_type: isGroup ? 'group' : 'private',
					message,
				};
				if (isGroup) {
					body.group_id = Number(targetId);
				} else {
					body.user_id = Number(targetId);
				}

				const res = await fetch(endpoint, {
					method: 'POST',
					headers,
					body: JSON.stringify(body),
				});

				const json = await res.json().catch(() => null);

				if (json && json.status === 'failed') {
					console.error(`[OneBot] send failed: retcode=${json.retcode} msg=${json.msg || json.wording || ''} target: ${targetId}`);
				} else if (!res.ok) {
					console.error(`[OneBot] send failed: HTTP ${res.status} target: ${targetId}`);
				}
			} catch (e) {
				console.error(`[OneBot] send error target: ${targetId}`, e.message);
			}
		}));
	}

	buildMessage(emailData) {
		const from = emailData.name || '';
		const recipient = getRecipientName(emailData);
		const lines = [
			`📧 新邮件`,
			`━━━━━━━━━━━━━━`,
			`发件人: ${from} <${emailData.sendEmail || ''}>`,
			`收件人: ${recipient}`,
			`主题: ${emailData.subject || '(无主题)'}`,
		];
		if (emailData.text) {
			const text = emailData.text.length > 200
				? emailData.text.slice(0, 200) + '...'
				: emailData.text;
			lines.push(`内容: ${text}`);
		}
		return lines.join('\n');
	}
}

export default OneBotProvider;
