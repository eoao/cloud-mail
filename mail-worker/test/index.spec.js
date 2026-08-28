import { env } from 'cloudflare:test';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import jobService from '../src/service/job-service';
import { jobType, registerHandler } from '../src/job/handlers';
import { jobConst } from '../src/const/entity-const';
import { dbInit } from '../src/init/init';

const c = { env };

// Minimal Hono-ish context for dbInit.init (it only reads a route param and
// returns text).
function initContext(secret) {
	const store = new Map();
	return {
		env,
		req: { param: () => secret },
		set: (k, v) => store.set(k, v),
		get: (k) => store.get(k),
		text: (body, status = 200) => ({ body, status })
	};
}

describe('init endpoint auth', () => {
	it('rejects a wrong secret without running migrations', async () => {
		const res = await dbInit.init(initContext('not-the-secret'));
		expect(res.status).toBe(403);
		expect(res.body).toContain('mismatch');
	});

	it('accepts the configured init_secret', async () => {
		const res = await dbInit.init(initContext(env.init_secret));
		expect(res.body).toBe('success');
	});
});

describe('job queue', () => {

	beforeAll(async () => {
		await dbInit.init(initContext(env.init_secret));
	});

	beforeEach(async () => {
		await env.db.prepare('DELETE FROM job').run();
	});

	it('creates the job table with the claim index', async () => {
		const { results } = await env.db.prepare(
			`SELECT name FROM sqlite_master WHERE name IN ('job','idx_job_claim')`
		).all();
		expect(results.map(r => r.name).sort()).toEqual(['idx_job_claim', 'job']);
	});

	it('enqueues and drains 50 jobs in FIFO order', async () => {
		const seen = [];
		registerHandler('test_order', async (_c, payload) => {
			seen.push(payload.n);
			return { n: payload.n };
		});

		for (let n = 0; n < 50; n++) {
			await jobService.enqueue(c, 'test_order', { n });
		}

		const runner = env.JOB_RUNNER.get(env.JOB_RUNNER.idFromName('global'));

		// Batch size is 5, so 10 drains clear the backlog.
		for (let i = 0; i < 12 && seen.length < 50; i++) {
			await runner.fetch('https://job-runner/drain');
		}

		expect(seen).toEqual(Array.from({ length: 50 }, (_, n) => n));

		const stats = await jobService.stats(c);
		expect(stats.done).toBe(50);
		expect(stats.pending).toBe(0);
		expect(stats.failed).toBe(0);
	});

	it('honours priority ahead of insertion order', async () => {
		const seen = [];
		registerHandler('test_priority', async (_c, payload) => {
			seen.push(payload.label);
		});

		await jobService.enqueue(c, 'test_priority', { label: 'low' }, { priority: -10 });
		await jobService.enqueue(c, 'test_priority', { label: 'normal' });
		await jobService.enqueue(c, 'test_priority', { label: 'high' }, { priority: 10 });

		const runner = env.JOB_RUNNER.get(env.JOB_RUNNER.idFromName('global'));
		await runner.fetch('https://job-runner/drain');

		expect(seen).toEqual(['high', 'normal', 'low']);
	});

	it('retries a failing job with backoff, then parks it as FAILED', async () => {
		let calls = 0;
		registerHandler('test_fail', async () => {
			calls++;
			throw new Error('boom');
		});

		await jobService.enqueue(c, 'test_fail', {}, { maxAttempts: 3 });
		const runner = env.JOB_RUNNER.get(env.JOB_RUNNER.idFromName('global'));

		await runner.fetch('https://job-runner/drain');
		expect(calls).toBe(1);

		let row = await env.db.prepare('SELECT * FROM job').first();
		expect(row.status).toBe(jobConst.status.PENDING);
		expect(row.attempts).toBe(1);
		expect(row.last_error).toContain('boom');

		// Backoff pushed run_after into the future, so a drain now is a no-op.
		await runner.fetch('https://job-runner/drain');
		expect(calls).toBe(1);

		// Fast-forward past the backoff twice to exhaust max_attempts.
		for (let i = 0; i < 2; i++) {
			await env.db.prepare(`UPDATE job SET run_after = '2000-01-01 00:00:00'`).run();
			await runner.fetch('https://job-runner/drain');
		}

		expect(calls).toBe(3);
		row = await env.db.prepare('SELECT * FROM job').first();
		expect(row.status).toBe(jobConst.status.FAILED);
		expect(row.attempts).toBe(3);
	});

	it('parks an unknown job type immediately instead of retrying', async () => {
		await jobService.enqueue(c, 'no_such_handler', {}, { maxAttempts: 5 });

		const runner = env.JOB_RUNNER.get(env.JOB_RUNNER.idFromName('global'));
		await runner.fetch('https://job-runner/drain');

		const row = await env.db.prepare('SELECT * FROM job').first();
		expect(row.status).toBe(jobConst.status.FAILED);
		expect(row.last_error).toContain('no handler');
	});

	it('does not run a job scheduled for the future', async () => {
		let ran = false;
		registerHandler('test_delayed', async () => { ran = true; });

		await jobService.enqueue(c, 'test_delayed', {}, { runAfter: '2999-01-01 00:00:00' });

		const runner = env.JOB_RUNNER.get(env.JOB_RUNNER.idFromName('global'));
		await runner.fetch('https://job-runner/drain');

		expect(ran).toBe(false);
		expect((await jobService.stats(c)).pending).toBe(1);
	});

	it('dedupes pending work by dedupeKey', async () => {
		const a = await jobService.enqueue(c, jobType.NOOP, {}, { dedupeKey: 'once' });
		const b = await jobService.enqueue(c, jobType.NOOP, {}, { dedupeKey: 'once' });

		expect(b.jobId).toBe(a.jobId);
		expect((await jobService.stats(c)).pending).toBe(1);
	});

	it('hands stale RUNNING jobs back to the queue', async () => {
		await jobService.enqueue(c, jobType.NOOP, {});
		await env.db.prepare(
			`UPDATE job SET status = ?, update_time = '2000-01-01 00:00:00'`
		).bind(jobConst.status.RUNNING).run();

		expect(await jobService.requeueStale(c)).toBe(1);
		expect((await jobService.stats(c)).pending).toBe(1);
	});

	it('retry() resets a failed job and cancel() removes a pending one', async () => {
		const row = await jobService.enqueue(c, jobType.NOOP, {});
		await env.db.prepare('UPDATE job SET status = ?, attempts = 3').bind(jobConst.status.FAILED).run();

		const retried = await jobService.retry(c, row.jobId);
		expect(retried.status).toBe(jobConst.status.PENDING);
		expect(retried.attempts).toBe(0);

		expect(await jobService.cancel(c, row.jobId)).toBeTruthy();
		expect((await jobService.stats(c)).pending).toBe(0);
	});
});
