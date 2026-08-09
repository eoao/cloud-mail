import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// CloudMail intentionally stores only a scoped CF Mail Push Gateway subscription.
// It never stores APNs device tokens or Apple provider credentials.
export const pushSubscription = sqliteTable('push_subscription', {
	pushId: integer('push_id').primaryKey({ autoIncrement: true }),
	userId: integer('user_id').notNull(),
	subscriptionId: text('subscription_id').notNull(),
	pushSecret: text('push_secret').notNull(),
	accountRef: text('account_ref').default('').notNull(),
	createTime: text('create_time').default(sql`CURRENT_TIMESTAMP`).notNull(),
});
