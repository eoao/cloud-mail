import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// Per-user inbound rules: conditions -> actions, evaluated in `sort` order.
// Conditions and actions are stored as JSON because their shape is a small
// closed vocabulary validated on write (see rule-service), not free-form data.
export const rule = sqliteTable('rule', {
	ruleId: integer('rule_id').primaryKey({ autoIncrement: true }),
	userId: integer('user_id').notNull(),
	name: text('name').notNull().default(''),
	conditions: text('conditions').notNull().default('[]'),
	actions: text('actions').notNull().default('[]'),
	matchAll: integer('match_all').notNull().default(1),
	stopOnMatch: integer('stop_on_match').notNull().default(0),
	enabled: integer('enabled').notNull().default(1),
	sort: integer('sort').notNull().default(0),
	createTime: text('create_time').default(sql`CURRENT_TIMESTAMP`).notNull()
}, (table) => ([
	index('idx_rule_user').on(table.userId, table.enabled, table.sort)
]));

export const template = sqliteTable('template', {
	templateId: integer('template_id').primaryKey({ autoIncrement: true }),
	userId: integer('user_id').notNull(),
	name: text('name').notNull(),
	subject: text('subject').notNull().default(''),
	content: text('content').notNull().default(''),
	createTime: text('create_time').default(sql`CURRENT_TIMESTAMP`).notNull()
}, (table) => ([
	index('idx_template_user').on(table.userId, table.templateId)
]));

export default rule;
