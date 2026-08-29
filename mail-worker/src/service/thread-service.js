import orm from '../entity/orm';
import email from '../entity/email';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';

// Conversation grouping.
//
// RFC 5322 gives a reply chain through In-Reply-To and References. The first id
// in References is the root of the conversation, so using it as thread_id makes
// every message in a chain agree on a key without a recursive lookup.

/**
 * Pick a stable conversation key for a parsed inbound message.
 *
 * References is a space-separated list, oldest first - its head is the thread
 * root. Falling back to In-Reply-To handles clients that omit References, and
 * falling back to the message's own id starts a new thread.
 */
export function deriveThreadId({ references, inReplyTo, messageId }) {

	const refs = String(references ?? '')
		.split(/\s+/)
		.map(r => r.trim())
		.filter(Boolean);

	if (refs.length > 0) {
		return refs[0];
	}

	if (inReplyTo) {
		return String(inReplyTo).trim();
	}

	if (messageId) {
		return String(messageId).trim();
	}

	return '';
}

const threadService = {

	deriveThreadId,

	/** Every message in one conversation, oldest first, scoped to the user. */
	async messages(c, threadId, userId) {

		if (!threadId) {
			return [];
		}

		return orm(c).select().from(email)
			.where(and(
				eq(email.userId, userId),
				eq(email.threadId, threadId),
				eq(email.isDel, 0)
			))
			.orderBy(asc(email.emailId))
			.all();
	},

	/**
	 * Collapse a page of messages into conversation rows.
	 *
	 * Done in JS over an already-fetched page rather than as a GROUP BY, because
	 * the list endpoint pages by email_id: grouping in SQL would need a second
	 * pass over the whole table per page, which the D1 free-tier read budget
	 * cannot afford.
	 */
	group(rows) {

		const threads = new Map();

		for (const row of rows) {
			const key = row.threadId || `e${row.emailId}`;
			const existing = threads.get(key);

			if (!existing) {
				threads.set(key, {
					threadId: key,
					latest: row,
					count: 1,
					unread: row.unread === 0 ? 1 : 0,
					participants: [row.name || row.sendEmail].filter(Boolean)
				});
				continue;
			}

			existing.count++;
			if (row.unread === 0) existing.unread++;

			// Rows arrive newest-first, so the first one seen is the latest.
			const who = row.name || row.sendEmail;
			if (who && !existing.participants.includes(who)) {
				existing.participants.push(who);
			}
		}

		return [...threads.values()];
	},

	/** Mark a whole conversation read in one write. */
	async markRead(c, threadId, userId) {
		await orm(c).update(email).set({ unread: 1 })
			.where(and(eq(email.userId, userId), eq(email.threadId, threadId)))
			.run();
	},

	async deleteThreads(c, threadIds, userId) {

		if (!threadIds?.length) {
			return 0;
		}

		const rows = await orm(c).update(email).set({ isDel: 1 })
			.where(and(eq(email.userId, userId), inArray(email.threadId, threadIds)))
			.returning({ emailId: email.emailId }).all();

		return rows.length;
	}
};

export default threadService;
