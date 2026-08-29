import { describe, it, expect } from 'vitest';
import totpUtils, { generateCode, verifyCode, base32Decode, base32Encode, otpauthUri } from '../src/utils/totp-utils';

// RFC 6238 publishes test vectors for the seed "12345678901234567890", which in
// base32 is GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ. Checking against those proves the
// implementation, not just that it is self-consistent.
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('base32', () => {

	it('round-trips', () => {
		const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
		expect([...base32Decode(base32Encode(bytes))]).toEqual([...bytes]);
	});

	it('accepts the spaced lower-case form authenticator apps display', () => {
		const spaced = 'gezd gnbv gy3t qojq gezd gnbv gy3t qojq';
		expect([...base32Decode(spaced)]).toEqual([...base32Decode(RFC_SECRET)]);
	});

	it('rejects a secret that is not base32', () => {
		expect(() => base32Decode('not-valid-1890!')).toThrow(/base32/);
	});
});

describe('code generation', () => {

	it('matches the RFC 6238 SHA-1 test vectors', async () => {
		// (unix time, expected 8-digit code) from RFC 6238 Appendix B.
		const vectors = [
			[59, '94287082'],
			[1111111109, '07081804'],
			[1111111111, '14050471'],
			[1234567890, '89005924'],
			[2000000000, '69279037']
		];

		for (const [time, expected] of vectors) {
			const counter = Math.floor(time / 30);
			expect(await generateCode(RFC_SECRET, counter, 8)).toBe(expected);
		}
	});

	it('produces six digits by default', async () => {
		const code = await generateCode(RFC_SECRET, 1);
		expect(code).toMatch(/^\d{6}$/);
	});
});

describe('code verification', () => {

	const NOW = 1111111109 * 1000;

	it('accepts the current code', async () => {
		const counter = Math.floor(NOW / 1000 / 30);
		const code = await generateCode(RFC_SECRET, counter);

		expect(await verifyCode(RFC_SECRET, code, { now: NOW })).toBe(true);
	});

	it('tolerates one step of clock drift either way', async () => {
		const counter = Math.floor(NOW / 1000 / 30);

		for (const drift of [-1, 1]) {
			const code = await generateCode(RFC_SECRET, counter + drift);
			expect(await verifyCode(RFC_SECRET, code, { now: NOW })).toBe(true);
		}
	});

	it('rejects a code from further out than the window', async () => {
		const counter = Math.floor(NOW / 1000 / 30);
		const stale = await generateCode(RFC_SECRET, counter - 5);

		expect(await verifyCode(RFC_SECRET, stale, { now: NOW })).toBe(false);
	});

	it('rejects malformed input without throwing', async () => {
		for (const bad of ['', '12345', '1234567', 'abcdef', null, undefined, '12 34 56']) {
			expect(await verifyCode(RFC_SECRET, bad, { now: NOW })).toBe(false);
		}
	});

	it('rejects a code generated from a different secret', async () => {
		const other = totpUtils.generateSecret();
		const counter = Math.floor(NOW / 1000 / 30);
		const code = await generateCode(other, counter);

		expect(await verifyCode(RFC_SECRET, code, { now: NOW })).toBe(false);
	});
});

describe('enrolment', () => {

	it('generates a secret an authenticator can read', () => {
		const secret = totpUtils.generateSecret();
		expect(secret).toMatch(/^[A-Z2-7]+$/);
		expect(secret.length).toBeGreaterThanOrEqual(32);
	});

	it('builds an otpauth URI carrying the parameters we verify with', () => {
		const uri = otpauthUri({ secret: RFC_SECRET, account: 'me@example.com' });

		expect(uri.startsWith('otpauth://totp/')).toBe(true);
		expect(uri).toContain('cloud-mail%3Ame%40example.com');
		expect(uri).toContain(`secret=${RFC_SECRET}`);
		expect(uri).toContain('algorithm=SHA1');
		expect(uri).toContain('digits=6');
		expect(uri).toContain('period=30');
	});
});
