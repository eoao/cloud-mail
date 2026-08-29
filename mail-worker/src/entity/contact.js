import { sqliteTable, text, integer, index, unique } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const contact = sqliteTable('contact', {
	contactId: integer('contact_id').primaryKey({ autoIncrement: true }),
	userId: integer('user_id').notNull(),
	name: text('name').notNull().default(''),
	email: text('email').notNull(),
	phone: text('phone').notNull().default(''),
	company: text('company').notNull().default(''),
	notes: text('notes').notNull().default(''),
	groupName: text('group_name').notNull().default(''),
	// Bumped every time we see the address, so autocomplete can rank by use.
	useCount: integer('use_count').notNull().default(0),
	lastUsed: text('last_used').notNull().default(''),
	createTime: text('create_time').default(sql`CURRENT_TIMESTAMP`).notNull()
}, (table) => ([
	// One row per address per user - the natural key for "remember this contact".
	unique('uq_contact_user_email').on(table.userId, table.email),
	index('idx_contact_user').on(table.userId, table.groupName)
]));

export const calendarEvent = sqliteTable('calendar_event', {
	eventId: integer('event_id').primaryKey({ autoIncrement: true }),
	userId: integer('user_id').notNull(),
	// The iCalendar UID, so a later REQUEST/CANCEL updates rather than duplicates.
	uid: text('uid').notNull().default(''),
	title: text('title').notNull().default(''),
	description: text('description').notNull().default(''),
	location: text('location').notNull().default(''),
	startAt: text('start_at').notNull().default(''),
	endAt: text('end_at').notNull().default(''),
	allDay: integer('all_day').notNull().default(0),
	organizer: text('organizer').notNull().default(''),
	attendees: text('attendees').notNull().default('[]'),
	status: text('status').notNull().default('confirmed'),
	response: text('response').notNull().default(''),
	emailId: integer('email_id').notNull().default(0),
	createTime: text('create_time').default(sql`CURRENT_TIMESTAMP`).notNull()
}, (table) => ([
	unique('uq_event_user_uid').on(table.userId, table.uid),
	index('idx_event_user_start').on(table.userId, table.startAt)
]));

export const task = sqliteTable('task', {
	taskId: integer('task_id').primaryKey({ autoIncrement: true }),
	userId: integer('user_id').notNull(),
	title: text('title').notNull(),
	notes: text('notes').notNull().default(''),
	done: integer('done').notNull().default(0),
	dueAt: text('due_at').notNull().default(''),
	// Set when the task was created from a message, so it can link back.
	emailId: integer('email_id').notNull().default(0),
	createTime: text('create_time').default(sql`CURRENT_TIMESTAMP`).notNull()
}, (table) => ([
	index('idx_task_user').on(table.userId, table.done, table.dueAt)
]));

export default contact;
