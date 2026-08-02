import orm from '../entity/orm';
import email from '../entity/email';
import account from '../entity/account';
import { and, eq, sql } from 'drizzle-orm';
import { emailConst } from '../const/entity-const';

const migrationService = {

	async migrateOrphanedEmails(c) {
		const rows = await orm(c).select({
			emailId: email.emailId,
			toEmail: email.toEmail,
		}).from(email).where(
			and(
				eq(email.userId, 0),
				eq(email.accountId, 0)
			)
		).all();

		if (rows.length === 0) {
			return { migrated: 0 };
		}

		let migrated = 0;

		for (const row of rows) {
			const accountRow = await orm(c).select().from(account).where(
				sql`${account.email} COLLATE NOCASE = ${row.toEmail}`
			).get();

			if (accountRow) {
				await orm(c).update(email).set({
					userId: accountRow.userId,
					accountId: accountRow.accountId,
					status: emailConst.status.RECEIVE
				}).where(eq(email.emailId, row.emailId)).run();
				migrated++;
			}
		}

		return { migrated };
	}
};

export default migrationService;
