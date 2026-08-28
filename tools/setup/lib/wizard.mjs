import { randomBytes } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

import { CloudflareApi, CloudflareError } from './cf-api.mjs';
import { renderWranglerToml, writeWranglerToml } from './wrangler-config.mjs';
import { run, has } from './shell.mjs';
import {
	ask, confirm, choose, heading, step,
	ok, bad, warn, info, note, bold, dim, cyan, green, red, yellow, closeIo
} from './ui.mjs';

const here = dirname(fileURLToPath(import.meta.url));

/** Walk up from the CLI to the repo root that holds mail-worker/ and mail-vue/. */
function findRepoRoot(start) {
	let dir = start;
	for (let i = 0; i < 6; i++) {
		if (existsSync(resolve(dir, 'mail-worker/src/index.js'))) {
			return dir;
		}
		dir = resolve(dir, '..');
	}
	return null;
}

const secret = (bytes = 32) => randomBytes(bytes).toString('hex');

const REQUIRED_TOKEN_SCOPES = [
	'Account → Workers Scripts → Edit',
	'Account → Workers KV Storage → Edit',
	'Account → D1 → Edit',
	'Account → Workers R2 Storage → Edit',
	'Account → Workers AI → Edit',
	'Zone → DNS → Edit',
	'Zone → Email Routing Rules → Edit',
	'Zone → Zone → Read'
];

export async function runWizard(options = {}) {

	const repoRoot = options.repoRoot ?? findRepoRoot(here);

	if (!repoRoot) {
		throw new Error('Could not find the cloud-mail checkout (looked for mail-worker/src/index.js). Run this from inside the repo.');
	}

	const workerDir = resolve(repoRoot, 'mail-worker');
	const report = [];
	const record = (label, status, detail) => report.push({ label, status, detail });

	console.log(bold(cyan('\n  cloud-mail setup\n')));
	note(`repo: ${repoRoot}`);

	// ---- 0. prerequisites ------------------------------------------------

	heading('Prerequisites');

	const [hasPnpm, hasNpx] = await Promise.all([has('pnpm'), has('npx')]);

	if (!hasNpx) {
		throw new Error('npx is required (it ships with Node.js). Install Node 20 or newer.');
	}
	ok('npx');

	if (hasPnpm) {
		ok('pnpm');
	} else {
		warn('pnpm not found - the frontend build step needs it');
		note('install with: npm install -g pnpm');
	}

	// ---- 1. token + account ---------------------------------------------

	heading('Cloudflare credentials');

	console.log(`  Create an API token at ${bold('https://dash.cloudflare.com/profile/api-tokens')}`);
	console.log('  with these permissions:');
	for (const scope of REQUIRED_TOKEN_SCOPES) {
		note(`• ${scope}`);
	}
	console.log('');

	const token = options.token
		?? process.env.CLOUDFLARE_API_TOKEN
		?? await ask('API token', { secret: true });

	if (!token) {
		throw new Error('An API token is required.');
	}

	const cf = new CloudflareApi(token);

	await step('Verifying token', async () => {
		const result = await cf.verifyToken();
		if (result.status !== 'active') {
			throw new Error(`token status is "${result.status}"`);
		}
		return 'active';
	});
	record('API token', 'ok');

	const accounts = await step('Listing accounts', async () => {
		const list = await cf.listAccounts();
		if (!list?.length) {
			throw new Error('token can see no accounts - add an Account-scoped permission');
		}
		return list;
	});

	const accountId = await choose('Cloudflare account', accounts.map(a => ({
		label: a.name,
		hint: a.id,
		value: a.id
	})));

	// ---- 2. zone ---------------------------------------------------------

	heading('Domain');

	const zones = await step('Listing zones', () => cf.listZones());

	if (!zones?.length) {
		throw new Error('No zones found. Add your domain to Cloudflare and point its nameservers there first.');
	}

	const zoneId = await choose('Mail domain', zones.map(z => ({
		label: z.name,
		hint: z.status === 'active' ? '' : `(${z.status})`,
		value: z.id
	})));

	const zone = zones.find(z => z.id === zoneId);

	if (zone.status !== 'active') {
		warn(`Zone "${zone.name}" is ${zone.status}. Mail will not flow until it is active.`);
		record('Zone status', 'warn', zone.status);
	} else {
		record('Zone status', 'ok', zone.name);
	}

	// ---- 3. naming + admin ----------------------------------------------

	const workerName = await ask('Worker name', { fallback: 'cloud-mail' });
	const adminEmail = await ask('Admin email address', { fallback: `admin@${zone.name}` });

	const wantCustomDomain = await confirm(`Serve the app on a custom domain (e.g. mail.${zone.name})?`, false);
	const customDomain = wantCustomDomain
		? await ask('Custom domain', { fallback: `mail.${zone.name}` })
		: '';

	// ---- 4. storage ------------------------------------------------------

	heading('Storage');

	let d1Row;
	await step('D1 database', async () => {
		d1Row = await cf.findOrCreateD1(accountId, `${workerName}-db`);
		return d1Row.created ? 'created' : 'reused';
	});
	record('D1 database', 'ok', d1Row.name);

	let kvRow;
	await step('KV namespace', async () => {
		kvRow = await cf.findOrCreateKv(accountId, workerName);
		return kvRow.created ? 'created' : 'reused';
	});
	record('KV namespace', 'ok', kvRow.title);

	let r2Row = null;
	if (await confirm('Use R2 for attachments? (recommended - otherwise attachments go to KV)', true)) {
		try {
			await step('R2 bucket', async () => {
				r2Row = await cf.findOrCreateR2(accountId, `${workerName}-r2`);
				return r2Row.created ? 'created' : 'reused';
			});
			record('R2 bucket', 'ok', `${workerName}-r2`);
		} catch (e) {
			warn(`R2 unavailable (${e.message}). Falling back to KV storage for attachments.`);
			record('R2 bucket', 'warn', 'not enabled - using KV');
		}
	} else {
		record('R2 bucket', 'skip', 'attachments will use KV');
	}

	// ---- 5. email routing ------------------------------------------------

	heading('Email Routing (inbound)');

	info('Cloudflare Email Routing only RECEIVES mail. Sending needs a provider (next step).');

	const routing = await cf.emailRoutingSettings(zoneId);

	if (routing?.enabled) {
		ok('Email Routing already enabled');
	} else {
		await step('Enabling Email Routing', () => cf.enableEmailRouting(zoneId));
	}
	record('Email Routing', 'ok', 'enabled');

	const required = await step('Reading required DNS records', () => cf.emailRoutingRequiredDns(zoneId));

	for (const rec of required ?? []) {
		const payload = {
			type: rec.type,
			name: rec.name,
			content: rec.content,
			ttl: rec.ttl ?? 1
		};
		if (rec.priority !== undefined) {
			payload.priority = rec.priority;
		}
		const outcome = await cf.upsertDnsRecord(zoneId, payload);
		info(`${rec.type} ${rec.name} ${dim(`— ${outcome.action}`)}`);
	}
	record('Inbound DNS (MX + SPF)', 'ok', `${(required ?? []).length} records`);

	// ---- 6. secrets + config --------------------------------------------

	heading('Worker configuration');

	const cloudflareEmailSending = await confirm(
		'Bind Cloudflare Email Sending? (only reaches addresses verified on your account)',
		false
	);

	const toml = renderWranglerToml({
		name: workerName,
		domains: [zone.name],
		admin: adminEmail,
		d1Name: d1Row.name,
		d1Id: d1Row.uuid ?? d1Row.id,
		kvId: kvRow.id,
		r2Bucket: r2Row ? `${workerName}-r2` : '',
		customDomain,
		cloudflareEmailSending
	});

	const tomlPath = resolve(workerDir, 'wrangler.toml');
	const tomlResult = await step('Writing wrangler.toml', () => writeWranglerToml(tomlPath, toml));
	record('wrangler.toml', 'ok', tomlResult);

	const jwtSecret = secret();
	const initSecret = secret();

	const env = { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: accountId };

	async function putSecret(key, value) {
		await run('npx', ['wrangler', 'secret', 'put', key, '--name', workerName], {
			cwd: workerDir,
			env,
			input: `${value}\n`
		});
	}

	// ---- 7. install, build, deploy ---------------------------------------

	heading('Deploy');

	if (hasPnpm) {
		await step('Installing worker dependencies', async () => {
			await run('pnpm', ['install', '--frozen-lockfile'], { cwd: workerDir });
		});
	}

	await step('Deploying worker (builds the frontend)', async () => {
		await run('npx', ['wrangler', 'deploy'], { cwd: workerDir, env });
	});
	record('Worker deploy', 'ok', workerName);

	// Secrets must be pushed after the script exists.
	await step('Setting jwt_secret', () => putSecret('jwt_secret', jwtSecret));
	await step('Setting init_secret', () => putSecret('init_secret', initSecret));
	record('Secrets', 'ok', 'jwt_secret, init_secret');

	// ---- 8. catch-all ----------------------------------------------------

	heading('Routing mail to the worker');

	await step('Pointing the catch-all rule at the worker', () => cf.setCatchAllToWorker(zoneId, workerName));
	record('Catch-all rule', 'ok', `→ ${workerName}`);

	// ---- 9. database init ------------------------------------------------

	heading('Database');

	const appUrl = customDomain
		? `https://${customDomain}`
		: await ask('Worker URL (from the deploy output above)', { fallback: `https://${workerName}.workers.dev` });

	await step('Running migrations', async () => {
		// The worker needs a moment after deploy before it answers.
		for (let attempt = 1; attempt <= 6; attempt++) {
			try {
				const res = await fetch(`${appUrl}/api/init/${initSecret}`);
				const body = (await res.text()).trim();
				if (body === 'success') {
					return 'schema up to date';
				}
				if (attempt === 6) {
					throw new Error(body || `HTTP ${res.status}`);
				}
			} catch (e) {
				if (attempt === 6) throw e;
			}
			await new Promise(r => setTimeout(r, 5000));
		}
	});
	record('Database schema', 'ok');

	// ---- 10. sending provider -------------------------------------------

	heading('Sending (outbound)');

	console.log('  Email Routing cannot send. Pick a provider in the admin panel under');
	console.log(`  ${bold('System Settings → Resend token')}, then verify your domain there.`);
	note('The provider gives you DKIM/DMARC records to add to this zone.');

	if (await confirm('Add a DMARC record now (p=none, safe default)?', true)) {
		const outcome = await cf.upsertDnsRecord(zoneId, {
			type: 'TXT',
			name: `_dmarc.${zone.name}`,
			content: `v=DMARC1; p=none; rua=mailto:${adminEmail}`,
			ttl: 1
		});
		ok(`_dmarc.${zone.name} ${dim(`— ${outcome.action}`)}`);
		record('DMARC record', 'ok');
	} else {
		record('DMARC record', 'skip');
	}

	record('Sending provider', 'todo', 'configure in the admin panel');

	// ---- report ----------------------------------------------------------

	heading('Summary');

	const icon = { ok: green('✓'), warn: yellow('!'), skip: dim('–'), todo: yellow('→'), fail: red('✗') };
	for (const row of report) {
		console.log(`  ${icon[row.status] ?? '?'} ${row.label}${row.detail ? ` ${dim(`— ${row.detail}`)}` : ''}`);
	}

	console.log('');
	console.log(`  ${bold('App:')}   ${appUrl}`);
	console.log(`  ${bold('Admin:')} register ${adminEmail} on that URL - it becomes the admin account.`);
	console.log('');
	console.log(`  ${bold(yellow('Keep this init secret'))} - it runs future migrations:`);
	console.log(`    ${appUrl}/api/init/${initSecret}`);
	console.log('');
	console.log(dim('  Re-run this wizard any time; it reuses whatever already exists.'));
	console.log('');

	return { appUrl, workerName, zone: zone.name, initSecret };
}

export async function main(argv = process.argv.slice(2)) {
	try {
		const token = argv.find(a => a.startsWith('--token='))?.slice(8);

		if (argv.includes('--doctor')) {
			const { runDoctor } = await import('./doctor.mjs');
			const { failed } = await runDoctor({ token });
			if (failed > 0) process.exitCode = 1;
			return;
		}

		await runWizard({ token });
	} catch (e) {
		console.error('');
		if (e instanceof CloudflareError) {
			bad(`Cloudflare API: ${e.message}`);
			note(`endpoint: ${e.path}`);
			if (e.status === 403) {
				note('This usually means the API token is missing a permission listed above.');
			}
		} else {
			bad(e.message);
		}
		console.error('');
		process.exitCode = 1;
	} finally {
		closeIo();
	}
}
