// AI provider drivers.
//
// Every driver exposes chat({ system, user, maxTokens, temperature, json }) and
// returns plain text. OpenAI-compatible endpoints share one implementation;
// Anthropic and Workers AI have their own request shapes.
//
// Workers AI is the default because it is on the Cloudflare free plan, so the
// features work before the operator has pasted any external key.

const DEFAULT_TIMEOUT_MS = 30_000;

async function postChat(url, headers, body, label) {

	const res = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', ...headers },
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
	});

	const raw = await res.text();

	let parsed = null;
	try {
		parsed = raw ? JSON.parse(raw) : null;
	} catch {
		// fall through to the error below
	}

	if (!res.ok) {
		const detail = parsed?.error?.message ?? parsed?.message ?? raw.slice(0, 300) ?? `HTTP ${res.status}`;
		const e = new Error(`${label}: ${detail}`);
		e.status = res.status;
		e.retryable = res.status === 429 || res.status >= 500;
		throw e;
	}

	return parsed;
}

/** Shared driver for every OpenAI-compatible /chat/completions endpoint. */
function openAiCompatible({ key, label, defaultBaseUrl, defaultModel }) {
	return {
		key,
		label,
		defaultBaseUrl,
		defaultModel,
		needsApiKey: true,

		async chat(c, row, { system, user, maxTokens = 512, temperature = 0.3, json = false }) {

			const base = (row.baseUrl || defaultBaseUrl).replace(/\/+$/, '');

			const body = {
				model: row.model || defaultModel,
				messages: [
					...(system ? [{ role: 'system', content: system }] : []),
					{ role: 'user', content: user }
				],
				temperature,
				max_tokens: maxTokens
			};

			if (json) {
				body.response_format = { type: 'json_object' };
			}

			const result = await postChat(
				`${base}/chat/completions`,
				{ Authorization: `Bearer ${row.apiKey}` },
				body,
				label
			);

			return result?.choices?.[0]?.message?.content ?? '';
		}
	};
}

const openai = openAiCompatible({
	key: 'openai',
	label: 'OpenAI',
	defaultBaseUrl: 'https://api.openai.com/v1',
	defaultModel: 'gpt-4o-mini'
});

const deepseek = openAiCompatible({
	key: 'deepseek',
	label: 'DeepSeek',
	defaultBaseUrl: 'https://api.deepseek.com/v1',
	defaultModel: 'deepseek-chat'
});

// Any self-hosted or third-party OpenAI-compatible gateway (Ollama, vLLM,
// OpenRouter, LM Studio...). baseUrl is required rather than defaulted.
const custom = openAiCompatible({
	key: 'custom',
	label: 'Custom (OpenAI-compatible)',
	defaultBaseUrl: '',
	defaultModel: ''
});

const anthropic = {
	key: 'anthropic',
	label: 'Anthropic',
	defaultBaseUrl: 'https://api.anthropic.com/v1',
	defaultModel: 'claude-3-5-haiku-latest',
	needsApiKey: true,

	async chat(c, row, { system, user, maxTokens = 512, temperature = 0.3 }) {

		const base = (row.baseUrl || this.defaultBaseUrl).replace(/\/+$/, '');

		const result = await postChat(
			`${base}/messages`,
			{ 'x-api-key': row.apiKey, 'anthropic-version': '2023-06-01' },
			{
				model: row.model || this.defaultModel,
				max_tokens: maxTokens,
				temperature,
				...(system ? { system } : {}),
				messages: [{ role: 'user', content: user }]
			},
			'anthropic'
		);

		return (result?.content ?? []).filter(p => p.type === 'text').map(p => p.text).join('');
	}
};

const workersAi = {
	key: 'workers-ai',
	label: 'Cloudflare Workers AI',
	defaultBaseUrl: '',
	defaultModel: '@cf/meta/llama-3.1-8b-instruct-fast',
	needsApiKey: false,

	available: (c) => !!c.env.ai,

	async chat(c, row, { system, user, maxTokens = 512, temperature = 0.3 }) {

		if (!c.env.ai) {
			const e = new Error('workers-ai: the [ai] binding is missing');
			e.retryable = false;
			throw e;
		}

		const model = row.model || c.env.ai_model || this.defaultModel;

		const result = await c.env.ai.run(model, {
			messages: [
				...(system ? [{ role: 'system', content: system }] : []),
				{ role: 'user', content: user }
			],
			temperature,
			max_tokens: maxTokens
		});

		if (typeof result === 'string') {
			return result;
		}

		return result?.response ?? '';
	}
};

export const aiDrivers = {
	[workersAi.key]: workersAi,
	[openai.key]: openai,
	[deepseek.key]: deepseek,
	[anthropic.key]: anthropic,
	[custom.key]: custom
};

export function getAiDriver(type) {
	return aiDrivers[type] ?? null;
}

export function listAiDrivers() {
	return Object.values(aiDrivers).map(d => ({
		key: d.key,
		label: d.label,
		defaultBaseUrl: d.defaultBaseUrl,
		defaultModel: d.defaultModel,
		needsApiKey: d.needsApiKey
	}));
}

export default aiDrivers;
