import { createI18n } from 'vue-i18n';
import en from './en.js'
import zh from './zh.js'
import tr from './tr.js'

const i18n = createI18n({
    legacy: false,
    // Any key a translation has not caught up with falls back to English
    // rather than rendering the raw key name.
    fallbackLocale: 'en',
    messages: {
        zh,
        en,
        tr
    },
});

export const locales = [
    {value: 'zh', label: '中文'},
    {value: 'en', label: 'English'},
    {value: 'tr', label: 'Türkçe'}
];

export default i18n;
