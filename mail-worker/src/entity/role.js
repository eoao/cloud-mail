import { sqliteTable, text, integer} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
export const role = sqliteTable('role', {
	roleId: integer('role_id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	key: text('key').notNull(),
	description: text('description'),
	sort: integer('sort'),
	isDefault: integer('is_default').default(0),
	createTime: text('create_time').default(sql`CURRENT_TIMESTAMP`).notNull(),
	userId: integer('user_id'),
	sendCount: integer('send_count'),
	sendType: text('send_type').default('count'),
	accountCount: integer('account_count')
});
export default role
