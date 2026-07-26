import { describe, it, expect } from 'vitest';
import cryptoUtils from '../src/utils/crypto-utils';

describe('hashPassword (M3)', () => {
	it('creates PBKDF2 hash with $pbkdf2$ prefix', async () => {
		const { salt, hash } = await cryptoUtils.hashPassword('testpassword');
		expect(hash).toMatch(/^\$pbkdf2\$/);
		expect(salt).toBeTruthy();
	});

	it('verifies correct password', async () => {
		const { salt, hash } = await cryptoUtils.hashPassword('mypassword');
		const valid = await cryptoUtils.verifyPassword('mypassword', salt, hash);
		expect(valid).toBe(true);
	});

	it('rejects incorrect password', async () => {
		const { salt, hash } = await cryptoUtils.hashPassword('mypassword');
		const valid = await cryptoUtils.verifyPassword('wrongpassword', salt, hash);
		expect(valid).toBe(false);
	});

	it('detects legacy hash needing rehash', async () => {
		expect(await cryptoUtils.needsRehash('plainSHA256base64hash')).toBe(true);
		expect(await cryptoUtils.needsRehash(null)).toBe(true);
		expect(await cryptoUtils.needsRehash('')).toBe(true);
	});

	it('detects PBKDF2 hash not needing rehash', async () => {
		const { hash } = await cryptoUtils.hashPassword('test');
		expect(await cryptoUtils.needsRehash(hash)).toBe(false);
	});
});

describe('genRandomPwd (M2)', () => {
	it('generates 16 character password by default', () => {
		const pwd = cryptoUtils.genRandomPwd();
		expect(pwd.length).toBe(16);
	});

	it('generates password with custom length', () => {
		const pwd = cryptoUtils.genRandomPwd(20);
		expect(pwd.length).toBe(20);
	});

	it('generates different passwords on each call', () => {
		const pwd1 = cryptoUtils.genRandomPwd();
		const pwd2 = cryptoUtils.genRandomPwd();
		expect(pwd1).not.toBe(pwd2);
	});
});
