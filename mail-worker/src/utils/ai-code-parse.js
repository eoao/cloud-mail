const TOKEN_RE = /^[A-Za-z0-9]{4,8}$/;
const TITLE_CASE_RE = /^[A-Z][a-z]+$/;
const STOPWORDS = new Set([
	'hello', 'thanks', 'please', 'welcome', 'regards', 'yours',
	'sincerely', 'dear', 'from', 'this', 'code', 'your', 'with',
	'have', 'just', 'that', 'what'
]);

function normalizeCode(value) {
	if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
		value = String(Math.trunc(value));
	}
	if (typeof value !== 'string') {
		return '';
	}
	const code = value.trim();
	if (!TOKEN_RE.test(code)) {
		return '';
	}
	if (TITLE_CASE_RE.test(code) || STOPWORDS.has(code.toLowerCase())) {
		return '';
	}
	return code;
}

function tryParseJson(text) {
	if (typeof text !== 'string') {
		return null;
	}
	const trimmed = text.trim();
	try {
		return JSON.parse(trimmed);
	} catch {
		// continue
	}
	const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
	if (fence) {
		try {
			return JSON.parse(fence[1].trim());
		} catch {
			// continue
		}
	}
	const obj = trimmed.match(/\{[\s\S]*\}/);
	if (obj) {
		try {
			return JSON.parse(obj[0]);
		} catch {
			// continue
		}
	}
	return null;
}

function codeFromParsed(json) {
	if (json == null) {
		return '';
	}
	if (typeof json === 'number' || typeof json === 'string') {
		return normalizeCode(json);
	}
	if (typeof json === 'object' && 'code' in json) {
		return normalizeCode(json.code);
	}
	return '';
}

export function parseAiResult(result) {
	if (result == null) {
		return '';
	}
	if (typeof result === 'number') {
		return normalizeCode(result);
	}
	if (typeof result === 'string') {
		const json = tryParseJson(result);
		if (json != null) {
			const fromJson = codeFromParsed(json);
			if (fromJson) {
				return fromJson;
			}
		}
		return normalizeCode(result);
	}
	if (typeof result === 'object') {
		const fromSelf = codeFromParsed(result);
		if (fromSelf) {
			return fromSelf;
		}
		const inner = result.response ?? result.output ?? result.result;
		if (inner !== undefined && inner !== result) {
			return parseAiResult(inner);
		}
	}
	return '';
}

// 不跨行：避免 "Your verification code\nHello" 把问候语当成码。
// 短语放长的在前。简体/英文/短信转发都能命中。
const PHRASE_RE = /(?:\b(?:(?:sms\s+)?verification code|one[-\s]?time (?:code|password|passcode)|security code|auth code|login code|otp(?:\s*code)?|passcode|pin code)\b|短信验证码|短信碼|短信码|动态密码|動態密碼|验证码|校验码|确认码|確認碼|驗證碼|確認コード)[ \t]*(?:is|code|为|為|是)?[ \t]*[:：=]?[ \t]*([A-Za-z0-9]{4,8})\b/i;

export function extractCodeFromText(text) {
	if (!text) {
		return '';
	}
	const globalRe = new RegExp(PHRASE_RE.source, 'gi');
	let match;
	while ((match = globalRe.exec(String(text)))) {
		const code = normalizeCode(match[1]);
		if (code) {
			return code;
		}
	}
	return '';
}
