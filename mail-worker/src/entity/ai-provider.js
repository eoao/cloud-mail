import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const aiProvider = sqliteTable('ai_provider', {
	aiId: integer('ai_id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull().default(''),
	type: text('type').notNull(),
	baseUrl: text('base_url').notNull().default(''),
	apiKey: text('api_key').notNull().default(''),
	model: text('model').notNull().default(''),
	enabled: integer('enabled').notNull().default(1),
	priority: integer('priority').notNull().default(0),
	dailyCallLimit: integer('daily_call_limit').notNull().default(0),
	usedToday: integer('used_today').notNull().default(0),
	usedDate: text('used_date').notNull().default(''),
	lastError: text('last_error').notNull().default(''),
	createTime: text('create_time').default(sql`CURRENT_TIMESTAMP`).notNull()
}, (table) => ([
	index('idx_ai_provider_pick').on(table.enabled, table.priority)
]));

export const aiTaskBinding = sqliteTable('ai_task_binding', {
	task: text('task').primaryKey(),
	aiId: integer('ai_id').notNull()
});

export default aiProvider;
