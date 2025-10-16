import BizError from '../error/biz-error';
import loginService from './login-service';
import KvConst from '../const/kv-const';
import { v4 as uuidv4 } from 'uuid';
import { t } from '../i18n/i18n.js';
import { isDel, settingConst, userConst } from '../const/entity-const';
import settingService from './setting-service';
import emailUtils from '../utils/email-utils';
import accountService from './account-service';
import roleService from './role-service';
import saltHashUtils from '../utils/crypto-utils';
import userService from './user-service';
import userOAuthService from './user-oauth-service';

const OAUTH_STATE_TTL = 60 * 5;

const oauthService = {

        async authorize(c, provider, options = {}) {
                const config = this.getProviderConfig(c, provider);
                const state = uuidv4();
                const stateData = { provider, mode: options.mode || 'login' };

                if (options.userId) {
                        stateData.userId = options.userId;
                }

                await c.env.kv.put(KvConst.OAUTH_STATE + state, JSON.stringify(stateData), { expirationTtl: OAUTH_STATE_TTL });
                const authorizeUrl = new URL('https://github.com/login/oauth/authorize');
                authorizeUrl.searchParams.set('client_id', config.clientId);
                authorizeUrl.searchParams.set('redirect_uri', config.redirectUri);
                authorizeUrl.searchParams.set('scope', config.scope);
                authorizeUrl.searchParams.set('state', state);
                return { url: authorizeUrl.toString() };
        },

        async callback(c, provider, params) {
                const { code, state } = params;

                if (!code || !state) {
                        throw new BizError(t('oauthInvalidCallback'));
                }

                const stateData = await this.validateState(c, provider, state);

                if (provider === 'github') {
                        const profile = await this.fetchGitHubProfile(c, code);
                        if (stateData?.mode === 'bind') {
                                const binding = await this.bindGitHubAccount(c, stateData, profile);
                                return { binding };
                        }

                        const binding = await userOAuthService.selectByProviderAndExternalId(c, 'github', profile.id);

                        if (binding) {
                                const userRow = await userService.selectByIdIncludeDel(c, binding.userId);

                                if (!userRow || userRow.isDel === isDel.DELETE) {
                                        throw new BizError(t('isDelUser'));
                                }

                                if (userRow.status === userConst.status.BAN) {
                                        throw new BizError(t('isBanUser'));
                                }

                                const session = await loginService.createSession(c, userRow);
                                return { token: session };
                        }

                        const email = profile.email?.toLowerCase();

                        if (!email) {
                                throw new BizError(t('oauthEmailNotFound'));
                        }

                        const name = profile.name || emailUtils.getName(email);
                        const userRow = await this.ensureUser(c, email, name);
                        await userOAuthService.bind(c, userRow.userId, 'github', profile);
                        const session = await loginService.createSession(c, userRow);
                        return { token: session };
                }

                throw new BizError(t('oauthUnsupportedProvider'));
        },

        async validateState(c, provider, state) {
                const key = KvConst.OAUTH_STATE + state;
                const record = await c.env.kv.get(key, { type: 'json' });
                await c.env.kv.delete(key);

                if (!record || record.provider !== provider) {
                        throw new BizError(t('oauthStateInvalid'));
                }

                return record;
        },

        getProviderConfig(c, provider) {
                if (provider !== 'github') {
                        throw new BizError(t('oauthUnsupportedProvider'));
                }

                const clientId = c.env.githubClientId;
                const clientSecret = c.env.githubClientSecret;
                const redirectUri = c.env.githubRedirectUri;

                if (!clientId || !clientSecret || !redirectUri) {
                        throw new BizError(t('oauthProviderDisabled'));
                }

                return {
                        clientId,
                        clientSecret,
                        redirectUri,
                        scope: 'read:user user:email'
                };
        },

        async fetchGitHubProfile(c, code) {
                const config = this.getProviderConfig(c, 'github');

                const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
                        method: 'POST',
                        headers: {
                                'Accept': 'application/json'
                        },
                        body: new URLSearchParams({
                                client_id: config.clientId,
                                client_secret: config.clientSecret,
                                code,
                                redirect_uri: config.redirectUri
                        })
                });

                if (!tokenRes.ok) {
                        throw new BizError(t('oauthExchangeFailed'));
                }

                const tokenJson = await tokenRes.json();

                if (tokenJson.error || !tokenJson.access_token) {
                        throw new BizError(t('oauthExchangeFailed'));
                }

                const accessToken = tokenJson.access_token;
                const headers = {
                        'Authorization': `Bearer ${accessToken}`,
                        'User-Agent': 'cloud-mail-oauth'
                };

                const userRes = await fetch('https://api.github.com/user', { headers });

                if (!userRes.ok) {
                        throw new BizError(t('oauthUserFetchFailed'));
                }

                const userJson = await userRes.json();
                let email = userJson.email;

                if (!email) {
                        const emailRes = await fetch('https://api.github.com/user/emails', { headers });

                        if (!emailRes.ok) {
                                throw new BizError(t('oauthEmailFetchFailed'));
                        }

                        const emailList = await emailRes.json();

                        if (Array.isArray(emailList)) {
                                const primary = emailList.find(item => item?.primary && item?.verified);
                                const verified = emailList.find(item => item?.verified);
                                email = (primary || verified || emailList[0])?.email;
                        }
                }

                return {
                        email,
                        name: userJson.name || userJson.login,
                        id: String(userJson.id),
                        username: userJson.login,
                        avatar: userJson.avatar_url || ''
                };
        },

        async ensureUser(c, email, name) {
                const normalizedEmail = email.toLowerCase();
                const userRow = await userService.selectByEmailIncludeDel(c, normalizedEmail);

                if (userRow) {
                        if (userRow.isDel === isDel.DELETE) {
                                throw new BizError(t('isDelUser'));
                        }

                        if (userRow.status === userConst.status.BAN) {
                                throw new BizError(t('isBanUser'));
                        }

                        return userRow;
                }

                const settingRow = await settingService.query(c);

                if (settingRow.register === settingConst.register.CLOSE) {
                        throw new BizError(t('regDisabled'));
                }

                if (!c.env.domain.includes(emailUtils.getDomain(normalizedEmail))) {
                        throw new BizError(t('notEmailDomain'));
                }

                const accountRow = await accountService.selectByEmailIncludeDel(c, normalizedEmail);

                if (accountRow && accountRow.isDel === isDel.DELETE) {
                        throw new BizError(t('isDelUser'));
                }

                if (accountRow) {
                        throw new BizError(t('isRegAccount'));
                }

                const roleRow = await roleService.selectDefaultRole(c);

                if (!roleRow) {
                        throw new BizError(t('roleNotExist'));
                }

                if (!roleService.hasAvailDomainPerm(roleRow.availDomain, normalizedEmail)) {
                        throw new BizError(t('noDomainPermReg'), 403);
                }

                const password = saltHashUtils.genRandomPwd(12);
                const { salt, hash } = await saltHashUtils.hashPassword(password);

                const userId = await userService.insert(c, { email: normalizedEmail, password: hash, salt, type: roleRow.roleId });
                await accountService.insert(c, { userId, email: normalizedEmail, name: name || emailUtils.getName(normalizedEmail) });
                await userService.updateUserInfo(c, userId, true);

                return await userService.selectByEmailIncludeDel(c, normalizedEmail);
        },

        async bindGitHubAccount(c, stateData, profile) {
                const { userId } = stateData || {};

                if (!userId) {
                        throw new BizError(t('oauthStateInvalid'));
                }

                const userRow = await userService.selectByIdIncludeDel(c, userId);

                if (!userRow || userRow.isDel === isDel.DELETE) {
                        throw new BizError(t('isDelUser'));
                }

                if (userRow.status === userConst.status.BAN) {
                        throw new BizError(t('isBanUser'));
                }

                const binding = await userOAuthService.bind(c, userId, 'github', profile);
                return binding;
        }
};

export default oauthService;
