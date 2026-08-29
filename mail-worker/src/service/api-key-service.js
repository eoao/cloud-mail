import orm from '../entity/orm';
import { apiKey, webhook } from '../entity/api-key';
import { and, asc, eq } from 'drizzle-orm';
import dayjs from 'dayjs';
import BizError from '../error/biz-error';
import webhookUtils from '../utils/webhook-utils';

// Programmatic access: API keys for calling in, webhooks for calling out.
//
// Keys are stored hashed. The plaintext is returned exactly once, at creation -
// a leaked database should not hand an attacker working credentials, and "show
// me the key again" is a feature that guarantees it can.

const PREFIX = 'cm_';
const PREFIX_LEN = 11; // "cm_" + 8 identifying characters

const SCOPES = ['mail:read', 'mail:send', 'contacts:read', 'contacts:write', 'calendar:read', 'tasks:write'];

const now = () => dayjs().format('YYYY-MM-DD HH:mm:ss');

function randomKey() {
	const bytes = crypto.getRandomValues(new Uint8Array(24));
	const body = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
	return `${PREFIX}${body}`;
}

async function hashKey(key) {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
	return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

const apiKeyService = {

	scopes: () => SCOPES,
	hashKey,

	async list(c, userId) {
		const rows = await orm(c).select().from(apiKey)
			.where(eq(apiKey.userId, userId)).orderBy(asc(apiKey.keyId)).all();

		// The hash is as sensitive as the key for an offline attack - never leave.
		return rows.map(({ hash, ...row }) => ({ ...row, scopes: safeJson(row.scopes) }));
	},

	/** Returns the row plus the plaintext key, which is never retrievable again. */
	async create(c, params, userId) {

		const scopes = (Array.isArray(params.scopes) ? params.scopes : []).filter(s => SCOPES.includes(s));

		if (scopes.length === 0) {
			throw new BizError('a key needs at least one scope', 400);
		}

		const key = randomKey();

		const row = await orm(c).insert(apiKey).values({
			userId,
			name: String(params.name ?? '').slice(0, 80),
			prefix: key.slice(0, PREFIX_LEN),
			hash: await hashKey(key),
			scopes: JSON.stringify(scopes),
			expiresAt: String(params.expiresAt ?? '')
		}).returning().get();

		const { hash, ...safe } = row;

		return { ...safe, scopes, key };
	},

	async revoke(c, keyId, userId) {
		const row = await orm(c).update(apiKey).set({ revoked: 1 })
			.where(and(eq(apiKey.keyId, Number(keyId)), eq(apiKey.userId, userId)))
			.returning().get();

		if (!row) {
			throw new BizError('key not found', 404);
		}

		return { keyId: row.keyId, revoked: 1 };
	},

	/**
	 * Resolve a presented key to its owner and scopes, or null.
	 *
	 * The prefix narrows the lookup to one row so this is an indexed read rather
	 * than a scan, and the comparison is timing-safe on the hash.
	 */
	async verify(c, presented) {

		if (!presented?.startsWith(PREFIX)) {
			return null;
		}

		const row = await orm(c).select().from(apiKey)
			.where(and(eq(apiKey.prefix, presented.slice(0, PREFIX_LEN)), eq(apiKey.revoked, 0)))
			.get();

		if (!row) {
			return null;
		}

		if (!webhookUtils.timingSafeEqual(await hashKey(presented), row.hash)) {
			return null;
		}

		if (row.expiresAt && row.expiresAt < now()) {
			return null;
		}

		// Best-effort usage stamp; a failure here must not deny a valid request.
		try {
			await orm(c).update(apiKey).set({ lastUsed: now() }).where(eq(apiKey.keyId, row.keyId)).run();
		} catch (e) {
			console.warn('could not stamp api key use:', e.message);
		}

		return { userId: row.userId, keyId: row.keyId, scopes: safeJson(row.scopes) };
	},

	// ---- outgoing webhooks ----------------------------------------------

	async listWebhooks(c, userId) {
		const rows = await orm(c).select().from(webhook)
			.where(eq(webhook.userId, userId)).orderBy(asc(webhook.webhookId)).all();

		return rows.map(row => ({
			...row,
			events: safeJson(row.events),
			secret: row.secret ? `${row.secret.slice(0, 6)}******` : ''
		}));
	},

	async upsertWebhook(c, params, userId) {

		let url;
		try {
			url = new URL(params.url);
		} catch {
			throw new BizError('url is not valid', 400);
		}

		// Only http(s) - anything else would be a way to reach internal schemes.
		if (!['http:', 'https:'].includes(url.protocol)) {
			throw new BizError('url must be http or https', 400);
		}

		const values = {
			url: url.toString(),
			events: JSON.stringify(Array.isArray(params.events) ? params.events.slice(0, 20) : []),
			enabled: Number(params.enabled ?? 1) ? 1 : 0
		};

		if (params.secret) {
			values.secret = String(params.secret).slice(0, 200);
		}

		if (params.webhookId) {
			const row = await orm(c).update(webhook).set(values)
				.where(and(eq(webhook.webhookId, Number(params.webhookId)), eq(webhook.userId, userId)))
				.returning().get();

			if (!row) {
				throw new BizError('webhook not found', 404);
			}

			return row;
		}

		// Generate a signing secret if the caller did not supply one, so an
		// endpoint can always verify that a delivery came from here.
		values.secret ??= randomKey().slice(PREFIX.length);

		return orm(c).insert(webhook).values({ ...values, userId }).returning().get();
	},

	async removeWebhook(c, webhookId, userId) {
		const row = await orm(c).delete(webhook)
			.where(and(eq(webhook.webhookId, Number(webhookId)), eq(webhook.userId, userId)))
			.returning().get();

		if (!row) {
			throw new BizError('webhook not found', 404);
		}

		return row;
	},

	/**
	 * Deliver one event to every endpoint subscribed to it.
	 *
	 * Signed the same way we require of inbound webhooks, so a receiver can
	 * verify us with a standard Svix-compatible check.
	 */
	async deliver(c, userId, event, payload) {

		const rows = await orm(c).select().from(webhook)
			.where(and(eq(webhook.userId, userId), eq(webhook.enabled, 1))).all();

		const targets = rows.filter(row => {
			const events = safeJson(row.events);
			return events.length === 0 || events.includes(event);
		});

		let delivered = 0;

		for (const row of targets) {

			const body = JSON.stringify({ event, data: payload, timestamp: now() });
			const id = crypto.randomUUID();
			const timestamp = String(Math.floor(Date.now() / 1000));

			try {
				const signature = await webhookUtils.signSvix(row.secret, id, timestamp, body);

				const res = await fetch(row.url, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'svix-id': id,
						'svix-timestamp': timestamp,
						'svix-signature': signature
					},
					body,
					signal: AbortSignal.timeout(10_000)
				});

				if (!res.ok) {
					throw new Error(`HTTP ${res.status}`);
				}

				await orm(c).update(webhook).set({ lastDelivery: now(), lastError: '' })
					.where(eq(webhook.webhookId, row.webhookId)).run();

				delivered++;
			} catch (e) {
				await orm(c).update(webhook).set({ lastError: String(e.message).slice(0, 300) })
					.where(eq(webhook.webhookId, row.webhookId)).run();
			}
		}

		return { targets: targets.length, delivered };
	}
};

function safeJson(raw) {
	try {
		const parsed = JSON.parse(raw ?? '[]');
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

export default apiKeyService;
