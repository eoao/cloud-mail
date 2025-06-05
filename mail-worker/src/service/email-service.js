import orm from '../entity/orm';
import email from '../entity/email';
import { emailConst, isDel, settingConst } from '../const/entity-const';
import { and, desc, eq, gt, inArray, lt, count, asc, like, ne } from 'drizzle-orm';
import { star } from '../entity/star';
import settingService from './setting-service';
import accountService from './account-service';
import BizError from '../error/biz-error';
import emailUtils from '../utils/email-utils';
import { Resend } from 'resend';
import attService from './att-service';
import { parseHTML } from 'linkedom';
import userService from './user-service';
import roleService from './role-service';
import user from '../entity/user';
import account from '../entity/account';
import starService from './star-service';

const emailService = {

	async list(c, params, userId) {

		let { emailId, type, accountId, size, timeSort } = params;

		size = Number(size);
		emailId = Number(emailId);
		timeSort = Number(timeSort);

		if (size > 30) {
			size = 30;
		}

		if (!emailId) {

			if (timeSort) {
				emailId = 0;
			} else {
				emailId = 9999999999;
			}

		}


		const query = orm(c)
			.select({
				...email,
				starId: star.starId
			})
			.from(email)
			.leftJoin(
				star,
				and(
					eq(star.emailId, email.emailId),
					eq(star.userId, userId)
				)
			)
			.where(
				and(
					timeSort ? gt(email.emailId, emailId) : lt(email.emailId, emailId),
					eq(email.accountId, accountId),
					eq(email.userId, userId),
					eq(email.type, type),
					eq(email.isDel, isDel.NORMAL)
				)
			);

		if (timeSort) {
			query.orderBy(asc(email.emailId));
		} else {
			query.orderBy(desc(email.emailId));
		}

		const listQuery = query.limit(size).all();

		const totalQuery = orm(c).select({ total: count() }).from(email).where(
			and(
				eq(email.accountId, accountId),
				eq(email.userId, userId),
				eq(email.type, type),
				eq(email.isDel, isDel.NORMAL)
			)
		).get();

		const latestEmailQuery = orm(c).select().from(email).where(
			and(
				eq(email.accountId, accountId),
				eq(email.userId, userId),
				eq(email.type, type),
				eq(email.isDel, isDel.NORMAL)
			))
			.orderBy(desc(email.emailId)).limit(1).get();

		let [list, totalRow, latestEmail] = await Promise.all([listQuery, totalQuery, latestEmailQuery]);

		list = list.map(item => ({
			...item,
			isStar: item.starId != null ? 1 : 0
		}));

		const emailIds = list.map(item => item.emailId);

		const attsList = await attService.selectByEmailIds(c, emailIds);

		list.forEach(emailRow => {
			const atts = attsList.filter(attsRow => attsRow.emailId === emailRow.emailId);
			emailRow.attList = atts;
		});

		return { list, total: totalRow.total, latestEmail };
	},

	async delete(c, params, userId) {
		const { emailIds } = params;
		const emailIdList = emailIds.split(',').map(Number);
		await orm(c).update(email).set({ isDel: isDel.DELETE }).where(
			and(
				eq(email.userId, userId),
				inArray(email.emailId, emailIdList)))
			.run();
	},

	receive(c, params, cidAttList) {

		const { document } = parseHTML(params.content);

		const images = Array.from(document.querySelectorAll('img'));

		for (const img of images) {

			const src = img.getAttribute('src');
			if (src && src.startsWith('cid:')) {

				const cid = src.replace(/^cid:/, '');
				const attCidIndex = cidAttList.findIndex(cidAtt => cidAtt.contentId.replace(/^<|>$/g, '') === cid);

				if (attCidIndex > -1) {
					const cidAtt = cidAttList[attCidIndex];
					img.setAttribute('src', '{{domain}}' + cidAtt.key);
				}
			}
		}

		params.content = document.toString();
		return orm(c).insert(email).values({ ...params }).returning().get();
	},

	async send(c, params, userId) {

		let { accountId, name, receiveEmail, text, content, subject, attachments } = params;

		const { resendTokens, r2Domain, send } = await settingService.query(c);


		const { attDataList, html } = await attService.toImageUrlHtml(c, content, r2Domain);

		if (attDataList.length > 0 && !r2Domain) {
			throw new BizError('r2域名未配置不能发送正文图片');
		}

		if (attDataList.length > 0 && !c.env.r2) {
			throw new BizError('r2对象存储未配置不能发送正文图片');
		}

		if (attachments.length > 0 && !r2Domain) {
			throw new BizError('r2域名未配置不能发送附件');
		}

		if (attachments.length > 0 && !c.env.r2) {
			throw new BizError('r2对象存储未配置不能发送附件');
		}

		if (send === settingConst.send.CLOSE) {
			throw new BizError('邮箱发送功能已停用', 403);
		}


		const userRow = await userService.selectById(c, userId);
		const roleRow = await roleService.selectById(c, userRow.type);

		if (userRow.sendCount >= roleRow.sendCount && c.env.admin !== userRow.email) {
			if (roleRow.sendType === 'day') throw new BizError('已到达每日发送数量限制', 403);
			if (roleRow.sendType === 'count') throw new BizError('已到达发送数量限制', 403);
		}


		const accountRow = await accountService.selectById(c, accountId);

		const domain = emailUtils.getDomain(accountRow.email);
		const resendToken = resendTokens[domain];
		if (!resendToken) {
			throw new BizError('resend密钥未配置');
		}

		if (!accountRow) {
			throw new BizError('邮箱不存在');
		}

		if (accountRow.userId !== userId) {
			throw new BizError('非当前用户所属邮箱');
		}

		if (!name) {
			name = emailUtils.getName(accountRow.email);
		}

		const resend = new Resend(resendToken);

		const { data, error } = await resend.emails.send({
			from: `${name} <${accountRow.email}>`,
			to: [receiveEmail],
			subject: subject,
			text: text,
			html: html,
			attachments: attachments
		});

		if (error) {
			console.error(error);
			throw new BizError(error.message);
		}

		const emailData = {};
		emailData.sendEmail = accountRow.email;
		emailData.name = name;
		emailData.subject = subject;
		emailData.receiveEmail = receiveEmail;
		emailData.content = html;
		emailData.text = text;
		emailData.accountId = accountId;
		emailData.type = emailConst.type.SEND;
		emailData.userId = userId;
		emailData.status = emailConst.status.SENT;
		emailData.resendEmailId = data.id;

		const emailRow = await orm(c).insert(email).values(emailData).returning().get();

		if (attDataList.length > 0) {
			await attService.saveArticleAtt(c, attDataList, userId, accountId, emailRow.emailId);
		}

		if (roleRow.sendCount) {
			await userService.incrUserService(c, 1, userId);
		}

		if (attachments?.length > 0 && c.env.r2) {
			await attService.saveSendAtt(c, attachments, userId, accountId, emailRow.emailId);
		}

		const attsList = await attService.selectByEmailIds(c, [emailRow.emailId]);
		emailRow.attList = attsList;

		return emailRow;
	},

	selectById(c, emailId) {
		return orm(c).select().from(email).where(
			and(eq(email.emailId, emailId),
				eq(email.isDel, isDel.NORMAL)))
			.get();
	},

	async latest(c, params, userId) {
		let { emailId, accountId } = params;
		const list = await orm(c).select().from(email).where(
			and(
				eq(email.userId, userId),
				eq(email.isDel, isDel.NORMAL),
				eq(email.accountId, accountId),
				eq(email.type, emailConst.type.RECEIVE),
				gt(email.emailId, emailId)
			))
			.orderBy(desc(email.emailId))
			.limit(20);

		const emailIds = list.map(item => item.emailId);

		if (emailIds.length > 0) {

			const attsList = await attService.selectByEmailIds(c, emailIds);

			list.forEach(emailRow => {
				const atts = attsList.filter(attsRow => attsRow.emailId === emailRow.emailId);
				emailRow.attList = atts;
			});
		}

		return list;
	},


	async physicsDeleteAll(c) {
		const emailIdsRow = await orm(c).select({ emailId: email.emailId }).from(email).where(eq(email.isDel, isDel.DELETE)).limit(99);
		if (emailIdsRow.length === 0) {
			return;
		}
		const emailIds = emailIdsRow.map(row => row.emailId);
		await attService.removeByEmailIds(c, emailIds);
		await starService.removeByEmailIds(c, emailIds);
		await orm(c).delete(email).where(inArray(email.emailId, emailIds)).run();
		if (emailIdsRow.length === 99) {
			await this.physicsDeleteAll(c);
		}
	},

	async physicsDelete(c, params) {
		let { emailIds } = params;
		emailIds = emailIds.split(',').map(Number);
		await attService.removeByEmailIds(c, emailIds);
		await starService.removeByEmailIds(c, emailIds);
		await orm(c).delete(email).where(inArray(email.emailId, emailIds)).run();
	},

	async physicsDeleteAccountIds(c, accountIds) {
		await attService.removeByAccountIds(c, accountIds);
		await orm(c).delete(email).where(inArray(email.accountId, accountIds)).run();
	},

	async physicsDeleteUserIds(c, userIds) {
		await attService.removeByUserIds(c, userIds);
		await orm(c).delete(email).where(inArray(email.userId, userIds)).run();
	},

	updateEmailStatus(c, params) {
		const { status, resendEmailId, message } = params;
		return orm(c).update(email).set({
			status: status,
			message: message
		}).where(eq(email.resendEmailId, resendEmailId)).returning().get();
	},

	async selectUserEmailCountList(c, userIds, type, del = isDel.NORMAL) {
		const result = await orm(c)
			.select({
				userId: email.userId,
				count: count(email.emailId)
			})
			.from(email)
			.where(and(
				inArray(email.userId, userIds),
				eq(email.type, type),
				eq(email.isDel, del)
			))
			.groupBy(email.userId);
		return result;
	},

	async allList(c, params) {

		let { emailId, size, name, subject, accountEmail, userEmail, type, timeSort } = params;

		size = Number(size);

		emailId = Number(emailId);
		timeSort = Number(timeSort);

		if (size > 30) {
			size = 30;
		}

		if (!emailId) {

			if (timeSort) {
				emailId = 0;
			} else {
				emailId = 9999999999;
			}

		}

		const conditions = [];


		if (type === 'send') {
			conditions.push(eq(email.type, emailConst.type.SEND));
		}

		if (type === 'receive') {
			conditions.push(eq(email.type, emailConst.type.RECEIVE));
		}

		if (type === 'delete') {
			conditions.push(eq(email.isDel, isDel.DELETE));
		}

		if (userEmail) {
			conditions.push(like(user.email, `${userEmail}%`));
		}

		if (accountEmail) {
			conditions.push(like(account.email, `${accountEmail}%`));
		}

		if (name) {
			conditions.push(like(email.name, `${name}%`));
		}

		if (subject) {
			conditions.push(like(email.subject, `${subject}%`));
		}

		conditions.push(ne(email.status, emailConst.status.SAVING))

		const countConditions = [...conditions];

		if (timeSort) {
			conditions.push(gt(email.emailId, emailId));
		} else {
			conditions.push(lt(email.emailId, emailId));
		}

		const query = orm(c).select({ ...email, userEmail: user.email, accountEmail: account.email })
			.from(email)
			.leftJoin(user, eq(email.userId, user.userId))
			.leftJoin(account, eq(email.accountId, account.accountId))
			.where(and(...conditions));

		const queryCount = orm(c).select({ total: count() })
			.from(email)
			.leftJoin(user, eq(email.userId, user.userId))
			.leftJoin(account, eq(email.accountId, account.accountId))
			.where(and(...countConditions));

		if (timeSort) {
			query.orderBy(asc(email.emailId));
		} else {
			query.orderBy(desc(email.emailId));
		}

		const listQuery = await query.limit(size).all();
		const totalQuery = await queryCount.get();

		const [list, totalRow] = await Promise.all([listQuery, totalQuery]);

		const emailIds = list.map(item => item.emailId);
		const attsList = await attService.selectByEmailIds(c, emailIds);

		list.forEach(emailRow => {
			const atts = attsList.filter(attsRow => attsRow.emailId === emailRow.emailId);
			emailRow.attList = atts;
		});

		return { list: list, total: totalRow.total };
	},

	async restoreByUserId(c, userId) {
		await orm(c).update(email).set({ isDel: isDel.NORMAL }).where(eq(email.userId, userId)).run();
	},

	async completeReceive(c, emailId) {
		await orm(c).update(email).set({ isDel: isDel.NORMAL, status: emailConst.status.RECEIVE }).where(eq(email.emailId, emailId)).run();
	}
};

export default emailService;
