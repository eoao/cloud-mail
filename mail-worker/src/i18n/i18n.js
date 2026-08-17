import i18next from 'i18next';
import zh_cn from './zh_cn.js'
import zh_tw from './zh_tw.js'
import en from './en.js'
import app from '../hono/hono';

app.use('*', async (c, next) => {
	const lang = c.req.header('accept-language')?.split('-')[0]
	i18next.init({
		lng: lang,
	});
	return await next()
})

const resources = {
	en: {
		translation: en
	},
	zh_cn: {
		translation: zh_cn,
	},
	zh_tw: {
		translation: zh_tw,
	}
};

i18next.init({
	fallbackLng: 'zh',
	resources,
});

export const t = (key, values) => i18next.t(key, values)

export default i18next;
