import BizError from '../error/biz-error';
import verifyUtils from '../utils/verify-utils';
import emailUtils from '../utils/email-utils';
import userService from './user-service';
import emailService from './email-service';
import orm from '../entity/orm';
import account from '../entity/account';
import { and, asc, eq, gt, inArray, count, like } from 'drizzle-orm';
import { isDel } from '../const/entity-const';
import settingService from './setting-service';
import turnstileService from './turnstile-service';
import roleService from './role-service';

const accountService = {

	async add(c, params, userId) {

		if (!await settingService.isAddEmail(c)) {
			throw new BizError('添加邮箱功能已关闭');
		}

		let { email, token } = params;

		if (!email) {
			throw new BizError('邮箱不能为空');
		}

		if (!verifyUtils.isEmail(email)) {
			throw new BizError('非法邮箱');
		}

		if (!c.env.domain.includes(emailUtils.getDomain(email))) {
			throw new BizError('不存在的邮箱域名');
		}

		const accountRow = await this.selectByEmailIncludeDel(c, email);

		if (accountRow && accountRow.isDel === isDel.DELETE) {
			throw new BizError('该邮箱已被注销');
		}

		if (accountRow) {
			throw new BizError('该邮箱已被注册');
		}

		const userRow = await userService.selectById(c, userId);
		const roleRow = await roleService.selectById(c, userRow.type);

		if (roleRow.accountCount) {

			const userAccountCount = await accountService.countUserAccount(c, userId)
			if(userAccountCount >= roleRow.accountCount) throw new BizError(`添加邮箱数量限制${roleRow.accountCount}个`, 403);

		}

		if (await settingService.isAddEmailVerify(c)) {
			await turnstileService.verify(c, token);
		}

		return orm(c).insert(account).values({ email: email, userId: userId }).returning().get();
	},

	selectByEmailIncludeDel(c, email) {
		return orm(c).select().from(account).where(eq(account.email, email)).get();
	},

	selectByEmail(c, email) {
		return orm(c).select().from(account).where(
			and(
				eq(account.email, email),
				eq(account.isDel, isDel.NORMAL)))
			.get();
	},

	list(c, params, userId) {

		let { accountId, size } = params;

		accountId = Number(accountId);
		size = Number(size);

		if (size > 30) {
			size = 30;
		}

		if (!accountId) {
			accountId = 0;
		}
		return orm(c).select().from(account).where(
			and(
				eq(account.userId, userId),
				eq(account.isDel, isDel.NORMAL),
				gt(account.accountId, accountId)))
			.orderBy(asc(account.accountId))
			.limit(size)
			.all();
	},

	async delete(c, params, userId) {

		let { accountId } = params;

		const user = await userService.selectById(c, userId);
		const accountRow = await this.selectById(c, accountId);

		if (accountRow.email === user.email) {
			throw new BizError('不可以删除自己的邮箱');
		}

		if (accountRow.userId !== user.userId) {
			throw new BizError('该邮箱不属于当前用户');
		}

		await orm(c).update(account).set({ isDel: isDel.DELETE }).where(
			and(eq(account.userId, userId),
				eq(account.accountId, accountId)))
			.run();
	},

	selectById(c, accountId) {
		return orm(c).select().from(account).where(
			and(eq(account.accountId, accountId),
				eq(account.isDel, isDel.NORMAL)))
			.get();
	},

	async insert(c, params) {
		await orm(c).insert(account).values({ ...params }).returning();
	},

	async physicsDeleteAll(c) {
		const accountIdsRow = await orm(c).select({accountId: account.accountId}).from(account).where(eq(account.isDel,isDel.DELETE)).limit(99);
		if (accountIdsRow.length === 0) {
			return;
		}
		const accountIds = accountIdsRow.map(item => item.accountId)
		await emailService.physicsDeleteAccountIds(c, accountIds);
		await orm(c).delete(account).where(inArray(account.accountId,accountIds)).run();
		if (accountIdsRow.length === 99) {
			await this.physicsDeleteAll(c)
		}
	},

	async physicsDeleteByUserIds(c, userIds) {
		await emailService.physicsDeleteUserIds(c, userIds);
		await orm(c).delete(account).where(inArray(account.userId,userIds)).run();
	},

	async selectUserAccountCountList(c, userIds, del = isDel.NORMAL) {
		const result = await orm(c)
			.select({
				userId: account.userId,
				count: count(account.accountId)
			})
			.from(account)
			.where(and(
				inArray(account.userId, userIds),
				eq(account.isDel, del)
			))
			.groupBy(account.userId)
		return result;
	},

	async countUserAccount(c, userId) {
		const { num } = await orm(c).select({num: count()}).from(account).where(and(eq(account.userId, userId),eq(account.isDel, isDel.NORMAL))).get();
		return num;
	},

	async restoreByEmail(c, email) {
		await orm(c).update(account).set({isDel: isDel.NORMAL}).where(eq(account.email, email)).run();
	},

	async restoreByUserId(c, userId) {
		await orm(c).update(account).set({isDel: isDel.NORMAL}).where(eq(account.userId, userId)).run();
	}
};

export default accountService;
