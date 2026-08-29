import { dbInit, SCHEMA_VERSION } from './init';
import KvConst from '../const/kv-const';

// Self-healing schema.
//
// Nine phases of migration were added on top of a design where the operator had
// to remember to call /api/init after every deploy. Between the deploy and that
// call the app is broken - the new code queries columns the database does not
// have yet, and the only symptom is "no such column" in a request that should
// have worked. That is not something to document; it is something to remove.
//
// So the worker checks once per isolate whether the database is behind the code
// and, if it is, brings it up to date itself. The manual endpoint still exists
// for a deliberate re-run.

// Per-isolate, not per-request: isolates are long-lived, so this is roughly one
// extra KV read per cold start rather than one per request.
let checked = false;
let inFlight = null;

export function resetForTest() {
	checked = false;
	inFlight = null;
}

export async function ensureSchema(env) {

	if (checked) {
		return 'cached';
	}

	// Concurrent requests in the same isolate share one attempt instead of all
	// starting their own migration.
	inFlight ??= run(env).finally(() => { inFlight = null; });

	return inFlight;
}

async function run(env) {

	try {
		const stored = await env.kv.get(KvConst.SCHEMA_VERSION);

		if (stored === SCHEMA_VERSION) {
			checked = true;
			return 'current';
		}

		console.log(`schema is ${stored ?? 'unknown'}, code expects ${SCHEMA_VERSION} - migrating`);

		await dbInit.migrate({ env });

		checked = true;
		return 'migrated';
	} catch (e) {
		// Leave `checked` false so a later request tries again, but never fail the
		// request that happened to be first: a migration problem should degrade
		// the app, not take it down entirely.
		console.error('automatic migration failed:', e.message);
		return 'failed';
	}
}

export default ensureSchema;
