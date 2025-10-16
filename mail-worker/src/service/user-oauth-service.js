import orm from '../entity/orm';
import userOAuth from '../entity/user-oauth';
import { and, eq } from 'drizzle-orm';
import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';

let schemaEnsured = false;

const userOAuthService = {

        async ensureSchema(c) {
                if (schemaEnsured) {
                        return;
                }

                try {
                        await c.env.db.prepare(`CREATE TABLE IF NOT EXISTS user_oauth (
                                id INTEGER PRIMARY KEY AUTOINCREMENT,
                                user_id INTEGER NOT NULL,
                                provider TEXT NOT NULL,
                                external_id TEXT NOT NULL,
                                email TEXT NOT NULL DEFAULT '',
                                name TEXT NOT NULL DEFAULT '',
                                username TEXT NOT NULL DEFAULT '',
                                avatar TEXT NOT NULL DEFAULT '',
                                create_time DATETIME DEFAULT CURRENT_TIMESTAMP
                        );`).run();
                        await c.env.db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_user_oauth_provider_external ON user_oauth(provider, external_id);`).run();
                        await c.env.db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_user_oauth_user_provider ON user_oauth(user_id, provider);`).run();
                } catch (e) {
                        // Ignore errors that indicate the table already exists in older schemas
                        if (!e.message?.includes('already exists')) {
                                throw e;
                        }
                }

                schemaEnsured = true;
        },

        async listByUserId(c, userId) {
                await this.ensureSchema(c);

                return await orm(c)
                        .select()
                        .from(userOAuth)
                        .where(eq(userOAuth.userId, userId))
                        .all();
        },

        async selectByUserIdAndProvider(c, userId, provider) {
                await this.ensureSchema(c);

                return await orm(c)
                        .select()
                        .from(userOAuth)
                        .where(and(eq(userOAuth.userId, userId), eq(userOAuth.provider, provider)))
                        .get();
        },

        async selectByProviderAndExternalId(c, provider, externalId) {
                await this.ensureSchema(c);

                return await orm(c)
                        .select()
                        .from(userOAuth)
                        .where(and(eq(userOAuth.provider, provider), eq(userOAuth.externalId, externalId)))
                        .get();
        },

        async bind(c, userId, provider, payload) {
                await this.ensureSchema(c);

                const { externalId, email = '', name = '', username = '', avatar = '' } = payload;

                if (!externalId) {
                        throw new BizError(t('oauthMissingExternalId'));
                }

                const existed = await this.selectByProviderAndExternalId(c, provider, externalId);

                if (existed && existed.userId !== userId) {
                        throw new BizError(t('oauthAccountAlreadyBound'));
                }

                const current = await this.selectByUserIdAndProvider(c, userId, provider);
                const data = { userId, provider, externalId, email, name, username, avatar };

                if (current) {
                        await orm(c)
                                .update(userOAuth)
                                .set(data)
                                .where(eq(userOAuth.id, current.id))
                                .run();
                        return { ...current, ...data };
                }

                const inserted = await orm(c)
                        .insert(userOAuth)
                        .values(data)
                        .returning()
                        .get();

                return inserted;
        },

        async unbind(c, userId, provider) {
                await this.ensureSchema(c);

                await orm(c)
                        .delete(userOAuth)
                        .where(and(eq(userOAuth.userId, userId), eq(userOAuth.provider, provider)))
                        .run();
        }
};

export default userOAuthService;
