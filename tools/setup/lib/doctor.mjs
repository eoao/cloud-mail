import { CloudflareApi } from './cf-api.mjs';
import { ask, choose, heading, ok, bad, warn, info, note, bold, dim, green, red, yellow } from './ui.mjs';

// Read-only diagnosis. Changes nothing - it tells you which piece of the
// Cloudflare setup is missing and what to do about it.

export async function runDoctor({ token: tokenArg } = {}) {

	const findings = [];
	const add = (status, label, detail, fix) => findings.push({ status, label, detail, fix });

	console.log(bold('\n  cloud-mail doctor\n'));

	const token = tokenArg ?? process.env.CLOUDFLARE_API_TOKEN ?? await ask('API token', { secret: true });
	const cf = new CloudflareApi(token);

	heading('Account');

	const verified = await cf.verifyToken();
	if (verified.status === 'active') {
		add('ok', 'API token', 'active');
	} else {
		add('fail', 'API token', verified.status, 'Create a new token at dash.cloudflare.com/profile/api-tokens');
	}

	const accounts = await cf.listAccounts();
	const accountId = await choose('Account', accounts.map(a => ({ label: a.name, hint: a.id, value: a.id })));

	const zones = await cf.listZones();
	if (!zones?.length) {
		add('fail', 'Zone', 'none visible to this token', 'Add the domain to Cloudflare and point its nameservers there');
		return print(findings);
	}

	const zoneId = await choose('Mail domain', zones.map(z => ({ label: z.name, hint: z.status, value: z.id })));
	const zone = zones.find(z => z.id === zoneId);
	const workerName = await ask('Worker name', { fallback: 'cloud-mail' });

	heading('Checks');

	zone.status === 'active'
		? add('ok', 'Zone active', zone.name)
		: add('fail', 'Zone active', zone.status, 'Finish the nameserver change at your registrar');

	// Worker deployed?
	const deployed = await cf.workerExists(accountId, workerName);
	deployed
		? add('ok', 'Worker deployed', workerName)
		: add('fail', 'Worker deployed', `no script named "${workerName}"`, 'Run: cd mail-worker && npx wrangler deploy');

	// Email Routing enabled?
	const routing = await cf.emailRoutingSettings(zoneId);
	routing?.enabled
		? add('ok', 'Email Routing', 'enabled')
		: add('fail', 'Email Routing', 'disabled', 'Re-run the setup wizard, or enable it in the dashboard');

	// Required MX/SPF present?
	try {
		const required = await cf.emailRoutingRequiredDns(zoneId);
		const live = await cf.listDnsRecords(zoneId);

		const missing = (required ?? []).filter(req =>
			!(live ?? []).some(r => r.type === req.type && r.name === req.name && r.content === req.content)
		);

		missing.length === 0
			? add('ok', 'Inbound DNS (MX + SPF)', `${(required ?? []).length} records present`)
			: add('fail', 'Inbound DNS (MX + SPF)',
				`${missing.length} missing: ${missing.map(m => `${m.type} ${m.name}`).join(', ')}`,
				'Re-run the setup wizard - it writes these records for you');
	} catch (e) {
		add('warn', 'Inbound DNS', e.message);
	}

	// Catch-all pointed at the worker?
	const catchAll = await cf.getCatchAll(zoneId);
	const target = catchAll?.actions?.find(a => a.type === 'worker')?.value?.[0];

	if (!catchAll?.enabled) {
		add('fail', 'Catch-all rule', 'disabled', 'Re-run the setup wizard to point it at the worker');
	} else if (target !== workerName) {
		add('fail', 'Catch-all rule', `points at ${target ?? catchAll.actions?.[0]?.type ?? 'nothing'}`,
			`It must forward to the worker "${workerName}" or no mail arrives`);
	} else {
		add('ok', 'Catch-all rule', `→ ${workerName}`);
	}

	// DMARC advisory.
	const txt = await cf.listDnsRecords(zoneId, '&type=TXT');
	(txt ?? []).some(r => r.name === `_dmarc.${zone.name}`)
		? add('ok', 'DMARC record', 'present')
		: add('warn', 'DMARC record', 'missing', 'Not required, but improves deliverability of mail you send');

	return print(findings);
}

function print(findings) {

	heading('Result');

	const icon = { ok: green('✓'), warn: yellow('!'), fail: red('✗') };

	for (const f of findings) {
		console.log(`  ${icon[f.status]} ${f.label}${f.detail ? ` ${dim(`— ${f.detail}`)}` : ''}`);
		if (f.fix && f.status !== 'ok') {
			note(`fix: ${f.fix}`);
		}
	}

	const failed = findings.filter(f => f.status === 'fail').length;
	console.log('');

	if (failed === 0) {
		ok('Everything Cloudflare-side looks correct.');
		info('If sending still fails, the sending provider is configured in the admin panel, not here.');
	} else {
		bad(`${failed} problem${failed === 1 ? '' : 's'} found.`);
	}

	console.log('');
	return { findings, failed };
}
