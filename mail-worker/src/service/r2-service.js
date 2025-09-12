import s3Service from './s3-service';
import settingService from './setting-service';

const r2Service = {

	async hasOSS(c) {

		if (c.env.r2) {
			return true;
		}

		const setting = await settingService.query(c);
		const { bucket, region, endpoint, s3AccessKey, s3SecretKey } = setting;

		return !!(bucket && region && endpoint && s3AccessKey && s3SecretKey);
	},

	async putObj(c, key, content, metadata) {

		if (c.env.r2) {

			await c.env.r2.put(key, content, {
				httpMetadata: { ...metadata }
			});

		} else {

			await s3Service.putObj(c, key, content, metadata);

		}

	},

	async getObj(c, key) {
		return await c.env.r2.get(key);
	},

	async delete(c, key) {

		if (c.env.r2) {

			await c.env.r2.delete(key);

		} else {

			await s3Service.deleteObj(c, key);

		}

	}

};
export default r2Service;
