// Task catalogue.
//
// A task turns caller input into a prompt and turns the model's text back into
// a typed result. Keeping prompts here (rather than at call sites) means every
// provider gets the same instruction, and a task can be re-pointed at a
// different model without touching the feature that uses it.
//
// `json: true` asks OpenAI-compatible providers for structured output; parsing
// stays defensive because Workers AI models often wrap JSON in prose.

export function extractJson(text) {
	if (!text) return null;
	if (typeof text === 'object') return text;

	try {
		return JSON.parse(text);
	} catch {
		// Models frequently pad JSON with prose or a fenced block.
	}

	const start = text.indexOf('{');
	const end = text.lastIndexOf('}');

	if (start === -1 || end <= start) return null;

	try {
		return JSON.parse(text.slice(start, end + 1));
	} catch {
		return null;
	}
}

const clip = (s, n) => String(s ?? '').slice(0, n);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number(n) || 0));

const tasks = {};

export function defineTask(name, spec) {
	tasks[name] = { name, ...spec };
}

export function getTask(name) {
	return tasks[name] ?? null;
}

export function listTasks() {
	return Object.values(tasks).map(t => ({ name: t.name, label: t.label, group: t.group }));
}

export { clip, clamp, tasks };
export default tasks;
