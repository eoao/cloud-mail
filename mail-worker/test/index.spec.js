import { env, SELF } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import passkeyService from '../src/service/passkey-service';
import settingService from '../src/service/setting-service';

describe('Passkey support', () => {
	beforeAll(async () => {
		const response = await SELF.fetch(`http://127.0.0.1/api/init/${env.jwt_secret}`);
		expect(await response.text()).toBe('success');
	});

	it('creates disabled-by-default Passkey schema', async () => {
		const settingColumn = await env.db.prepare(`SELECT name FROM pragma_table_info('setting') WHERE name = 'passkey'`).first();
		const credentialTable = await env.db
			.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'passkey_credential'`).first();
		const challengeTable = await env.db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'passkey_challenge'`).first();
		const setting = await env.db.prepare('SELECT passkey FROM setting').first();

		expect(settingColumn?.name).toBe('passkey');
		expect(credentialTable?.name).toBe('passkey_credential');
		expect(challengeTable?.name).toBe('passkey_challenge');
		expect(setting?.passkey).toBe(0);
	});

	it('exposes the disabled flag and rejects authentication options', async () => {
		const configResponse = await SELF.fetch('http://127.0.0.1/api/setting/websiteConfig');
		const config = await configResponse.json();
		expect(config.data.passkey).toBe(0);

		const optionsResponse = await SELF.fetch('http://127.0.0.1/api/passkey/auth/options', {
			method: 'POST',
			headers: { Origin: 'http://127.0.0.1' },
		});
		const options = await optionsResponse.json();
		expect(options.code).toBe(501);
	});

	it('keeps password login working', async () => {
		const headers = { 'Content-Type': 'application/json' };
		const registerResponse = await SELF.fetch('http://127.0.0.1/api/register', {
			method: 'POST',
			headers,
			body: JSON.stringify({ email: 'passkey-test@example.com', password: 'test-password' }),
		});
		expect((await registerResponse.json()).code).toBe(200);

		const loginResponse = await SELF.fetch('http://127.0.0.1/api/login', {
			method: 'POST',
			headers,
			body: JSON.stringify({ email: 'passkey-test@example.com', password: 'test-password' }),
		});
		const login = await loginResponse.json();
		expect(login.code).toBe(200);
		expect(login.data.token).toBeTruthy();
	});

	it('accepts only exact production origins or loopback development origins', () => {
		const context = (url, origin) => ({ req: { url, header: () => origin } });
		expect(passkeyService.getRelyingParty(context('https://mail.example.com/api', 'https://mail.example.com'))).toEqual({
			origin: 'https://mail.example.com',
			rpID: 'mail.example.com',
		});
		expect(passkeyService.getRelyingParty(context('http://127.0.0.1:8787/api', 'http://localhost:3001'))).toEqual({
			origin: 'http://localhost:3001',
			rpID: 'localhost',
		});
		expect(() => passkeyService.getRelyingParty(context('https://mail.example.com/api', 'https://evil.example.com'))).toThrow();
		expect(() => passkeyService.getRelyingParty(context('https://mail.example.com/api', 'http://mail.example.com'))).toThrow();
		expect(() => passkeyService.getRelyingParty(context('https://mail.example.com/api', 'https://mail.example.com:8443'))).toThrow();
	});

	it('consumes each challenge only once', async () => {
		const context = { env };
		const transactionId = await passkeyService.saveChallenge(context, {
			type: 'authentication',
			challenge: 'test-challenge',
			origin: 'http://127.0.0.1',
			rpID: '127.0.0.1',
		});

		const first = await passkeyService.consumeChallenge(context, transactionId, 'authentication');
		const second = await passkeyService.consumeChallenge(context, transactionId, 'authentication');
		expect(first?.challenge).toBe('test-challenge');
		expect(second).toBeNull();
	});

	it('generates discoverable authentication options when enabled', async () => {
		await env.db.prepare('UPDATE setting SET passkey = 1').run();
		await settingService.refresh({ env, set: () => {} });
		const response = await SELF.fetch('http://127.0.0.1/api/passkey/auth/options', {
			method: 'POST',
			headers: { Origin: 'http://127.0.0.1' },
		});
		const body = await response.json();
		const challenge = await env.db.prepare('SELECT challenge_id FROM passkey_challenge WHERE challenge_id = ?')
			.bind(body.data.transactionId).first();

		expect(body.code).toBe(200);
		expect(body.data.options.rpId).toBe('127.0.0.1');
		expect(body.data.options.userVerification).toBe('required');
		expect(challenge?.challenge_id).toBe(body.data.transactionId);
	});
});
