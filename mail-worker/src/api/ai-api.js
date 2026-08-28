import app from '../hono/hono';
import result from '../model/result';
import aiRouter from '../service/ai';
import jobService from '../service/job-service';
import { jobType } from '../job/handlers';

// AI provider administration plus the interactive tasks the compose window and
// message view call. Auth and permissions live in src/security/security.js.

app.get('/ai/drivers', (c) => c.json(result.ok(aiRouter.listDrivers())));
app.get('/ai/tasks', (c) => c.json(result.ok(aiRouter.listTasks())));
app.get('/ai/list', async (c) => c.json(result.ok(await aiRouter.listProviders(c))));
app.get('/ai/bindings', async (c) => c.json(result.ok(await aiRouter.listBindings(c))));

app.post('/ai/set', async (c) => {
	return c.json(result.ok(await aiRouter.upsertProvider(c, await c.req.json())));
});

app.delete('/ai/delete', async (c) => {
	return c.json(result.ok(await aiRouter.removeProvider(c, Number(c.req.query('aiId')))));
});

app.post('/ai/bind', async (c) => {
	const { task, aiId } = await c.req.json();
	return c.json(result.ok(await aiRouter.bindTask(c, task, aiId)));
});

// Round-trips a trivial prompt so the admin can tell a bad key from a bad model.
app.post('/ai/test', async (c) => {
	const outcome = await aiRouter.run(c, 'translate', { text: 'hello', target: 'French' });
	return c.json(result.ok(outcome));
});

/**
 * Interactive tasks, run inline because a human is waiting on the answer.
 * Anything triggered by the system (inbound triage, bulk work) goes through the
 * job queue instead - see jobType.AI_TASK.
 */
app.post('/ai/run', async (c) => {
	const { task, input } = await c.req.json();
	return c.json(result.ok(await aiRouter.run(c, task, input ?? {})));
});

/** Queue a task and return its job id; poll /job/list for the outcome. */
app.post('/ai/enqueue', async (c) => {
	const { task, input } = await c.req.json();
	const row = await jobService.enqueue(c, jobType.AI_TASK, { task, input });
	c.executionCtx.waitUntil(jobService.kick(c));
	return c.json(result.ok({ jobId: row?.jobId ?? null }));
});
