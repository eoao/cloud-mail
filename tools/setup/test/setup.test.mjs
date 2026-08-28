// Run: node --test tools/setup/test/setup.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderWranglerToml } from '../lib/wrangler-config.mjs';
import { CloudflareApi } from '../lib/cf-api.mjs';

const base = {
	name: 'cloud-mail',
	domains: ['example.com'],
	admin: 'admin@example.com',
	d1Name: 'cloud-mail-db',
	d1Id: 'db-uuid',
	kvId: 'kv-id',
	r2Bucket: 'cloud-mail-r2',
	customDomain: '',
	cloudflareEmailSending: false
};

test('rendered config never contains a secret value', () => {
	const toml = renderWranglerToml(base);
	assert.ok(!toml.includes('\njwt_secret ='));
	assert.ok(!toml.includes('\ninit_secret ='));
	assert.ok(!toml.includes('\nwebhook_secret ='));
	assert.ok(toml.includes('wrangler secret put'));
});

test('rendered config binds every resource the worker reads', () => {
	const toml = renderWranglerToml(base);
	const expected = [
		'binding = "db"',
		'binding = "kv"',
		'binding = "r2"',
		'binding = "ai"',
		'binding = "assets"',
		'name = "JOB_RUNNER"',
		'new_sqlite_classes = ["JobRunner"]',
		'crons = ["0 * * * *"]',
		'domain = ["example.com"]',
		'admin = "admin@example.com"',
		'database_id = "db-uuid"',
		'id = "kv-id"'
	];
	for (const fragment of expected) {
		assert.ok(toml.includes(fragment), `missing: ${fragment}`);
	}
});

test('r2 block is omitted when no bucket was created', () => {
	const toml = renderWranglerToml({ ...base, r2Bucket: '' });
	assert.ok(!toml.includes('r2_buckets'));
	assert.ok(toml.includes('binding = "kv"'));
});

test('optional blocks appear only when asked for', () => {
	const plain = renderWranglerToml(base);
	assert.ok(!plain.includes('send_email'));
	assert.ok(!plain.includes('[[routes]]'));

	const full = renderWranglerToml({
		...base,
		cloudflareEmailSending: true,
		customDomain: 'mail.example.com'
	});
	assert.ok(full.includes('[[send_email]]'));
	assert.ok(full.includes('pattern = "mail.example.com"'));
	assert.ok(full.includes('custom_domain = true'));
});

test('multiple domains render as a toml array', () => {
	const toml = renderWranglerToml({ ...base, domains: ['a.com', 'b.com'] });
	assert.ok(toml.includes('domain = ["a.com", "b.com"]'));
});

// ---- API client behaviour (mocked transport) ----------------------------

function mockApi(handler) {
	const api = new CloudflareApi('test-token');
	api.calls = [];
	api.request = async (method, path, body) => {
		api.calls.push({ method, path, body });
		return handler(method, path, body);
	};
	return api;
}

test('findOrCreateD1 reuses an existing database instead of creating a second', async () => {
	const api = mockApi((method, path) => {
		if (method === 'GET' && path.startsWith('/accounts/acct/d1/database?')) {
			return [{ name: 'cloud-mail-db', uuid: 'existing' }];
		}
		throw new Error(`unexpected ${method} ${path}`);
	});

	const db = await api.findOrCreateD1('acct', 'cloud-mail-db');

	assert.equal(db.uuid, 'existing');
	assert.equal(db.created, false);
	assert.equal(api.calls.filter(c => c.method === 'POST').length, 0);
});

test('findOrCreateD1 creates one when the name is free', async () => {
	const api = mockApi((method) => (method === 'GET' ? [] : { uuid: 'fresh' }));

	const db = await api.findOrCreateD1('acct', 'cloud-mail-db');

	assert.equal(db.uuid, 'fresh');
	assert.equal(db.created, true);
});

test('upsertDnsRecord leaves an identical record alone', async () => {
	const api = mockApi((method) => {
		if (method === 'GET') {
			return [{ id: 'r1', type: 'TXT', name: 'example.com', content: 'v=spf1 include:_spf.mx.cloudflare.net ~all' }];
		}
		throw new Error('should not write');
	});

	const result = await api.upsertDnsRecord('zone', {
		type: 'TXT',
		name: 'example.com',
		content: 'v=spf1 include:_spf.mx.cloudflare.net ~all'
	});

	assert.equal(result.action, 'unchanged');
});

test('upsertDnsRecord replaces a conflicting TXT rather than duplicating it', async () => {
	const api = mockApi((method) => {
		if (method === 'GET') {
			return [{ id: 'r1', type: 'TXT', name: 'example.com', content: 'old value' }];
		}
		if (method === 'PUT') {
			return { id: 'r1', content: 'new value' };
		}
		throw new Error(`unexpected ${method}`);
	});

	const result = await api.upsertDnsRecord('zone', { type: 'TXT', name: 'example.com', content: 'new value' });

	assert.equal(result.action, 'updated');
	assert.equal(api.calls.filter(c => c.method === 'POST').length, 0);
});

test('upsertDnsRecord adds an MX alongside existing ones', async () => {
	// Email Routing needs three MX records at different priorities, so an MX
	// with a different content must never overwrite a sibling.
	const api = mockApi((method) => {
		if (method === 'GET') {
			return [{ id: 'r1', type: 'MX', name: 'example.com', content: 'route1.mx.cloudflare.net', priority: 1 }];
		}
		if (method === 'POST') {
			return { id: 'r2' };
		}
		throw new Error(`unexpected ${method}`);
	});

	const result = await api.upsertDnsRecord('zone', {
		type: 'MX',
		name: 'example.com',
		content: 'route2.mx.cloudflare.net',
		priority: 2
	});

	assert.equal(result.action, 'created');
	assert.equal(api.calls.filter(c => c.method === 'PUT').length, 0);
});

test('setCatchAllToWorker targets the worker by name', async () => {
	const api = mockApi(() => ({}));
	await api.setCatchAllToWorker('zone', 'cloud-mail');

	const call = api.calls[0];
	assert.equal(call.method, 'PUT');
	assert.equal(call.path, '/zones/zone/email/routing/rules/catch_all');
	assert.equal(call.body.enabled, true);
	assert.deepEqual(call.body.matchers, [{ type: 'all' }]);
	assert.deepEqual(call.body.actions, [{ type: 'worker', value: ['cloud-mail'] }]);
});
