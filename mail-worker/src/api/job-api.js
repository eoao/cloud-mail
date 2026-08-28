import app from '../hono/hono';
import result from '../model/result';
import jobService from '../service/job-service';
import { jobType } from '../job/handlers';

// Admin-only queue visibility. Route auth is enforced centrally in
// src/security/security.js (perm key setting:query).

app.get('/job/stats', async (c) => {
	return c.json(result.ok(await jobService.stats(c)));
});

app.get('/job/list', async (c) => {
	return c.json(result.ok(await jobService.list(c, c.req.query())));
});

app.put('/job/retry', async (c) => {
	const { jobId } = await c.req.json();
	const row = await jobService.retry(c, Number(jobId));
	c.executionCtx.waitUntil(jobService.kick(c));
	return c.json(result.ok(row));
});

app.delete('/job/cancel', async (c) => {
	const jobId = Number(c.req.query('jobId'));
	return c.json(result.ok(await jobService.cancel(c, jobId)));
});

// "Is the queue alive?" - enqueues a no-op and kicks the runner.
app.post('/job/ping', async (c) => {
	const row = await jobService.enqueue(c, jobType.NOOP, { ping: Date.now() }, { priority: 10 });
	const kicked = await jobService.kick(c);
	return c.json(result.ok({ jobId: row?.jobId ?? null, runnerBound: kicked }));
});
