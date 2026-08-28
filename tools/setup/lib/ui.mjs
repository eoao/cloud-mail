import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const supportsColor = stdout.isTTY && process.env.NO_COLOR === undefined;
const wrap = (code) => (s) => supportsColor ? `[${code}m${s}[0m` : String(s);

export const bold = wrap('1');
export const dim = wrap('2');
export const red = wrap('31');
export const green = wrap('32');
export const yellow = wrap('33');
export const blue = wrap('34');
export const cyan = wrap('36');

let rl;

function io() {
	rl ??= readline.createInterface({ input: stdin, output: stdout });
	return rl;
}

export function closeIo() {
	rl?.close();
	rl = undefined;
}

export function heading(text) {
	console.log(`\n${bold(cyan(text))}`);
	console.log(dim('─'.repeat(Math.max(text.length, 24))));
}

export const ok = (text) => console.log(`  ${green('✓')} ${text}`);
export const warn = (text) => console.log(`  ${yellow('!')} ${text}`);
export const bad = (text) => console.log(`  ${red('✗')} ${text}`);
export const info = (text) => console.log(`  ${dim('·')} ${text}`);
export const note = (text) => console.log(`    ${dim(text)}`);

export async function ask(question, { fallback = '', secret = false } = {}) {
	const suffix = fallback ? ` ${dim(`[${fallback}]`)}` : '';

	if (!secret) {
		const answer = (await io().question(`  ${question}${suffix}: `)).trim();
		return answer || fallback;
	}

	// Suppress echo for tokens and passwords.
	const rli = io();
	const onKeypress = () => {
		stdout.write('[2K[G');
		stdout.write(`  ${question}: `);
	};
	rli.input.on('data', onKeypress);
	try {
		const answer = (await rli.question(`  ${question}: `)).trim();
		stdout.write('\n');
		return answer || fallback;
	} finally {
		rli.input.off('data', onKeypress);
	}
}

export async function confirm(question, defaultYes = true) {
	const hint = defaultYes ? 'Y/n' : 'y/N';
	const answer = (await io().question(`  ${question} ${dim(`(${hint})`)}: `)).trim().toLowerCase();
	if (!answer) return defaultYes;
	return answer === 'y' || answer === 'yes';
}

export async function choose(question, options) {

	if (options.length === 0) {
		throw new Error(`${question}: nothing to choose from`);
	}

	if (options.length === 1) {
		info(`${question}: ${bold(options[0].label)} ${dim('(only option)')}`);
		return options[0].value;
	}

	console.log(`  ${question}`);
	options.forEach((opt, i) => {
		console.log(`    ${bold(String(i + 1))}) ${opt.label}${opt.hint ? ` ${dim(opt.hint)}` : ''}`);
	});

	while (true) {
		const raw = (await io().question(`  ${dim('number')}: `)).trim();
		const n = Number(raw);
		if (Number.isInteger(n) && n >= 1 && n <= options.length) {
			return options[n - 1].value;
		}
		bad(`Enter a number between 1 and ${options.length}.`);
	}
}

/** Run an async step with a one-line status that resolves to ✓ or ✗. */
export async function step(label, fn) {
	stdout.write(`  ${dim('·')} ${label} ${dim('...')}`);
	try {
		const result = await fn();
		stdout.write(`[2K[G`);
		ok(typeof result === 'string' ? `${label} ${dim(`— ${result}`)}` : label);
		return result;
	} catch (e) {
		stdout.write(`[2K[G`);
		bad(`${label} ${dim(`— ${e.message}`)}`);
		throw e;
	}
}
