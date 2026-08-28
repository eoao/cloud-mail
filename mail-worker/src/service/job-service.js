import orm from '../entity/orm';
import job from '../entity/job';
import { and, eq, lte, sql, desc, inArray } from 'drizzle-orm';
import dayjs from 'dayjs';
import { jobConst } from '../const/entity-const';

// Cloudflare Queues is a paid-plan feature, so the queue lives in D1 and is
// drained by a single Durable Object (see src/do/job-runner.js). That keeps
// heavy work off the request path and, because there is exactly one runner,
// makes execution serial - which is also what keeps us inside the free-plan
// CPU and D1-write budgets.

const now = () => dayjs().format('YYYY-MM-DD HH:mm:ss');

const jobService = {

	/**
	 * Add a job. `runAfter` (ISO/ 'YYYY-MM-DD HH:mm:ss') delays execution -
	 * that is how scheduled send, undo-send and snooze are implemented.
	 * `dedupeKey` makes enqueue idempotent for pending/running work.
	 */
	async enqueue(c, type, payload = {}, opts = {}) {

		const { priority = 0, runAfter = null, maxAttempts = 3, dedupeKey = '' } = opts;

		if (dedupeKey) {
			const existing = await orm(c).select({ jobId: job.jobId }).from(job)
				.where(and(
					eq(job.dedupeKey, dedupeKey),
					inArray(job.status, [jobConst.status.PENDING, jobConst.status.RUNNING])
				)).get();

			if (existing) {
				return existing;
			}
		}

		return orm(c).insert(job).values({
			type,
			payload: JSON.stringify(payload ?? {}),
			status: jobConst.status.PENDING,
			priority,
			runAfter: runAfter || now(),
			maxAttempts,
			dedupeKey,
			createTime: now(),
			updateTime: now()
		}).returning().get();
	},

	/**
	 * Atomically take up to `limit` due jobs. The UPDATE...RETURNING against a
	 * bounded sub-select is a single D1 statement, so two concurrent runners
	 * can never claim the same row.
	 */
	async claim(c, limit = 5) {
		const { results } = await c.env.db.prepare(
			`UPDATE job
			    SET status = ?, attempts = attempts + 1, update_time = ?
			  WHERE job_id IN (
			        SELECT job_id FROM job
			         WHERE status = ? AND run_after <= ?
			         ORDER BY priority DESC, job_id ASC
			         LIMIT ?
			  )
			  RETURNING *`
		).bind(jobConst.status.RUNNING, now(), jobConst.status.PENDING, now(), limit).all();

		// RETURNING gives no ordering guarantee, so re-impose the queue order the
		// sub-select selected by. Without this a batch can execute out of order.
		return (results ?? []).sort((a, b) => (b.priority - a.priority) || (a.job_id - b.job_id));
	},

	async complete(c, jobId, resultValue) {
		await orm(c).update(job).set({
			status: jobConst.status.DONE,
			lastError: '',
			result: resultValue === undefined ? '' : JSON.stringify(resultValue).slice(0, 2000),
			updateTime: now()
		}).where(eq(job.jobId, jobId)).run();
	},

	/**
	 * Retry with exponential backoff until max_attempts is spent, then park the
	 * job as FAILED so an admin can inspect and requeue it.
	 */
	async fail(c, row, error) {

		const message = String(error?.message ?? error ?? 'unknown error').slice(0, 1000);
		const exhausted = row.attempts >= row.max_attempts;

		if (exhausted) {
			await orm(c).update(job).set({
				status: jobConst.status.FAILED,
				lastError: message,
				updateTime: now()
			}).where(eq(job.jobId, row.job_id)).run();
			return { retrying: false };
		}

		const backoffSeconds = Math.min(Math.pow(4, row.attempts) * 15, 3600);

		await orm(c).update(job).set({
			status: jobConst.status.PENDING,
			lastError: message,
			runAfter: dayjs().add(backoffSeconds, 'second').format('YYYY-MM-DD HH:mm:ss'),
			updateTime: now()
		}).where(eq(job.jobId, row.job_id)).run();

		return { retrying: true, backoffSeconds };
	},

	/** Jobs stuck in RUNNING (worker evicted mid-flight) are handed back. */
	async requeueStale(c, olderThanMinutes = 15) {
		const cutoff = dayjs().subtract(olderThanMinutes, 'minute').format('YYYY-MM-DD HH:mm:ss');

		const { meta } = await c.env.db.prepare(
			`UPDATE job SET status = ?, update_time = ?
			  WHERE status = ? AND update_time < ?`
		).bind(jobConst.status.PENDING, now(), jobConst.status.RUNNING, cutoff).run();

		return meta?.changes ?? 0;
	},

	async hasPending(c) {
		const row = await orm(c).select({ jobId: job.jobId }).from(job)
			.where(and(eq(job.status, jobConst.status.PENDING), lte(job.runAfter, now())))
			.limit(1).get();
		return !!row;
	},

	/** Seconds until the next scheduled job, or null when nothing is queued. */
	async nextRunAfter(c) {
		const row = await orm(c).select({ runAfter: job.runAfter }).from(job)
			.where(eq(job.status, jobConst.status.PENDING))
			.orderBy(job.runAfter).limit(1).get();

		if (!row) {
			return null;
		}

		return Math.max(0, dayjs(row.runAfter).diff(dayjs(), 'second'));
	},

	async stats(c) {
		const { results } = await c.env.db.prepare(
			`SELECT status, COUNT(*) AS count FROM job GROUP BY status`
		).all();

		const out = { pending: 0, running: 0, done: 0, failed: 0 };
		const names = { 0: 'pending', 1: 'running', 2: 'done', 3: 'failed' };

		for (const row of results ?? []) {
			const key = names[row.status];
			if (key) {
				out[key] = row.count;
			}
		}

		return out;
	},

	async list(c, params = {}) {
		const { status, size = 50 } = params;
		const limit = Math.min(Number(size) || 50, 200);

		const query = orm(c).select().from(job).orderBy(desc(job.jobId)).limit(limit);

		if (status !== undefined && status !== null && status !== '') {
			return query.where(eq(job.status, Number(status))).all();
		}

		return query.all();
	},

	/** Put a failed job back in line with a fresh attempt budget. */
	async retry(c, jobId) {
		return orm(c).update(job).set({
			status: jobConst.status.PENDING,
			attempts: 0,
			lastError: '',
			runAfter: now(),
			updateTime: now()
		}).where(eq(job.jobId, jobId)).returning().get();
	},

	async cancel(c, jobId) {
		return orm(c).delete(job)
			.where(and(eq(job.jobId, jobId), eq(job.status, jobConst.status.PENDING)))
			.returning().get();
	},

	/** Housekeeping: keep finished rows from eating the D1 free-tier row budget. */
	async purgeFinished(c, olderThanDays = 3) {
		const cutoff = dayjs().subtract(olderThanDays, 'day').format('YYYY-MM-DD HH:mm:ss');

		const { meta } = await c.env.db.prepare(
			`DELETE FROM job WHERE status = ? AND update_time < ?`
		).bind(jobConst.status.DONE, cutoff).run();

		return meta?.changes ?? 0;
	},

	/**
	 * Wake the single JobRunner Durable Object. Safe to call from a request
	 * path - callers should wrap it in ctx.waitUntil so the user is not made
	 * to wait on the queue.
	 */
	async kick(c) {
		if (!c.env.JOB_RUNNER) {
			return false;
		}
		try {
			const id = c.env.JOB_RUNNER.idFromName('global');
			await c.env.JOB_RUNNER.get(id).fetch('https://job-runner/kick');
			return true;
		} catch (e) {
			console.warn('job runner kick failed:', e.message);
			return false;
		}
	}
};

export default jobService;
