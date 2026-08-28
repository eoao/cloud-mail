import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

const sendProvider = sqliteTable('send_provider', {
	providerId: integer('provider_id').primaryKey({ autoIncrement: true }),
	domain: text('domain').notNull(),
	type: text('type').notNull(),
	credentials: text('credentials').notNull().default('{}'),
	priority: integer('priority').notNull().default(0),
	enabled: integer('enabled').notNull().default(1),
	dailyLimit: integer('daily_limit').notNull().default(0),
	sentToday: integer('sent_today').notNull().default(0),
	sentDate: text('sent_date').notNull().default(''),
	lastError: text('last_error').notNull().default(''),
	verifiedAt: text('verified_at').notNull().default(''),
	createTime: text('create_time').default(sql`CURRENT_TIMESTAMP`).notNull()
}, (table) => ([
	index('idx_send_provider_pick').on(table.domain, table.enabled, table.priority)
]));

export default sendProvider;
