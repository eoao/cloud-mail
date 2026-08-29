import net from 'node:net';
import { ApiClient } from './api-client.mjs';
import { parseSubmission } from './mime.mjs';

// SMTP submission (RFC 6409), translated into calls to the worker's send API.
//
// Deliberately a submission server, not an MTA: it only accepts authenticated
// mail from a client that already has an API key, and it never relays. Anything
// arriving unauthenticated is refused before a recipient is even read.

const CRLF = '\r\n';

export function createSmtpServer({ baseUrl, hostname = 'cloud-mail.local', onLog = () => {} }) {

	return net.createServer((socket) => {

		const session = {
			authed: false,
			api: null,
			from: '',
			rcpt: [],
			inData: false,
			data: '',
			awaiting: null
		};

		let buffer = '';

		const send = (line) => socket.write(line + CRLF);

		socket.setEncoding('utf8');
		send(`220 ${hostname} cloud-mail bridge ready`);

		socket.on('data', async (chunk) => {
			buffer += chunk;

			let index;
			while ((index = buffer.indexOf(CRLF)) !== -1) {
				const line = buffer.slice(0, index);
				buffer = buffer.slice(index + 2);

				try {
					await handleLine(line);
				} catch (e) {
					onLog('smtp error', e.message);
					send('451 Requested action aborted: local error');
				}
			}
		});

		socket.on('error', (e) => onLog('smtp socket error', e.message));

		async function handleLine(line) {

			// Inside DATA every line is content until a lone dot.
			if (session.inData) {
				if (line === '.') {
					session.inData = false;
					await deliver();
					return;
				}
				// Undo dot-stuffing (RFC 5321 4.5.2).
				session.data += (line.startsWith('..') ? line.slice(1) : line) + '\n';
				return;
			}

			// Continuation of a multi-step AUTH exchange.
			if (session.awaiting) {
				const step = session.awaiting;
				session.awaiting = null;
				return step(line);
			}

			const [verbRaw, ...rest] = line.split(' ');
			const verb = verbRaw.toUpperCase();
			const arg = rest.join(' ');

			switch (verb) {

				case 'EHLO':
					send(`250-${hostname}`);
					send('250-AUTH PLAIN LOGIN');
					send('250-8BITMIME');
					send('250 SMTPUTF8');
					return;

				case 'HELO':
					send(`250 ${hostname}`);
					return;

				case 'AUTH':
					return handleAuth(arg);

				case 'MAIL':
					if (!session.authed) return send('530 Authentication required');
					session.from = extractPath(arg);
					session.rcpt = [];
					return send('250 OK');

				case 'RCPT': {
					if (!session.authed) return send('530 Authentication required');
					const address = extractPath(arg);
					if (!address) return send('501 Bad recipient');
					session.rcpt.push(address);
					return send('250 OK');
				}

				case 'DATA':
					if (!session.authed) return send('530 Authentication required');
					if (session.rcpt.length === 0) return send('503 No recipients');
					session.inData = true;
					session.data = '';
					return send('354 End data with <CRLF>.<CRLF>');

				case 'RSET':
					session.from = '';
					session.rcpt = [];
					session.data = '';
					return send('250 OK');

				case 'NOOP':
					return send('250 OK');

				case 'QUIT':
					send('221 Bye');
					return socket.end();

				default:
					return send('502 Command not implemented');
			}
		}

		async function handleAuth(arg) {

			const [mechanism, initial] = arg.split(' ');

			const finish = async (user, pass) => {
				// The password field carries the API key: a mail client has nowhere
				// else to put one, and the key is what the worker actually checks.
				const api = new ApiClient(baseUrl, pass);

				try {
					const me = await api.whoami();
					session.authed = true;
					session.api = api;
					session.identity = me;
					onLog('smtp auth ok', me.email);
					send('235 Authentication successful');
				} catch {
					onLog('smtp auth failed', user);
					send('535 Authentication credentials invalid');
				}
			};

			if (/^PLAIN$/i.test(mechanism)) {
				const decode = (payload) => {
					const parts = Buffer.from(payload, 'base64').toString('utf8').split('\0');
					return finish(parts[1] ?? '', parts[2] ?? '');
				};

				if (initial) return decode(initial);

				send('334 ');
				session.awaiting = decode;
				return;
			}

			if (/^LOGIN$/i.test(mechanism)) {
				send('334 VXNlcm5hbWU6'); // "Username:"
				session.awaiting = (userLine) => {
					const user = Buffer.from(userLine, 'base64').toString('utf8');
					send('334 UGFzc3dvcmQ6'); // "Password:"
					session.awaiting = (passLine) =>
						finish(user, Buffer.from(passLine, 'base64').toString('utf8'));
				};
				return;
			}

			return send('504 Authentication mechanism not supported');
		}

		async function deliver() {

			const parsed = parseSubmission(session.data);

			// The envelope is authoritative for delivery - a Bcc never appears in
			// the document, so header-only parsing would silently drop recipients.
			const headerRecipients = new Set([...parsed.to, ...parsed.cc]);
			const bcc = session.rcpt.filter(address => !headerRecipients.has(address));

			try {
				await session.api.sendEmail({
					accountId: session.identity?.account?.accountId,
					name: session.identity?.name ?? '',
					sendType: 'send',
					receiveEmail: parsed.to.length ? parsed.to : session.rcpt,
					cc: parsed.cc,
					bcc,
					subject: parsed.subject,
					text: parsed.text,
					content: parsed.html || `<pre>${escapeHtml(parsed.text)}</pre>`
				});

				onLog('smtp sent', parsed.subject);
				send('250 Message accepted');
			} catch (e) {
				onLog('smtp send failed', e.message);
				// 5xx for a rejected message, 4xx for anything the client should retry.
				send(`${e.status >= 400 && e.status < 500 ? '550' : '451'} ${e.message}`);
			}

			session.from = '';
			session.rcpt = [];
			session.data = '';
		}
	});
}

function extractPath(arg) {
	const match = /<([^>]*)>/.exec(arg ?? '');
	return (match ? match[1] : String(arg ?? '').split(' ')[0].replace(/^(FROM|TO):/i, '')).trim();
}

function escapeHtml(text) {
	return String(text ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

export default createSmtpServer;
