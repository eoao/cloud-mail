import orm from '../entity/orm';
import userOAuth from '../entity/user-oauth';
import { and, eq } from 'drizzle-orm';
import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';

const userOAuthService = {

        listByUserId(c, userId) {
                return orm(c)
                        .select()
                        .from(userOAuth)
                        .where(eq(userOAuth.userId, userId))
                        .all();
        },

        selectByUserIdAndProvider(c, userId, provider) {
                return orm(c)
                        .select()
                        .from(userOAuth)
                        .where(and(eq(userOAuth.userId, userId), eq(userOAuth.provider, provider)))
                        .get();
        },

        selectByProviderAndExternalId(c, provider, externalId) {
                return orm(c)
                        .select()
                        .from(userOAuth)
                        .where(and(eq(userOAuth.provider, provider), eq(userOAuth.externalId, externalId)))
                        .get();
        },

        async bind(c, userId, provider, payload) {
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
                await orm(c)
                        .delete(userOAuth)
                        .where(and(eq(userOAuth.userId, userId), eq(userOAuth.provider, provider)))
                        .run();
        }
};

export default userOAuthService;
