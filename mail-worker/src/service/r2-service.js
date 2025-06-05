import attService from './att-service';
import constant from '../const/constant';

const r2Service = {
	async putObj(c, key, content, metadata) {
		await c.env.r2.put(key, content, {
			httpMetadata: {...metadata}
		});
	},

	async getObj(c, key) {
		return await c.env.r2.get(key);
	},

	async delete(c, key) {
		await c.env.r2.delete(key);
	}

};
export default r2Service;
