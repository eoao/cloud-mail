import orm from '../entity/orm';
import { label, emailLabel } from '../entity/label';
import email from '../entity/email';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import BizError from '../error/biz-error';

// Folders and labels. A message may carry many labels but sits in at most one
// folder, which is the only behavioural difference between the two kinds.

const KINDS = ['label', 'folder'];

const labelService = {

	async list(c, userId) {
		const rows = await orm(c).select().from(label)
			.where(eq(label.userId, userId))
			.orderBy(asc(label.kind), asc(label.sort), asc(label.labelId))
			.all();

		// Counts come from one grouped query rather than one per label.
		const { results } = await c.env.db.prepare(
			`SELECT el.label_id AS labelId, COUNT(*) AS total,
			        SUM(CASE WHEN e.unread = 0 THEN 1 ELSE 0 END) AS unread
			   FROM email_label el
			   JOIN email e ON e.email_id = el.email_id AND e.is_del = 0
			  WHERE el.user_id = ?
			  GROUP BY el.label_id`
		).bind(userId).all();

		const counts = new Map((results ?? []).map(r => [r.labelId, r]));

		return rows.map(row => ({
			...row,
			total: counts.get(row.labelId)?.total ?? 0,
			unread: counts.get(row.labelId)?.unread ?? 0
		}));
	},

	async upsert(c, params, userId) {

		const { labelId, name, color = '', kind = 'label', sort = 0 } = params;

		if (!name?.trim()) {
			throw new BizError('name is required', 400);
		}

		if (!KINDS.includes(kind)) {
			throw new BizError(`kind must be one of ${KINDS.join(', ')}`, 400);
		}

		const values = { name: name.trim().slice(0, 60), color, kind, sort: Number(sort) || 0 };

		if (labelId) {
			// Scoping the update by userId is what stops one user renaming another's.
			const row = await orm(c).update(label).set(values)
				.where(and(eq(label.labelId, Number(labelId)), eq(label.userId, userId)))
				.returning().get();

			if (!row) {
				throw new BizError('label not found', 404);
			}

			return row;
		}

		return orm(c).insert(label).values({ ...values, userId }).returning().get();
	},

	async remove(c, labelId, userId) {

		const row = await orm(c).delete(label)
			.where(and(eq(label.labelId, Number(labelId)), eq(label.userId, userId)))
			.returning().get();

		if (!row) {
			throw new BizError('label not found', 404);
		}

		// Assignments are meaningless once the label is gone.
		await orm(c).delete(emailLabel)
			.where(and(eq(emailLabel.labelId, Number(labelId)), eq(emailLabel.userId, userId)))
			.run();

		return row;
	},

	/** Attach or detach one label across many messages. */
	async assign(c, { emailIds, labelId, attach = true }, userId) {

		const ids = (emailIds ?? []).map(Number).filter(Boolean);

		if (ids.length === 0) {
			return 0;
		}

		const owned = await orm(c).select({ labelId: label.labelId, kind: label.kind }).from(label)
			.where(and(eq(label.labelId, Number(labelId)), eq(label.userId, userId))).get();

		if (!owned) {
			throw new BizError('label not found', 404);
		}

		// Only act on messages this user actually owns.
		const mine = await orm(c).select({ emailId: email.emailId }).from(email)
			.where(and(eq(email.userId, userId), inArray(email.emailId, ids))).all();

		const allowed = mine.map(r => r.emailId);

		if (allowed.length === 0) {
			return 0;
		}

		if (!attach) {
			await orm(c).delete(emailLabel)
				.where(and(
					eq(emailLabel.labelId, Number(labelId)),
					eq(emailLabel.userId, userId),
					inArray(emailLabel.emailId, allowed)
				)).run();
			return allowed.length;
		}

		// A message lives in one folder at a time, so moving clears the others.
		if (owned.kind === 'folder') {
			await c.env.db.prepare(
				`DELETE FROM email_label
				  WHERE user_id = ?
				    AND email_id IN (${allowed.map(() => '?').join(',')})
				    AND label_id IN (SELECT label_id FROM label WHERE user_id = ? AND kind = 'folder')`
			).bind(userId, ...allowed, userId).run();
		}

		await orm(c).insert(emailLabel)
			.values(allowed.map(emailId => ({ emailId, labelId: Number(labelId), userId })))
			.onConflictDoNothing()
			.run();

		return allowed.length;
	},

	/** Labels per message, for rendering chips in a list. */
	async forEmails(c, emailIds, userId) {

		const ids = (emailIds ?? []).map(Number).filter(Boolean);

		if (ids.length === 0) {
			return {};
		}

		const rows = await c.env.db.prepare(
			`SELECT el.email_id AS emailId, l.label_id AS labelId, l.name, l.color, l.kind
			   FROM email_label el
			   JOIN label l ON l.label_id = el.label_id
			  WHERE el.user_id = ? AND el.email_id IN (${ids.map(() => '?').join(',')})`
		).bind(userId, ...ids).all();

		const out = {};

		for (const row of rows.results ?? []) {
			(out[row.emailId] ??= []).push(row);
		}

		return out;
	}
};

export default labelService;
