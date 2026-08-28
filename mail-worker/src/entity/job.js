import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

const job = sqliteTable('job', {
	jobId: integer('job_id').primaryKey({ autoIncrement: true }),
	type: text('type').notNull(),
	payload: text('payload').notNull().default('{}'),
	status: integer('status').notNull().default(0),
	priority: integer('priority').notNull().default(0),
	runAfter: text('run_after').default(sql`CURRENT_TIMESTAMP`).notNull(),
	attempts: integer('attempts').notNull().default(0),
	maxAttempts: integer('max_attempts').notNull().default(3),
	lastError: text('last_error').notNull().default(''),
	result: text('result').notNull().default(''),
	dedupeKey: text('dedupe_key').notNull().default(''),
	createTime: text('create_time').default(sql`CURRENT_TIMESTAMP`).notNull(),
	updateTime: text('update_time').default(sql`CURRENT_TIMESTAMP`).notNull()
}, (table) => ([
	index('idx_job_claim').on(table.status, table.priority, table.runAfter)
]));

export default job;
