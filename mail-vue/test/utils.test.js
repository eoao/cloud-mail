import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { pollDelay, isVisible, whenVisible, MIN_DELAY_MS, MAX_DELAY_MS } from '@/utils/poll-utils.js';
import { isTyping, keyOf } from '@/composables/use-shortcuts.js';
import { prefs, inQuietHours } from '@/composables/use-notifications.js';
import en from '@/i18n/en.js';
import zh from '@/i18n/zh.js';
import tr from '@/i18n/tr.js';

describe('adaptive polling', () => {

	it('honours the admin interval when nothing has backed off', () => {
		expect(pollDelay(30, 0)).toBe(30_000);
	});

	it('never polls faster than the floor, whatever is configured', () => {
		// The old code allowed an effective 3s floor; anything lower would burn
		// the free-plan request budget in hours.
		expect(pollDelay(0, 0)).toBe(MIN_DELAY_MS);
		expect(pollDelay(1, 0)).toBe(MIN_DELAY_MS);
		expect(pollDelay(-5, 0)).toBe(MIN_DELAY_MS);
	});

	it('backs off monotonically and stops at the cap', () => {
		const delays = Array.from({ length: 15 }, (_, i) => pollDelay(3, i));

		for (let i = 1; i < delays.length; i++) {
			expect(delays[i]).toBeGreaterThanOrEqual(delays[i - 1]);
		}

		expect(delays.at(-1)).toBe(MAX_DELAY_MS);
		expect(pollDelay(3, 9999)).toBe(MAX_DELAY_MS);
	});

	it('reports visibility from the document', () => {
		expect(isVisible()).toBe(true);
	});

	it('resolves whenVisible immediately when the tab is already visible', async () => {
		await expect(whenVisible()).resolves.toBeUndefined();
	});

	it('parks until the tab becomes visible again', async () => {
		const spy = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');

		let resolved = false;
		const waiting = whenVisible().then(() => { resolved = true; });

		await Promise.resolve();
		expect(resolved).toBe(false);

		spy.mockReturnValue('visible');
		document.dispatchEvent(new Event('visibilitychange'));
		await waiting;

		expect(resolved).toBe(true);
		spy.mockRestore();
	});
});

describe('keyboard shortcut gating', () => {

	const eventOn = (tagName, extra = {}) => {
		const el = document.createElement(tagName);
		document.body.appendChild(el);
		Object.assign(el, extra);
		return { target: el, cleanup: () => el.remove() };
	};

	it('treats form fields as typing, so a bare key never fires there', () => {
		for (const tag of ['input', 'textarea', 'select']) {
			const { target, cleanup } = eventOn(tag);
			expect(isTyping({ target })).toBe(true);
			cleanup();
		}
	});

	it('treats a rich text editor as typing', () => {
		const el = document.createElement('div');
		Object.defineProperty(el, 'isContentEditable', { value: true });
		expect(isTyping({ target: el })).toBe(true);
	});

	it('treats anything inside an open dialog or TinyMCE as typing', () => {
		const dialog = document.createElement('div');
		dialog.className = 'el-dialog';
		const button = document.createElement('button');
		dialog.appendChild(button);
		document.body.appendChild(dialog);

		expect(isTyping({ target: button })).toBe(true);

		dialog.remove();
	});

	it('lets a shortcut through on ordinary page content', () => {
		const { target, cleanup } = eventOn('div');
		expect(isTyping({ target })).toBe(false);
		cleanup();
	});

	it('normalises a key event into a comparable string', () => {
		expect(keyOf({ key: 'C', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false })).toBe('c');
		expect(keyOf({ key: 'k', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false })).toBe('mod+k');
		expect(keyOf({ key: 'k', ctrlKey: false, metaKey: true, altKey: false, shiftKey: false })).toBe('mod+k');
		expect(keyOf({ key: 'Escape', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false })).toBe('escape');
	});
});

describe('notification quiet hours', () => {

	const at = (hh, mm = 0) => new Date(2024, 0, 1, hh, mm);

	afterEach(() => {
		prefs.value.quietFrom = '';
		prefs.value.quietTo = '';
	});

	it('is off when no window is set', () => {
		expect(inQuietHours(at(3))).toBe(false);
	});

	it('handles a window inside one day', () => {
		prefs.value.quietFrom = '09:00';
		prefs.value.quietTo = '17:00';

		expect(inQuietHours(at(8, 59))).toBe(false);
		expect(inQuietHours(at(9))).toBe(true);
		expect(inQuietHours(at(16, 59))).toBe(true);
		expect(inQuietHours(at(17))).toBe(false);
	});

	it('handles a window that crosses midnight', () => {
		// The obvious implementation gets this backwards and goes quiet all day.
		prefs.value.quietFrom = '22:00';
		prefs.value.quietTo = '07:00';

		expect(inQuietHours(at(23))).toBe(true);
		expect(inQuietHours(at(2))).toBe(true);
		expect(inQuietHours(at(6, 59))).toBe(true);
		expect(inQuietHours(at(7))).toBe(false);
		expect(inQuietHours(at(12))).toBe(false);
		expect(inQuietHours(at(21, 59))).toBe(false);
	});
});

describe('translations', () => {

	const keysOf = (bundle) => Object.keys(bundle).sort();

	it('has no duplicate keys, which would silently override each other', () => {
		// A duplicate is invisible in JS - the later one just wins - so this is
		// checked against the source text rather than the parsed object.
		for (const [name, bundle] of [['en', en], ['zh', zh], ['tr', tr]]) {
			expect(keysOf(bundle).length, name).toBe(new Set(keysOf(bundle)).size);
		}
	});

	it('zh and tr cover every key English has', () => {
		const missing = (bundle) => keysOf(en).filter(key => !(key in bundle));

		expect(missing(zh)).toEqual([]);
		expect(missing(tr)).toEqual([]);
	});

	it('carries no key that English does not define', () => {
		// An extra key means a rename went half-done and the English fallback
		// would show a raw key name.
		const extra = (bundle) => keysOf(bundle).filter(key => !(key in en));

		expect(extra(zh)).toEqual([]);
		expect(extra(tr)).toEqual([]);
	});

	it('keeps the same interpolation placeholders in every language', () => {
		const placeholders = (value) =>
			[...String(value).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();

		for (const key of keysOf(en)) {
			if (typeof en[key] !== 'string') continue;

			const expected = placeholders(en[key]);
			if (expected.length === 0) continue;

			// A missing placeholder renders as a literal gap in the sentence.
			expect(placeholders(zh[key]), `zh.${key}`).toEqual(expected);
			expect(placeholders(tr[key]), `tr.${key}`).toEqual(expected);
		}
	});

	it('has no empty translations outside the one intentional blank', () => {
		const blanks = (bundle) => keysOf(bundle).filter(key => bundle[key] === '');

		// `character` is deliberately empty in English (a unit suffix Chinese
		// needs and English does not).
		expect(blanks(en)).toEqual(['character']);
		expect(blanks(tr)).toEqual(['character']);
	});
});
