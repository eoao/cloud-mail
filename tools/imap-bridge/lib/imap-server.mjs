import net from 'node:net';
import { ApiClient } from './api-client.mjs';
import { toRfc822 } from './mime.mjs';

// A read-only IMAP4rev1 subset, backed by the worker's REST API.
//
// Scope is deliberate: enough for Thunderbird or Apple Mail to list and read
// mail, not a full IMAP server. Writes go through SMTP submission and the web
// UI, so the commands that would mutate state are answered honestly with NO
// rather than pretended.
//
// lc-debt: messages for a mailbox are fetched in one page and held for the
// session; a very large mailbox will be truncated to PAGE_SIZE. Paging the
// upstream API per FETCH range is the upgrade path.

const CRLF = '\r\n';
const PAGE_SIZE = 200;

export function createImapServer({ baseUrl, onLog = () => {} }) {

	return net.createServer((socket) => {

		const session = { authed: false, api: null, identity: null, mailbox: null, messages: [] };
		let buffer = '';

		const send = (line) => socket.write(line + CRLF);

		socket.setEncoding('utf8');
		send('* OK [CAPABILITY IMAP4rev1 AUTH=PLAIN LOGINDISABLED=NO] cloud-mail bridge ready');

		socket.on('data', async (chunk) => {
			buffer += chunk;

			let index;
			while ((index = buffer.indexOf(CRLF)) !== -1) {
				const line = buffer.slice(0, index);
				buffer = buffer.slice(index + 2);

				try {
					await handleLine(line);
				} catch (e) {
					onLog('imap error', e.message);
					send(`* BAD ${e.message}`);
				}
			}
		});

		socket.on('error', (e) => onLog('imap socket error', e.message));

		async function handleLine(line) {

			const [tag, commandRaw, ...rest] = line.split(' ');

			if (!commandRaw) {
				return send(`${tag || '*'} BAD Missing command`);
			}

			const command = commandRaw.toUpperCase();
			const args = rest.join(' ');

			switch (command) {

				case 'CAPABILITY':
					send('* CAPABILITY IMAP4rev1 AUTH=PLAIN');
					return send(`${tag} OK CAPABILITY completed`);

				case 'NOOP':
					return send(`${tag} OK NOOP completed`);

				case 'LOGOUT':
					send('* BYE Logging out');
					send(`${tag} OK LOGOUT completed`);
					return socket.end();

				case 'LOGIN':
					return handleLogin(tag, args);

				case 'LIST':
					if (!session.authed) return send(`${tag} NO Not authenticated`);
					send('* LIST (\\HasNoChildren) "/" "INBOX"');
					send('* LIST (\\HasNoChildren \\Sent) "/" "Sent"');
					return send(`${tag} OK LIST completed`);

				case 'LSUB':
					if (!session.authed) return send(`${tag} NO Not authenticated`);
					send('* LSUB () "/" "INBOX"');
					return send(`${tag} OK LSUB completed`);

				case 'SELECT':
				case 'EXAMINE':
					return handleSelect(tag, args);

				case 'SEARCH':
					return handleSearch(tag, args, false);

				case 'FETCH':
					return handleFetch(tag, args, false);

				case 'UID': {
					const [subRaw, ...subRest] = rest;
					const sub = String(subRaw ?? '').toUpperCase();
					if (sub === 'FETCH') return handleFetch(tag, subRest.join(' '), true);
					if (sub === 'SEARCH') return handleSearch(tag, subRest.join(' '), true);
					return send(`${tag} BAD Unsupported UID command`);
				}

				case 'CLOSE':
					session.mailbox = null;
					return send(`${tag} OK CLOSE completed`);

				// Honest refusal beats a fake OK: a client told a flag was stored
				// will stop showing the message as unread when it still is.
				case 'STORE':
				case 'APPEND':
				case 'COPY':
				case 'EXPUNGE':
				case 'CREATE':
				case 'DELETE':
				case 'RENAME':
					return send(`${tag} NO This bridge is read-only; use the web app or SMTP`);

				default:
					return send(`${tag} BAD Command not implemented`);
			}
		}

		async function handleLogin(tag, args) {

			const [, user, key] = /^"?([^"\s]+)"?\s+"?([^"\s]+)"?/.exec(args) ?? [];

			if (!key) {
				return send(`${tag} BAD LOGIN requires a username and password`);
			}

			// The API key goes in the password field - the only place a mail client
			// offers, and the only credential the worker checks.
			const api = new ApiClient(baseUrl, key);

			try {
				session.identity = await api.whoami();
				session.api = api;
				session.authed = true;
				onLog('imap auth ok', session.identity.email);
				return send(`${tag} OK LOGIN completed`);
			} catch {
				onLog('imap auth failed', user);
				return send(`${tag} NO LOGIN failed`);
			}
		}

		async function handleSelect(tag, args) {

			if (!session.authed) return send(`${tag} NO Not authenticated`);

			const mailbox = args.replace(/"/g, '').trim() || 'INBOX';

			// The worker models sent mail as a type, not a folder.
			const type = /^sent$/i.test(mailbox) ? 1 : 0;

			const rows = await session.api.listEmails({ type, size: PAGE_SIZE });

			// IMAP sequence numbers are 1-based and ascending by arrival, so the
			// newest-first API order has to be reversed.
			session.messages = [...rows].reverse();
			session.mailbox = mailbox;

			const unseen = session.messages.filter(m => m.unread === 0).length;

			send(`* ${session.messages.length} EXISTS`);
			send(`* ${unseen} RECENT`);
			send('* FLAGS (\\Seen \\Answered \\Flagged)');
			send('* OK [PERMANENTFLAGS ()] Read-only bridge');
			send(`* OK [UIDVALIDITY 1] UIDs valid`);
			send(`* OK [UIDNEXT ${nextUid()}] Predicted next UID`);

			return send(`${tag} OK [READ-ONLY] ${args.toUpperCase().startsWith('EXAMINE') ? 'EXAMINE' : 'SELECT'} completed`);
		}

		function nextUid() {
			return session.messages.reduce((max, m) => Math.max(max, m.emailId), 0) + 1;
		}

		function handleSearch(tag, args, byUid) {

			if (!session.mailbox) return send(`${tag} NO No mailbox selected`);

			const query = args.trim().toUpperCase();

			const matched = session.messages.filter((message) => {
				if (query === 'ALL' || query === '') return true;
				if (query === 'UNSEEN') return message.unread === 0;
				if (query === 'SEEN') return message.unread !== 0;
				// Anything more complex is answered as ALL rather than wrongly:
				// a client that gets an empty set assumes the mailbox is empty.
				return true;
			});

			const ids = matched.map((message, i) =>
				byUid ? message.emailId : session.messages.indexOf(message) + 1);

			send(`* SEARCH${ids.length ? ' ' + ids.join(' ') : ''}`);
			return send(`${tag} OK SEARCH completed`);
		}

		function handleFetch(tag, args, byUid) {

			if (!session.mailbox) return send(`${tag} NO No mailbox selected`);

			const space = args.indexOf(' ');
			const rangeText = space === -1 ? args : args.slice(0, space);
			const items = (space === -1 ? '' : args.slice(space + 1)).toUpperCase();

			for (const { index, message } of resolveRange(rangeText, byUid)) {

				const uid = message.emailId;
				const flags = message.unread === 0 ? '' : '\\Seen';

				if (items.includes('BODY[]') || items.includes('RFC822')) {
					const raw = toRfc822(message);
					// {n} is a literal: the client reads exactly n octets next.
					send(`* ${index} FETCH (UID ${uid} FLAGS (${flags}) BODY[] {${Buffer.byteLength(raw, 'utf8')}}`);
					socket.write(raw + ')' + CRLF);
					continue;
				}

				const parts = [`UID ${uid}`, `FLAGS (${flags})`];

				if (items.includes('INTERNALDATE')) {
					parts.push(`INTERNALDATE "${imapDate(message.createTime)}"`);
				}

				if (items.includes('RFC822.SIZE')) {
					parts.push(`RFC822.SIZE ${Buffer.byteLength(toRfc822(message), 'utf8')}`);
				}

				if (items.includes('ENVELOPE')) {
					parts.push(envelope(message));
				}

				send(`* ${index} FETCH (${parts.join(' ')})`);
			}

			return send(`${tag} OK FETCH completed`);
		}

		/** Expand "1:5", "3", "1:*" or a comma list into the messages it names. */
		function resolveRange(rangeText, byUid) {

			const out = [];

			for (const part of String(rangeText).split(',')) {

				const [fromRaw, toRaw] = part.split(':');
				const from = fromRaw === '*' ? Infinity : Number(fromRaw);
				const to = toRaw === undefined ? from : (toRaw === '*' ? Infinity : Number(toRaw));

				if (!Number.isFinite(from) && from !== Infinity) continue;

				const low = Math.min(from, to);
				const high = Math.max(from, to);

				session.messages.forEach((message, i) => {
					const key = byUid ? message.emailId : i + 1;
					if (key >= low && key <= high) {
						out.push({ index: i + 1, message });
					}
				});
			}

			return out;
		}
	});
}

function quoted(value) {
	return value ? `"${String(value).replace(/[\\"]/g, '\\$&')}"` : 'NIL';
}

function envelope(message) {
	const from = `((${quoted(message.name)} NIL ${quoted((message.sendEmail ?? '').split('@')[0])} ${quoted((message.sendEmail ?? '').split('@')[1])}))`;
	const to = `((NIL NIL ${quoted((message.toEmail ?? '').split('@')[0])} ${quoted((message.toEmail ?? '').split('@')[1])}))`;

	return `ENVELOPE (${quoted(message.createTime)} ${quoted(message.subject)} ${from} ${from} ${from} ${to} NIL NIL NIL ${quoted(message.messageId)})`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function imapDate(value) {
	const date = value ? new Date(String(value).replace(' ', 'T') + 'Z') : new Date();
	const d = Number.isNaN(date.getTime()) ? new Date() : date;
	const pad = (n) => String(n).padStart(2, '0');

	return `${pad(d.getUTCDate())}-${MONTHS[d.getUTCMonth()]}-${d.getUTCFullYear()} ` +
		`${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} +0000`;
}

export default createImapServer;
