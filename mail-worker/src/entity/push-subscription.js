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
	previewMode: text('preview_mode').default('privateOnly').notNull(),
	soundEnabled: integer('sound_enabled').default(1).notNull(),
	badgeEnabled: integer('badge_enabled').default(1).notNull(),
	quietHoursEnabled: integer('quiet_hours_enabled').default(0).notNull(),
	quietStartMinutes: integer('quiet_start_minutes').default(1320).notNull(),
	quietEndMinutes: integer('quiet_end_minutes').default(420).notNull(),
	timeZone: text('time_zone').default('UTC').notNull(),
	createTime: text('create_time').default(sql`CURRENT_TIMESTAMP`).notNull(),
});
