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
import aiRouter from '../service/ai';
import searchService from '../service/search-service';
import ruleService from '../service/rule-service';
import contactService from '../service/contact-service';
import r2Service from '../service/r2-service';
import orm from '../entity/orm';
import email from '../entity/email';
import { eq } from 'drizzle-orm';

export const jobType = {
	AUTO_CLEAN: 'auto_clean',
	REFRESH_ANALYSIS: 'refresh_analysis',
	COMPLETE_RECEIVE: 'complete_receive',
	PURGE_JOBS: 'purge_jobs',
	AI_TASK: 'ai_task',
	AI_TRIAGE: 'ai_triage',
	REBUILD_SEARCH: 'rebuild_search',
	SEND_EMAIL: 'send_email',
	WAKE_SNOOZED: 'wake_snoozed',
	IMPORT_ICS: 'import_ics',
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

	// Generic escape hatch: run any registered AI task off the request path.
	[jobType.AI_TASK]: async (c, payload) => {
		const { task, input } = payload ?? {};
		const outcome = await aiRouter.run(c, task, input ?? {});

		if (!outcome.ok) {
			throw new Error(outcome.error);
		}

		return outcome.result;
	},

	/**
	 * Classify one received email. Runs in the queue rather than in the inbound
	 * email handler so the 10ms CPU budget and the Workers AI daily quota are
	 * not spent while Cloudflare is waiting on the SMTP transaction.
	 */
	[jobType.AI_TRIAGE]: async (c, payload) => {

		const emailId = Number(payload?.emailId);

		if (!emailId) {
			throw new Error('ai_triage requires an emailId');
		}

		const row = await orm(c).select().from(email).where(eq(email.emailId, emailId)).get();

		if (!row) {
			// The message was deleted before we got to it - nothing to do.
			return { skipped: 'email no longer exists' };
		}

		const input = {
			from: row.sendEmail,
			subject: row.subject,
			body: row.text || row.content || ''
		};

		const [category, spam] = await Promise.all([
			aiRouter.run(c, 'categorize', input),
			aiRouter.run(c, 'spam_score', { ...input, links: [] })
		]);

		const update = {};

		if (category.ok && category.result) {
			update.category = category.result.category;
			update.priority = category.result.priority;
		}

		if (spam.ok && spam.result) {
			update.spamScore = spam.result.score;
			update.spamVerdict = spam.result.verdict;
		}

		// A provider outage leaves the row untouched rather than writing defaults
		// that would look like a real "not spam" verdict.
		if (Object.keys(update).length === 0) {
			throw new Error(category.error || spam.error || 'triage produced nothing');
		}

		await orm(c).update(email).set(update).where(eq(email.emailId, emailId)).run();

		// Rules run after classification so a rule can match on the AI category.
		const applied = await ruleService.apply(c, { ...row, ...update });

		return { emailId, ...update, rules: applied.length };
	},

	[jobType.REBUILD_SEARCH]: async (c) => {
		return searchService.rebuildIndex(c);
	},

	// Deferred delivery for scheduled sends and the undo-send window.
	[jobType.SEND_EMAIL]: async (c, payload) => {
		return emailService.deliverEmail(c, Number(payload?.emailId));
	},

	[jobType.WAKE_SNOOZED]: async (c) => {
		return { woken: await emailService.wakeSnoozed(c) };
	},

	// Parse a meeting invitation attached to a received message. Queued rather
	// than run inline: iCalendar parsing is pure CPU, which is the scarcest
	// thing in the inbound path.
	[jobType.IMPORT_ICS]: async (c, payload) => {
		const { emailId, userId, key } = payload ?? {};

		const obj = await r2Service.getObj(c, key);

		if (!obj) {
			return { skipped: 'invitation is no longer in storage' };
		}

		const saved = await contactService.importIcs(c, await obj.text(), Number(userId), Number(emailId) || 0);

		return { imported: saved.length };
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
