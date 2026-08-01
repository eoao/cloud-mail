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

function escapeHtml(text = '') {
	return text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeMarkdownV2(text) {
	if (!text) return text;
	return String(text).replace(/[_*[\]()~>#+\-=|{}.!\\]/g, '\\$&');
}

function truncateText(text, maxLen) {
	if (!text || text.length <= maxLen) return text || '';
	return text.slice(0, maxLen - 3) + '...';
}

class TelegramProvider extends NotificationProvider {
	name = 'telegram';

	static schema() {
		return {
			type: 'telegram',
			label: 'notifyTelegram',
			fields: [
				{ key: 'botToken', type: 'input', label: 'tgBotToken', default: '' },
				{ key: 'chatIds', type: 'input', label: 'tgChatIds', default: '' },
				{ key: 'serverUrl', type: 'input', label: 'tgServerUrl', default: '' },
				{ key: 'msgFrom', type: 'select', label: 'senderInfo', default: 'show', options: [
					{ value: 'show', label: 'show' },
					{ value: 'hide', label: 'hide' },
					{ value: 'only-name', label: 'onlyName' },
				]},
				{ key: 'msgTo', type: 'select', label: 'recipient', default: 'show', options: [
					{ value: 'show', label: 'show' },
					{ value: 'hide', label: 'hide' },
				]},
				{ key: 'msgText', type: 'select', label: 'emailText', default: 'show', options: [
					{ value: 'show', label: 'show' },
					{ value: 'hide', label: 'hide' },
				]},
				{ key: 'parseMode', type: 'select', label: 'parseMode', default: 'HTML', options: [
					{ value: 'HTML', label: 'HTML' },
					{ value: 'MarkdownV2', label: 'MarkdownV2' },
					{ value: 'plain', label: 'plainText' },
				]},
				{ key: 'messageThreadId', type: 'input', label: 'tgThreadId', default: '' },
				{ key: 'sendSilently', type: 'switch', label: 'tgSendSilently', default: false },
				{ key: 'disableLinkPreview', type: 'switch', label: 'tgDisableLinkPreview', default: true },
			],
		};
	}

	async send(notification, emailData, env) {
		const {
			botToken, chatIds, msgFrom, msgTo, msgText,
			parseMode = 'HTML', serverUrl, messageThreadId,
			sendSilently = false, disableLinkPreview = true,
		} = notification;
		if (!botToken || !chatIds) return;

		const chatIdList = chatIds.split(',').map(s => s.trim()).filter(Boolean);
		const baseUrl = serverUrl || 'https://api.telegram.org';
		const text = this.buildText(emailData, parseMode, msgFrom || 'only-name', msgTo || 'show', msgText || 'hide');

		await Promise.all(chatIdList.map(async chatId => {
			try {
				const params = {
					chat_id: chatId,
					text,
					disable_notification: sendSilently,
					link_preview_options: { is_disabled: disableLinkPreview },
				};

				if (parseMode !== 'plain') {
					params.parse_mode = parseMode;
				}

				if (messageThreadId) {
					params.message_thread_id = messageThreadId;
				}

				const res = await fetch(`${baseUrl}/bot${botToken}/sendMessage`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(params),
				});

				if (!res.ok) {
					const errText = await res.text();
					console.error(`[Telegram] send failed: ${res.status} chatId: ${chatId} ${errText}`);
				}
			} catch (e) {
				console.error(`[Telegram] send error chatId: ${chatId}`, e.message);
			}
		}));
	}

	buildText(emailData, parseMode, msgFrom, msgTo, msgText) {
		const from = this.formatFrom(emailData, msgFrom);
		const to = getRecipientName(emailData);
		const subject = emailData.subject || '';
		const preview = emailData.text || '';

		if (parseMode === 'MarkdownV2') {
			const lines = [`📧 *新邮件*`, `━━━━━━━━━━━━━━`];
			if (from) lines.push(`*发件人:* ${escapeMarkdownV2(from)}`);
			if (msgTo === 'show') lines.push(`*收件人:* ${escapeMarkdownV2(to)}`);
			lines.push(`*主题:* ${escapeMarkdownV2(subject)}`);
			if (msgText === 'show' && preview) {
				const text = preview.length > 500 ? preview.slice(0, 500) + '...' : preview;
				lines.push(`*内容:* ${escapeMarkdownV2(text)}`);
			}
			return lines.join('\n');
		}

		if (parseMode === 'plain') {
			const lines = [`📧 新邮件`, `━━━━━━━━━━━━━━`];
			if (from) lines.push(`发件人: ${from}`);
			if (msgTo === 'show') lines.push(`收件人: ${to}`);
			lines.push(`主题: ${subject}`);
			if (msgText === 'show' && preview) {
				const text = preview.length > 500 ? preview.slice(0, 500) + '...' : preview;
				lines.push(`内容: ${text}`);
			}
			return lines.join('\n');
		}

		// HTML mode
		const lines = [`<b>📧 新邮件</b>`, `<code>━━━━━━━━━━━━━━</code>`];
		if (from) lines.push(`<b>发件人:</b> ${escapeHtml(from)}`);
		if (msgTo === 'show') lines.push(`<b>收件人:</b> ${escapeHtml(to)}`);
		lines.push(`<b>主题:</b> ${escapeHtml(subject)}`);
		if (msgText === 'show' && preview) {
			const text = preview.length > 500 ? preview.slice(0, 500) + '...' : preview;
			lines.push(`<b>内容:</b> ${escapeHtml(text)}`);
		}
		return lines.join('\n');
	}

	formatFrom(emailData, mode) {
		if (mode === 'hide') return '';
		if (mode === 'only-name') return emailData.name || '';
		return `${emailData.name || ''} <${emailData.sendEmail || ''}>`;
	}
}

export default TelegramProvider;
