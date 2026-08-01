import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const notifyRule = sqliteTable('notify_rule', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	type: text('type').notNull(),
	name: text('name').default(''),
	config: text('config').notNull(),
	enabled: integer('enabled').default(1).notNull(),
	createTime: text('create_time').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export default notifyRule;