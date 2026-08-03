import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const passkeyCredential = sqliteTable('passkey_credential', {
	passkeyId: integer('passkey_id').primaryKey({ autoIncrement: true }),
	userId: integer('user_id').notNull().unique(),
	userHandle: text('user_handle').notNull().unique(),
	credentialId: text('credential_id').notNull().unique(),
	publicKey: text('public_key').notNull(),
	counter: integer('counter').default(0).notNull(),
	transports: text('transports').default('[]').notNull(),
	createTime: text('create_time').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export default passkeyCredential;
