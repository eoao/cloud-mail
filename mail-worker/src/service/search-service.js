import BizError from '../error/biz-error';

// Full-text search over the user's own mail, backed by the email_fts virtual
// table created in init.js.
//
// Two things matter here: the query is user input going into an FTS5 MATCH
// expression, and the result set must never leak another user's mail. The first
// is handled by tokenising and re-quoting rather than interpolating; the second
// by always joining back to email and filtering on user_id.

const MAX_TERMS = 12;

/**
 * Turn free text into a safe FTS5 MATCH expression.
 *
 * FTS5 treats ", *, ^, NEAR, AND/OR/NOT as syntax, so an unescaped query can
 * both error and change the meaning of the search. Every term is emitted as a
 * quoted string (with embedded quotes doubled), which FTS5 reads literally.
 */
export function toMatchExpression(raw) {

	const terms = String(raw ?? '')
		.split(/\s+/)
		.map(t => t.trim())
		.filter(Boolean)
		.slice(0, MAX_TERMS);

	if (terms.length === 0) {
		return '';
	}

	return terms
		.map(term => {
			const quoted = term.replace(/"/g, '""');
			// Trailing * gives prefix matching, which is what a search box implies.
			return `"${quoted}"*`;
		})
		.join(' AND ');
}

/** Column filters that map onto real, indexed columns. */
const FILTERS = {
	from: 'e.send_email LIKE ?',
	to: 'e.to_email LIKE ?',
	accountId: 'e.account_id = ?',
	type: 'e.type = ?',
	unread: 'e.unread = ?',
	category: 'e.category = ?'
};

const searchService = {

	toMatchExpression,

	/**
	 * @param params.keyword   free text
	 * @param params.from/to   substring match on the addresses
	 * @param params.hasAtt    only messages with attachments
	 * @param params.since/until  ISO dates, inclusive
	 * @param params.emailId   pagination cursor (exclusive, descending)
	 */
	async search(c, params, userId) {

		const match = toMatchExpression(params.keyword);
		const where = ['e.user_id = ?', 'e.is_del = 0'];
		const binds = [userId];

		if (match) {
			where.push('e.email_id IN (SELECT rowid FROM email_fts WHERE email_fts MATCH ?)');
			binds.push(match);
		}

		for (const [key, clause] of Object.entries(FILTERS)) {
			const value = params[key];
			if (value === undefined || value === null || value === '') continue;

			where.push(clause);
			binds.push(clause.includes('LIKE') ? `%${value}%` : value);
		}

		if (params.since) {
			where.push('e.create_time >= ?');
			binds.push(`${params.since} 00:00:00`);
		}

		if (params.until) {
			where.push('e.create_time <= ?');
			binds.push(`${params.until} 23:59:59`);
		}

		if (params.hasAtt) {
			where.push("EXISTS (SELECT 1 FROM attachments a WHERE a.email_id = e.email_id AND a.type = 0)");
		}

		if (params.labelId) {
			where.push('EXISTS (SELECT 1 FROM email_label el WHERE el.email_id = e.email_id AND el.label_id = ?)');
			binds.push(Number(params.labelId));
		}

		// Keyset pagination: cheaper than OFFSET and stable while new mail arrives.
		if (params.emailId) {
			where.push('e.email_id < ?');
			binds.push(Number(params.emailId));
		}

		const size = Math.min(Number(params.size) || 20, 100);

		const sql = `SELECT e.email_id AS emailId, e.send_email AS sendEmail, e.name, e.subject,
					        substr(e.text, 1, 200) AS text, e.to_email AS toEmail, e.to_name AS toName,
					        e.type, e.status, e.unread, e.thread_id AS threadId, e.category,
					        e.spam_verdict AS spamVerdict, e.create_time AS createTime
					   FROM email e
					  WHERE ${where.join(' AND ')}
					  ORDER BY e.email_id DESC
					  LIMIT ?`;

		try {
			const { results } = await c.env.db.prepare(sql).bind(...binds, size).all();
			return results ?? [];
		} catch (e) {
			// A missing email_fts means init has not run since the upgrade.
			if (String(e.message).includes('email_fts')) {
				throw new BizError('search index is missing - run the database init endpoint', 503);
			}
			throw e;
		}
	},

	/** Rebuild the FTS index from the email table. Runs as a queue job. */
	async rebuildIndex(c) {
		await c.env.db.prepare(`INSERT INTO email_fts(email_fts) VALUES ('rebuild')`).run();
		return { rebuilt: true };
	}
};

export default searchService;
