import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import { runBackup, restoreBackup, listBackups } from '../src/service/backup-service';
import orm from '../src/entity/orm';
import email from '../src/entity/email';
import account from '../src/entity/account';
import { eq } from 'drizzle-orm';

const c = { env };

beforeAll(async () => {
	const response = await SELF.fetch('http://example.com/api/init', {
		headers: { Authorization: 'test-init-secret' },
	});
	expect(response.status).toBe(200);
});

async function seedEmail(subject, content) {
	return await orm(c)
		.insert(email)
		.values({
			accountId: 1,
			userId: 1,
			sendEmail: 'sender@example.com',
			name: 'Sender',
			subject,
			text: `plain body of ${subject}`,
			content,
			toEmail: 'me@example.com',
			toName: 'Me',
			// DDL declares recipient NOT NULL DEFAULT '[]', but the drizzle entity
			// marks it nullable, so an omitted value is sent as an explicit NULL.
			recipient: '[]',
		})
		.returning()
		.get();
}

describe('backup and restore (P4)', () => {
	it('captures email bodies, not just metadata', async () => {
		const body = '<p>the message body is the product</p>';
		const row = await seedEmail('body-capture', body);

		const manifest = await runBackup(c);
		expect(manifest).not.toBeNull();
		expect(manifest.emailChunks).toBeGreaterThan(0);

		const obj = await env.r2.get(`backups/${manifest.date}/email-0000.json`);
		const rows = await obj.json();
		const backed = rows.find(r => r.emailId === row.emailId);

		expect(backed).toBeDefined();
		expect(backed.content).toBe(body);
		expect(backed.text).toBe('plain body of body-capture');
	});

	// The plan's P4 criterion: a restore that has actually been exercised,
	// not merely documented. Destroy real rows, then bring them back.
	it('restores rows destroyed after the backup was taken', async () => {
		const original = await seedEmail('restore-me', '<p>original content</p>');
		const manifest = await runBackup(c);

		await orm(c).delete(email).where(eq(email.emailId, original.emailId)).run();
		const gone = await orm(c).select().from(email).where(eq(email.emailId, original.emailId)).get();
		expect(gone).toBeUndefined();

		const outcome = await restoreBackup(c, manifest.date);
		expect(outcome.restored.email).toBe(manifest.counts.email);

		const recovered = await orm(c).select().from(email).where(eq(email.emailId, original.emailId)).get();
		expect(recovered).toBeDefined();
		expect(recovered.subject).toBe('restore-me');
		expect(recovered.content).toBe('<p>original content</p>');
	});

	it('discards rows written after the backup it restores', async () => {
		const manifest = await runBackup(c);
		const afterwards = await seedEmail('written-after-backup', '<p>later</p>');

		await restoreBackup(c, manifest.date);

		const survivor = await orm(c).select().from(email).where(eq(email.emailId, afterwards.emailId)).get();
		expect(survivor).toBeUndefined();
	});

	it('round-trips a non-email table', async () => {
		const created = await orm(c)
			.insert(account)
			.values({ email: 'roundtrip@example.com', name: 'roundtrip', userId: 1 })
			.returning()
			.get();

		const manifest = await runBackup(c);
		await orm(c).delete(account).where(eq(account.accountId, created.accountId)).run();

		await restoreBackup(c, manifest.date);

		const recovered = await orm(c)
			.select()
			.from(account)
			.where(eq(account.accountId, created.accountId))
			.get();
		expect(recovered).toBeDefined();
		expect(recovered.email).toBe('roundtrip@example.com');
	});

	it('pages emails across chunks beyond one page', async () => {
		for (let i = 0; i < 3; i++) {
			await seedEmail(`page-${i}`, `<p>body ${i}</p>`);
		}
		const manifest = await runBackup(c);

		const total = manifest.counts.email;
		expect(manifest.emailChunks).toBe(Math.max(1, Math.ceil(total / 200)));

		let seen = 0;
		for (let i = 0; i < manifest.emailChunks; i++) {
			const obj = await env.r2.get(
				`backups/${manifest.date}/email-${String(i).padStart(4, '0')}.json`,
			);
			seen += (await obj.json()).length;
		}
		expect(seen).toBe(total);
	});

	it('lists the backup it just wrote', async () => {
		const manifest = await runBackup(c);
		expect(await listBackups(c)).toContain(manifest.date);
	});

	it('refuses to restore a date with no manifest', async () => {
		await expect(restoreBackup(c, '1999-01-01')).rejects.toThrow(/No backup manifest/);
	});
});
