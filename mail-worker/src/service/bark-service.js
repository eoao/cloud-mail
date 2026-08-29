import orm from '../entity/orm';
import user from '../entity/user';
import { eq } from 'drizzle-orm';
import { emailConst } from '../const/entity-const';

const barkService = {

	/**
	 * 收到邮件后通过 Bark 推送通知到用户手机
	 * 推送标题 = 收件箱地址（message.to），推送内容 = 邮件标题
	 * 仅对收件（type=RECEIVE）触发，发件不通知
	 *
	 * @param c          Hono/Worker 上下文（含 env）
	 * @param emailRow   邮件记录（含 toEmail、subject、userId、type 等）
	 */
	async notifyReceive(c, emailRow) {
		try {
			// 仅收件邮件触发 Bark 通知，发件不通知
			if (emailRow.type !== emailConst.type.RECEIVE) {
				return;
			}

			// userId 为 0 表示无人收件（无对应用户），不推送
			if (!emailRow.userId || emailRow.userId === 0) {
				return;
			}

			// 查询用户 barkUrl
			const userRow = await orm(c).select({ barkUrl: user.barkUrl })
				.from(user)
				.where(eq(user.userId, emailRow.userId))
				.get();

			if (!userRow || !userRow.barkUrl) {
				return;
			}

			const barkUrl = userRow.barkUrl.trim();
			if (!barkUrl) {
				return;
			}

			// 标题 = 收件箱地址，内容 = 邮件标题
			const title = emailRow.toEmail || '';
			const body = emailRow.subject || '';

			// 支持 GET 路径格式和 POST JSON 格式
			// 用户填写的 URL 形如：https://api.day.app/your_key
			// 使用 POST JSON 方式推送
			const res = await fetch(barkUrl, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json; charset=utf-8'
				},
				body: JSON.stringify({
					title: title,
					body: body,
					group: 'CloudMail'
				})
			});

			if (!res.ok) {
				console.error(`Bark 推送失败 status: ${res.status} response: ${await res.text()}`);
			}
		} catch (e) {
			// Bark 推送失败不影响邮件接收主流程
			console.error('Bark 推送异常:', e.message);
		}
	}

};

export default barkService;
