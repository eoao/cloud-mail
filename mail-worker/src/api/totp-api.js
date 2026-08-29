import app from '../hono/hono';
import result from '../model/result';
import orm from '../entity/orm';
import user from '../entity/user';
import { eq } from 'drizzle-orm';
import totpUtils from '../utils/totp-utils';
import cryptoUtils from '../utils/crypto-utils';
import userContext from '../security/user-context';
import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';

// Two-factor setup.
//
// Enabling is two steps on purpose: the secret is stored first but stays
// inactive until the user proves they can produce a code from it. Turning it on
// in one step would lock out anyone whose authenticator failed to save it.

app.get('/totp/status', async (c) => {
	const row = c.get('user');
	return c.json(result.ok({ enabled: !!row.totpEnabled }));
});

app.post('/totp/start', async (c) => {

	const userId = userContext.getUserId(c);
	const row = await orm(c).select().from(user).where(eq(user.userId, userId)).get();

	if (row.totpEnabled) {
		throw new BizError(t('totpAlreadyOn'), 400);
	}

	const secret = totpUtils.generateSecret();

	await orm(c).update(user).set({ totpSecret: secret }).where(eq(user.userId, userId)).run();

	return c.json(result.ok({
		secret,
		uri: totpUtils.otpauthUri({ secret, account: row.email })
	}));
});

app.post('/totp/confirm', async (c) => {

	const { code } = await c.req.json();
	const userId = userContext.getUserId(c);
	const row = await orm(c).select().from(user).where(eq(user.userId, userId)).get();

	if (!row.totpSecret) {
		throw new BizError(t('totpNotStarted'), 400);
	}

	if (!await totpUtils.verifyCode(row.totpSecret, code)) {
		throw new BizError(t('totpInvalid'), 400);
	}

	await orm(c).update(user).set({ totpEnabled: 1 }).where(eq(user.userId, userId)).run();

	return c.json(result.ok({ enabled: true }));
});

// Turning it off needs the password: someone who walks up to an unlocked screen
// should not be able to strip the second factor.
app.post('/totp/disable', async (c) => {

	const { password, code } = await c.req.json();
	const userId = userContext.getUserId(c);
	const row = await orm(c).select().from(user).where(eq(user.userId, userId)).get();

	if (!await cryptoUtils.verifyPassword(password, row.salt, row.password)) {
		throw new BizError(t('IncorrectPwd'), 400);
	}

	if (row.totpEnabled && !await totpUtils.verifyCode(row.totpSecret, code)) {
		throw new BizError(t('totpInvalid'), 400);
	}

	await orm(c).update(user).set({ totpEnabled: 0, totpSecret: '' }).where(eq(user.userId, userId)).run();

	return c.json(result.ok({ enabled: false }));
});
