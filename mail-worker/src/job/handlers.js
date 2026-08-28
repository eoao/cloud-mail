// Job type registry. Each handler receives (c, payload, row) and may return a
// small JSON-serialisable value that is stored on the job row for debugging.
//
// Handlers run inside the JobRunner Durable Object, off the request path, so
// they may be slow - but they still share the account's D1 / Workers AI budget,
// so keep each one narrow and idempotent: a job can be retried after a partial
// failure or a mid-flight worker eviction.

import emailService from '../service/email-service';
import analysisService from '../service/analysis-service';
import jobService from '../service/job-service';

export const jobType = {
	AUTO_CLEAN: 'auto_clean',
	REFRESH_ANALYSIS: 'refresh_analysis',
	COMPLETE_RECEIVE: 'complete_receive',
	PURGE_JOBS: 'purge_jobs',
	NOOP: 'noop'
};

const handlers = {

	[jobType.AUTO_CLEAN]: async (c) => {
		await emailService.autoClean(c);
		return { ok: true };
	},

	[jobType.REFRESH_ANALYSIS]: async (c) => {
		await analysisService.refreshEchartsCache(c);
		return { ok: true };
	},

	[jobType.COMPLETE_RECEIVE]: async (c) => {
		await emailService.completeReceiveAll(c);
		return { ok: true };
	},

	[jobType.PURGE_JOBS]: async (c, payload) => {
		const removed = await jobService.purgeFinished(c, payload?.olderThanDays ?? 3);
		return { removed };
	},

	// Used by tests and by the admin "queue is alive" check.
	[jobType.NOOP]: async (c, payload) => {
		if (payload?.fail) {
			throw new Error(payload.fail === true ? 'forced failure' : String(payload.fail));
		}
		return { echo: payload ?? null };
	}
};

export function getHandler(type) {
	return handlers[type] ?? null;
}

export function registerHandler(type, fn) {
	handlers[type] = fn;
}

export default handlers;
