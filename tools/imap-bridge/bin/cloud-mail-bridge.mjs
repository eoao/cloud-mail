#!/usr/bin/env node
import { createImapServer } from '../lib/imap-server.mjs';
import { createSmtpServer } from '../lib/smtp-server.mjs';

const baseUrl = process.env.CLOUD_MAIL_URL;

if (!baseUrl) {
	console.error('CLOUD_MAIL_URL is required, e.g. https://mail.example.com');
	process.exit(1);
}

const imapPort = Number(process.env.IMAP_PORT) || 1143;
const smtpPort = Number(process.env.SMTP_PORT) || 1587;
const host = process.env.BIND_HOST || '127.0.0.1';

const log = (...parts) => console.log(new Date().toISOString(), ...parts);

createImapServer({ baseUrl, onLog: log }).listen(imapPort, host, () => {
	log(`imap listening on ${host}:${imapPort}`);
});

createSmtpServer({ baseUrl, onLog: log }).listen(smtpPort, host, () => {
	log(`smtp listening on ${host}:${smtpPort}`);
});

log(`bridging to ${baseUrl}`);

if (host === '0.0.0.0') {
	log('WARNING: bound to all interfaces in plaintext - put a TLS terminator in front of it');
}
