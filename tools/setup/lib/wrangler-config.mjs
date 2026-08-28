import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

/**
 * Render mail-worker/wrangler.toml from the resources the wizard resolved.
 *
 * Secrets are deliberately absent: jwt_secret / init_secret / webhook_secret
 * are pushed with `wrangler secret put` so they never land in a file that can
 * be committed.
 */
export function renderWranglerToml({
	name,
	domains,
	admin,
	d1Name,
	d1Id,
	kvId,
	r2Bucket,
	customDomain,
	cloudflareEmailSending
}) {

	const lines = [
		`name = "${name}"`,
		'main = "src/index.js"',
		'compatibility_date = "2025-06-04"',
		'keep_vars = true',
		'',
		'[observability]',
		'enabled = true',
		'',
		'[[d1_databases]]',
		'binding = "db"',
		`database_name = "${d1Name}"`,
		`database_id = "${d1Id}"`,
		'',
		'[[kv_namespaces]]',
		'binding = "kv"',
		`id = "${kvId}"`,
		''
	];

	if (r2Bucket) {
		lines.push('[[r2_buckets]]', 'binding = "r2"', `bucket_name = "${r2Bucket}"`, '');
	}

	lines.push('[ai]', 'binding = "ai"', '');

	lines.push(
		'# Single-instance job queue drainer. SQLite-backed so it works on the free plan.',
		'[[durable_objects.bindings]]',
		'name = "JOB_RUNNER"',
		'class_name = "JobRunner"',
		'',
		'[[migrations]]',
		'tag = "v1"',
		'new_sqlite_classes = ["JobRunner"]',
		''
	);

	if (cloudflareEmailSending) {
		lines.push(
			'# Cloudflare Email Sending. Only reaches addresses verified on your account,',
			'# so an external provider is still needed for arbitrary recipients.',
			'[[send_email]]',
			'name = "email"',
			''
		);
	}

	lines.push(
		'[assets]',
		'binding = "assets"',
		'directory = "./dist"',
		'not_found_handling = "single-page-application"',
		'run_worker_first = true',
		''
	);

	if (customDomain) {
		lines.push('[[routes]]', `pattern = "${customDomain}"`, 'custom_domain = true', '');
	}

	lines.push('[triggers]', 'crons = ["0 * * * *"]', '');

	lines.push(
		'[vars]',
		`domain = [${domains.map(d => `"${d}"`).join(', ')}]`,
		`admin = "${admin}"`,
		'',
		'# Secrets - NEVER put these in [vars]; set them with `wrangler secret put <name>`:',
		'#   jwt_secret     signs session tokens (rotating it logs everyone out)',
		'#   init_secret    gates GET /api/init/<secret> (DB bootstrap + migrations)',
		"#   webhook_secret Svix signing secret from the sending provider's webhook config",
		'',
		'[build]',
		'command = "pnpm --prefix ../mail-vue install && pnpm --prefix ../mail-vue run build"',
		''
	);

	return lines.join('\n');
}

/** Write the config, keeping a one-shot .bak of whatever was there before. */
export async function writeWranglerToml(path, contents) {

	if (existsSync(path)) {
		const current = await readFile(path, 'utf8');
		if (current === contents) {
			return 'unchanged';
		}
		await copyFile(path, `${path}.bak`);
		await writeFile(path, contents);
		return 'updated (previous saved as wrangler.toml.bak)';
	}

	await writeFile(path, contents);
	return 'created';
}
