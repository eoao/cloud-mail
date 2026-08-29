import app from './hono/webs';
import { email } from './email/email';
import userService from './service/user-service';
import verifyRecordService from './service/verify-record-service';
import emailService from './service/email-service';
import kvObjService from './service/kv-obj-service';
import oauthService from './service/oauth-service';
import analysisService from './service/analysis-service';
import jobService from './service/job-service';
import { jobType } from './job/handlers';

export { JobRunner } from './do/job-runner';

export default {
	 async fetch(req, env, ctx) {

		const url = new URL(req.url)

		if (url.pathname.startsWith('/api/')) {
			url.pathname = url.pathname.replace('/api', '')
			req = new Request(url.toString(), req)
			return app.fetch(req, env, ctx);
		}

		 if (['/static/','/attachments/'].some(p => url.pathname.startsWith(p))) {
			 return await kvObjService.toObjResp( { env }, url.pathname.substring(1));
		 }

		return env.assets.fetch(req);
	},
	email: email,
	async scheduled(c, env, ctx) {

		const ctxLike = { env };

		// Cheap bookkeeping stays inline.
		await verifyRecordService.clearRecord(ctxLike)
		await userService.resetDaySendCount(ctxLike)
		await oauthService.clearNoBindOathUser(ctxLike)

		// Everything expensive goes through the queue so it runs serially in the
		// JobRunner instead of racing inside one scheduled invocation. dedupeKey
		// stops an hour's jobs piling up when the runner is behind.
		if (env.JOB_RUNNER) {

			await jobService.requeueStale(ctxLike)

			await jobService.enqueue(ctxLike, jobType.COMPLETE_RECEIVE, {}, { dedupeKey: jobType.COMPLETE_RECEIVE })
			await jobService.enqueue(ctxLike, jobType.AUTO_CLEAN, {}, { dedupeKey: jobType.AUTO_CLEAN })
			await jobService.enqueue(ctxLike, jobType.REFRESH_ANALYSIS, {}, { dedupeKey: jobType.REFRESH_ANALYSIS })
			await jobService.enqueue(ctxLike, jobType.PURGE_JOBS, {}, { dedupeKey: jobType.PURGE_JOBS, priority: -10 })
			await jobService.enqueue(ctxLike, jobType.WAKE_SNOOZED, {}, { dedupeKey: jobType.WAKE_SNOOZED })

			await jobService.kick(ctxLike)
			return;
		}

		// No Durable Object binding (older deployment): fall back to inline work.
		await emailService.completeReceiveAll(ctxLike)
		await emailService.autoClean(ctxLike)
		await analysisService.refreshEchartsCache(ctxLike)
	},
};
