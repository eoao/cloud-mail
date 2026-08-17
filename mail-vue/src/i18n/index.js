import { createI18n } from 'vue-i18n';
import en from './en.js'
import zh_cn from './zh_cn.js'
import zh_tw from './zh_tw.js'
const i18n = createI18n({
    legacy: false,
    messages: {
        zh_cn,
        zh_tw,
        en
    },
});

export default i18n;