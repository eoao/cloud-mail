import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

const userOAuth = sqliteTable('user_oauth', {
        id: integer('id').primaryKey({ autoIncrement: true }),
        userId: integer('user_id').notNull(),
        provider: text('provider').notNull(),
        externalId: text('external_id').notNull(),
        email: text('email').notNull().default(''),
        name: text('name').notNull().default(''),
        username: text('username').notNull().default(''),
        avatar: text('avatar').notNull().default(''),
        createTime: text('create_time').default(sql`CURRENT_TIMESTAMP`)
});

export default userOAuth;
