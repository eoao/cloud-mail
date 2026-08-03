import {
	generateAuthenticationOptions,
	generateRegistrationOptions,
	verifyAuthenticationResponse,
	verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { eq } from 'drizzle-orm';
import BizError from '../error/biz-error';
import orm from '../entity/orm';
import passkeyCredential from '../entity/passkey-credential';
import cryptoUtils from '../utils/crypto-utils';
import settingService from './setting-service';
import userService from './user-service';
import loginService from './login-service';
import { t } from '../i18n/i18n.js';

const CHALLENGE_TTL = 5 * 60 * 1000;
const PASSKEY_ENABLED = 1;

const passkeyService = {
	async status(c, userId) {
		const credential = await this.findByUserId(c, userId);
		return {
			registered: !!credential,
			createTime: credential?.createTime || null,
		};
	},

	async registrationOptions(c, userId, params) {
		await this.ensureEnabled(c);
		const user = await this.verifyCurrentPassword(c, userId, params?.password);
		const { origin, rpID } = this.getRelyingParty(c);
		const userHandleBytes = new Uint8Array(32);
		crypto.getRandomValues(userHandleBytes);
		const userHandle = isoBase64URL.fromBuffer(userHandleBytes);
		const options = await generateRegistrationOptions({
			rpName: (await settingService.query(c)).title || 'Cloud Mail',
			rpID,
			userID: userHandleBytes,
			userName: user.email,
			userDisplayName: user.email,
			attestationType: 'none',
			authenticatorSelection: {
				residentKey: 'required',
				userVerification: 'required',
			},
		});
		const transactionId = await this.saveChallenge(c, {
			type: 'registration',
			challenge: options.challenge,
			userId,
			userHandle,
			origin,
			rpID,
		});
		return { transactionId, options };
	},

	async verifyRegistration(c, userId, params) {
		await this.ensureEnabled(c);
		const challenge = await this.consumeChallenge(c, params?.transactionId, 'registration');
		if (!challenge || challenge.user_id !== userId) {
			throw new BizError(t('passkeyChallengeInvalid'));
		}

		let verification;
		try {
			verification = await verifyRegistrationResponse({
				response: params?.response,
				expectedChallenge: challenge.challenge,
				expectedOrigin: challenge.origin,
				expectedRPID: challenge.rp_id,
				requireUserVerification: true,
			});
		} catch (error) {
			console.warn(JSON.stringify({
				message: 'Passkey registration verification failed',
				error: error instanceof Error ? error.message : String(error),
			}));
			throw new BizError(t('passkeyVerifyFailed'));
		}
		if (!verification.verified || !verification.registrationInfo) {
			throw new BizError(t('passkeyVerifyFailed'));
		}

		const credential = verification.registrationInfo.credential;
		const values = {
			userId,
			userHandle: challenge.user_handle,
			credentialId: credential.id,
			publicKey: isoBase64URL.fromBuffer(credential.publicKey),
			counter: credential.counter,
			transports: JSON.stringify(credential.transports || params?.response?.response?.transports || []),
			createTime: new Date().toISOString(),
		};
		await orm(c).insert(passkeyCredential).values(values).onConflictDoUpdate({
			target: passkeyCredential.userId,
			set: values,
		}).run();
		return this.status(c, userId);
	},

	async authenticationOptions(c) {
		await this.ensureEnabled(c);
		const { origin, rpID } = this.getRelyingParty(c);
		const options = await generateAuthenticationOptions({
			rpID,
			userVerification: 'required',
		});
		const transactionId = await this.saveChallenge(c, {
			type: 'authentication',
			challenge: options.challenge,
			origin,
			rpID,
		});
		return { transactionId, options };
	},

	async verifyAuthentication(c, params) {
		await this.ensureEnabled(c);
		const challenge = await this.consumeChallenge(c, params?.transactionId, 'authentication');
		if (!challenge) {
			throw new BizError(t('passkeyChallengeInvalid'));
		}
		const credential = await this.findByCredentialId(c, params?.response?.id);
		if (!credential || params?.response?.response?.userHandle !== credential.userHandle) {
			throw new BizError(t('passkeyNotFound'));
		}

		let verification;
		try {
			verification = await verifyAuthenticationResponse({
				response: params.response,
				expectedChallenge: challenge.challenge,
				expectedOrigin: challenge.origin,
				expectedRPID: challenge.rp_id,
				requireUserVerification: true,
				credential: {
					id: credential.credentialId,
					publicKey: isoBase64URL.toBuffer(credential.publicKey),
					counter: credential.counter,
					transports: this.parseTransports(credential.transports),
				},
			});
		} catch (error) {
			console.warn(JSON.stringify({
				message: 'Passkey authentication verification failed',
				error: error instanceof Error ? error.message : String(error),
			}));
			throw new BizError(t('passkeyVerifyFailed'));
		}
		if (!verification.verified) {
			throw new BizError(t('passkeyVerifyFailed'));
		}

		await orm(c).update(passkeyCredential).set({
			counter: verification.authenticationInfo.newCounter,
		}).where(eq(passkeyCredential.passkeyId, credential.passkeyId)).run();
		const user = await userService.selectByIdIncludeDel(c, credential.userId);
		return loginService.loginUser(c, user);
	},

	async delete(c, userId, params) {
		await this.verifyCurrentPassword(c, userId, params?.password);
		await orm(c).delete(passkeyCredential).where(eq(passkeyCredential.userId, userId)).run();
	},

	async ensureEnabled(c) {
		const { passkey } = await settingService.query(c);
		if (passkey !== PASSKEY_ENABLED) {
			throw new BizError(t('passkeyDisabled'));
		}
	},

	async verifyCurrentPassword(c, userId, password) {
		if (!password) {
			throw new BizError(t('emailAndPwdEmpty'));
		}
		const user = await userService.selectByIdIncludeDel(c, userId);
		if (!user || !await cryptoUtils.verifyPassword(password, user.salt, user.password)) {
			throw new BizError(t('IncorrectPwd'));
		}
		return user;
	},

	async findByUserId(c, userId) {
		return orm(c).select().from(passkeyCredential).where(eq(passkeyCredential.userId, userId)).get();
	},

	async findByCredentialId(c, credentialId) {
		if (!credentialId) return null;
		return orm(c).select().from(passkeyCredential).where(eq(passkeyCredential.credentialId, credentialId)).get();
	},

	parseTransports(transports) {
		try {
			return JSON.parse(transports || '[]');
		} catch (_) {
			return [];
		}
	},

	getRelyingParty(c) {
		try {
			const requestUrl = new URL(c.req.url);
			const origin = new URL(c.req.header('Origin') || requestUrl.origin);
			const loopbackHosts = ['localhost', '127.0.0.1', '[::1]'];
			const originIsLoopback = loopbackHosts.includes(origin.hostname);
			const requestIsLoopback = loopbackHosts.includes(requestUrl.hostname);
			const secureOrigin = origin.protocol === 'https:'
				|| (origin.protocol === 'http:' && originIsLoopback);
			const trustedOrigin = origin.origin === requestUrl.origin
				|| (originIsLoopback && requestIsLoopback);
			if (secureOrigin && trustedOrigin) {
				return { origin: origin.origin, rpID: origin.hostname };
			}
		} catch (_) {
			throw new BizError(t('passkeyOriginInvalid'));
		}
		throw new BizError(t('passkeyOriginInvalid'));
	},

	async saveChallenge(c, challenge) {
		const transactionId = crypto.randomUUID();
		const now = Date.now();
		await c.env.db.batch([
			c.env.db.prepare('DELETE FROM passkey_challenge WHERE expires_at <= ?').bind(now),
			c.env.db.prepare(`
				INSERT INTO passkey_challenge
				(challenge_id, type, challenge, user_id, user_handle, origin, rp_id, expires_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			`).bind(
				transactionId,
				challenge.type,
				challenge.challenge,
				challenge.userId || 0,
				challenge.userHandle || '',
				challenge.origin,
				challenge.rpID,
				now + CHALLENGE_TTL,
			),
		]);
		return transactionId;
	},

	async consumeChallenge(c, transactionId, type) {
		if (!transactionId) return null;
		return c.env.db.prepare(`
			DELETE FROM passkey_challenge
			WHERE challenge_id = ? AND type = ? AND expires_at > ?
			RETURNING *
		`).bind(transactionId, type, Date.now()).first();
	},
};

export default passkeyService;
