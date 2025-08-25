import {useUserStore} from "@/store/user.js";
import {useSettingStore} from "@/store/setting.js";
import {useAccountStore} from "@/store/account.js";
import {loginUserInfo} from "@/request/my.js";
import {permsToRouter} from "@/perm/perm.js";
import router from "@/router";
import {websiteConfig} from "@/request/setting.js";
import {cvtR2Url} from "@/utils/convert.js";
import i18n from "@/i18n/index.js";

export async function init() {
    document.title = '\u200B'

    const settingStore = useSettingStore();
    const userStore = useUserStore();
    const accountStore = useAccountStore();

    const token = localStorage.getItem('token');

    if (!settingStore.lang) {
        let lang = navigator.language
        if (lang.split('-')[0] === 'zh') {
            settingStore.lang = lang === 'zh-CN' ? 'zh' : 'zhTW'
        } else {
            settingStore.lang = lang
        }
    }

    i18n.global.locale.value = settingStore.lang

    let setting = null;

    if (token) {
        const userPromise = loginUserInfo().catch(e => {
            console.error(e);
            return null;
        });

        const [s, user] = await Promise.all([websiteConfig(), userPromise]);
        setting = s;
        settingStore.settings = setting;
        settingStore.domainList = setting.domainList;
        document.title = setting.title;

        if (user) {
            accountStore.currentAccountId = user.accountId;
            userStore.user = user;

            const routers = permsToRouter(user.permKeys);
            routers.forEach(routerData => {
                router.addRoute('layout', routerData);
            });
        }

    } else {
        setting = await websiteConfig();
        settingStore.settings = setting;
        settingStore.domainList = setting.domainList;
        document.title = setting.title;
    }

    const loading = document.getElementById('loading-first');

    if (!setting.background) {
        loading.remove();
        return;
    }

    const img = new Image();
    img.src = cvtR2Url(setting.background);
    img.onload = () => {
        loading.remove();
    };

    img.onerror = () => {

        console.warn('背景图片加载失败:', img.src);
        loading.remove();

    };
}

