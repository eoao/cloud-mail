import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

const oauthBinding = sqliteTable('oauth_binding', {
	bindingId: integer('binding_id').primaryKey({ autoIncrement: true }),
	userId: integer('user_id').notNull(),
	provider: text('provider').notNull(), // github, google, microsoft
	oauthId: text('oauth_id').notNull(), // OAuth provider's user ID
	oauthEmail: text('oauth_email'), // OAuth provider's email
	oauthName: text('oauth_name'), // OAuth provider's user name
	accessToken: text('access_token'), // OAuth access token
	refreshToken: text('refresh_token'), // OAuth refresh token
	expiresAt: text('expires_at'), // Token expiration time
	createTime: text('create_time').default(sql`CURRENT_TIMESTAMP`),
	updateTime: text('update_time').default(sql`CURRENT_TIMESTAMP`)
});

export default oauthBinding;

