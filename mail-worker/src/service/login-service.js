import BizError from '../error/biz-error';
import userService from './user-service';
import emailUtils from '../utils/email-utils';
import { isDel, userConst } from '../const/entity-const';
import JwtUtils from '../utils/jwt-utils';
import { v4 as uuidv4 } from 'uuid';
import KvConst from '../const/kv-const';
import constant from '../const/constant';
import userContext from '../security/user-context';
import verifyUtils from '../utils/verify-utils';
import accountService from './account-service';
import settingService from './setting-service';
import saltHashUtils from '../utils/crypto-utils';
import cryptoUtils from '../utils/crypto-utils';
import turnstileService from './turnstile-service';
import roleService from './role-service';
import dayjs from 'dayjs';

const loginService = {

	async register(c, params) {

		const { email, password, token } = params;

		if (!await settingService.isRegister(c)) {
			throw new BizError('注册功能已关闭');
		}

		if (!verifyUtils.isEmail(email)) {
			throw new BizError('非法邮箱');
		}

		if (password.length < 6) {
			throw new BizError('密码必须大于6位');
		}

		if (!c.env.domain.includes(emailUtils.getDomain(email))) {
			throw new BizError('非法邮箱域名');
		}

		const accountRow = await accountService.selectByEmailIncludeDel(c, email);

		if (accountRow && accountRow.isDel === isDel.DELETE) {
			throw new BizError('该邮箱已被注销');
		}

		if (accountRow) {
			throw new BizError('该邮箱已被其他用户绑定');
		}

		if (await settingService.isRegisterVerify(c)) {
			await turnstileService.verify(c,token)
		}

		const { salt, hash } = await saltHashUtils.hashPassword(password);

		const roleRow = await roleService.selectDefaultRole(c);

		const userId = await userService.insert(c, { email, password: hash, salt, type: roleRow.roleId });

		await userService.updateUserInfo(c, userId, true);

		await accountService.insert(c, { userId: userId, email });
	},

	async login(c, params) {

		const { email, password } = params;

		if (!email || !password) {
			throw new BizError('邮箱和密码不能为空');
		}

		const userRow = await userService.selectByEmailIncludeDel(c, email);

		if (!userRow) {
			throw new BizError('该用户不存在');
		}

		if(userRow.isDel === isDel.DELETE) {
			throw new BizError('该用户已被注销');
		}

		if(userRow.status === userConst.status.BAN) {
			throw new BizError('该用户已被禁用');
		}

		if (!await cryptoUtils.verifyPassword(password, userRow.salt, userRow.password)) {
			throw new BizError('密码输入错误');
		}

		const uuid = uuidv4();
		const jwt = await JwtUtils.generateToken(c,{ userId: userRow.userId, token: uuid });

		let authInfo = await c.env.kv.get(KvConst.AUTH_INFO + userRow.userId, { type: 'json' });

		if (authInfo) {

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
	},

	async logout(c, userId) {
		const token =userContext.getToken(c);
		const authInfo = await c.env.kv.get(KvConst.AUTH_INFO + userId, { type: 'json' });
		const index = authInfo.tokens.findIndex(item => item === token);
		authInfo.tokens.splice(index, 1);
		await c.env.kv.put(KvConst.AUTH_INFO + userId, JSON.stringify(authInfo));
	}

};

export default loginService;
