import { env } from 'cloudflare:test';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import contactService from '../src/service/contact-service';
import { parseIcs, parseDate, parseLine, unfold, buildReply } from '../src/utils/ics-utils';
import { dbInit } from '../src/init/init';

const c = { env };
const USER = 1;
const OTHER = 2;

function initContext(secret) {
	const store = new Map();
	return {
		env,
		req: { param: () => secret },
		set: (k, v) => store.set(k, v),
		get: (k) => store.get(k),
		text: (body, status = 200) => ({ body, status })
	};
}

const INVITE = [
	'BEGIN:VCALENDAR',
	'VERSION:2.0',
	'METHOD:REQUEST',
	'BEGIN:VEVENT',
	'UID:abc-123@example.com',
	'SUMMARY:Quarterly review',
	'DTSTART:20240315T090000Z',
	'DTEND:20240315T100000Z',
	'LOCATION:Room 2',
	'ORGANIZER;CN=Alice:mailto:alice@example.com',
	'ATTENDEE;CN=Bob;PARTSTAT=NEEDS-ACTION:mailto:bob@example.com',
	'END:VEVENT',
	'END:VCALENDAR'
].join('\r\n');

describe('iCalendar parsing', () => {

	it('unfolds continuation lines', () => {
		// RFC 5545 folds long values; a naive split would lose half the summary.
		expect(unfold('SUMMARY:Hello\r\n  world')).toBe('SUMMARY:Hello world');
	});

	it('does not treat a colon inside a quoted parameter as the separator', () => {
		const line = parseLine('DTSTART;TZID="Europe/Berlin:extra":20240101T090000');
		expect(line.name).toBe('DTSTART');
		expect(line.params.TZID).toBe('Europe/Berlin:extra');
		expect(line.value).toBe('20240101T090000');
	});

	it('unescapes the text escapes iCalendar requires', () => {
		expect(parseLine('SUMMARY:a\\, b\\; c\\nd').value).toBe('a, b; c\nd');
	});

	it('reads UTC, floating and date-only times', () => {
		expect(parseDate('20240315T090000Z')).toMatchObject({ value: '2024-03-15 09:00:00', utc: true });
		expect(parseDate('20240315T090000', { TZID: 'Europe/Berlin' }))
			.toMatchObject({ value: '2024-03-15 09:00:00', tzid: 'Europe/Berlin' });
		expect(parseDate('20240315')).toMatchObject({ value: '2024-03-15 00:00:00', allDay: true });
	});

	it('returns empty rather than throwing on a malformed date', () => {
		expect(parseDate('tomorrow')).toMatchObject({ value: '' });
	});

	it('extracts an invitation', () => {
		const { method, events } = parseIcs(INVITE);

		expect(method).toBe('REQUEST');
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			uid: 'abc-123@example.com',
			title: 'Quarterly review',
			startAt: '2024-03-15 09:00:00',
			endAt: '2024-03-15 10:00:00',
			location: 'Room 2',
			organizer: 'alice@example.com'
		});
		expect(events[0].attendees[0]).toMatchObject({ address: 'bob@example.com', name: 'Bob' });
	});

	it('marks a cancellation from METHOD, which is where clients put it', () => {
		const cancelled = INVITE.replace('METHOD:REQUEST', 'METHOD:CANCEL');
		expect(parseIcs(cancelled).events[0].status).toBe('cancelled');
	});

	it('survives a document with no VEVENT', () => {
		expect(parseIcs('BEGIN:VCALENDAR\r\nEND:VCALENDAR')).toMatchObject({ events: [] });
		expect(parseIcs('total garbage')).toMatchObject({ events: [] });
		expect(parseIcs('')).toMatchObject({ events: [] });
	});

	it('builds a REPLY that names the response', () => {
		const reply = buildReply({
			uid: 'abc-123', organizer: 'alice@example.com',
			attendee: 'bob@example.com', response: 'accepted', title: 'Review'
		});

		expect(reply).toContain('METHOD:REPLY');
		expect(reply).toContain('PARTSTAT=ACCEPTED');
		expect(reply).toContain('UID:abc-123');
	});
});

describe('contacts', () => {

	beforeAll(async () => {
		await dbInit.init(initContext(env.init_secret));
	});

	beforeEach(async () => {
		await env.db.prepare('DELETE FROM contact').run();
		await env.db.prepare('DELETE FROM calendar_event').run();
		await env.db.prepare('DELETE FROM task').run();
	});

	it('requires an email address', async () => {
		await expect(contactService.upsert(c, { name: 'Nobody' }, USER)).rejects.toThrow(/email is required/);
	});

	it('normalises the address so case does not create a duplicate', async () => {
		await contactService.upsert(c, { email: 'Bob@Example.com', name: 'Bob' }, USER);
		await contactService.upsert(c, { email: 'bob@example.com', name: 'Bobby' }, USER);

		const rows = await contactService.list(c, {}, USER);
		expect(rows).toHaveLength(1);
		expect(rows[0].name).toBe('Bobby');
	});

	it('keeps each user\'s address book separate', async () => {
		await contactService.upsert(c, { email: 'shared@example.com', name: 'Mine' }, USER);
		await contactService.upsert(c, { email: 'shared@example.com', name: 'Theirs' }, OTHER);

		expect((await contactService.list(c, {}, USER))[0].name).toBe('Mine');
		expect((await contactService.list(c, {}, OTHER))[0].name).toBe('Theirs');
	});

	it('will not let one user edit or delete another\'s contact', async () => {
		const row = await contactService.upsert(c, { email: 'a@example.com' }, USER);

		await expect(contactService.upsert(c, { contactId: row.contactId, email: 'b@example.com' }, OTHER))
			.rejects.toThrow(/not found/);
		await expect(contactService.remove(c, row.contactId, OTHER)).rejects.toThrow(/not found/);
	});

	it('learns addresses from sending and counts repeat use', async () => {
		await contactService.touch(c, ['a@example.com', 'b@example.com'], USER);
		await contactService.touch(c, ['a@example.com'], USER);

		const rows = await contactService.list(c, {}, USER);

		expect(rows).toHaveLength(2);
		// Most-used first, so autocomplete surfaces who you actually write to.
		expect(rows[0].email).toBe('a@example.com');
		expect(rows[0].useCount).toBe(2);
	});

	it('deduplicates addresses within one send', async () => {
		await contactService.touch(c, ['x@example.com', 'X@example.com', 'x@example.com'], USER);

		const rows = await contactService.list(c, {}, USER);
		expect(rows).toHaveLength(1);
		expect(rows[0].useCount).toBe(1);
	});

	it('searches name, address and company', async () => {
		await contactService.upsert(c, { email: 'ceo@acme.com', name: 'Jane', company: 'Acme' }, USER);
		await contactService.upsert(c, { email: 'other@x.com', name: 'Bob' }, USER);

		expect(await contactService.list(c, { keyword: 'acme' }, USER)).toHaveLength(1);
		expect(await contactService.list(c, { keyword: 'Jane' }, USER)).toHaveLength(1);
		expect(await contactService.list(c, { keyword: 'nope' }, USER)).toHaveLength(0);
	});
});

describe('calendar', () => {

	beforeAll(async () => {
		await dbInit.init(initContext(env.init_secret));
	});

	beforeEach(async () => {
		await env.db.prepare('DELETE FROM calendar_event').run();
	});

	it('imports an invitation', async () => {
		const saved = await contactService.importIcs(c, INVITE, USER, 42);

		expect(saved).toHaveLength(1);
		expect(saved[0]).toMatchObject({ title: 'Quarterly review', emailId: 42 });
	});

	it('an updated invitation replaces the original instead of duplicating it', async () => {
		await contactService.importIcs(c, INVITE, USER);
		await contactService.importIcs(c, INVITE.replace('Quarterly review', 'Quarterly review (moved)'), USER);

		const events = await contactService.listEvents(c, {}, USER);
		expect(events).toHaveLength(1);
		expect(events[0].title).toBe('Quarterly review (moved)');
	});

	it('the same UID for two users is two separate events', async () => {
		await contactService.importIcs(c, INVITE, USER);
		await contactService.importIcs(c, INVITE, OTHER);

		expect(await contactService.listEvents(c, {}, USER)).toHaveLength(1);
		expect(await contactService.listEvents(c, {}, OTHER)).toHaveLength(1);
	});

	it('skips an event with no UID or no start time', async () => {
		const noUid = INVITE.replace('UID:abc-123@example.com\r\n', '');
		const noStart = INVITE.replace('DTSTART:20240315T090000Z\r\n', '');

		expect(await contactService.importIcs(c, noUid, USER)).toEqual([]);
		expect(await contactService.importIcs(c, noStart, USER)).toEqual([]);
	});

	it('filters events by date range', async () => {
		await contactService.importIcs(c, INVITE, USER);

		expect(await contactService.listEvents(c, { since: '2024-03-01', until: '2024-03-31' }, USER)).toHaveLength(1);
		expect(await contactService.listEvents(c, { since: '2024-04-01' }, USER)).toHaveLength(0);
	});

	it('records a response and rejects an invented one', async () => {
		const [event] = await contactService.importIcs(c, INVITE, USER);

		const updated = await contactService.respondToEvent(c, event.eventId, 'accepted', USER);
		expect(updated.response).toBe('accepted');

		await expect(contactService.respondToEvent(c, event.eventId, 'maybe-ish', USER))
			.rejects.toThrow(/accepted, declined or tentative/);
	});

	it('will not let one user answer another\'s invitation', async () => {
		const [event] = await contactService.importIcs(c, INVITE, USER);
		await expect(contactService.respondToEvent(c, event.eventId, 'accepted', OTHER)).rejects.toThrow(/not found/);
	});
});

describe('tasks', () => {

	beforeAll(async () => {
		await dbInit.init(initContext(env.init_secret));
	});

	beforeEach(async () => {
		await env.db.prepare('DELETE FROM task').run();
	});

	it('requires a title', async () => {
		await expect(contactService.upsertTask(c, { title: '  ' }, USER)).rejects.toThrow(/title is required/);
	});

	it('hides completed tasks unless asked for', async () => {
		const open = await contactService.upsertTask(c, { title: 'Open' }, USER);
		const done = await contactService.upsertTask(c, { title: 'Done' }, USER);
		await contactService.upsertTask(c, { taskId: done.taskId, title: 'Done', done: 1 }, USER);

		const visible = await contactService.listTasks(c, {}, USER);
		expect(visible.map(t => t.taskId)).toEqual([open.taskId]);

		expect(await contactService.listTasks(c, { includeDone: '1' }, USER)).toHaveLength(2);
	});

	it('links a task back to the message it came from', async () => {
		const row = await contactService.upsertTask(c, { title: 'Reply to Bob', emailId: 77 }, USER);
		expect(row.emailId).toBe(77);
	});

	it('will not let one user touch another\'s task', async () => {
		const row = await contactService.upsertTask(c, { title: 'Mine' }, USER);

		await expect(contactService.upsertTask(c, { taskId: row.taskId, title: 'Theirs' }, OTHER))
			.rejects.toThrow(/not found/);
		await expect(contactService.removeTask(c, row.taskId, OTHER)).rejects.toThrow(/not found/);
	});
});
