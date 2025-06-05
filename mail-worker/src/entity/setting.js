import { sqliteTable, text, integer} from 'drizzle-orm/sqlite-core';
export const setting = sqliteTable('setting', {
	register: integer('register').default(0).notNull(),
	receive: integer('receive').default(0).notNull(),
	title: text('title').default('').notNull(),
	manyEmail: integer('many_email').default(1).notNull(),
	addEmail: integer('add_email').default(0).notNull(),
	autoRefreshTime: integer('auto_refresh_time').default(0).notNull(),
	addEmailVerify: integer('add_email_verify').default(1).notNull(),
	registerVerify: integer('register_verify').default(1).notNull(),
	send: integer('send').default(1).notNull(),
	r2Domain: text('r2_domain'),
	secretKey: text('secret_key'),
	siteKey: text('site_key'),
	background: text('background'),
	loginOpacity: integer('login_opacity').default(0.9),
	resendTokens: text('resend_tokens').default("{}").notNull(),
});
export default setting
