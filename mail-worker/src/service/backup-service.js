import orm from '../entity/orm';
import setting from '../entity/setting';
import user from '../entity/user';
import account from '../entity/account';
import role from '../entity/role';
import email from '../entity/email';
import { att } from '../entity/att';
import { star } from '../entity/star';
import { oauth } from '../entity/oauth';
import { regKey } from '../entity/reg-key';
import { perm } from '../entity/perm';
import { rolePerm } from '../entity/role-perm';

const BACKUP_RETENTION_DAYS = 7;
const BACKUP_PREFIX = 'backups/';

// Emails carry the message bodies, so they are paged instead of loaded whole:
// a single .all() over a large mailbox exceeds the Worker memory ceiling.
const EMAIL_PAGE_SIZE = 200;

// verify_record is deliberately absent: it is rate-limiting scratch data that the
// scheduled job rebuilds, and restoring it would resurrect stale counters.
const TABLES = {
	setting,
	role,
	perm,
	role_perm: rolePerm,
	user,
	account,
	oauth,
	reg_key: regKey,
	star,
	att,
};

function today() {
	return new Date().toISOString().split('T')[0];
}

async function putJson(c, key, data) {
	await c.env.r2.put(key, JSON.stringify(data), {
		httpMetadata: { contentType: 'application/json' },
	});
}

async function getJson(c, key) {
	const obj = await c.env.r2.get(key);
	if (!obj) return null;
	return await obj.json();
}

async function cleanupOldBackups(c) {
	const cutoff = new Date();
	cutoff.setDate(cutoff.getDate() - BACKUP_RETENTION_DAYS);

	let cursor;
	do {
		const list = await c.env.r2.list({ prefix: BACKUP_PREFIX, cursor });
		for (const obj of list.objects) {
			if (obj.uploaded && obj.uploaded < cutoff) {
				await c.env.r2.delete(obj.key);
			}
		}
		cursor = list.truncated ? list.cursor : undefined;
	} while (cursor);
}

export async function runBackup(c) {
	if (!c.env.r2) return null;

	const date = today();
	const prefix = `${BACKUP_PREFIX}${date}`;
	const counts = {};

	for (const [name, table] of Object.entries(TABLES)) {
		const rows = await orm(c).select().from(table).all();
		await putJson(c, `${prefix}/${name}.json`, rows);
		counts[name] = rows.length;
	}

	// Full rows, bodies included. Paged by primary key so a partial page
	// signals the end without a separate count query.
	let offset = 0;
	let chunk = 0;
	let emailCount = 0;
	for (;;) {
		const rows = await orm(c)
			.select()
			.from(email)
			.orderBy(email.emailId)
			.limit(EMAIL_PAGE_SIZE)
			.offset(offset)
			.all();

		if (rows.length === 0) break;

		await putJson(c, `${prefix}/email-${String(chunk).padStart(4, '0')}.json`, rows);
		emailCount += rows.length;
		chunk++;
		offset += EMAIL_PAGE_SIZE;

		if (rows.length < EMAIL_PAGE_SIZE) break;
	}

	const manifest = {
		date,
		createdAt: new Date().toISOString(),
		tables: Object.keys(TABLES),
		emailChunks: chunk,
		counts: { ...counts, email: emailCount },
	};

	await putJson(c, `${prefix}/manifest.json`, manifest);
	await cleanupOldBackups(c);

	return manifest;
}

export async function listBackups(c) {
	if (!c.env.r2) return [];

	const dates = new Set();
	let cursor;
	do {
		const list = await c.env.r2.list({ prefix: BACKUP_PREFIX, cursor });
		for (const obj of list.objects) {
			const match = obj.key.match(/^backups\/([^/]+)\/manifest\.json$/);
			if (match) dates.add(match[1]);
		}
		cursor = list.truncated ? list.cursor : undefined;
	} while (cursor);

	return [...dates].sort().reverse();
}

async function insertAll(c, table, rows) {
	if (rows.length === 0) return;
	// D1 caps bound parameters per statement, so insert in slices rather than one call.
	const columnCount = Object.keys(rows[0]).length;
	const perStatement = Math.max(1, Math.floor(90 / Math.max(1, columnCount)));
	for (let i = 0; i < rows.length; i += perStatement) {
		await orm(c).insert(table).values(rows.slice(i, i + perStatement)).run();
	}
}

/**
 * Replaces current database contents with the named backup.
 *
 * Destructive: every table it touches is emptied before reload. Tables absent
 * from the backup are left untouched rather than cleared, so a partial archive
 * cannot silently wipe data it never captured.
 */
export async function restoreBackup(c, date) {
	if (!c.env.r2) {
		throw new Error('R2 is not bound; nothing to restore from');
	}

	const prefix = `${BACKUP_PREFIX}${date}`;
	const manifest = await getJson(c, `${prefix}/manifest.json`);

	if (!manifest) {
		throw new Error(`No backup manifest found for ${date}`);
	}

	const restored = {};

	for (const [name, table] of Object.entries(TABLES)) {
		const rows = await getJson(c, `${prefix}/${name}.json`);
		if (rows === null) continue;

		await orm(c).delete(table).run();
		await insertAll(c, table, rows);
		restored[name] = rows.length;
	}

	// Keyed on whether the backup captured the email table at all, not on whether it
	// found rows: a backup taken from an empty mailbox must still clear the table,
	// otherwise restoring it would leave later messages behind.
	if (manifest.counts?.email !== undefined) {
		await orm(c).delete(email).run();
		let emailCount = 0;
		for (let i = 0; i < (manifest.emailChunks || 0); i++) {
			const rows = await getJson(c, `${prefix}/email-${String(i).padStart(4, '0')}.json`);
			if (!rows) continue;
			await insertAll(c, email, rows);
			emailCount += rows.length;
		}
		restored.email = emailCount;
	}

	return { date, restored, manifest };
}
