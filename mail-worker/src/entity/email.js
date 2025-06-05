import { sqliteTable, text, integer} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
export const email = sqliteTable('email', {
	emailId: integer('email_id').primaryKey({ autoIncrement: true }),
	sendEmail: text('send_email'),
	name: text('name'),
	receiveEmail: text('receive_email').notNull(),
	accountId: integer('account_id').notNull(),
	userId: integer('user_id').notNull(),
	subject: text('subject'),
	text: text('text'),
	content: text('content'),
	type: integer('type').default(0).notNull(),
	status: integer('status').default(0).notNull(),
	resendEmailId: text('resend_email_id'),
	message: text('message'),
	createTime: text('create_time').default(sql`CURRENT_TIMESTAMP`).notNull(),
	isDel: integer('is_del').default(0).notNull()
});
export default email
