import orm from '../entity/orm';
import email from '../entity/email';
import { emailListColumns, emailBriefColumns, EMAIL_LIST_TEXT_LEN } from '../lib/email-list-columns';
import { attConst, emailConst, isDel, settingConst } from '../const/entity-const';
import { and, desc, eq, gt, inArray, notInArray, lt, count, asc, sql, ne, or, like, lte, gte } from 'drizzle-orm';
import { star } from '../entity/star';
import settingService from './setting-service';
import accountService from './account-service';
import BizError from '../error/biz-error';
import emailUtils from '../utils/email-utils';
import fileUtils from '../utils/file-utils';
import providerService from './send-provider';
import jobService from './job-service';
import { jobType } from '../job/handlers';
import r2Service from './r2-service';
import attService from './att-service';
import { parseHTML } from 'linkedom';
import userService from './user-service';
import roleService from './role-service';
import user from '../entity/user';
import starService from './star-service';
import dayjs from 'dayjs';
import kvConst from '../const/kv-const';
import { t } from '../i18n/i18n'
import domainUtils from '../utils/domain-uitls';
import account from "../entity/account";
import { att } from '../entity/att';
import telegramService from './telegram-service';

const emailService = {

	async list(c, params, userId) {

		let { emailId, type, accountId, size, timeSort, allReceive, full } = params;

		size = Number(size);
		emailId = Number(emailId) || 0;
		timeSort = Number(timeSort);
		accountId = Number(accountId);
		allReceive = Number(allReceive);
		full = Number(full) === 1;

		if (size > 50) {
			size = 50;
		}

		if (isNaN(allReceive)) {
			let accountRow = await accountService.selectById(c, accountId);
			allReceive = accountRow.allReceive;
		}

		const filters = this.emailListFilters({ userId, accountId, type, allReceive, emailId, timeSort });
		const countFilters = this.emailListFilters({ userId, accountId, type, allReceive, withCursor: false });
		const columns = full ? emailListColumns : emailBriefColumns;

		const query = orm(c)
			.select({
				...columns,
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
			.innerJoin(
				account,
				eq(account.accountId, email.accountId)
			)
			.where(and(...filters));

		if (timeSort) {
			query.orderBy(asc(email.emailId));
		} else {
			query.orderBy(desc(email.emailId));
		}

		const listQuery = query.limit(size).all();

		const totalQuery = orm(c).select({ total: count() }).from(email)
			.innerJoin(
				account,
				eq(account.accountId, email.accountId)
			)
			.where(and(...countFilters))
			.get();

		const latestEmailQuery = orm(c).select({
			emailId: email.emailId,
			accountId: email.accountId,
			userId: email.userId,
		}).from(email).where(
			and(
				eq(email.userId, userId),
				eq(email.type, type),
				eq(email.isDel, isDel.NORMAL),
				allReceive ? undefined : eq(email.accountId, accountId)
			))
			.orderBy(desc(email.emailId)).limit(1).get();

		let [list, totalRow, latestEmail] = await Promise.all([listQuery, totalQuery, latestEmailQuery]);

		list = list.map(item => ({
			...item,
			isStar: item.starId != null ? 1 : 0
		}));

		if (full) {
			await this.emailAddAtt(c, list);
		} else {
			this.applyListText(list);
		}

		if (!latestEmail) {
			latestEmail = {
				emailId: 0,
				accountId: accountId,
				userId: userId,
			}
		}

		return { list, total: totalRow.total, latestEmail };
	},

	toListText(item) {
		const raw = emailUtils.formatText(item.text) || emailUtils.htmlToText(item.content);
		return raw.replace(/\s+/g, ' ').trim().slice(0, EMAIL_LIST_TEXT_LEN);
	},

	applyListText(list) {
		for (const item of list) {
			item.text = this.toListText(item);
			delete item.content;
		}
		return list;
	},

	emailListFilters({ userId, accountId, type, allReceive, emailId, timeSort, withCursor = true }) {
		const conditions = [
			eq(email.userId, userId),
			eq(email.type, type),
			eq(email.isDel, isDel.NORMAL),
			eq(account.isDel, isDel.NORMAL),
		];
		if (!allReceive) {
			conditions.push(eq(email.accountId, accountId));
		}
		if (withCursor && emailId) {
			conditions.push(timeSort ? gt(email.emailId, emailId) : lt(email.emailId, emailId));
		}
		return conditions;
	},

	allEmailListFilters({ emailId, name, subject, accountEmail, userEmail, type, timeSort, withCursor = true }) {
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

		if (type === 'noone') {
			conditions.push(eq(email.status, emailConst.status.NOONE));
		}

		if (userEmail) {
			conditions.push(sql`${user.email} COLLATE NOCASE LIKE ${userEmail + '%'}`);
		}

		if (accountEmail) {
			conditions.push(
				or(
					sql`${email.toEmail} COLLATE NOCASE LIKE ${accountEmail + '%'}`,
					sql`${email.sendEmail} COLLATE NOCASE LIKE ${accountEmail + '%'}`,
				)
			);
		}

		if (name) {
			conditions.push(sql`${email.name} COLLATE NOCASE LIKE ${name + '%'}`);
		}

		if (subject) {
			conditions.push(sql`${email.subject} COLLATE NOCASE LIKE ${subject + '%'}`);
		}

		if (withCursor && emailId) {
			conditions.push(timeSort ? gt(email.emailId, emailId) : lt(email.emailId, emailId));
		}

		return conditions;
	},

	async delete(c, params, userId) {
		const { emailIds } = params;
		const emailIdList = emailIds.split(',').map(Number);
		const { syncDelete } = await settingService.query(c);

		if (syncDelete === settingConst.syncDelete.OPEN) {
			const owned = await orm(c).select({ emailId: email.emailId }).from(email)
				.where(and(eq(email.userId, userId), inArray(email.emailId, emailIdList)))
				.all();
			const ownedIds = owned.map(row => row.emailId);
			if (ownedIds.length) {
				await this.physicsDelete(c, { emailIds: ownedIds.join(',') });
			}
			return;
		}

		await orm(c).update(email).set({ isDel: isDel.DELETE }).where(
			and(
				eq(email.userId, userId),
				inArray(email.emailId, emailIdList)))
			.run();
	},

	receive(c, params, cidAttList, r2domain) {
		params.content = this.imgReplace(params.content, cidAttList, r2domain)
		return orm(c).insert(email).values({ ...params }).returning().get();
	},

	//邮件发送
	async send(c, params, userId) {

		let {
			accountId, //发送账号id
			name, //发件人名字
			sendType, //发件类型
			emailId, //邮件id，如果是回复邮件会带
			receiveEmail, //收件人邮箱
			text, //邮件纯文本
			content, //邮件内容
			subject, //邮件标题
			cc = [], //抄送
			bcc = [], //密送
			attachments = [] //附件
		} = params;

		const { r2Domain, send, domainList } = await settingService.query(c);

		let { imageDataList, html } = await attService.toImageUrlHtml(c, content);

		//判断是否关闭发件功能
		if (send === settingConst.send.CLOSE) {
			throw new BizError(t('disabledSend'), 403);
		}

		const userRow = await userService.selectById(c, userId);
		const roleRow = await roleService.selectById(c, userRow.type);

		//判断接收方是不是全部为站内邮箱
		const allInternal = receiveEmail.every(email => {
			const domain = '@' + emailUtils.getDomain(email);
			return domainList.includes(domain);
		});

		if (c.env.admin !== userRow.email) {

			//发件被禁用
			if (roleRow.sendType === 'ban') {
				throw new BizError(t('bannedSend'), 403);
			}

			//发件被禁用
			if (roleRow.sendType === 'internal' && !allInternal) {
				throw new BizError(t('onlyInternalSend'), 403);
			}

		}

		//如果不是管理员，权限设置了发送次数
		if (c.env.admin !== userRow.email && roleRow.sendCount) {

			if (userRow.sendCount >= roleRow.sendCount) {
				if (roleRow.sendType === 'day') throw new BizError(t('daySendLimit'), 403);
				if (roleRow.sendType === 'count') throw new BizError(t('totalSendLimit'), 403);
			}

			if (userRow.sendCount + receiveEmail.length > roleRow.sendCount) {
				if (roleRow.sendType === 'day') throw new BizError(t('daySendLack'), 403);
				if (roleRow.sendType === 'count') throw new BizError(t('totalSendLack'), 403);
			}

		}

		const accountRow = await accountService.selectById(c, accountId);

		if (!accountRow) {
			throw new BizError(t('senderAccountNotExist'));
		}

		if (accountRow.userId !== userId) {
			throw new BizError(t('sendEmailNotCurUser'));
		}

		if (c.env.admin !== userRow.email) {
			//用户没有这个域名的使用权限
			if(!roleService.hasAvailDomainPerm(roleRow.availDomain, accountRow.email)) {
				throw new BizError(t('noDomainPermSend'),403)
			}

		}

		const domain = emailUtils.getDomain(accountRow.email);

		// Cloudflare Email Routing only receives. Anything leaving the instance
		// needs a configured provider for the sending domain.
		const providers = allInternal ? [] : await providerService.candidatesFor(c, domain);

		if (!allInternal && providers.length === 0) {
			throw new BizError(t('noSendProvider'));
		}

		//没有发件人名字自动截取
		if (!name) {
			name = emailUtils.getName(accountRow.email);
		}

		let emailRow = {
			messageId: null
		};

		//如果是回复邮件
		if (sendType === 'reply') {

			emailRow = await this.selectById(c, emailId);

			if (!emailRow) {
				throw new BizError(t('notExistEmailReply'));
			}

		}

		let sendResult = {};

		// A scheduled or undo-window send is validated and stored now, then handed
		// to a queue job at `deferUntil`. Nothing reaches a provider until then,
		// which is what makes "undo" actually undo rather than recall.
		const deferUntil = this.resolveSendTime(params);

		// Providers are tried in priority order for this sending domain, with
		// failover; see src/service/send-provider.
		if (!allInternal && !deferUntil) {

			const outgoing = [...imageDataList, ...attachments];

			try {
				sendResult = await providerService.send(c, domain, {
					name,
					accountEmail: accountRow.email,
					receiveEmail,
					cc,
					bcc,
					subject,
					text,
					html,
					sendType,
					messageId: emailRow.messageId
				}, (encoding) => encoding === 'buffer'
					? this.toArrayBufferAttachments(outgoing)
					: this.toResendAttachments(outgoing));
			} catch (e) {
				throw new BizError(e.noProvider ? t('noSendProvider') : e.message);
			}
		}

		imageDataList = imageDataList.map(item => ({...item, contentId: `<${item.contentId}>`}))

		//把图片标签cid标签切换会通用url
		html = this.imgReplace(html, imageDataList, r2Domain);

		//封装数据保存到数据库
		const emailData = {};
		emailData.sendEmail = accountRow.email;
		emailData.name = name;
		emailData.subject = subject;
		emailData.content = html;
		emailData.text = text;
		emailData.accountId = accountId;
		if (deferUntil && !allInternal) {
			emailData.status = emailConst.status.SCHEDULED;
			emailData.scheduledAt = deferUntil;
		} else {
			emailData.status = sendResult.status === 'delivered' ? emailConst.status.DELIVERED : emailConst.status.SENT;
		}
		emailData.type = emailConst.type.SEND;
		emailData.userId = userId;
		// Column keeps its historical name; it now holds any provider's message id.
		emailData.resendEmailId = sendResult.providerMessageId ?? null;

		const recipient = [];

		receiveEmail.forEach(item => {
			recipient.push({ address: item, name: '' });
		});

		emailData.recipient = JSON.stringify(recipient);
		emailData.cc = JSON.stringify(cc.map(address => ({ address, name: '' })));
		emailData.bcc = JSON.stringify(bcc.map(address => ({ address, name: '' })));

		if (sendType === 'reply') {
			emailData.inReplyTo = emailRow.messageId;
			emailData.relation = emailRow.messageId;
			// Stay in the conversation being replied to; fall back to its own chain
			// when the original predates threading.
			emailData.threadId = emailRow.threadId || emailRow.messageId || `e${emailRow.emailId}`;
		}

		//如果权限有发送次数增加用户发送次数
		if (roleRow.sendCount && roleRow.sendType !== 'internal') {
			await userService.incrUserSendCount(c, receiveEmail.length, userId);
		}

		//保存到数据库并返回结果
		const emailResult = await orm(c).insert(email).values(emailData).returning().get();

		// A new outgoing message starts its own conversation. The id is only known
		// after the insert, so this is a second write - sends are rare compared to
		// receives, so it stays inside the D1 free-tier write budget.
		if (!emailResult.threadId) {
			emailResult.threadId = `e${emailResult.emailId}`;
			await orm(c).update(email).set({ threadId: emailResult.threadId })
				.where(eq(email.emailId, emailResult.emailId)).run();
		}

		//保存内嵌附件
		if (imageDataList.length > 0) {
			if (imageDataList.length > 10) {
				throw new BizError(t('imageAttLimit'));
			}
			await attService.saveArticleAtt(c, imageDataList, userId, accountId, emailResult.emailId);
		}

		//保存普通附件
		if (attachments?.length > 0) {
			if (attachments.length > 10) {
				throw new BizError(t('attLimit'));
			}
			await attService.saveSendAtt(c, attachments, userId, accountId, emailResult.emailId);
		}

		const attList = await attService.selectByEmailIds(c, [emailResult.emailId]);
		emailResult.attList = attList;

		//如果全是站内接收方，直接写入数据库
		if (allInternal) {
			await this.HandleOnSiteEmail(c, receiveEmail, emailResult, attList);
		}

		// Attachments are on disk by now, so the delivery job can rebuild them
		// from R2 rather than carrying them in the job payload.
		if (emailResult.status === emailConst.status.SCHEDULED) {
			await jobService.enqueue(c, jobType.SEND_EMAIL, { emailId: emailResult.emailId }, {
				runAfter: emailResult.scheduledAt,
				dedupeKey: `${jobType.SEND_EMAIL}:${emailResult.emailId}`,
				priority: 10
			});
			c.executionCtx?.waitUntil?.(jobService.kick(c));
		}

		const dateStr = dayjs().format('YYYY-MM-DD');
		let daySendTotal = await c.env.kv.get(kvConst.SEND_DAY_COUNT + dateStr);

		//记录每天发件次数统计
		if (!daySendTotal) {
			await c.env.kv.put(kvConst.SEND_DAY_COUNT + dateStr, JSON.stringify(receiveEmail.length), { expirationTtl: 60 * 60 * 24 });
		} else  {
			daySendTotal = Number(daySendTotal) + receiveEmail.length
			await c.env.kv.put(kvConst.SEND_DAY_COUNT + dateStr, JSON.stringify(daySendTotal), { expirationTtl: 60 * 60 * 24 });
		}

		return [ emailResult ];
	},

	// sendByCloudflareEmail / sendByResend / toCloudflareAttachments moved to
	// src/service/send-provider/drivers.js when sending became pluggable.

	/**
	 * When (if ever) this send should be deferred.
	 *
	 * `scheduleAt` is an explicit time; `undoSeconds` is the grace window the
	 * compose window asks for. Returns a 'YYYY-MM-DD HH:mm:ss' string, or null
	 * for "send immediately".
	 */
	resolveSendTime({ scheduleAt, undoSeconds }) {

		if (scheduleAt) {
			const at = dayjs(scheduleAt);

			if (!at.isValid()) {
				throw new BizError(t('invalidScheduleTime'));
			}

			// A time already in the past means "now", not "never".
			if (at.isBefore(dayjs())) {
				return null;
			}

			return at.format('YYYY-MM-DD HH:mm:ss');
		}

		const grace = Number(undoSeconds) || 0;

		if (grace <= 0) {
			return null;
		}

		return dayjs().add(Math.min(grace, 120), 'second').format('YYYY-MM-DD HH:mm:ss');
	},

	/**
	 * Hand a stored SCHEDULED message to a provider. Runs from the queue, so it
	 * rebuilds attachments from storage rather than from the request that
	 * created the message.
	 */
	async deliverEmail(c, emailId) {

		const row = await this.selectById(c, emailId);

		if (!row) {
			return { skipped: 'message no longer exists' };
		}

		// Cancelled during the undo window, or already delivered by a retry.
		if (row.status !== emailConst.status.SCHEDULED) {
			return { skipped: `status is ${row.status}` };
		}

		const accountRow = await accountService.selectById(c, row.accountId);

		if (!accountRow) {
			throw new BizError(t('senderAccountNotExist'));
		}

		const recipients = JSON.parse(row.recipient || '[]').map(r => r.address).filter(Boolean);
		const cc = JSON.parse(row.cc || '[]').map(r => r.address).filter(Boolean);
		const bcc = JSON.parse(row.bcc || '[]').map(r => r.address).filter(Boolean);

		const attRows = await attService.selectByEmailIds(c, [emailId]);
		const outgoing = await this.attachmentsFromStorage(c, attRows);

		const domain = emailUtils.getDomain(accountRow.email);

		const sendResult = await providerService.send(c, domain, {
			name: row.name,
			accountEmail: accountRow.email,
			receiveEmail: recipients,
			cc,
			bcc,
			subject: row.subject,
			text: row.text,
			html: row.content,
			sendType: row.inReplyTo ? 'reply' : 'send',
			messageId: row.inReplyTo
		}, (encoding) => encoding === 'buffer'
			? this.toArrayBufferAttachments(outgoing)
			: this.toResendAttachments(outgoing));

		await orm(c).update(email).set({
			status: sendResult.status === 'delivered' ? emailConst.status.DELIVERED : emailConst.status.SENT,
			resendEmailId: sendResult.providerMessageId ?? null,
			scheduledAt: ''
		}).where(eq(email.emailId, emailId)).run();

		return { emailId, provider: sendResult.type };
	},

	/** Read attachment bodies back out of R2/KV/S3 for a deferred send. */
	async attachmentsFromStorage(c, attRows) {

		const out = [];

		for (const row of attRows ?? []) {
			const obj = await r2Service.getObj(c, row.key);

			if (!obj) {
				console.warn(`attachment ${row.key} is missing from storage; sending without it`);
				continue;
			}

			out.push({
				content: await obj.arrayBuffer(),
				filename: row.filename,
				mimeType: row.mimeType,
				contentType: row.mimeType,
				contentId: row.contentId
			});
		}

		return out;
	},

	/**
	 * Undo a send that has not left yet. Only works while the message is still
	 * SCHEDULED - once a provider has it, it is gone.
	 */
	async cancelScheduled(c, emailId, userId) {

		const row = await orm(c).update(email)
			.set({ status: emailConst.status.CANCELED, scheduledAt: '' })
			.where(and(
				eq(email.emailId, Number(emailId)),
				eq(email.userId, userId),
				eq(email.status, emailConst.status.SCHEDULED)
			))
			.returning().get();

		if (!row) {
			throw new BizError(t('sendAlreadyLeft'), 409);
		}

		return row;
	},

	/** Hide a message from the inbox until a given time. */
	async snooze(c, emailIds, until, userId) {

		const ids = (emailIds ?? []).map(Number).filter(Boolean);

		if (ids.length === 0) {
			return 0;
		}

		const at = until ? dayjs(until) : null;

		if (until && !at.isValid()) {
			throw new BizError(t('invalidScheduleTime'));
		}

		const rows = await orm(c).update(email)
			.set({ snoozeUntil: until ? at.format('YYYY-MM-DD HH:mm:ss') : '' })
			.where(and(eq(email.userId, userId), inArray(email.emailId, ids)))
			.returning({ emailId: email.emailId }).all();

		return rows.length;
	},

	/**
	 * Clear snoozes whose time has passed. Runs hourly from the queue.
	 *
	 * Counts via RETURNING rather than meta.changes: the email table carries FTS
	 * triggers, and their writes are included in the change count, so it reports
	 * several times the number of messages actually touched.
	 */
	async wakeSnoozed(c) {
		const now = dayjs().format('YYYY-MM-DD HH:mm:ss');

		const { results } = await c.env.db.prepare(
			`UPDATE email SET snooze_until = ''
			  WHERE snooze_until != '' AND snooze_until <= ?
			  RETURNING email_id`
		).bind(now).all();

		return (results ?? []).length;
	},

	async toResendAttachments(attachments = []) {
		const result = [];

		for (const attachment of attachments) {
			const content = await this.toAttachmentBase64(attachment);
			if (!content) {
				continue;
			}

			result.push({
				...attachment,
				content,
				contentType: attachment.contentType || attachment.mimeType || attachment.type || 'application/octet-stream'
			});
		}

		return result;
	},

	async toArrayBufferAttachments(attachments = []) {
		const result = [];

		for (const attachment of attachments) {
			const content = await this.toAttachmentArrayBuffer(attachment);
			if (!content) {
				continue;
			}

			result.push({ ...attachment, content });
		}

		return result;
	},

	async toAttachmentBase64(attachment) {
		let content = attachment.content;

		if (!content) {
			return null;
		}

		if (typeof content === 'string') {
			if (content.startsWith('data:')) {
				content = content.split(',')[1] || content;
			}
			return content.replace(/\s+/g, '');
		}

		const arrayBuffer = await this.toAttachmentArrayBuffer(attachment);
		if (!arrayBuffer) {
			return null;
		}

		const bytes = new Uint8Array(arrayBuffer);
		let binary = '';

		for (let i = 0; i < bytes.length; i += 0x8000) {
			binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
		}

		return btoa(binary);
	},

	async toAttachmentArrayBuffer(attachment) {
		let content = attachment.content;

		if (!content) {
			return null;
		}

		if (content instanceof ArrayBuffer) {
			return content;
		}

		if (content instanceof Uint8Array) {
			return content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength);
		}

		if (typeof content === 'string') {
			if (content.startsWith('data:')) {
				content = content.split(',')[1] || content;
			}
			return fileUtils.base64ToUint8Array(content.replace(/\s+/g, '')).buffer;
		}

		return content;
	},

	//处理站内邮件发送
	async HandleOnSiteEmail(c, receiveEmail, sendEmailData, attList) {

		const { noRecipient  } = await settingService.query(c);

		//查询所有收件人账号信息
		let accountList = await orm(c).select().from(account).where(inArray(account.email, receiveEmail)).all();

		// 对于含+未精确匹配的收件人，获取基础地址账号
		const plusEmails = receiveEmail.filter(
			e => e.includes('+') && !accountList.some(a => a.email === e)
		);
		const baseAccounts = [];
		if (plusEmails.length > 0) {
			const baseEmails = [...new Set(
				plusEmails.map(e => emailUtils.getBaseEmail(e)).filter(Boolean)
			)];
			const existing = new Set(accountList.map(a => a.email));
			const needed = baseEmails.filter(e => !existing.has(e));
			if (needed.length > 0) {
				const rows = await orm(c).select().from(account)
					.where(inArray(account.email, needed)).all();
				baseAccounts.push(...rows);
			}
		}

		// 合并精确匹配和基础地址匹配的账号用于权限查询
		const allAccounts = [...accountList, ...baseAccounts];

		//查询所有收件人权限身份
		const userIds = allAccounts.map(accountRow => accountRow.userId);
		let roleList = await roleService.selectByUserIds(c, userIds);

		//封装数据库准备保存到数据库
		const emailDataList = [];

		for (const email of receiveEmail) {

			//把发件人邮件改成收件
			const emailValues = {...sendEmailData}
			emailValues.status = emailConst.status.RECEIVE;
			emailValues.type = emailConst.type.RECEIVE;
			emailValues.toEmail = email;
			emailValues.toName = emailUtils.getName(email);
			emailValues.emailId = null;

			let accountRow = allAccounts.find(accountRow => accountRow.email === email);

			// 精确匹配不到时回退到主地址（去掉 +tag）
			if (!accountRow && email.includes('+')) {
				const baseEmail = emailUtils.getBaseEmail(email);
				accountRow = allAccounts.find(accountRow => accountRow.email === baseEmail);
			}

			//如果收件人存在就把邮件信息改成收件人的
			if (accountRow) {

				//设置给收件人保存
				emailValues.userId = accountRow.userId;
				emailValues.accountId = accountRow.accountId;
				emailValues.type = emailConst.type.RECEIVE;
				emailValues.status = emailConst.status.RECEIVE;

				const roleRow = roleList.find(roleRow => roleRow.userId === accountRow.userId);

				let { banEmail, availDomain } = roleRow;

				//如果收件人没有这个域名的使用权限和有邮件拦截，就把邮件改为拒收状态
				if (email !== c.env.admin) {

					if (!roleService.hasAvailDomainPerm(availDomain, email)) {
						emailValues.status = emailConst.status.BOUNCED;
						emailValues.message = `The recipient <${email}> is not authorized to use this domain.`;
					} else if(roleService.isBanEmail(banEmail, sendEmailData.sendEmail)) {
						emailValues.status = emailConst.status.BOUNCED;
						emailValues.message = `The recipient <${email}> is disabled from receiving emails.`;
					}

				}

				emailDataList.push(emailValues);

			} else {

				//设置无收件人邮件信息
				emailValues.userId = 0;
				emailValues.accountId = 0;
				emailValues.type = emailConst.type.RECEIVE;
				emailValues.status = emailConst.status.NOONE;

				//如果无人收件关闭改为拒收
				if (noRecipient === settingConst.noRecipient.CLOSE) {
					emailValues.status = emailConst.status.BOUNCED;
					emailValues.message = `Recipient not found: <${email}>`;
				}

				emailDataList.push(emailValues);

			}

		}

		//保存邮件
		const receiveEmailList = emailDataList.filter(emailRow => emailRow.status === emailConst.status.RECEIVE || emailRow.status === emailConst.status.NOONE);

		for (const emailData of receiveEmailList) {

			const emailRow = await orm(c).insert(email).values(emailData).returning().get();

			//设置附件保存
			for (const attRow of attList) {
				const attValues = {...attRow};
				attValues.emailId = emailRow.emailId;
				attValues.accountId = emailRow.accountId;
				attValues.userId = emailRow.userId;
				attValues.attId = null;
				await orm(c).insert(att).values(attValues).run();
			}

		}

		const bouncedEmail = emailDataList.find(emailRow => emailRow.status === emailConst.status.BOUNCED);


		let status = emailConst.status.DELIVERED;
		let message = ''
		//如果有拒收邮件，就把发件人的邮件改成拒收
		if (bouncedEmail) {
			const messageJson = { message: bouncedEmail.message };
			message = JSON.stringify(messageJson);
			status = emailConst.status.BOUNCED;
		}

		await orm(c).update(email).set({ status, message: message }).where(eq(email.emailId, sendEmailData.emailId)).run();

	},

	imgReplace(content, cidAttList, r2domain) {

		if (!content) {
			return ''
		}

		const { document } = parseHTML(content);

		const images = Array.from(document.querySelectorAll('img'));

		const useAtts = []

		for (const img of images) {

			const src = img.getAttribute('src');
			if (src && src.startsWith('cid:') && cidAttList) {

				const cid = src.replace(/^cid:/, '');
				const attCidIndex = cidAttList.findIndex(cidAtt => cidAtt.contentId.replace(/^<|>$/g, '') === cid);

				if (attCidIndex > -1) {
					const cidAtt = cidAttList[attCidIndex];
					img.setAttribute('src', '{{domain}}' + cidAtt.key);
					useAtts.push(cidAtt)
				}

			}

			r2domain = domainUtils.toOssDomain(r2domain)

			if (src && src.startsWith(r2domain + '/')) {
				img.setAttribute('src', src.replace(r2domain + '/', '{{domain}}'));
			}

		}

		useAtts.forEach(att => {
			att.type = attConst.type.EMBED
		})

		return document.toString();
	},

	selectById(c, emailId) {
		return orm(c).select().from(email).where(
			and(eq(email.emailId, emailId),
				eq(email.isDel, isDel.NORMAL)))
			.get();
	},

	async latest(c, params, userId) {
		let { emailId, accountId, allReceive } = params;
		allReceive = Number(allReceive);

		if (isNaN(allReceive)) {
			let accountRow = await accountService.selectById(c, accountId);
			allReceive = accountRow.allReceive;
		}

		let list = await orm(c).select({ ...emailBriefColumns }).from(email)
			.innerJoin(
				account,
				eq(account.accountId, email.accountId)
			)
			.where(
				and(
					gt(email.emailId, emailId),
					eq(email.userId, userId),
					eq(email.isDel, isDel.NORMAL),
					eq(account.isDel, isDel.NORMAL),
					allReceive ? undefined : eq(email.accountId, accountId),
					eq(email.type, emailConst.type.RECEIVE)
				))
			.orderBy(desc(email.emailId))
			.limit(20);

		return this.applyListText(list);
	},

	async physicsDelete(c, params) {
		let { emailIds } = params;
		emailIds = emailIds.split(',').map(Number);
		await attService.removeByEmailIds(c, emailIds);
		await starService.removeByEmailIds(c, emailIds);
		await orm(c).delete(email).where(inArray(email.emailId, emailIds)).run();
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
				eq(email.isDel, del),
				ne(email.status, emailConst.status.SAVING),
			))
			.groupBy(email.userId);
		return result;
	},

	async allList(c, params) {

		let { emailId, size, name, subject, accountEmail, userEmail, type, timeSort, full } = params;

		size = Number(size);

		emailId = Number(emailId) || 0;
		timeSort = Number(timeSort);
		full = Number(full) === 1;

		if (size > 50) {
			size = 50;
		}

		const filters = this.allEmailListFilters({ emailId, name, subject, accountEmail, userEmail, type, timeSort });
		const countFilters = this.allEmailListFilters({ emailId, name, subject, accountEmail, userEmail, type, timeSort, withCursor: false });
		const columns = full ? emailListColumns : emailBriefColumns;

		const query = orm(c).select({ ...columns, userEmail: user.email })
			.from(email)
			.leftJoin(user, eq(email.userId, user.userId))
			.where(and(...filters));

		// count 不搜用户时无需 join user
		const queryCount = userEmail
			? orm(c).select({ total: count() })
				.from(email)
				.leftJoin(user, eq(email.userId, user.userId))
				.where(and(...countFilters))
			: orm(c).select({ total: count() })
				.from(email)
				.where(and(...countFilters));

		if (timeSort) {
			query.orderBy(asc(email.emailId));
		} else {
			query.orderBy(desc(email.emailId));
		}

		const listQuery = query.limit(size).all();
		const totalQuery = queryCount.get();
		const latestEmailQuery = orm(c).select({
			emailId: email.emailId,
			accountId: email.accountId,
			userId: email.userId,
		}).from(email)
			.where(eq(email.type, emailConst.type.RECEIVE))
			.orderBy(desc(email.emailId)).limit(1).get();

		let [list, totalRow, latestEmail] = await Promise.all([listQuery, totalQuery, latestEmailQuery]);

		if (full) {
			await this.emailAddAtt(c, list);
		} else {
			this.applyListText(list);
		}

		if (!latestEmail) {
			latestEmail = {
				emailId: 0,
				accountId: 0,
				userId: 0,
			}
		}

		return { list: list, total: totalRow.total, latestEmail };
	},

	async allEmailLatest(c, params) {

		const { emailId } = params;

		let list = await orm(c).select({ ...emailBriefColumns, userEmail: user.email }).from(email)
			.leftJoin(user, eq(email.userId, user.userId))
			.where(
				and(
					gt(email.emailId, emailId),
					eq(email.type, emailConst.type.RECEIVE)
				))
			.orderBy(desc(email.emailId))
			.limit(20);

		return this.applyListText(list);
	},

	async emailAddAtt(c, list) {

		const emailIds = list.map(item => item.emailId);

		if (emailIds.length > 0) {

			const attList = await attService.selectByEmailIds(c, emailIds);

			list.forEach(emailRow => {
				const atts = attList.filter(attRow => attRow.emailId === emailRow.emailId);
				emailRow.attList = atts;
			});
		}
	},

	async restoreByUserId(c, userId) {
		await orm(c).update(email).set({ isDel: isDel.NORMAL }).where(eq(email.userId, userId)).run();
	},

	async completeReceive(c, status, emailId) {
		return await orm(c).update(email).set({
			isDel: isDel.NORMAL,
			status: status
		}).where(eq(email.emailId, emailId)).returning().get();
	},

	async completeReceiveAll(c) {
		// 用 EXISTS 走 status=6 部分索引 + account 主键；避免 IN (SELECT account_id FROM account) 触发全盘扫描
		await c.env.db.prepare(
			`UPDATE email
			 SET status = ${emailConst.status.RECEIVE}
			 WHERE status = ${emailConst.status.SAVING}
			   AND EXISTS (SELECT 1 FROM account WHERE account.account_id = email.account_id)`
		).run();
		await c.env.db.prepare(
			`UPDATE email
			 SET status = ${emailConst.status.NOONE}
			 WHERE status = ${emailConst.status.SAVING}`
		).run();
	},

	async autoClean(c) {
		const { autoCleanDays, autoCleanExclude } = await settingService.query(c);
		const days = Number(autoCleanDays);

		if (!days || days <= 0) {
			return;
		}

		const cutoff = dayjs().subtract(days, 'day').format('YYYY-MM-DD HH:mm:ss');
		const excludeEmails = String(autoCleanExclude || '')
			.split(/[,，]/)
			.map(item => item.trim())
			.filter(Boolean);

		let excludeUserIds = [];
		if (excludeEmails.length) {
			const rows = await orm(c)
				.select({ userId: user.userId })
				.from(user)
				.where(sql`lower(${user.email}) IN (${sql.join(excludeEmails.map(email => sql`${email.toLowerCase()}`), sql`, `)})`)
				.all();
			excludeUserIds = rows.map(row => row.userId);
		}

		const batchSize = 95;

		while (true) {
			const conditions = [lt(email.createTime, cutoff)];
			if (excludeUserIds.length) {
				conditions.push(notInArray(email.userId, excludeUserIds));
			}

			const rows = await orm(c)
				.select({ emailId: email.emailId })
				.from(email)
				.where(and(...conditions))
				.limit(batchSize)
				.all();

			if (!rows.length) {
				break;
			}

			const emailIds = rows.map(row => row.emailId);
			await this.physicsDelete(c, { emailIds: emailIds.join(',') });

			if (rows.length < batchSize) {
				break;
			}
		}
	},

	async batchDelete(c, params) {
		let { sendName, sendEmail, toEmail, subject, startTime, endTime, type  } = params

		let right = type === 'left' || type === 'include'
		let left = type === 'include'

		const conditions = []

		if (sendName) {
			conditions.push(like(email.name,`${left ? '%' : ''}${sendName}${right ? '%' : ''}`))
		}

		if (subject) {
			conditions.push(like(email.subject,`${left ? '%' : ''}${subject}${right ? '%' : ''}`))
		}

		if (sendEmail) {
			conditions.push(like(email.sendEmail,`${left ? '%' : ''}${sendEmail}${right ? '%' : ''}`))
		}

		if (toEmail) {
			conditions.push(like(email.toEmail,`${left ? '%' : ''}${toEmail}${right ? '%' : ''}`))
		}

		if (startTime && endTime) {
			conditions.push(gte(email.createTime,`${startTime}`))
			conditions.push(lte(email.createTime,`${endTime}`))
		}

		if (conditions.length === 0) {
			return;
		}

		const emailIdsRow = await orm(c).select({emailId: email.emailId}).from(email).where(conditions.length > 1 ? and(...conditions) : conditions[0]).all();

		const emailIds = emailIdsRow.map(row => row.emailId);

		if (emailIds.length === 0){
			return;
		}

		await attService.removeByEmailIds(c, emailIds);

		await orm(c).delete(email).where(conditions.length > 1 ? and(...conditions) : conditions[0]).run();
	},

	async physicsDeleteByAccountId(c, accountId) {
		await attService.removeByAccountId(c, accountId);
		await orm(c).delete(email).where(eq(email.accountId, accountId)).run();
	},

	async read(c, params, userId) {
		const { emailIds } = params;
		await orm(c).update(email).set({ unread: emailConst.unread.READ }).where(and(eq(email.userId, userId), inArray(email.emailId, emailIds)));
	}
};

export default emailService;
