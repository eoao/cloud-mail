import {useUserStore} from "@/store/user.js";
import {useSettingStore} from "@/store/setting.js";
import {useAccountStore} from "@/store/account.js";
import {loginUserInfo} from "@/request/my.js";
import {permsToRouter} from "@/perm/perm.js";
import router from "@/router";
import {websiteConfig} from "@/request/setting.js";
import i18n from "@/i18n/index.js";

export async function init() {
    document.title = '\u200B'

    const settingStore = useSettingStore();
    const userStore = useUserStore();
    const accountStore = useAccountStore();

    if (!settingStore.lang) {
        let lang = navigator.language.split('-')[0]
        lang = lang === 'zh' ? lang : 'en'
        settingStore.lang = lang
    }

    i18n.global.locale.value = settingStore.lang

    const s = await websiteConfig();
    settingStore.settings = s;
    settingStore.domainList = s.domainList;
    document.title = s.title;

    try {
        const user = await loginUserInfo();
        userStore.markAuthenticated();
        accountStore.currentAccountId = user.account.accountId;
        accountStore.currentAccount = user.account;
        userStore.user = user;

        const routers = permsToRouter(user.permKeys);
        routers.forEach(routerData => {
            router.addRoute('layout', routerData);
        });
    } catch (e) {
        userStore.clearAuth();
    }
}
