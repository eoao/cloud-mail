import { env, runInDurableObject } from 'cloudflare:test';
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import jobService from '../src/service/job-service';
import { jobType, registerHandler } from '../src/job/handlers';
import { dbInit } from '../src/init/init';
import dayjs from 'dayjs';

// The alarm chain is what keeps the queue moving. Nothing tested it before:
// /drain deliberately does not re-arm, so every earlier test drove the queue by
// hand and the scheduling logic never ran. A queue that stops arming itself
// fails silently - work just never happens.

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

const c = { env };
const runner = () => env.JOB_RUNNER.get(env.JOB_RUNNER.idFromName('global'));

/** Fire one alarm cycle and report the alarm it left behind. */
async function tick() {
	return runInDurableObject(runner(), async (instance, state) => {
		await instance.alarm();
		return state.storage.getAlarm();
	});
}

async function currentAlarm() {
	return runInDurableObject(runner(), async (_instance, state) => state.storage.getAlarm());
}

/**
 * Empty the queue and make sure no alarm survives.
 *
 * An alarm armed for "now" fires on its own and re-arms, so a single delete can
 * lose the race - the loop clears the work first, which makes the runner delete
 * its own alarm, then confirms.
 */
async function quiesce() {
	for (let attempt = 0; attempt < 5; attempt++) {
		await env.db.prepare('DELETE FROM job').run();
		await runInDurableObject(runner(), async (_i, state) => state.storage.deleteAlarm());

		if ((await currentAlarm()) === null) {
			return;
		}
	}

	throw new Error('job runner would not go quiet');
}

describe('job runner alarm chain', () => {

	beforeAll(async () => {
		await dbInit.init(initContext(env.init_secret));
	});

	beforeEach(quiesce);

	// This is the only spec that arms real alarms, and the runner is a single
	// shared instance. An alarm left behind fires during another spec's test and
	// drains its jobs, so every test here has to leave the runner asleep.
	afterEach(quiesce);
	afterAll(quiesce);

	it('stops arming alarms when the queue is empty', async () => {
		// Otherwise the runner wakes forever on an idle deployment, which on the
		// free plan is pure waste.
		expect(await tick()).toBe(null);
	});

	it('comes straight back while due work remains', async () => {
		let ran = 0;
		registerHandler('alarm_many', async () => { ran++; });

		// More than one batch, so the first tick cannot finish them.
		for (let i = 0; i < 8; i++) {
			await jobService.enqueue(c, 'alarm_many', { i });
		}

		const armed = await tick();

		expect(ran).toBe(5);
		expect(armed).not.toBe(null);
		// Immediately, not in an hour.
		expect(armed - Date.now()).toBeLessThan(2000);
	});

	it('drains everything across successive alarms', async () => {
		let ran = 0;
		registerHandler('alarm_all', async () => { ran++; });

		for (let i = 0; i < 12; i++) {
			await jobService.enqueue(c, 'alarm_all', {});
		}

		for (let i = 0; i < 5 && ran < 12; i++) {
			await tick();
		}

		expect(ran).toBe(12);
		// And then it goes quiet.
		expect(await tick()).toBe(null);
	});

	it('sleeps until a future job is due instead of spinning', async () => {
		let ran = false;
		registerHandler('alarm_later', async () => { ran = true; });

		await jobService.enqueue(c, 'alarm_later', {}, {
			runAfter: dayjs().add(10, 'minute').format('YYYY-MM-DD HH:mm:ss')
		});

		const armed = await tick();

		expect(ran).toBe(false);
		expect(armed).not.toBe(null);

		const waitSeconds = (armed - Date.now()) / 1000;
		expect(waitSeconds).toBeGreaterThan(60);
		expect(waitSeconds).toBeLessThanOrEqual(11 * 60);
	});

	it('caps the wait so a far-future job still gets re-checked', async () => {
		registerHandler('alarm_distant', async () => {});

		await jobService.enqueue(c, 'alarm_distant', {}, { runAfter: '2999-01-01 00:00:00' });

		const armed = await tick();
		const waitSeconds = (armed - Date.now()) / 1000;

		// A year-long alarm would survive no deployment; an hour is the ceiling.
		expect(waitSeconds).toBeLessThanOrEqual(3601);
	});

	it('a kick runs urgent work instead of waiting for a distant alarm', async () => {
		let ran = 0;
		registerHandler('alarm_kick', async () => { ran++; });

		// Park a far-future job, so the runner settles on an hour-long alarm.
		await jobService.enqueue(c, 'alarm_kick', {}, { runAfter: '2999-01-01 00:00:00' });
		const distant = await tick();
		expect((distant - Date.now()) / 1000).toBeGreaterThan(60);

		// Something urgent arrives. Without the kick it would sit for that hour.
		await jobService.enqueue(c, 'alarm_kick', {});
		expect(await jobService.kick(c)).toBe(true);

		// The kick arms an immediate alarm, which fires on its own; drive one
		// cycle deterministically rather than racing it.
		await tick();

		expect(ran).toBe(1);
	});

	it('never pushes an already-armed alarm further out', async () => {
		// Two callers asking for different delays must leave the earlier one
		// standing, or a steady trickle of kicks would postpone the queue forever.
		const { soon, after } = await runInDurableObject(runner(), async (instance, state) => {
			await instance.scheduleNext(60);
			const soon = await state.storage.getAlarm();

			await instance.scheduleNext(3600);
			const after = await state.storage.getAlarm();

			return { soon, after };
		});

		expect(after).toBe(soon);
	});

	it('pulls an armed alarm earlier when asked for a shorter delay', async () => {
		const { late, earlier } = await runInDurableObject(runner(), async (instance, state) => {
			await instance.scheduleNext(3600);
			const late = await state.storage.getAlarm();

			await instance.scheduleNext(30);
			const earlier = await state.storage.getAlarm();

			return { late, earlier };
		});

		expect(earlier).toBeLessThan(late);
	});

	it('keeps working after a handler throws', async () => {
		// One bad job must not stop the queue: the rest of the batch and the next
		// alarm both have to survive it.
		let good = 0;
		registerHandler('alarm_bad', async () => { throw new Error('boom'); });
		registerHandler('alarm_good', async () => { good++; });

		await jobService.enqueue(c, 'alarm_bad', {});
		await jobService.enqueue(c, 'alarm_good', {});
		await jobService.enqueue(c, 'alarm_good', {});

		await tick();

		expect(good).toBe(2);

		const stats = await jobService.stats(c);
		expect(stats.done).toBe(2);
		// The failure is parked for retry, not lost.
		expect(stats.pending).toBe(1);
	});

	it('re-arms for a retry rather than dropping the failed job', async () => {
		registerHandler('alarm_retry', async () => { throw new Error('transient'); });

		await jobService.enqueue(c, 'alarm_retry', {}, { maxAttempts: 3 });

		const armed = await tick();

		expect(armed).not.toBe(null);
		// Backoff pushed it out, so the alarm is in the future, not immediate.
		expect(armed - Date.now()).toBeGreaterThan(1000);
	});
});
