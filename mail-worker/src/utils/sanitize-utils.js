import { parseHTML } from 'linkedom';
import DOMPurify from 'dompurify';

const { window } = parseHTML('<!DOCTYPE html><html><body></body></html>');
const purify = DOMPurify(window);

const ALLOWED_TAGS = [
	'html', 'head', 'body', 'meta', 'title',
	'div', 'span', 'p', 'br', 'hr',
	'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
	'blockquote', 'pre', 'code', 'cite',
	'b', 'i', 'u', 'strong', 'em', 'small', 'sub', 'sup', 'del', 'ins', 'mark',
	'ul', 'ol', 'li', 'dl', 'dt', 'dd',
	'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
	'a', 'img',
	'font', 'center',
	'style', 'link',
];

const ALLOWED_ATTR = [
	'href', 'src', 'alt', 'title', 'width', 'height',
	'style', 'class', 'id',
	'colspan', 'rowspan', 'align', 'valign',
	'border', 'cellpadding', 'cellspacing', 'cellspacing',
	'target', 'rel', 'name', 'charset', 'content',
	'color', 'bgcolor', 'face', 'size',
	'type', 'media',
	'dir', 'lang',
];

purify.addHook('afterSanitizeAttributes', (node) => {
	if (node.hasAttribute('href')) {
		const href = node.getAttribute('href');
		if (/^\s*javascript:/i.test(href) || /^\s*data:/i.test(href)) {
			node.removeAttribute('href');
		}
	}
	if (node.hasAttribute('src')) {
		const src = node.getAttribute('src');
		if (/^\s*javascript:/i.test(src)) {
			node.removeAttribute('src');
		}
	}
});

export function sanitizeHtml(html) {
	if (!html) return '';
	return purify.sanitize(html, {
		ALLOWED_TAGS,
		ALLOWED_ATTR,
		ALLOW_DATA_ATTR: false,
		ALLOW_UNKNOWN_PROTOCOLS: false,
	});
}
