import { env } from 'cloudflare:test';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import searchService, { toMatchExpression } from '../src/service/search-service';
import threadService, { deriveThreadId } from '../src/service/thread-service';
import labelService from '../src/service/label-service';
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

let nextId = 1000;

async function insertEmail(overrides = {}) {
	const row = {
		emailId: nextId++,
		userId: USER,
		accountId: 1,
		sendEmail: 'sender@example.com',
		name: 'Sender',
		subject: 'hello world',
		text: 'body text',
		toEmail: 'me@example.com',
		threadId: '',
		type: 0,
		unread: 0,
		isDel: 0,
		category: '',
		...overrides
	};

	await env.db.prepare(
		`INSERT INTO email (email_id, user_id, account_id, send_email, name, subject, text,
		                    to_email, thread_id, type, unread, is_del, category)
		 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
	).bind(row.emailId, row.userId, row.accountId, row.sendEmail, row.name, row.subject,
		row.text, row.toEmail, row.threadId, row.type, row.unread, row.isDel, row.category).run();

	return row;
}

describe('thread derivation', () => {

	it('uses the first References entry as the conversation root', () => {
		expect(deriveThreadId({
			references: '<root@a.com> <second@a.com> <third@a.com>',
			inReplyTo: '<third@a.com>',
			messageId: '<fourth@a.com>'
		})).toBe('<root@a.com>');
	});

	it('falls back to In-Reply-To when References is absent', () => {
		expect(deriveThreadId({ inReplyTo: '<parent@a.com>', messageId: '<mine@a.com>' }))
			.toBe('<parent@a.com>');
	});

	it('starts a new thread from the message id', () => {
		expect(deriveThreadId({ messageId: '<mine@a.com>' })).toBe('<mine@a.com>');
		expect(deriveThreadId({})).toBe('');
	});

	it('groups a page into conversations with counts and participants', () => {
		const grouped = threadService.group([
			{ emailId: 3, threadId: 't1', name: 'Bob', unread: 0 },
			{ emailId: 2, threadId: 't1', name: 'Alice', unread: 1 },
			{ emailId: 1, threadId: 't2', name: 'Carol', unread: 0 }
		]);

		expect(grouped).toHaveLength(2);
		expect(grouped[0]).toMatchObject({ threadId: 't1', count: 2, unread: 1 });
		expect(grouped[0].latest.emailId).toBe(3);
		expect(grouped[0].participants).toEqual(['Bob', 'Alice']);
	});

	it('gives an unthreaded message its own group', () => {
		const grouped = threadService.group([{ emailId: 7, threadId: '', name: 'X', unread: 1 }]);
		expect(grouped[0].threadId).toBe('e7');
	});
});

describe('search query building', () => {

	it('quotes terms so FTS5 syntax in user input is inert', () => {
		// Unquoted, these would be parsed as operators and either error or change
		// the meaning of the search.
		expect(toMatchExpression('AND OR')).toBe('"AND"* AND "OR"*');
		expect(toMatchExpression('a"b')).toBe('"a""b"*');
		expect(toMatchExpression('NEAR(x y)')).toContain('"NEAR(x"*');
	});

	it('requires every term', () => {
		expect(toMatchExpression('foo bar')).toBe('"foo"* AND "bar"*');
	});

	it('returns nothing for an empty query so the caller can skip MATCH', () => {
		expect(toMatchExpression('')).toBe('');
		expect(toMatchExpression('   ')).toBe('');
		expect(toMatchExpression(null)).toBe('');
	});

	it('caps the number of terms', () => {
		const many = Array.from({ length: 40 }, (_, i) => `t${i}`).join(' ');
		expect(toMatchExpression(many).split(' AND ')).toHaveLength(12);
	});
});

describe('search execution', () => {

	beforeAll(async () => {
		await dbInit.init(initContext(env.init_secret));
	});

	beforeEach(async () => {
		await env.db.prepare('DELETE FROM email').run();
		await env.db.prepare('DELETE FROM email_label').run();
		await env.db.prepare('DELETE FROM label').run();
	});

	it('creates the fts table and its sync triggers', async () => {
		const { results } = await env.db.prepare(
			`SELECT name FROM sqlite_master WHERE name IN ('email_fts','email_fts_ai','email_fts_ad','email_fts_au')`
		).all();
		expect(results.map(r => r.name).sort())
			.toEqual(['email_fts', 'email_fts_ad', 'email_fts_ai', 'email_fts_au']);
	});

	it('finds a message by a word in its subject', async () => {
		await insertEmail({ subject: 'quarterly invoice attached' });
		await insertEmail({ subject: 'lunch plans' });

		const rows = await searchService.search(c, { keyword: 'invoice' }, USER);

		expect(rows).toHaveLength(1);
		expect(rows[0].subject).toContain('invoice');
	});

	it('matches on a prefix, like a search box implies', async () => {
		await insertEmail({ subject: 'deployment notes' });
		expect(await searchService.search(c, { keyword: 'deploy' }, USER)).toHaveLength(1);
	});

	it('never returns another user\'s mail', async () => {
		await insertEmail({ subject: 'secret plans', userId: OTHER });
		expect(await searchService.search(c, { keyword: 'secret' }, USER)).toEqual([]);
	});

	it('excludes deleted mail', async () => {
		await insertEmail({ subject: 'gone forever', isDel: 1 });
		expect(await searchService.search(c, { keyword: 'gone' }, USER)).toEqual([]);
	});

	it('survives a query made of FTS5 operators', async () => {
		await insertEmail({ subject: 'normal message' });
		// Would throw "fts5: syntax error" if the query were interpolated raw.
		await expect(searchService.search(c, { keyword: 'AND OR NOT *' }, USER)).resolves.toEqual([]);
	});

	it('filters by sender without a keyword', async () => {
		await insertEmail({ sendEmail: 'billing@stripe.com' });
		await insertEmail({ sendEmail: 'friend@gmail.com' });

		const rows = await searchService.search(c, { from: 'stripe' }, USER);
		expect(rows).toHaveLength(1);
		expect(rows[0].sendEmail).toBe('billing@stripe.com');
	});

	it('combines a keyword with a filter', async () => {
		await insertEmail({ subject: 'invoice march', sendEmail: 'billing@stripe.com' });
		await insertEmail({ subject: 'invoice april', sendEmail: 'other@x.com' });

		const rows = await searchService.search(c, { keyword: 'invoice', from: 'stripe' }, USER);
		expect(rows).toHaveLength(1);
		expect(rows[0].subject).toContain('march');
	});

	it('pages with a descending keyset cursor', async () => {
		const a = await insertEmail({ subject: 'page one' });
		const b = await insertEmail({ subject: 'page two' });

		const first = await searchService.search(c, { keyword: 'page', size: 1 }, USER);
		expect(first[0].emailId).toBe(b.emailId);

		const second = await searchService.search(c, { keyword: 'page', size: 1, emailId: b.emailId }, USER);
		expect(second[0].emailId).toBe(a.emailId);
	});

	it('keeps the index in step when a message is edited or deleted', async () => {
		const row = await insertEmail({ subject: 'original wording' });

		await env.db.prepare('UPDATE email SET subject = ? WHERE email_id = ?')
			.bind('replaced wording', row.emailId).run();

		expect(await searchService.search(c, { keyword: 'original' }, USER)).toEqual([]);
		expect(await searchService.search(c, { keyword: 'replaced' }, USER)).toHaveLength(1);

		await env.db.prepare('DELETE FROM email WHERE email_id = ?').bind(row.emailId).run();
		expect(await searchService.search(c, { keyword: 'replaced' }, USER)).toEqual([]);
	});
});

describe('labels and folders', () => {

	beforeAll(async () => {
		await dbInit.init(initContext(env.init_secret));
	});

	beforeEach(async () => {
		await env.db.prepare('DELETE FROM email').run();
		await env.db.prepare('DELETE FROM email_label').run();
		await env.db.prepare('DELETE FROM label').run();
	});

	it('rejects an unnamed label and an unknown kind', async () => {
		await expect(labelService.upsert(c, { name: '  ' }, USER)).rejects.toThrow(/name is required/);
		await expect(labelService.upsert(c, { name: 'x', kind: 'wat' }, USER)).rejects.toThrow(/kind must be/);
	});

	it('will not let one user rename or delete another\'s label', async () => {
		const row = await labelService.upsert(c, { name: 'Private' }, USER);

		await expect(labelService.upsert(c, { labelId: row.labelId, name: 'Stolen' }, OTHER))
			.rejects.toThrow(/not found/);
		await expect(labelService.remove(c, row.labelId, OTHER)).rejects.toThrow(/not found/);

		const [still] = await labelService.list(c, USER);
		expect(still.name).toBe('Private');
	});

	it('attaches a label and reports counts', async () => {
		const mail = await insertEmail({ unread: 0 });
		const tag = await labelService.upsert(c, { name: 'Finance', color: '#0af' }, USER);

		await labelService.assign(c, { emailIds: [mail.emailId], labelId: tag.labelId }, USER);

		const [listed] = await labelService.list(c, USER);
		expect(listed).toMatchObject({ name: 'Finance', total: 1, unread: 1 });
	});

	it('ignores messages the user does not own', async () => {
		const theirs = await insertEmail({ userId: OTHER });
		const tag = await labelService.upsert(c, { name: 'Mine' }, USER);

		expect(await labelService.assign(c, { emailIds: [theirs.emailId], labelId: tag.labelId }, USER)).toBe(0);
	});

	it('assigning twice does not duplicate the row', async () => {
		const mail = await insertEmail();
		const tag = await labelService.upsert(c, { name: 'Dup' }, USER);

		await labelService.assign(c, { emailIds: [mail.emailId], labelId: tag.labelId }, USER);
		await labelService.assign(c, { emailIds: [mail.emailId], labelId: tag.labelId }, USER);

		const [listed] = await labelService.list(c, USER);
		expect(listed.total).toBe(1);
	});

	it('a message can hold several labels but only one folder', async () => {
		const mail = await insertEmail();
		const l1 = await labelService.upsert(c, { name: 'Tag A' }, USER);
		const l2 = await labelService.upsert(c, { name: 'Tag B' }, USER);
		const f1 = await labelService.upsert(c, { name: 'Inbox', kind: 'folder' }, USER);
		const f2 = await labelService.upsert(c, { name: 'Archive', kind: 'folder' }, USER);

		await labelService.assign(c, { emailIds: [mail.emailId], labelId: l1.labelId }, USER);
		await labelService.assign(c, { emailIds: [mail.emailId], labelId: l2.labelId }, USER);
		await labelService.assign(c, { emailIds: [mail.emailId], labelId: f1.labelId }, USER);
		await labelService.assign(c, { emailIds: [mail.emailId], labelId: f2.labelId }, USER);

		const attached = (await labelService.forEmails(c, [mail.emailId], USER))[mail.emailId];
		const names = attached.map(a => a.name).sort();

		expect(names).toEqual(['Archive', 'Tag A', 'Tag B']);
		expect(names).not.toContain('Inbox');
	});

	it('detaching removes only the named label', async () => {
		const mail = await insertEmail();
		const l1 = await labelService.upsert(c, { name: 'Keep' }, USER);
		const l2 = await labelService.upsert(c, { name: 'Drop' }, USER);

		await labelService.assign(c, { emailIds: [mail.emailId], labelId: l1.labelId }, USER);
		await labelService.assign(c, { emailIds: [mail.emailId], labelId: l2.labelId }, USER);
		await labelService.assign(c, { emailIds: [mail.emailId], labelId: l2.labelId, attach: false }, USER);

		const attached = (await labelService.forEmails(c, [mail.emailId], USER))[mail.emailId];
		expect(attached.map(a => a.name)).toEqual(['Keep']);
	});

	it('deleting a label clears its assignments', async () => {
		const mail = await insertEmail();
		const tag = await labelService.upsert(c, { name: 'Temp' }, USER);
		await labelService.assign(c, { emailIds: [mail.emailId], labelId: tag.labelId }, USER);

		await labelService.remove(c, tag.labelId, USER);

		expect(await labelService.forEmails(c, [mail.emailId], USER)).toEqual({});
	});

	it('search can filter to one label', async () => {
		const tagged = await insertEmail({ subject: 'tagged report' });
		await insertEmail({ subject: 'untagged report' });
		const tag = await labelService.upsert(c, { name: 'Reports' }, USER);
		await labelService.assign(c, { emailIds: [tagged.emailId], labelId: tag.labelId }, USER);

		const rows = await searchService.search(c, { keyword: 'report', labelId: tag.labelId }, USER);
		expect(rows).toHaveLength(1);
		expect(rows[0].emailId).toBe(tagged.emailId);
	});
});

describe('thread queries', () => {

	beforeAll(async () => {
		await dbInit.init(initContext(env.init_secret));
	});

	beforeEach(async () => {
		await env.db.prepare('DELETE FROM email').run();
	});

	it('returns a conversation oldest first and scoped to the user', async () => {
		await insertEmail({ threadId: 't1', subject: 'first' });
		await insertEmail({ threadId: 't1', subject: 'second' });
		await insertEmail({ threadId: 't1', subject: 'theirs', userId: OTHER });

		const rows = await threadService.messages(c, 't1', USER);

		expect(rows.map(r => r.subject)).toEqual(['first', 'second']);
	});

	it('marks a whole conversation read in one call', async () => {
		await insertEmail({ threadId: 't2', unread: 0 });
		await insertEmail({ threadId: 't2', unread: 0 });

		await threadService.markRead(c, 't2', USER);

		const rows = await threadService.messages(c, 't2', USER);
		expect(rows.every(r => r.unread === 1)).toBe(true);
	});

	it('soft-deletes every message in the named conversations', async () => {
		await insertEmail({ threadId: 't3' });
		await insertEmail({ threadId: 't3' });
		await insertEmail({ threadId: 't4' });

		expect(await threadService.deleteThreads(c, ['t3'], USER)).toBe(2);
		expect(await threadService.messages(c, 't3', USER)).toEqual([]);
		expect(await threadService.messages(c, 't4', USER)).toHaveLength(1);
	});

	it('does nothing for an empty thread id', async () => {
		expect(await threadService.messages(c, '', USER)).toEqual([]);
		expect(await threadService.deleteThreads(c, [], USER)).toBe(0);
	});
});
