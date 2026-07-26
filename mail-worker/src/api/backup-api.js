import app from '../hono/hono';
import result from '../model/result';
import BizError from '../error/biz-error';
import userContext from '../security/user-context';
import { listBackups, restoreBackup, runBackup } from '../service/backup-service';

// Restore rewrites the whole database, so these are gated on the configured admin
// address rather than the permission table, which a restore could itself alter.
function requireAdmin(c) {
	const user = userContext.getUser(c);
	if (!user || !c.env.admin || user.email !== c.env.admin) {
		throw new BizError('unauthorized', 403);
	}
}

app.get('/backup/list', async (c) => {
	requireAdmin(c);
	return c.json(result.ok(await listBackups(c)));
});

app.post('/backup/run', async (c) => {
	requireAdmin(c);
	const manifest = await runBackup(c);
	if (!manifest) {
		throw new BizError('R2 is not bound; backups are disabled', 400);
	}
	return c.json(result.ok(manifest));
});

app.post('/backup/restore', async (c) => {
	requireAdmin(c);

	const { date, confirm } = await c.req.json();

	if (!date) {
		throw new BizError('date is required', 400);
	}

	// Echoing the date back is what separates an intentional restore from a
	// mistyped or replayed request; the operation is not reversible.
	if (confirm !== date) {
		throw new BizError('confirm must equal date to authorize a destructive restore', 400);
	}

	return c.json(result.ok(await restoreBackup(c, date)));
});
