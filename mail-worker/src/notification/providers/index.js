import WebhookProvider from './webhook.js';
import OneBotProvider from './onebot.js';
import TelegramProvider from './telegram.js';

const providerList = {};

function init() {
	const providers = [
		new WebhookProvider(),
		new OneBotProvider(),
		new TelegramProvider(),
	];

	for (const p of providers) {
		if (!p.name) {
			throw new Error('Notification provider without name');
		}
		providerList[p.name] = p;
	}
}

init();

export { providerList };
