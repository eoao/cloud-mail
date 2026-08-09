import orm from '../entity/orm';
import { pushSubscription } from '../entity/push-subscription';
import { and, desc, eq, inArray } from 'drizzle-orm';
import BizError from '../error/biz-error';
import { toId, toTrimmedString } from '../utils/input-utils';

const MAX_SUBSCRIPTIONS_PER_USER = 10;
const PREVIEW_MODES = new Set(['privateOnly', 'sender', 'senderAndSubject', 'fullPreview']);

function normalizeSubscriptionId(value) {
	const subscriptionId = toTrimmedString(value, { name: '推送订阅 ID', required: true, max: 128 });
	if (!/^ps_[A-Za-z0-9_-]{20,120}$/.test(subscriptionId)) throw new BizError('推送订阅 ID 格式无效', 400);
	return subscriptionId;
}

function normalizePushSecret(value) {
	const secret = toTrimmedString(value, { name: '推送订阅密钥', required: true, max: 256 });
	if (!/^pgs_[A-Za-z0-9_-]{32,240}$/.test(secret)) throw new BizError('推送订阅密钥格式无效', 400);
	return secret;
}

function normalizeAccountRef(value) {
	const accountRef = toTrimmedString(value, { name: '客户端账户标识', required: false, max: 64 });
	if (!accountRef) return '';
	if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(accountRef)) {
		throw new BizError('客户端账户标识格式无效', 400);
	}
	return accountRef.toLowerCase();
}

function normalizeBoolean(value, fallback) {
	if (value === undefined || value === null) return fallback;
	if (typeof value === 'boolean') return value;
	if (value === 1 || value === '1' || value === 'true') return true;
	if (value === 0 || value === '0' || value === 'false') return false;
	return fallback;
}

function normalizeMinute(value, fallback) {
	const number = Number(value);
	return Number.isInteger(number) && number >= 0 && number <= 1439 ? number : fallback;
}

function normalizePreviewMode(value) {
	const mode = String(value || 'privateOnly').trim();
	return PREVIEW_MODES.has(mode) ? mode : 'privateOnly';
}

function normalizeTimeZone(value) {
	const zone = String(value || 'UTC').trim().slice(0, 64) || 'UTC';
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: zone }).format(new Date());
		return zone;
	} catch {
		return 'UTC';
	}
}

function normalizePreferences(input = {}) {
	return {
		previewMode: normalizePreviewMode(input.previewMode),
		soundEnabled: normalizeBoolean(input.soundEnabled, true),
		badgeEnabled: normalizeBoolean(input.badgeEnabled, true),
		quietHoursEnabled: normalizeBoolean(input.quietHoursEnabled, false),
		quietStartMinutes: normalizeMinute(input.quietStartMinutes, 22 * 60),
		quietEndMinutes: normalizeMinute(input.quietEndMinutes, 7 * 60),
		timeZone: normalizeTimeZone(input.timeZone)
	};
}

const pushSubscriptionService = {
	async register(c, userId, subscriptionIdValue, pushSecretValue, accountRefValue = '', preferenceInput = {}) {
		const uid = toId(userId, 'userId');
		const subscriptionId = normalizeSubscriptionId(subscriptionIdValue);
		const pushSecret = normalizePushSecret(pushSecretValue);
		const accountRef = normalizeAccountRef(accountRefValue);
		const prefs = normalizePreferences(preferenceInput);

		await c.env.db.prepare(`
			INSERT INTO push_subscription (
				user_id, subscription_id, push_secret, account_ref,
				preview_mode, sound_enabled, badge_enabled,
				quiet_hours_enabled, quiet_start_minutes, quiet_end_minutes, time_zone,
				create_time
			)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
			ON CONFLICT(user_id, subscription_id) DO UPDATE SET
				push_secret = excluded.push_secret,
				account_ref = excluded.account_ref,
				preview_mode = excluded.preview_mode,
				sound_enabled = excluded.sound_enabled,
				badge_enabled = excluded.badge_enabled,
				quiet_hours_enabled = excluded.quiet_hours_enabled,
				quiet_start_minutes = excluded.quiet_start_minutes,
				quiet_end_minutes = excluded.quiet_end_minutes,
				time_zone = excluded.time_zone,
				create_time = CURRENT_TIMESTAMP
		`).bind(
			uid, subscriptionId, pushSecret, accountRef,
			prefs.previewMode, prefs.soundEnabled ? 1 : 0, prefs.badgeEnabled ? 1 : 0,
			prefs.quietHoursEnabled ? 1 : 0, prefs.quietStartMinutes, prefs.quietEndMinutes, prefs.timeZone
		).run();

		const current = await orm(c).select({ pushId: pushSubscription.pushId }).from(pushSubscription)
			.where(eq(pushSubscription.userId, uid)).orderBy(desc(pushSubscription.pushId)).all();
		const stale = current.slice(MAX_SUBSCRIPTIONS_PER_USER).map(item => item.pushId);
		if (stale.length) await orm(c).delete(pushSubscription).where(inArray(pushSubscription.pushId, stale)).run();
	},

	async unregister(c, userId, subscriptionIdValue) {
		const uid = toId(userId, 'userId');
		const subscriptionId = normalizeSubscriptionId(subscriptionIdValue);
		await orm(c).delete(pushSubscription).where(
			and(eq(pushSubscription.userId, uid), eq(pushSubscription.subscriptionId, subscriptionId))
		).run();
	},

	async unregisterAllByUserId(c, userId) {
		await orm(c).delete(pushSubscription).where(eq(pushSubscription.userId, toId(userId, 'userId'))).run();
	},

	async removeById(c, subscriptionIdValue) {
		let subscriptionId;
		try { subscriptionId = normalizeSubscriptionId(subscriptionIdValue); } catch { return; }
		await orm(c).delete(pushSubscription).where(eq(pushSubscription.subscriptionId, subscriptionId)).run();
	},

	async listByUserId(c, userId) {
		return orm(c).select().from(pushSubscription).where(eq(pushSubscription.userId, toId(userId, 'userId'))).all();
	}
};

export default pushSubscriptionService;
