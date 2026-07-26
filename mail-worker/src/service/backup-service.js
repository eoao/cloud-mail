import orm from '../entity/orm';
import setting from '../entity/setting';
import user from '../entity/user';
import account from '../entity/account';
import role from '../entity/role';
import email from '../entity/email';

const BACKUP_RETENTION_DAYS = 7;

async function exportTable(c, table, columns) {
	const rows = await orm(c).select(columns || {}).from(table).all();
	return rows;
}

async function uploadToR2(c, key, data) {
	if (!c.env.r2) return;
	const json = JSON.stringify(data);
	await c.env.r2.put(key, json, {
		httpMetadata: { contentType: 'application/json' },
	});
}

async function cleanupOldBackups(c) {
	if (!c.env.r2) return;
	const cutoff = new Date();
	cutoff.setDate(cutoff.getDate() - BACKUP_RETENTION_DAYS);
	const prefix = 'backups/';

	const list = await c.env.r2.list({ prefix, limit: 100 });
	for (const obj of list.objects) {
		if (obj.uploaded && obj.uploaded < cutoff) {
			await c.env.r2.delete(obj.key);
		}
	}
}

export async function runBackup(c) {
	if (!c.env.r2) return;

	const today = new Date().toISOString().split('T')[0];
	const prefix = `backups/${today}`;

	const tables = {
		setting: await exportTable(c, setting),
		user: await exportTable(c, user),
		account: await exportTable(c, account),
		role: await exportTable(c, role),
		email: await exportTable(c, email, {
			emailId: email.emailId,
			sendEmail: email.sendEmail,
			name: email.name,
			accountId: email.accountId,
			userId: email.userId,
			subject: email.subject,
			createTime: email.createTime,
			isDel: email.isDel,
			type: email.type,
			status: email.status,
		}),
	};

	for (const [name, data] of Object.entries(tables)) {
		await uploadToR2(c, `${prefix}/${name}.json`, data);
	}

	await uploadToR2(c, `${prefix}/manifest.json`, {
		date: today,
		tables: Object.keys(tables),
		counts: Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length])),
	});

	await cleanupOldBackups(c);
}
