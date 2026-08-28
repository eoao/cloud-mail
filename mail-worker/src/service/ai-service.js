import emailUtils from '../utils/email-utils';
import { settingConst } from '../const/entity-const';
import aiRouter from './ai';

// Thin wrapper kept for the inbound mail path. The model call itself now goes
// through the provider router in src/service/ai, so the same feature works on
// Workers AI, OpenAI, DeepSeek, Anthropic or a custom endpoint.

const aiService = {

	async extractCode(c, email, options = {}) {

		if (!this.shouldExtractCode(options.aiCode, options.aiCodeFilter, email)) {
			return '';
		}

		const subject = email.subject || '';
		const text = emailUtils.formatText(email.text || '');
		const htmlText = emailUtils.htmlToText(email.html || '');
		const body = htmlText || text;

		if (!subject && !body) {
			return '';
		}

		const { ok, result } = await aiRouter.run(c, 'extract_code', { subject, body });

		return ok && typeof result === 'string' ? result : '';
	},

	shouldExtractCode(aiCode, aiCodeFilterStr, email) {

		if (aiCode !== settingConst.aiCode.OPEN) {
			return false;
		}

		const filterList = aiCodeFilterStr
			? aiCodeFilterStr.split(',').map(item => item.trim().toLowerCase()).filter(Boolean)
			: [];

		if (filterList.length === 0) {
			return true;
		}

		const fromEmail = (email.from?.address || '').trim().toLowerCase();
		const fromDomain = emailUtils.getDomain(fromEmail).toLowerCase();

		return filterList.some(item => item === fromEmail || item === fromDomain);
	}
};

export default aiService;
