import domainUtils from '../utils/domain-uitls';

const webhookService = {

	async sendEmail(c, emailRow, webhookUrl, retry = 0, webhookSecret) {

		webhookUrl = domainUtils.toOssDomain(webhookUrl);

		if (!webhookUrl) {
			return;
		}

		retry = Number(retry);
		if (isNaN(retry) || retry < 0) {
			retry = 0;
		}

		const headers = {
			'Content-Type': 'application/json'
		};

		if (webhookSecret) {
			headers['Authorization'] = webhookSecret;
		}

		const body = JSON.stringify({
			emailId: emailRow.emailId,
			sendEmail: emailRow.sendEmail,
			sendName: emailRow.name,
			toEmail: emailRow.toEmail,
			toName: emailRow.toName,
			subject: emailRow.subject,
			text: emailRow.text,
			content: emailRow.content,
			code: emailRow.code,
			createTime: emailRow.createTime
		});

		let lastError = '';

		for (let i = 0; i <= retry; i++) {
			try {
				const res = await fetch(webhookUrl, {
					method: 'POST',
					headers,
					body
				});

				if (res.ok) {
					return;
				}

				lastError = `status: ${res.status} response: ${await res.text()}`;
			} catch (e) {
				lastError = e.message;
			}
		}

		console.error(`Webhook 推送失败: ${lastError}`);
	}

};

export default webhookService;
