import KvConst from '../const/kv-const';
import setting from '../entity/setting';
import orm from '../entity/orm';
import { settingConst } from '../const/entity-const';
import fileUtils from '../utils/file-utils';
import r2Service from './r2-service';
import emailService from './email-service';
import accountService from './account-service';
import userService from './user-service';
import starService from './star-service';
import constant from '../const/constant';
import BizError from '../error/biz-error';

const settingService = {

	async refresh(c) {
		const settingRow = await orm(c).select().from(setting).get();
		settingRow.resendTokens = JSON.parse(settingRow.resendTokens);
		await c.env.kv.put(KvConst.SETTING, JSON.stringify(settingRow));
	},

	async query(c) {
		const setting = await c.env.kv.get(KvConst.SETTING, { type: 'json' });
		let domainList = c.env.domain;
		if (typeof domainList === 'string') {
			throw new BizError('环境变量domain必须是JSON类型');
		}
		domainList = domainList.map(item => '@' + item);
		setting.domainList = domainList;
		return setting;
	},

	async get(c) {
		const settingRow = await this.query(c);
		settingRow.secretKey = settingRow.secretKey ? `${settingRow.secretKey.slice(0, 12)}******`: null ;
		Object.keys(settingRow.resendTokens).forEach(key => {
			settingRow.resendTokens[key] = `${settingRow.resendTokens[key].slice(0, 12)}******`;
		});
		return settingRow
	},

	async set(c, params) {
		const settingData  = await this.query(c)
		let resendTokens = {...settingData.resendTokens,...params.resendTokens}
		Object.keys(resendTokens).forEach(domain => {
			if(!resendTokens[domain]) delete resendTokens[domain]
		})
		params.resendTokens = JSON.stringify(resendTokens)
		await orm(c).update(setting).set({ ...params }).returning().get();
		await this.refresh(c);
	},

	async isRegister(c) {
		const { register } = await this.query(c);
		return register === settingConst.register.OPEN;
	},

	async isReceive(c) {
		const { receive } = await this.query(c);
		return receive === settingConst.receive.OPEN;
	},

	async isAddEmail(c) {
		const { addEmail, manyEmail } = await this.query(c);
		return addEmail === settingConst.addEmail.OPEN && manyEmail === settingConst.manyEmail.OPEN;
	},

	async isRegisterVerify(c) {
		const { registerVerify } = await this.query(c);
		return registerVerify === settingConst.registerVerify.OPEN;
	},

	async isAddEmailVerify(c) {
		const { addEmailVerify } = await this.query(c);
		return addEmailVerify === settingConst.addEmailVerify.OPEN;
	},

	async setBackground(c, params) {

		const settingRow = await this.query(c);


		if (!c.env.r2) {
			throw new BizError('r2对象存储未配置不能上传背景');
		}

		if (!settingRow.r2Domain) {
			throw new BizError('r2域名未配置不上传背景');
		}

		const { background } = params;
		const file = fileUtils.base64ToFile(background);
		const arrayBuffer = await file.arrayBuffer();
		const key = constant.BACKGROUND_PREFIX + await fileUtils.getBuffHash(arrayBuffer) + fileUtils.getExtFileName(file.name);
		await r2Service.putObj(c, key, file, {
			contentType: file.type
		});

		if (settingRow.background) {
			await r2Service.delete(c, settingRow.background);
		}

		await orm(c).update(setting).set({ background: key }).run();
		await this.refresh(c);
		return key;
	},

	async physicsDeleteAll(c) {
		await emailService.physicsDeleteAll(c);
		await accountService.physicsDeleteAll(c);
		await userService.physicsDeleteAll(c);
	}
};

export default settingService;
