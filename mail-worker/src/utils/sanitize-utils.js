const REMOVE_TAGS = ['script', 'iframe', 'object', 'embed', 'form'];
const DANGEROUS_URL_ATTRS = ['href', 'src', 'action', 'formaction', 'poster', 'background'];
const DANGEROUS_URL_PATTERN = /^\s*(javascript|data|vbscript):/i;

class RemoveElement {
	element(el) {
		el.remove();
	}
}

class StripDangerousAttributes {
	element(el) {
		for (const [name] of [...el.attributes]) {
			if (/^on/i.test(name)) {
				el.removeAttribute(name);
			}
		}
		for (const attr of DANGEROUS_URL_ATTRS) {
			const value = el.getAttribute(attr);
			if (value && DANGEROUS_URL_PATTERN.test(value)) {
				el.removeAttribute(attr);
			}
		}
	}
}

export async function sanitizeHtml(html) {

	if (!html) return '';

	let rewriter = new HTMLRewriter();

	for (const tag of REMOVE_TAGS) {
		rewriter = rewriter.on(tag, new RemoveElement());
	}

	rewriter = rewriter.on('*', new StripDangerousAttributes());

	const response = rewriter.transform(new Response(html, {
		headers: { 'content-type': 'text/html; charset=utf-8' }
	}));

	return await response.text();
}
