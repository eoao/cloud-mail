// Just enough MIME to bridge between the worker's JSON and what a mail client
// expects on the wire.

/**
 * Render one stored message as an RFC 5322 document.
 *
 * Clients fetch a whole message and parse it themselves, so the bridge has to
 * produce something well-formed rather than a summary. Bodies are sent as
 * quoted-printable-free UTF-8 with an explicit charset, which every client
 * since the 1990s handles.
 */
export function toRfc822(email) {

	const headers = [];
	const push = (name, value) => {
		if (value) headers.push(`${name}: ${foldHeader(String(value))}`);
	};

	push('Message-ID', email.messageId || `<${email.emailId}@cloud-mail>`);
	push('Date', toRfc822Date(email.createTime));
	push('From', formatAddress(email.name, email.sendEmail));
	push('To', email.toEmail);
	push('Subject', encodeHeaderWord(email.subject || ''));

	if (email.inReplyTo) {
		push('In-Reply-To', email.inReplyTo);
		push('References', email.relation || email.inReplyTo);
	}

	const html = email.content ?? '';
	const text = email.text ?? '';

	if (html && text) {
		const boundary = `cm-${email.emailId}-${Math.random().toString(36).slice(2, 10)}`;
		headers.push('MIME-Version: 1.0');
		headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);

		return [
			headers.join('\r\n'),
			'',
			`--${boundary}`,
			'Content-Type: text/plain; charset=utf-8',
			'',
			normaliseCrlf(text),
			`--${boundary}`,
			'Content-Type: text/html; charset=utf-8',
			'',
			normaliseCrlf(html),
			`--${boundary}--`,
			''
		].join('\r\n');
	}

	headers.push('MIME-Version: 1.0');
	headers.push(`Content-Type: text/${html ? 'html' : 'plain'}; charset=utf-8`);

	return `${headers.join('\r\n')}\r\n\r\n${normaliseCrlf(html || text)}\r\n`;
}

export function normaliseCrlf(text) {
	return String(text ?? '').replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
}

export function formatAddress(name, address) {
	if (!address) return '';
	return name ? `${encodeHeaderWord(name)} <${address}>` : address;
}

/**
 * RFC 2047 encoded-word, but only when the value is not plain ASCII.
 *
 * Encoding unconditionally would make every subject unreadable in a raw dump
 * for no benefit; leaving non-ASCII unencoded breaks older clients.
 */
export function encodeHeaderWord(value) {
	const text = String(value ?? '');

	if (!/[^\x20-\x7e]/.test(text)) {
		return text;
	}

	return `=?UTF-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`;
}

/** Fold a long header at 78 columns, as the spec asks. */
export function foldHeader(value) {
	if (value.length <= 78) return value;

	const parts = [];
	let line = '';

	for (const word of value.split(' ')) {
		if (line && (line + ' ' + word).length > 78) {
			parts.push(line);
			line = word;
		} else {
			line = line ? `${line} ${word}` : word;
		}
	}

	if (line) parts.push(line);

	return parts.join('\r\n ');
}

export function toRfc822Date(value) {
	const date = value ? new Date(String(value).replace(' ', 'T') + 'Z') : new Date();
	return (Number.isNaN(date.getTime()) ? new Date() : date).toUTCString().replace('GMT', '+0000');
}

/**
 * Parse a submitted message far enough to hand it to the send API.
 *
 * SMTP clients send a full RFC 5322 document; the worker's API wants fields.
 * Only the parts that affect delivery are read - the rest of the document is
 * regenerated on the other side.
 */
export function parseSubmission(raw) {

	const text = String(raw ?? '').replace(/\r\n/g, '\n');
	const split = text.indexOf('\n\n');
	const headerBlock = split === -1 ? text : text.slice(0, split);
	const body = split === -1 ? '' : text.slice(split + 2);

	// Unfold before splitting: a folded To: line holds recipients too.
	const unfolded = headerBlock.replace(/\n[ \t]+/g, ' ');
	const headers = {};

	for (const line of unfolded.split('\n')) {
		const colon = line.indexOf(':');
		if (colon === -1) continue;
		headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
	}

	const contentType = headers['content-type'] ?? '';
	const isHtml = /text\/html/i.test(contentType);

	return {
		subject: decodeHeaderWord(headers.subject ?? ''),
		to: splitAddresses(headers.to),
		cc: splitAddresses(headers.cc),
		bcc: splitAddresses(headers.bcc),
		inReplyTo: headers['in-reply-to'] ?? '',
		html: isHtml ? body : '',
		text: isHtml ? '' : body,
		headers
	};
}

export function splitAddresses(value) {
	if (!value) return [];

	// Addresses are comma-separated, but a display name may contain a comma
	// inside quotes, so only split on commas outside quotes and angle brackets.
	const out = [];
	let current = '';
	let inQuotes = false;
	let inAngle = false;

	for (const char of String(value)) {
		if (char === '"') inQuotes = !inQuotes;
		else if (char === '<') inAngle = true;
		else if (char === '>') inAngle = false;

		if (char === ',' && !inQuotes && !inAngle) {
			out.push(current);
			current = '';
			continue;
		}

		current += char;
	}

	out.push(current);

	return out
		.map(part => {
			const angle = /<([^>]+)>/.exec(part);
			return (angle ? angle[1] : part).trim();
		})
		.filter(Boolean);
}

export function decodeHeaderWord(value) {
	return String(value ?? '').replace(
		/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g,
		(_, charset, encoding, data) => {
			try {
				if (encoding.toLowerCase() === 'b') {
					// Buffer.from does not throw on invalid base64 - it silently drops
					// the bad characters, so garbage in gives an empty string rather
					// than an error. Fall back to the raw text in that case.
					const decoded = Buffer.from(data, 'base64')
						.toString(charset.toLowerCase() === 'utf-8' ? 'utf8' : 'latin1');
					return decoded || data;
				}
				const bytes = data.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, (__, hex) =>
					String.fromCharCode(parseInt(hex, 16)));
				return Buffer.from(bytes, 'latin1').toString('utf8');
			} catch {
				// A malformed encoded-word is better shown raw than dropped.
				return data;
			}
		}
	);
}

export default { toRfc822, parseSubmission, splitAddresses, encodeHeaderWord, decodeHeaderWord, foldHeader };
