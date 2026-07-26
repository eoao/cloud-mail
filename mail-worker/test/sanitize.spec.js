import { describe, it, expect } from 'vitest';
import { sanitizeHtml } from '../src/utils/sanitize-utils';

describe('sanitizeHtml (F1-XSS)', () => {
	it('strips script tags', () => {
		const result = sanitizeHtml('<p>Hello</p><script>alert(1)</script>');
		expect(result).not.toContain('<script>');
		expect(result).toContain('Hello');
	});

	it('strips onerror handlers', () => {
		const result = sanitizeHtml('<img src=x onerror="alert(1)">');
		expect(result).not.toContain('onerror');
	});

	it('strips onload handlers', () => {
		const result = sanitizeHtml('<svg onload="alert(1)"></svg>');
		expect(result).not.toContain('onload');
	});

	it('strips iframe tags', () => {
		const result = sanitizeHtml('<iframe src="evil"></iframe>');
		expect(result).not.toContain('<iframe');
	});

	it('strips javascript: URLs from href', () => {
		const result = sanitizeHtml('<a href="javascript:alert(1)">click</a>');
		expect(result).not.toContain('javascript:');
	});

	it('strips data: URLs from href', () => {
		const result = sanitizeHtml('<a href="data:text/html,<script>alert(1)</script>">click</a>');
		expect(result).not.toContain('data:');
	});

	it('strips object and embed tags', () => {
		const result = sanitizeHtml('<object data="evil"></object><embed src="evil">');
		expect(result).not.toContain('<object');
		expect(result).not.toContain('<embed');
	});

	it('strips form tags', () => {
		const result = sanitizeHtml('<form action="evil"><input></form>');
		expect(result).not.toContain('<form');
	});

	it('preserves safe HTML', () => {
		const result = sanitizeHtml('<p>Hello <b>World</b></p><a href="https://example.com">link</a>');
		expect(result).toContain('<p>');
		expect(result).toContain('<b>');
		expect(result).toContain('<a');
		expect(result).toContain('href="https://example.com"');
	});

	it('returns empty string for falsy input', () => {
		expect(sanitizeHtml('')).toBe('');
		expect(sanitizeHtml(null)).toBe('');
		expect(sanitizeHtml(undefined)).toBe('');
	});
});
