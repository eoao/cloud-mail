import orm from '../entity/orm';
import apply from '../entity/apply';
import settingEntity from '../entity/setting';
import { oauth } from '../entity/oauth';
import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';
import jwtUtils from '../utils/jwt-utils';
import verifyUtils from '../utils/verify-utils';
import emailUtils from '../utils/email-utils';
import userService from './user-service';
import roleService from './role-service';
import accountService from './account-service';
import saltHashUtils from '../utils/crypto-utils';
import { applyConst, isDel, settingConst } from '../const/entity-const';
import { and, desc, eq, count, like, or } from 'drizzle-orm';
import dayjs from 'dayjs';

const REASON_MIN_LENGTH = 10;
const APPLY_JWT_EXPIRE = 7 * 24 * 60 * 60;

const applyService = {

	generateApplyToken(c, oauthUserId) {
		return jwtUtils.generateToken(c, { type: 'apply', oauthUserId }, APPLY_JWT_EXPIRE);
	},

	async getSettingRow(c) {
		return await orm(c).select().from(settingEntity).get();
	},

	async verifyApplyToken(c, token) {

		if (!token) {
			throw new BizError(t('applyIdentityFail'), 401);
		}

		const payload = await jwtUtils.verifyToken(c, token);

		if (!payload || payload.type !== 'apply' || !payload.oauthUserId) {
			throw new BizError(t('applyIdentityFail'), 401);
		}

		const oauthRow = await orm(c).select().from(oauth).where(eq(oauth.oauthUserId, payload.oauthUserId)).get();

		if (!oauthRow) {
			throw new BizError(t('applyIdentityFail'), 401);
		}

		return { payload, oauthRow };
	},

	async submit(c, params) {

		const email = params.email;
		const reasonText = String(params.reason || '').trim();

		const verified = await this.verifyApplyToken(c, params.token);
		const oauthRow = verified.oauthRow;

		if (oauthRow.userId !== 0) {
			throw new BizError(t('oauthBound'));
		}

		if (!verifyUtils.isEmail(email)) {
			throw new BizError(t('notEmail'));
		}

		const domainList = Array.isArray(c.env.domain) ? c.env.domain : JSON.parse(c.env.domain);

		if (!domainList.includes(emailUtils.getDomain(email))) {
			throw new BizError(t('notEmailDomain'));
		}

		const settingRow = await this.getSettingRow(c);
		const prefixFilters = String(settingRow.emailPrefixFilter || '').split(',').filter(Boolean);

		if (emailUtils.getName(email).length < settingRow.minEmailPrefix) {
			throw new BizError(t('applyMinPrefix'));
		}

		const bannedHit = prefixFilters.some(content => emailUtils.getName(email).includes(content));
		if (bannedHit) {
			throw new BizError(t('banEmailPrefix'));
		}

		if (reasonText.length < REASON_MIN_LENGTH) {
			throw new BizError(t('reasonTooShort'));
		}

		const pendingRow = await orm(c).select().from(apply)
			.where(and(eq(apply.oauthUserId, oauthRow.oauthUserId), eq(apply.status, applyConst.status.PENDING)))
			.get();

		if (pendingRow) {
			throw new BizError(t('applyExists'));
		}

		const accountRow = await accountService.selectByEmailIncludeDel(c, email);

		if (accountRow && accountRow.isDel === isDel.DELETE) {
			throw new BizError(t('isDelUser'));
		}
		if (accountRow) {
			throw new BizError(t('isRegAccount'));
		}

		const applyRow = await orm(c).insert(apply).values({
			oauthUserId: oauthRow.oauthUserId,
			platform: oauthRow.platform,
			username: oauthRow.username,
			name: oauthRow.name,
			avatar: oauthRow.avatar,
			trustLevel: oauthRow.trustLevel,
			email: email,
			reason: reasonText,
			status: applyConst.status.PENDING
		}).returning().get();

		const threshold = Number(settingRow.applyAutoTrustLevel) || 0;
		const trustLevel = Number(oauthRow.trustLevel === null ? -1 : oauthRow.trustLevel);

		if (threshold > 0 && trustLevel >= threshold) {
			try {
				await this.doApprove(c, applyRow, 0);
				await this.notify(c, applyRow, 'auto');
				return;
			} catch (e) {
				applyRow.remark = (e.message || 'unknown').slice(0, 200);
				await orm(c).update(apply).set({
					status: applyConst.status.PENDING,
					remark: applyRow.remark,
					updateTime: dayjs().format('YYYY-MM-DD HH:mm:ss')
				}).where(eq(apply.applyId, applyRow.applyId)).run();
				await this.notify(c, applyRow, 'fallback');
				return;
			}
		}

		await this.notify(c, applyRow, 'pending');
	},

	async mine(c, params) {

		const verified = await this.verifyApplyToken(c, params.token);

		const row = await orm(c).select().from(apply)
			.where(eq(apply.oauthUserId, verified.oauthRow.oauthUserId))
			.orderBy(desc(apply.applyId))
			.limit(1)
			.get();

		if (!row) {
			return {};
		}

		return {
			email: row.email,
			status: row.status,
			remark: row.remark,
			createTime: row.createTime
		};
	},

	async list(c, params) {

		let num = Number(params.num) || 1;
		let size = Number(params.size) || 15;

		if (size > 50) {
			size = 50;
		}

		num = (num - 1) * size;

		const conditions = [];

		if (params.status !== undefined && params.status !== '') {
			conditions.push(eq(apply.status, Number(params.status)));
		}

		if (params.keyword) {
			const kw = '%' + params.keyword + '%';
			conditions.push(or(
				like(apply.username, kw),
				like(apply.name, kw),
				like(apply.email, kw)
			));
		}

		const where = and(...conditions);

		const listQuery = orm(c).select().from(apply)
			.where(where)
			.orderBy(desc(apply.applyId))
			.limit(size)
			.offset(num);

		const totalQuery = orm(c).select({ total: count() }).from(apply).where(where);

		const rows = await Promise.all([listQuery.all(), totalQuery.get()]);

		return { list: rows[0], total: rows[1].total };
	},

	async approve(c, params, adminId) {

		const applyRow = await orm(c).select().from(apply).where(eq(apply.applyId, Number(params.applyId))).get();

		if (!applyRow) {
			throw new BizError(t('applyNotFound'));
		}

		await this.doApprove(c, applyRow, adminId);
		await this.notify(c, applyRow, 'approved');
	},

	async doApprove(c, applyRow, adminId) {

		if (!applyRow || applyRow.status !== applyConst.status.PENDING) {
			throw new BizError(t('applyProcessed'));
		}

		let oauthRow = await orm(c).select().from(oauth).where(eq(oauth.oauthUserId, applyRow.oauthUserId)).get();

		if (!oauthRow) {
			oauthRow = await orm(c).insert(oauth).values({
				oauthUserId: applyRow.oauthUserId,
				platform: applyRow.platform,
				username: applyRow.username,
				name: applyRow.name,
				avatar: applyRow.avatar,
				trustLevel: applyRow.trustLevel,
				userId: 0
			}).returning().get();
		}

		if (oauthRow.userId !== 0) {
			throw new BizError(t('oauthBound'));
		}

		const accountRow = await accountService.selectByEmailIncludeDel(c, applyRow.email);

		if (accountRow && accountRow.isDel === isDel.DELETE) {
			throw new BizError(t('isDelUser'));
		}
		if (accountRow) {
			throw new BizError(t('isRegAccount'));
		}

		const defRole = await roleService.selectDefaultRole(c);

		await userService.add(c, {
			email: applyRow.email,
			password: saltHashUtils.genRandomPwd(),
			type: defRole.roleId
		});

		const userRow = await userService.selectByEmail(c, applyRow.email);

		await orm(c).update(oauth).set({ userId: userRow.userId }).where(eq(oauth.oauthId, oauthRow.oauthId)).run();

		await orm(c).update(apply).set({
			status: applyConst.status.APPROVED,
			adminId: adminId,
			updateTime: dayjs().format('YYYY-MM-DD HH:mm:ss')
		}).where(eq(apply.applyId, applyRow.applyId)).run();
	},

	async reject(c, params, adminId) {

		const applyRow = await orm(c).select().from(apply).where(eq(apply.applyId, Number(params.applyId))).get();

		if (!applyRow) {
			throw new BizError(t('applyNotFound'));
		}

		if (applyRow.status !== applyConst.status.PENDING) {
			throw new BizError(t('applyProcessed'));
		}

		const remark = String(params.remark || '').trim().slice(0, 200);

		await orm(c).update(apply).set({
			status: applyConst.status.REJECTED,
			remark: remark,
			adminId: adminId,
			updateTime: dayjs().format('YYYY-MM-DD HH:mm:ss')
		}).where(eq(apply.applyId, applyRow.applyId)).run();
	},

	async notify(c, applyRow, mode) {

		if (!applyRow) {
			return;
		}

		try {
			const settingRow = await this.getSettingRow(c);
			const token = settingRow.tgBotToken;
			const rawChatId = settingRow.tgChatId;

			if (!token || !rawChatId || Number(settingRow.tgBotStatus) === settingConst.tgBotStatus.CLOSE) {
				return;
			}

			const trustText = applyRow.trustLevel === null ? 'unknown' : ['TL', applyRow.trustLevel].join('');
			const who = [applyRow.username, applyRow.platform, trustText].filter(Boolean).join(' ');
			const headMap = {
				auto: '邮箱申请已自动通过',
				fallback: '邮箱申请自动通过失败，转人工审核',
				pending: '收到新的邮箱申请（待人工审核）',
				approved: '邮箱申请已人工通过'
			};
			const reasonPart = mode === 'fallback' ? ['原因：', applyRow.remark].join('') : '';
			const lines = [
				headMap[mode] || '邮箱申请状态更新',
				['申请人：', who].join(''),
				['期望地址：', applyRow.email].join(''),
				reasonPart
			];

			const apiBase = ['https://api.telegram.org/bot', token, '/sendMessage'].join('');

			const chatIds = String(rawChatId).split(',').map(item => item.trim()).filter(Boolean);

			for (const chatId of chatIds) {
				await fetch(apiBase, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						chat_id: chatId,
						text: lines.filter(Boolean).join('\n')
					})
				});
			}
		} catch (e) {
			console.error('Telegram notify failed:', e.message);
		}
	}

};

export default applyService
