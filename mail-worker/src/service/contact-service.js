import orm from '../entity/orm';
import { contact, calendarEvent, task } from '../entity/contact';
import { and, asc, desc, eq, like, or, sql } from 'drizzle-orm';
import dayjs from 'dayjs';
import BizError from '../error/biz-error';
import { parseIcs } from '../utils/ics-utils';

// Address book, calendar and tasks. All three are per-user and every query is
// scoped by userId - none of them accept a caller-supplied owner.

const now = () => dayjs().format('YYYY-MM-DD HH:mm:ss');
const normalise = (email) => String(email ?? '').trim().toLowerCase();

const contactService = {

	// ---- contacts -------------------------------------------------------

	async list(c, params, userId) {

		const { keyword, groupName, size = 100 } = params ?? {};
		const limit = Math.min(Number(size) || 100, 500);

		let query = orm(c).select().from(contact).where(eq(contact.userId, userId));

		if (keyword) {
			const term = `%${keyword}%`;
			query = orm(c).select().from(contact).where(and(
				eq(contact.userId, userId),
				or(like(contact.name, term), like(contact.email, term), like(contact.company, term))
			));
		} else if (groupName) {
			query = orm(c).select().from(contact)
				.where(and(eq(contact.userId, userId), eq(contact.groupName, groupName)));
		}

		// Most-used first: an address book is only useful if the people you
		// actually write to are at the top.
		return query.orderBy(desc(contact.useCount), asc(contact.name)).limit(limit).all();
	},

	async upsert(c, params, userId) {

		const email = normalise(params.email);

		if (!email) {
			throw new BizError('email is required', 400);
		}

		const values = {
			name: String(params.name ?? '').slice(0, 120),
			email,
			phone: String(params.phone ?? '').slice(0, 60),
			company: String(params.company ?? '').slice(0, 120),
			notes: String(params.notes ?? '').slice(0, 2000),
			groupName: String(params.groupName ?? '').slice(0, 60)
		};

		if (params.contactId) {
			const row = await orm(c).update(contact).set(values)
				.where(and(eq(contact.contactId, Number(params.contactId)), eq(contact.userId, userId)))
				.returning().get();

			if (!row) {
				throw new BizError('contact not found', 404);
			}

			return row;
		}

		// The (user, email) unique index makes this idempotent, so saving an
		// address twice updates rather than erroring.
		return orm(c).insert(contact).values({ ...values, userId })
			.onConflictDoUpdate({ target: [contact.userId, contact.email], set: values })
			.returning().get();
	},

	async remove(c, contactId, userId) {
		const row = await orm(c).delete(contact)
			.where(and(eq(contact.contactId, Number(contactId)), eq(contact.userId, userId)))
			.returning().get();

		if (!row) {
			throw new BizError('contact not found', 404);
		}

		return row;
	},

	/**
	 * Record that an address was written to. Creates the contact if it is new,
	 * so the address book fills itself from real use instead of needing to be
	 * typed in up front.
	 */
	async touch(c, addresses, userId) {

		const unique = [...new Set((addresses ?? []).map(normalise).filter(Boolean))].slice(0, 50);

		for (const email of unique) {
			await orm(c).insert(contact)
				.values({ userId, email, name: '', useCount: 1, lastUsed: now() })
				.onConflictDoUpdate({
					target: [contact.userId, contact.email],
					set: { useCount: sql`${contact.useCount} + 1`, lastUsed: now() }
				})
				.run();
		}

		return unique.length;
	},

	// ---- calendar -------------------------------------------------------

	async listEvents(c, params, userId) {

		const { since, until } = params ?? {};
		const where = ['user_id = ?'];
		const binds = [userId];

		if (since) {
			where.push('start_at >= ?');
			binds.push(`${since} 00:00:00`);
		}

		if (until) {
			where.push('start_at <= ?');
			binds.push(`${until} 23:59:59`);
		}

		const { results } = await c.env.db.prepare(
			`SELECT event_id AS eventId, uid, title, description, location,
			        start_at AS startAt, end_at AS endAt, all_day AS allDay,
			        organizer, attendees, status, response, email_id AS emailId
			   FROM calendar_event
			  WHERE ${where.join(' AND ')}
			  ORDER BY start_at ASC
			  LIMIT 500`
		).bind(...binds).all();

		return (results ?? []).map(row => ({ ...row, attendees: safeJson(row.attendees) }));
	},

	/**
	 * Store the events in an invitation. Keyed on the iCalendar UID, so an
	 * updated or cancelled invitation replaces the original rather than piling
	 * up duplicates in the calendar.
	 */
	async importIcs(c, icsText, userId, emailId = 0) {

		const { events } = parseIcs(icsText);
		const saved = [];

		for (const event of events) {

			// Without a UID there is nothing to key an update on, and a start time
			// is the minimum needed to place it in a calendar.
			if (!event.uid || !event.startAt) {
				continue;
			}

			const values = {
				title: event.title,
				description: event.description,
				location: event.location,
				startAt: event.startAt,
				endAt: event.endAt,
				allDay: event.allDay,
				organizer: event.organizer,
				attendees: JSON.stringify(event.attendees ?? []),
				status: event.status,
				emailId
			};

			const row = await orm(c).insert(calendarEvent)
				.values({ ...values, userId, uid: event.uid })
				.onConflictDoUpdate({ target: [calendarEvent.userId, calendarEvent.uid], set: values })
				.returning().get();

			saved.push(row);
		}

		return saved;
	},

	async respondToEvent(c, eventId, response, userId) {

		if (!['accepted', 'declined', 'tentative'].includes(response)) {
			throw new BizError('response must be accepted, declined or tentative', 400);
		}

		const row = await orm(c).update(calendarEvent).set({ response })
			.where(and(eq(calendarEvent.eventId, Number(eventId)), eq(calendarEvent.userId, userId)))
			.returning().get();

		if (!row) {
			throw new BizError('event not found', 404);
		}

		return row;
	},

	async removeEvent(c, eventId, userId) {
		const row = await orm(c).delete(calendarEvent)
			.where(and(eq(calendarEvent.eventId, Number(eventId)), eq(calendarEvent.userId, userId)))
			.returning().get();

		if (!row) {
			throw new BizError('event not found', 404);
		}

		return row;
	},

	// ---- tasks ----------------------------------------------------------

	async listTasks(c, params, userId) {

		const includeDone = String(params?.includeDone ?? '') === '1';

		const where = includeDone
			? eq(task.userId, userId)
			: and(eq(task.userId, userId), eq(task.done, 0));

		return orm(c).select().from(task).where(where)
			.orderBy(asc(task.done), asc(task.dueAt), desc(task.taskId))
			.limit(500).all();
	},

	async upsertTask(c, params, userId) {

		if (!params.title?.trim()) {
			throw new BizError('title is required', 400);
		}

		const values = {
			title: params.title.trim().slice(0, 300),
			notes: String(params.notes ?? '').slice(0, 5000),
			done: Number(params.done) ? 1 : 0,
			dueAt: String(params.dueAt ?? ''),
			emailId: Number(params.emailId) || 0
		};

		if (params.taskId) {
			const row = await orm(c).update(task).set(values)
				.where(and(eq(task.taskId, Number(params.taskId)), eq(task.userId, userId)))
				.returning().get();

			if (!row) {
				throw new BizError('task not found', 404);
			}

			return row;
		}

		return orm(c).insert(task).values({ ...values, userId }).returning().get();
	},

	async removeTask(c, taskId, userId) {
		const row = await orm(c).delete(task)
			.where(and(eq(task.taskId, Number(taskId)), eq(task.userId, userId)))
			.returning().get();

		if (!row) {
			throw new BizError('task not found', 404);
		}

		return row;
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

export default contactService;
