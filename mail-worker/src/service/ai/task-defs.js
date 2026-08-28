import { defineTask, extractJson, clip, clamp } from './tasks';

// ---- security ----------------------------------------------------------

defineTask('extract_code', {
	label: 'Verification code extraction',
	group: 'security',
	maxTokens: 32,
	temperature: 0,
	json: true,
	system: 'You extract verification codes from emails. Return only JSON like {"code":"12345678"} or {"code":""}. The code must be 8 characters or fewer and must not contain spaces. If the code is longer than 8 characters or contains spaces, return {"code":""}. Do not explain.',
	user: ({ subject, body }) => `Subject: ${clip(subject, 200)}\n\n${clip(body, 6000)}`,
	parse: (text) => {
		const code = extractJson(text)?.code;
		if (typeof code !== 'string' || code.length > 8 || /\s/.test(code)) {
			return '';
		}
		return code;
	}
});

defineTask('spam_score', {
	label: 'Spam and phishing score',
	group: 'security',
	maxTokens: 200,
	temperature: 0,
	json: true,
	system: 'You are an email security classifier. Reply with JSON only: {"score":0-100,"verdict":"ham"|"spam"|"phishing","reasons":["..."]}. score is the probability the message is unwanted or malicious. Judge sender/link mismatch, credential requests, urgency pressure and impersonation. Do not explain outside the JSON.',
	user: ({ from, subject, body, links = [] }) =>
		`From: ${clip(from, 200)}\nSubject: ${clip(subject, 200)}\nLinks: ${clip(links.join(', '), 800)}\n\n${clip(body, 4000)}`,
	parse: (text) => {
		const json = extractJson(text);
		if (!json) return null;
		return {
			score: clamp(json.score, 0, 100),
			verdict: ['ham', 'spam', 'phishing'].includes(json.verdict) ? json.verdict : 'ham',
			reasons: Array.isArray(json.reasons) ? json.reasons.slice(0, 5).map(r => clip(r, 200)) : []
		};
	}
});

// ---- reading -----------------------------------------------------------

defineTask('summarize', {
	label: 'Summarize a message or thread',
	group: 'reading',
	maxTokens: 400,
	temperature: 0.2,
	json: true,
	system: 'You summarize email. Reply with JSON only: {"summary":"2-4 sentences","actionItems":["..."],"deadline":"ISO date or empty string"}. Write the summary in the same language as the email. Only list action items that are actually asked of the reader.',
	user: ({ subject, body, language }) =>
		`${language ? `Reply language: ${language}\n` : ''}Subject: ${clip(subject, 300)}\n\n${clip(body, 8000)}`,
	parse: (text) => {
		const json = extractJson(text);
		if (!json) return null;
		return {
			summary: clip(json.summary, 2000),
			actionItems: Array.isArray(json.actionItems) ? json.actionItems.slice(0, 10).map(a => clip(a, 300)) : [],
			deadline: clip(json.deadline, 40)
		};
	}
});

defineTask('categorize', {
	label: 'Category and priority',
	group: 'reading',
	maxTokens: 120,
	temperature: 0,
	json: true,
	system: 'You triage email. Reply with JSON only: {"category":"personal"|"work"|"finance"|"shopping"|"travel"|"social"|"newsletter"|"notification"|"other","priority":0-100,"needsReply":true|false}. priority reflects how soon a human should look at it.',
	user: ({ from, subject, body }) =>
		`From: ${clip(from, 200)}\nSubject: ${clip(subject, 300)}\n\n${clip(body, 3000)}`,
	parse: (text) => {
		const json = extractJson(text);
		if (!json) return null;
		const allowed = ['personal', 'work', 'finance', 'shopping', 'travel', 'social', 'newsletter', 'notification', 'other'];
		return {
			category: allowed.includes(json.category) ? json.category : 'other',
			priority: clamp(json.priority, 0, 100),
			needsReply: json.needsReply === true
		};
	}
});

// ---- writing -----------------------------------------------------------

// Composition tasks return prose, not JSON, so the editor can insert it as-is.
const prose = (text) => clip(String(text ?? '').trim(), 20000);

defineTask('draft', {
	label: 'Draft a message',
	group: 'writing',
	maxTokens: 900,
	temperature: 0.6,
	system: 'You write email bodies. Output only the body text - no subject line, no greeting placeholders like [Name], no commentary, no markdown fences. Match the requested language and tone.',
	user: ({ instruction, language, tone, context }) =>
		[
			`Write an email body. Instruction: ${clip(instruction, 2000)}`,
			language ? `Language: ${clip(language, 40)}` : '',
			tone ? `Tone: ${clip(tone, 40)}` : '',
			context ? `Context to reply to:\n${clip(context, 6000)}` : ''
		].filter(Boolean).join('\n'),
	parse: prose
});

defineTask('reply_suggest', {
	label: 'Suggest replies',
	group: 'writing',
	maxTokens: 400,
	temperature: 0.5,
	json: true,
	system: 'You propose short email replies. Reply with JSON only: {"replies":["...","...","..."]}. Give three options - one accepting, one declining or deferring, one asking a clarifying question. Each under 40 words, in the language of the original email.',
	user: ({ subject, body }) => `Subject: ${clip(subject, 300)}\n\n${clip(body, 5000)}`,
	parse: (text) => {
		const json = extractJson(text);
		const replies = Array.isArray(json?.replies) ? json.replies : [];
		return replies.slice(0, 3).map(r => clip(r, 800));
	}
});

defineTask('rewrite', {
	label: 'Rewrite (tone, length, proofread)',
	group: 'writing',
	maxTokens: 900,
	temperature: 0.4,
	system: 'You rewrite email text. Output only the rewritten text - no commentary, no markdown fences. Preserve meaning and any concrete details such as dates, names and amounts.',
	user: ({ text, mode, language }) => {
		const instruction = {
			formal: 'Rewrite it in a more formal, professional tone.',
			casual: 'Rewrite it in a warmer, more casual tone.',
			shorter: 'Make it significantly shorter while keeping every concrete detail.',
			longer: 'Expand it with helpful detail, without inventing facts.',
			proofread: 'Fix spelling, grammar and punctuation. Change nothing else.'
		}[mode] ?? 'Improve the clarity of the text.';

		return `${instruction}${language ? ` Reply in ${clip(language, 40)}.` : ''}\n\n${clip(text, 8000)}`;
	},
	parse: prose
});

defineTask('translate', {
	label: 'Translate',
	group: 'writing',
	maxTokens: 1200,
	temperature: 0.2,
	system: 'You translate email text. Output only the translation - no commentary, no markdown fences, no transliteration of names.',
	user: ({ text, target }) => `Translate into ${clip(target, 40) || 'English'}:\n\n${clip(text, 8000)}`,
	parse: prose
});

// ---- agent -------------------------------------------------------------

defineTask('rule_from_text', {
	label: 'Build a filter rule from a sentence',
	group: 'agent',
	maxTokens: 300,
	temperature: 0,
	json: true,
	system: 'You convert a plain-language mail rule into JSON: {"conditions":[{"field":"from"|"to"|"subject"|"body","op":"contains"|"equals"|"endsWith","value":"..."}],"actions":[{"type":"move"|"label"|"markRead"|"star"|"delete","value":"..."}]}. Use only those fields, operators and action types. Reply with JSON only.',
	user: ({ instruction }) => clip(instruction, 1000),
	parse: (text) => {
		const json = extractJson(text);
		if (!json) return null;

		const fields = ['from', 'to', 'subject', 'body'];
		const ops = ['contains', 'equals', 'endsWith'];
		const actionTypes = ['move', 'label', 'markRead', 'star', 'delete'];

		const conditions = (Array.isArray(json.conditions) ? json.conditions : [])
			.filter(cond => fields.includes(cond?.field) && ops.includes(cond?.op) && cond?.value)
			.slice(0, 10)
			.map(cond => ({ field: cond.field, op: cond.op, value: clip(cond.value, 200) }));

		const actions = (Array.isArray(json.actions) ? json.actions : [])
			.filter(a => actionTypes.includes(a?.type))
			.slice(0, 5)
			.map(a => ({ type: a.type, value: clip(a.value, 200) }));

		// A rule with no condition would match every message - refuse it.
		if (conditions.length === 0 || actions.length === 0) {
			return null;
		}

		return { conditions, actions };
	}
});

defineTask('ask_archive', {
	label: 'Answer a question over retrieved emails',
	group: 'agent',
	maxTokens: 700,
	temperature: 0.2,
	system: 'You answer questions using only the provided emails. Cite the emails you used by their [n] marker. If the answer is not in them, say so plainly instead of guessing.',
	user: ({ question, documents = [] }) => {
		const context = documents
			.slice(0, 8)
			.map((d, i) => `[${i + 1}] From: ${clip(d.from, 120)} | Subject: ${clip(d.subject, 200)}\n${clip(d.body, 1500)}`)
			.join('\n\n');
		return `Question: ${clip(question, 500)}\n\nEmails:\n${context}`;
	},
	parse: prose
});
