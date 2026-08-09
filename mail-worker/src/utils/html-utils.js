import { parseHTML } from 'linkedom';

// Keep <style> blocks: modern HTML email relies heavily on class selectors and media queries.
// Active/interactive elements remain blocked, while CSS itself is reduced to a safe subset below.
const BLOCKED_TAGS = [
	'script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea',
	'select', 'option', 'meta', 'base', 'link', 'frame', 'frameset', 'applet'
];
const URL_ATTRS = ['href', 'src', 'action', 'formaction', 'xlink:href'];

function isUnsafeUrl(value = '', { allowCid = true, allowDataImage = true } = {}) {
	const normalized = value.trim().replace(/[\u0000-\u001F\u007F\s]+/g, '').toLowerCase();
	if (!normalized) return false;
	if (normalized.startsWith('javascript:') || normalized.startsWith('vbscript:')) return true;
	if (normalized.startsWith('data:')) {
		if (allowDataImage && /^data:image\/(png|gif|jpe?g|webp|bmp);base64,/i.test(value.trim())) return false;
		return true;
	}
	if (normalized.startsWith('cid:')) return !allowCid;
	return false;
}

/**
 * Preserve the parts of email CSS needed by real-world newsletters/transactional mail while
 * removing mechanisms that can execute legacy expressions or import arbitrary styles/fonts.
 * Network images referenced by CSS remain possible; clients still apply their remote-content
 * privacy policy at render time.
 */
export function sanitizeEmailCss(css = '') {
	return String(css)
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/@charset\s+[^;]+;/gi, '')
		.replace(/@import\s+(?:url\s*\([^)]*\)|['"][^'"]*['"]|[^;]+)\s*;?/gi, '')
		.replace(/@font-face\s*\{[\s\S]*?\}/gi, '')
		.replace(/expression\s*\([^)]*\)/gi, '')
		.replace(/(?:behavior|-moz-binding)\s*:\s*[^;}]+[;}]?/gi, '')
		.replace(/url\s*\(\s*(['"]?)\s*(?:javascript|vbscript):[\s\S]*?\1\s*\)/gi, 'none');
}

export function sanitizeEmailHtml(html) {
	if (!html || typeof html !== 'string') return '';

	const wrapped = /<html[\s>]/i.test(html)
		? html
		: `<!DOCTYPE html><html><body>${html}</body></html>`;
	const { document } = parseHTML(wrapped);

	document.querySelectorAll(BLOCKED_TAGS.join(',')).forEach(element => element.remove());

	// Do not throw away legitimate email styling. Sanitize the CSS text and keep media queries,
	// selectors, colors, table layout and responsive rules intact.
	document.querySelectorAll('style').forEach(element => {
		const cleaned = sanitizeEmailCss(element.textContent || '');
		if (cleaned.trim()) element.textContent = cleaned;
		else element.remove();
	});

	document.querySelectorAll('*').forEach(element => {
		for (const attribute of [...element.attributes]) {
			const name = attribute.name.toLowerCase();
			const value = attribute.value || '';

			if (name.startsWith('on') || name === 'srcdoc') {
				element.removeAttribute(attribute.name);
				continue;
			}

			if (URL_ATTRS.includes(name) && isUnsafeUrl(value)) {
				element.removeAttribute(attribute.name);
				continue;
			}

			if (name === 'style') {
				const cleaned = sanitizeEmailCss(value);
				if (cleaned.trim()) element.setAttribute('style', cleaned);
				else element.removeAttribute('style');
			}
		}

		if (element.tagName?.toLowerCase() === 'a') {
			element.setAttribute('rel', 'noopener noreferrer nofollow');
			element.setAttribute('target', '_blank');
		}
	});

	return document.toString();
}

export function escapeHtml(text = '') {
	return String(text)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}
