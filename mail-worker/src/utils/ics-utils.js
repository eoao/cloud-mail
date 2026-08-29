// Minimal iCalendar (RFC 5545) reader for meeting invitations.
//
// Deliberately not a general iCalendar implementation: it reads the VEVENT
// fields a mail client needs to show and answer an invitation, and ignores
// everything else rather than failing on it. Real-world invitations come from
// Outlook, Google and a long tail of libraries, so the parser has to be
// forgiving about folding, escaping and parameter noise.

/**
 * Undo RFC 5545 line folding: a CRLF followed by a space or tab is a
 * continuation, not a new property.
 */
export function unfold(text) {
	return String(text ?? '').replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
}

/** Split "DTSTART;TZID=Europe/Berlin:20240101T090000" into name, params, value. */
export function parseLine(line) {

	const colon = indexOfUnquoted(line, ':');

	if (colon === -1) {
		return null;
	}

	const left = line.slice(0, colon);
	const value = line.slice(colon + 1);
	const [name, ...paramParts] = left.split(';');

	const params = {};

	for (const part of paramParts) {
		const eq = part.indexOf('=');
		if (eq === -1) continue;
		params[part.slice(0, eq).toUpperCase()] = stripQuotes(part.slice(eq + 1));
	}

	return { name: name.toUpperCase(), params, value: unescapeText(value) };
}

// A colon inside a quoted parameter (TZID="a:b") is not the value separator.
function indexOfUnquoted(line, char) {
	let inQuotes = false;

	for (let i = 0; i < line.length; i++) {
		if (line[i] === '"') inQuotes = !inQuotes;
		else if (line[i] === char && !inQuotes) return i;
	}

	return -1;
}

function stripQuotes(s) {
	return s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s;
}

function unescapeText(s) {
	return String(s)
		.replace(/\\n/gi, '\n')
		.replace(/\\,/g, ',')
		.replace(/\\;/g, ';')
		.replace(/\\\\/g, '\\');
}

/**
 * Convert an iCalendar date-time to 'YYYY-MM-DD HH:mm:ss'.
 *
 * Three forms occur: a floating local time, a UTC time with a trailing Z, and
 * a date-only value for all-day events. A TZID parameter is noted but not
 * resolved - carrying a full tz database into a Worker is not worth it, and the
 * common case from Outlook and Google is UTC.
 */
export function parseDate(value, params = {}) {

	const raw = String(value ?? '').trim();

	const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(raw);

	if (dateOnly) {
		const [, y, m, d] = dateOnly;
		return { value: `${y}-${m}-${d} 00:00:00`, allDay: true };
	}

	const dateTime = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(raw);

	if (!dateTime) {
		return { value: '', allDay: false };
	}

	const [, y, m, d, hh, mm, ss, zulu] = dateTime;
	const local = `${y}-${m}-${d} ${hh}:${mm}:${ss}`;

	if (zulu) {
		return { value: local, allDay: false, utc: true };
	}

	return { value: local, allDay: false, tzid: params.TZID || '' };
}

function parsePerson(line) {
	const address = String(line.value ?? '').replace(/^mailto:/i, '').trim();
	return {
		address,
		name: line.params.CN || '',
		role: line.params.ROLE || '',
		status: line.params.PARTSTAT || ''
	};
}

/**
 * Extract the VEVENTs from an iCalendar document.
 *
 * @returns { method, events[] } - METHOD distinguishes an invitation (REQUEST)
 *          from a reply or a cancellation, which is what decides whether the
 *          UI should offer accept/decline buttons.
 */
export function parseIcs(text) {

	const lines = unfold(text).split('\n').map(l => l.trim()).filter(Boolean);

	let method = '';
	const events = [];
	let current = null;

	for (const raw of lines) {

		const line = parseLine(raw);
		if (!line) continue;

		if (line.name === 'BEGIN' && line.value === 'VEVENT') {
			current = { uid: '', title: '', description: '', location: '', startAt: '', endAt: '', allDay: 0, organizer: '', attendees: [], status: 'confirmed' };
			continue;
		}

		if (line.name === 'END' && line.value === 'VEVENT') {
			if (current) events.push(current);
			current = null;
			continue;
		}

		if (!current) {
			if (line.name === 'METHOD') method = line.value.toUpperCase();
			continue;
		}

		switch (line.name) {
			case 'UID': current.uid = line.value; break;
			case 'SUMMARY': current.title = line.value; break;
			case 'DESCRIPTION': current.description = line.value; break;
			case 'LOCATION': current.location = line.value; break;
			case 'ORGANIZER': current.organizer = parsePerson(line).address; break;
			case 'ATTENDEE': current.attendees.push(parsePerson(line)); break;
			case 'STATUS': current.status = line.value.toLowerCase(); break;
			case 'DTSTART': {
				const parsed = parseDate(line.value, line.params);
				current.startAt = parsed.value;
				current.allDay = parsed.allDay ? 1 : 0;
				break;
			}
			case 'DTEND':
				current.endAt = parseDate(line.value, line.params).value;
				break;
			default:
				break;
		}
	}

	// A cancellation is expressed by METHOD, not by STATUS, in most clients.
	if (method === 'CANCEL') {
		for (const event of events) {
			event.status = 'cancelled';
		}
	}

	return { method, events };
}

/** Build a minimal REPLY document so an answer can be mailed back. */
export function buildReply({ uid, organizer, attendee, response, title }) {

	const partstat = { accepted: 'ACCEPTED', declined: 'DECLINED', tentative: 'TENTATIVE' }[response] ?? 'TENTATIVE';
	const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

	return [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//cloud-mail//EN',
		'METHOD:REPLY',
		'BEGIN:VEVENT',
		`UID:${uid}`,
		`DTSTAMP:${stamp}`,
		`SUMMARY:${String(title ?? '').replace(/([,;\\])/g, '\\$1')}`,
		`ORGANIZER:mailto:${organizer}`,
		`ATTENDEE;PARTSTAT=${partstat}:mailto:${attendee}`,
		'END:VEVENT',
		'END:VCALENDAR'
	].join('\r\n');
}

export default { parseIcs, parseDate, parseLine, unfold, buildReply };
