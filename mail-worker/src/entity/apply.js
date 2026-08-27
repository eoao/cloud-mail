import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const apply = sqliteTable('apply', {
	applyId: integer('apply_id').primaryKey({ autoIncrement: true }),
	oauthUserId: text('oauth_user_id').default('').notNull(),
	platform: text('platform').default('').notNull(),
	username: text('username').default('').notNull(),
	name: text('name').default('').notNull(),
	avatar: text('avatar'),
	trustLevel: integer('trust_level'),
	email: text('email').notNull(),
	reason: text('reason').default('').notNull(),
	status: integer('status').default(0).notNull(),
	remark: text('remark').default('').notNull(),
	adminId: integer('admin_id').default(0).notNull(),
	createTime: text('create_time').default(sql`CURRENT_TIMESTAMP`).notNull(),
	updateTime: text('update_time')
});

export default apply
