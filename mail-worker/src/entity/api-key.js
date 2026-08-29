import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const apiKey = sqliteTable('api_key', {
	keyId: integer('key_id').primaryKey({ autoIncrement: true }),
	userId: integer('user_id').notNull(),
	name: text('name').notNull().default(''),
	// The leading characters, shown in the UI so a key can be recognised.
	prefix: text('prefix').notNull(),
	// Only the hash is stored - the key itself is shown once, at creation.
	hash: text('hash').notNull(),
	scopes: text('scopes').notNull().default('[]'),
	lastUsed: text('last_used').notNull().default(''),
	expiresAt: text('expires_at').notNull().default(''),
	revoked: integer('revoked').notNull().default(0),
	createTime: text('create_time').default(sql`CURRENT_TIMESTAMP`).notNull()
}, (table) => ([
	index('idx_api_key_lookup').on(table.prefix, table.revoked)
]));

export const webhook = sqliteTable('webhook', {
	webhookId: integer('webhook_id').primaryKey({ autoIncrement: true }),
	userId: integer('user_id').notNull(),
	url: text('url').notNull(),
	secret: text('secret').notNull().default(''),
	events: text('events').notNull().default('[]'),
	enabled: integer('enabled').notNull().default(1),
	lastError: text('last_error').notNull().default(''),
	lastDelivery: text('last_delivery').notNull().default(''),
	createTime: text('create_time').default(sql`CURRENT_TIMESTAMP`).notNull()
}, (table) => ([
	index('idx_webhook_user').on(table.userId, table.enabled)
]));

export default apiKey;
