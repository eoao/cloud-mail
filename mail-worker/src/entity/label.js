import { sqliteTable, text, integer, index, primaryKey } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// Folders and labels are the same shape - a named bucket owned by a user - and
// differ only in whether a message can be in several at once. Keeping them in
// one table avoids duplicating the whole CRUD surface; `kind` separates them.
export const label = sqliteTable('label', {
	labelId: integer('label_id').primaryKey({ autoIncrement: true }),
	userId: integer('user_id').notNull(),
	name: text('name').notNull(),
	color: text('color').notNull().default(''),
	kind: text('kind').notNull().default('label'),
	sort: integer('sort').notNull().default(0),
	createTime: text('create_time').default(sql`CURRENT_TIMESTAMP`).notNull()
}, (table) => ([
	index('idx_label_user').on(table.userId, table.kind, table.sort)
]));

export const emailLabel = sqliteTable('email_label', {
	emailId: integer('email_id').notNull(),
	labelId: integer('label_id').notNull(),
	userId: integer('user_id').notNull()
}, (table) => ([
	primaryKey({ columns: [table.emailId, table.labelId] }),
	index('idx_email_label_label').on(table.labelId, table.emailId)
]));

export default label;
