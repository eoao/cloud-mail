import app from './hono/webs';
import { email } from './email/email';
import userService from './service/user-service';
export default {
	 async fetch(req, env, ctx) {
		const url = new URL(req.url)


		if (url.pathname.startsWith('/api/')) {
			url.pathname = url.pathname.replace('/api', '')
			req = new Request(url.toString(), req)
			return app.fetch(req, env, ctx);
		}

		return env.assets.fetch(req);
	},
	email: email,
	async scheduled(c, env, ctx) {
		await userService.resetDaySendCount({ env })
	},
};
