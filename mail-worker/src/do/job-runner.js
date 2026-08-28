import { DurableObject } from 'cloudflare:workers';
import jobService from '../service/job-service';
import { getHandler } from '../job/handlers';

// Single-instance queue drainer.
//
// Everything addresses this DO as idFromName('global'), so exactly one runner
// exists per deployment. That gives serial execution for free and acts as a
// natural throttle against the Workers free-plan CPU budget - no job can be
// running while another one is.
//
// lc-debt: one DO instance = one worker, ceiling of a few jobs/second;
// if throughput ever matters, shard the DO by job type.

const BATCH_SIZE = 5;
const MAX_ALARM_SECONDS = 3600;

export class JobRunner extends DurableObject {

	constructor(ctx, env) {
		super(ctx, env);
		this.env = env;
		this.ctx = ctx;
	}

	/** Hono-shaped context so services can be reused verbatim. */
	get c() {
		return { env: this.env };
	}

	async fetch(request) {
		const url = new URL(request.url);

		if (url.pathname === '/kick') {
			await this.scheduleNext(0);
			return Response.json({ ok: true });
		}

		// Drain one batch without touching the alarm chain - used by the admin
		// panel and by tests, where self-rescheduling would be a side effect.
		if (url.pathname === '/drain') {
			const processed = await this.drain();
			return Response.json({ processed });
		}

		return new Response('not found', { status: 404 });
	}

	async alarm() {
		const processed = await this.drain();
		await this.rearm(processed);
	}

	/** Process at most one batch. */
	async drain() {

		let processed = 0;

		try {
			const rows = await jobService.claim(this.c, BATCH_SIZE);

			for (const row of rows) {
				await this.runOne(row);
				processed++;
			}
		} catch (e) {
			console.error('job drain failed:', e.message);
		}

		return processed;
	}

	async runOne(row) {

		const handler = getHandler(row.type);

		if (!handler) {
			// Unknown type: no amount of retrying will help, so park it now.
			await jobService.fail(this.c, { ...row, attempts: row.max_attempts }, `no handler for job type "${row.type}"`);
			return;
		}

		let payload = {};
		try {
			payload = row.payload ? JSON.parse(row.payload) : {};
		} catch {
			await jobService.fail(this.c, { ...row, attempts: row.max_attempts }, 'payload is not valid JSON');
			return;
		}

		try {
			const result = await handler(this.c, payload, row);
			await jobService.complete(this.c, row.job_id, result);
		} catch (e) {
			console.warn(`job ${row.job_id} (${row.type}) failed:`, e.message);
			await jobService.fail(this.c, row, e);
		}
	}

	async rearm(processed) {

		// Anything left that is already due: come straight back.
		if (processed >= BATCH_SIZE || await jobService.hasPending(this.c)) {
			return this.scheduleNext(0);
		}

		const waitSeconds = await jobService.nextRunAfter(this.c);

		if (waitSeconds === null) {
			// Queue is empty - stop burning alarms, the next enqueue will kick us.
			return this.ctx.storage.deleteAlarm();
		}

		return this.scheduleNext(Math.min(Math.max(waitSeconds, 1), MAX_ALARM_SECONDS));
	}

	async scheduleNext(delaySeconds) {
		const target = Date.now() + Math.max(0, delaySeconds) * 1000;
		const existing = await this.ctx.storage.getAlarm();

		// Never push an already-armed alarm further out.
		if (existing !== null && existing <= target) {
			return;
		}

		await this.ctx.storage.setAlarm(target);
	}
}

export default JobRunner;
