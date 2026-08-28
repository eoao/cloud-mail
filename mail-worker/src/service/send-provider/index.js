import orm from '../../entity/orm';
import sendProvider from '../../entity/send-provider';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import dayjs from 'dayjs';
import { getDriver, listDrivers } from './drivers';

// Provider registry: picks a driver per sending domain, in priority order, and
// fails over to the next one when a send fails for a transport reason.
//
// Configuration lives in the send_provider table rather than env vars so it can
// be edited from the admin panel, and so several domains can use different
// providers at the same time.

const today = () => dayjs().format('YYYY-MM-DD');

const providerService = {

	listDrivers,

	async listAll(c) {
		const rows = await orm(c).select().from(sendProvider)
			.orderBy(asc(sendProvider.domain), desc(sendProvider.priority)).all();

		// Never hand credentials back to the browser.
		return rows.map(row => ({ ...row, credentials: maskCredentials(row.credentials) }));
	},

	/** Enabled providers for one domain, best first, quota-exhausted ones dropped. */
	async candidatesFor(c, domain) {
		const rows = await orm(c).select().from(sendProvider)
			.where(and(eq(sendProvider.domain, domain), eq(sendProvider.enabled, 1)))
			.orderBy(desc(sendProvider.priority), asc(sendProvider.providerId)).all();

		return rows.filter(row => {
			if (!row.dailyLimit) return true;
			if (row.sentDate !== today()) return true;
			return row.sentToday < row.dailyLimit;
		});
	},

	async upsert(c, params) {
		const { providerId, domain, type, credentials, priority = 0, enabled = 1, dailyLimit = 0 } = params;

		if (!getDriver(type)) {
			throw new Error(`unknown provider type "${type}"`);
		}

		const values = {
			domain,
			type,
			priority: Number(priority) || 0,
			enabled: Number(enabled) ? 1 : 0,
			dailyLimit: Number(dailyLimit) || 0
		};

		// An omitted credentials object means "keep what is stored", so the admin
		// UI can save a row it only ever saw masked.
		if (credentials !== undefined) {
			values.credentials = JSON.stringify(credentials ?? {});
		}

		if (providerId) {
			return orm(c).update(sendProvider).set(values)
				.where(eq(sendProvider.providerId, Number(providerId))).returning().get();
		}

		return orm(c).insert(sendProvider).values({ credentials: '{}', ...values }).returning().get();
	},

	async remove(c, providerId) {
		return orm(c).delete(sendProvider)
			.where(eq(sendProvider.providerId, Number(providerId))).returning().get();
	},

	/**
	 * Send through the first provider for `domain` that accepts the message.
	 *
	 * Returns { providerMessageId, status, type }. Throws only when every
	 * candidate failed - the last error is preserved as the cause.
	 */
	async send(c, domain, params, buildAttachments) {

		const candidates = await this.candidatesFor(c, domain);

		if (candidates.length === 0) {
			const e = new Error(`no sending provider configured for ${domain}`);
			e.noProvider = true;
			throw e;
		}

		const attachmentCache = {};
		let lastError = null;

		for (const row of candidates) {

			const driver = getDriver(row.type);

			if (!driver) {
				lastError = new Error(`unknown provider type "${row.type}"`);
				continue;
			}

			if (driver.available && !driver.available(c)) {
				lastError = new Error(`${row.type} is configured but its binding is missing`);
				continue;
			}

			// Encoding attachments is the expensive part, so do it once per encoding
			// rather than once per provider attempt.
			const encoding = driver.attachmentEncoding ?? 'base64';
			attachmentCache[encoding] ??= await buildAttachments(encoding);

			const payload = {
				...params,
				base64Attachments: encoding === 'base64' ? attachmentCache[encoding] : [],
				bufferAttachments: encoding === 'buffer' ? attachmentCache[encoding] : []
			};

			try {
				const result = await driver.send(c, payload, parseCredentials(row.credentials));
				await this.recordSuccess(c, row, params.receiveEmail?.length ?? 1);
				return { ...result, type: row.type, providerId: row.providerId };
			} catch (e) {
				lastError = e;
				await this.recordError(c, row, e.message);

				// A rejected message (bad address, unverified domain) fails identically
				// everywhere, so stop instead of burning every provider's quota.
				if (e.retryable === false) {
					break;
				}
			}
		}

		throw lastError ?? new Error(`every sending provider for ${domain} failed`);
	},

	async recordSuccess(c, row, count) {
		const date = today();
		const sentToday = row.sentDate === date ? row.sentToday + count : count;

		await orm(c).update(sendProvider)
			.set({ sentToday, sentDate: date, lastError: '' })
			.where(eq(sendProvider.providerId, row.providerId)).run();
	},

	async recordError(c, row, message) {
		await orm(c).update(sendProvider)
			.set({ lastError: String(message).slice(0, 500) })
			.where(eq(sendProvider.providerId, row.providerId)).run();
	},

	/**
	 * One-time migration of the old setting.resend_tokens map ({domain: token})
	 * into provider rows, so existing installs keep sending after the upgrade.
	 */
	async importResendTokens(c, resendTokens = {}) {

		let imported = 0;

		for (const [domain, apiKey] of Object.entries(resendTokens)) {

			if (!apiKey) continue;

			const existing = await orm(c).select().from(sendProvider)
				.where(and(eq(sendProvider.domain, domain), eq(sendProvider.type, 'resend'))).get();

			if (existing) continue;

			await orm(c).insert(sendProvider).values({
				domain,
				type: 'resend',
				credentials: JSON.stringify({ apiKey }),
				priority: 0,
				enabled: 1
			}).run();

			imported++;
		}

		return imported;
	},

	/** DNS records the operator must add for a provider to be trusted. */
	dnsAdvice(type, domain, adminEmail) {
		const dmarc = {
			type: 'TXT',
			name: `_dmarc.${domain}`,
			content: `v=DMARC1; p=none; rua=mailto:${adminEmail || `postmaster@${domain}`}`,
			note: 'Safe default; tighten to p=quarantine once you trust your setup.'
		};

		const spf = {
			resend: 'include:amazonses.com',
			postmark: 'include:spf.mtasv.net',
			sendgrid: 'include:sendgrid.net',
			brevo: 'include:spf.brevo.com',
			mailgun: 'include:mailgun.org'
		}[type];

		const records = [dmarc];

		if (spf) {
			records.unshift({
				type: 'TXT',
				name: domain,
				content: `v=spf1 ${spf} ~all`,
				note: 'Merge into your existing SPF record - a domain may only have one.'
			});
		}

		records.push({
			type: 'CNAME/TXT',
			name: '(provider-specific)',
			content: '(copy from the provider dashboard)',
			note: 'DKIM keys are generated per account and cannot be predicted here.'
		});

		return records;
	}
};

function parseCredentials(raw) {
	try {
		return JSON.parse(raw || '{}');
	} catch {
		return {};
	}
}

function maskCredentials(raw) {
	const creds = parseCredentials(raw);
	const out = {};

	for (const [key, value] of Object.entries(creds)) {
		if (typeof value !== 'string' || value.length === 0) {
			out[key] = value;
		} else if (key === 'endpoint' || key === 'domain' || key === 'region' || key === 'messageStream') {
			out[key] = value;
		} else {
			out[key] = `${value.slice(0, 4)}${'*'.repeat(Math.max(0, Math.min(value.length - 4, 12)))}`;
		}
	}

	return out;
}

export default providerService;
