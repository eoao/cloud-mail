import { eq, and } from 'drizzle-orm';
import orm from '../entity/orm';
import oauthBinding from '../entity/oauth-binding';
import userService from './user-service';
import accountService from './account-service';
import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';
import JwtUtils from '../utils/jwt-utils';
import { v4 as uuidv4 } from 'uuid';
import constant from '../const/constant';
import KvConst from '../const/kv-const';
import dayjs from 'dayjs';

const oauthService = {
	// Get user's OAuth bindings
	async getUserBindings(c, userId) {
		const db = orm(c);
		const bindings = await db.select().from(oauthBinding).where(eq(oauthBinding.userId, userId));
		// Don't return access tokens or refresh tokens to client
		return bindings.map(b => ({
			provider: b.provider,
			oauthId: b.oauthId,
			oauthEmail: b.oauthEmail,
			oauthName: b.oauthName,
			createTime: b.createTime
		}));
	},

	// Bind OAuth account to user
	async bindOauthAccount(c, userId, provider, oauthData) {
		const db = orm(c);
		
		// Check if already bound
		const existing = await db.select().from(oauthBinding).where(
			and(
				eq(oauthBinding.userId, userId),
				eq(oauthBinding.provider, provider)
			)
		);

		if (existing.length > 0) {
			throw new BizError(t('oauthAlreadyBound'), 400);
		}

		// Check if OAuth ID is already used by another user
		const used = await db.select().from(oauthBinding).where(
			and(
				eq(oauthBinding.provider, provider),
				eq(oauthBinding.oauthId, oauthData.oauthId)
			)
		);

		if (used.length > 0) {
			throw new BizError(t('oauthIdAlreadyUsed'), 400);
		}

		// Insert binding
		await db.insert(oauthBinding).values({
			userId,
			provider,
			oauthId: oauthData.oauthId,
			oauthEmail: oauthData.oauthEmail,
			oauthName: oauthData.oauthName,
			accessToken: oauthData.accessToken,
			refreshToken: oauthData.refreshToken,
			expiresAt: oauthData.expiresAt
		});
	},

	// Unbind OAuth account
	async unbindOauthAccount(c, userId, provider) {
		const db = orm(c);
		
		await db.delete(oauthBinding).where(
			and(
				eq(oauthBinding.userId, userId),
				eq(oauthBinding.provider, provider)
			)
		);
	},

	// Find user by OAuth ID
	async findUserByOauth(c, provider, oauthId) {
		const db = orm(c);
		
		const binding = await db.select().from(oauthBinding).where(
			and(
				eq(oauthBinding.provider, provider),
				eq(oauthBinding.oauthId, oauthId)
			)
		);

		if (binding.length === 0) {
			return null;
		}

		return binding[0];
	},

	// OAuth login
	async oauthLogin(c, provider, oauthData) {
		// Find user by OAuth binding
		const binding = await this.findUserByOauth(c, provider, oauthData.oauthId);

		if (!binding) {
			throw new BizError(t('oauthUserNotFound'), 404);
		}

		// Get user
		const userRow = await userService.selectById(c, binding.userId);

		if (!userRow) {
			throw new BizError(t('notExistUser'), 404);
		}

		if (userRow.isDel === 1) {
			throw new BizError(t('isDelUser'), 403);
		}

		if (userRow.status === 1) {
			throw new BizError(t('isBanUser'), 403);
		}

		// Generate JWT token
		const uuid = uuidv4();
		const jwt = await JwtUtils.generateToken(c, { userId: userRow.userId, token: uuid });

		// Update auth info in KV
		let authInfo = await c.env.kv.get(KvConst.AUTH_INFO + userRow.userId, { type: 'json' });

		if (authInfo) {
			if (authInfo.tokens.length > 10) {
				authInfo.tokens.shift();
			}
			authInfo.tokens.push(uuid);
		} else {
			authInfo = {
				tokens: [],
				user: userRow,
				refreshTime: dayjs().toISOString()
			};
			authInfo.tokens.push(uuid);
		}

		await userService.updateUserInfo(c, userRow.userId);
		await c.env.kv.put(KvConst.AUTH_INFO + userRow.userId, JSON.stringify(authInfo), { expirationTtl: constant.TOKEN_EXPIRE });

		return jwt;
	}
};

export default oauthService;

