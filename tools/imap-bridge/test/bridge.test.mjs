// Run: node --test tools/imap-bridge/test/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import {
	toRfc822, parseSubmission, splitAddresses, encodeHeaderWord, decodeHeaderWord, foldHeader
} from '../lib/mime.mjs';
import { createImapServer } from '../lib/imap-server.mjs';
import { createSmtpServer } from '../lib/smtp-server.mjs';

// ---- MIME ---------------------------------------------------------------

test('renders a stored message as a parseable RFC 5322 document', () => {
	const raw = toRfc822({
		emailId: 7,
		sendEmail: 'alice@example.com',
		name: 'Alice',
		toEmail: 'bob@example.com',
		subject: 'Hello',
		text: 'Plain body',
		createTime: '2024-03-15 09:00:00'
	});

	assert.match(raw, /^Message-ID: /m);
	assert.match(raw, /^From: Alice <alice@example\.com>$/m);
	assert.match(raw, /^To: bob@example\.com$/m);
	assert.match(raw, /^Subject: Hello$/m);
	assert.match(raw, /charset=utf-8/);
	// Headers and body separated by a blank line, CRLF throughout.
	assert.ok(raw.includes('\r\n\r\nPlain body'));
});

test('sends both parts as multipart/alternative when both exist', () => {
	const raw = toRfc822({
		emailId: 1, sendEmail: 'a@b.com', subject: 's',
		text: 'plain', content: '<p>rich</p>'
	});

	assert.match(raw, /Content-Type: multipart\/alternative; boundary="cm-1-/);
	assert.ok(raw.includes('text/plain'));
	assert.ok(raw.includes('text/html'));
	assert.ok(raw.includes('plain'));
	assert.ok(raw.includes('<p>rich</p>'));
});

test('encodes a non-ASCII subject and leaves ASCII alone', () => {
	// Encoding unconditionally would make every subject unreadable in a dump.
	assert.equal(encodeHeaderWord('Plain subject'), 'Plain subject');

	const encoded = encodeHeaderWord('Merhaba dünya');
	assert.match(encoded, /^=\?UTF-8\?B\?/);
	assert.equal(decodeHeaderWord(encoded), 'Merhaba dünya');
});

test('decodes both base64 and quoted-printable encoded words', () => {
	assert.equal(decodeHeaderWord('=?UTF-8?B?SGVsbG8=?='), 'Hello');
	assert.equal(decodeHeaderWord('=?UTF-8?Q?Hello_World?='), 'Hello World');
	// A malformed word is shown raw rather than dropped.
	assert.ok(decodeHeaderWord('=?UTF-8?B?!!!?=').length > 0);
});

test('folds a long header instead of emitting one huge line', () => {
	const folded = foldHeader(Array.from({length: 40}, (_, i) => `word${i}`).join(' '));
	assert.ok(folded.includes('\r\n '));
	for (const line of folded.split('\r\n')) {
		assert.ok(line.length <= 79, `line too long: ${line.length}`);
	}
});

test('splits addresses without breaking on a comma inside a display name', () => {
	assert.deepEqual(
		splitAddresses('"Smith, John" <john@a.com>, jane@b.com'),
		['john@a.com', 'jane@b.com']
	);
	assert.deepEqual(splitAddresses(''), []);
	assert.deepEqual(splitAddresses(undefined), []);
});

test('parses a submitted message, unfolding headers first', () => {
	const raw = [
		'From: me@example.com',
		'To: one@x.com,',
		' two@x.com',
		'Subject: =?UTF-8?B?U2VsYW0=?=',
		'Content-Type: text/html; charset=utf-8',
		'',
		'<p>body</p>'
	].join('\r\n');

	const parsed = parseSubmission(raw);

	// A folded To: line carries recipients that a naive split would lose.
	assert.deepEqual(parsed.to, ['one@x.com', 'two@x.com']);
	assert.equal(parsed.subject, 'Selam');
	assert.equal(parsed.html, '<p>body</p>');
	assert.equal(parsed.text, '');
});

test('treats a message with no content-type as plain text', () => {
	const parsed = parseSubmission('To: a@b.com\r\nSubject: hi\r\n\r\njust text');
	assert.equal(parsed.text, 'just text');
	assert.equal(parsed.html, '');
});

// ---- protocol servers ---------------------------------------------------

/** Start a server on an ephemeral port and return a line-oriented client. */
async function connect(server) {
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

	const {port} = server.address();
	const socket = net.createConnection(port, '127.0.0.1');
	socket.setEncoding('utf8');

	let buffer = '';
	const waiters = [];

	socket.on('data', (chunk) => {
		buffer += chunk;
		while (waiters.length && waiters[0].test(buffer)) {
			waiters.shift().resolve(buffer);
			buffer = '';
		}
	});

	return {
		send: (line) => socket.write(line + '\r\n'),
		/** Resolve once the accumulated output matches. */
		until: (pattern) => new Promise((resolve, reject) => {
			const test = (text) => pattern.test(text);
			if (test(buffer)) {
				const out = buffer;
				buffer = '';
				return resolve(out);
			}
			const timer = setTimeout(() => reject(new Error(`timeout waiting for ${pattern}, got: ${buffer}`)), 3000);
			waiters.push({test, resolve: (text) => { clearTimeout(timer); resolve(text); }});
		}),
		close: () => { socket.destroy(); server.close(); }
	};
}

test('imap refuses everything before login', async () => {
	const client = await connect(createImapServer({baseUrl: 'http://127.0.0.1:1'}));

	await client.until(/\* OK/);
	client.send('a1 LIST "" "*"');
	assert.match(await client.until(/a1 /), /a1 NO Not authenticated/);

	client.close();
});

test('imap answers CAPABILITY without authentication', async () => {
	const client = await connect(createImapServer({baseUrl: 'http://127.0.0.1:1'}));

	await client.until(/\* OK/);
	client.send('a1 CAPABILITY');

	const reply = await client.until(/a1 OK/);
	assert.match(reply, /IMAP4rev1/);

	client.close();
});

test('imap refuses writes honestly rather than pretending they worked', async () => {
	// A client told a flag was stored stops showing the message as unread when
	// it still is - a fake OK is worse than a refusal.
	const client = await connect(createImapServer({baseUrl: 'http://127.0.0.1:1'}));

	await client.until(/\* OK/);

	for (const [i, command] of ['STORE 1 +FLAGS (\\Seen)', 'EXPUNGE', 'DELETE INBOX'].entries()) {
		client.send(`w${i} ${command}`);
		assert.match(await client.until(new RegExp(`w${i} `)), /NO This bridge is read-only/);
	}

	client.close();
});

test('imap rejects a bad key instead of hanging', async () => {
	const client = await connect(createImapServer({baseUrl: 'http://127.0.0.1:1'}));

	await client.until(/\* OK/);
	client.send('a1 LOGIN user cm_not_a_real_key');

	assert.match(await client.until(/a1 /), /a1 NO LOGIN failed/);

	client.close();
});

test('smtp will not accept mail from an unauthenticated client', async () => {
	const client = await connect(createSmtpServer({baseUrl: 'http://127.0.0.1:1'}));

	await client.until(/^220 /);
	client.send('EHLO test');
	assert.match(await client.until(/250 SMTPUTF8/), /AUTH PLAIN LOGIN/);

	client.send('MAIL FROM:<me@example.com>');
	assert.match(await client.until(/\d{3} /), /530 Authentication required/);

	client.send('RCPT TO:<you@example.com>');
	assert.match(await client.until(/\d{3} /), /530 Authentication required/);

	client.send('DATA');
	assert.match(await client.until(/\d{3} /), /530 Authentication required/);

	client.close();
});

test('smtp rejects credentials the worker does not accept', async () => {
	const client = await connect(createSmtpServer({baseUrl: 'http://127.0.0.1:1'}));

	await client.until(/^220 /);
	client.send('EHLO test');
	await client.until(/250 SMTPUTF8/);

	const payload = Buffer.from(`\0user\0cm_bad`).toString('base64');
	client.send(`AUTH PLAIN ${payload}`);

	assert.match(await client.until(/\d{3} /), /535 Authentication credentials invalid/);

	client.close();
});

test('smtp supports the multi-step LOGIN exchange', async () => {
	const client = await connect(createSmtpServer({baseUrl: 'http://127.0.0.1:1'}));

	await client.until(/^220 /);
	client.send('EHLO test');
	await client.until(/250 SMTPUTF8/);

	client.send('AUTH LOGIN');
	assert.match(await client.until(/334 /), /334 VXNlcm5hbWU6/);

	client.send(Buffer.from('user').toString('base64'));
	assert.match(await client.until(/334 /), /334 UGFzc3dvcmQ6/);

	client.send(Buffer.from('cm_bad').toString('base64'));
	assert.match(await client.until(/\d{3} /), /535 /);

	client.close();
});
