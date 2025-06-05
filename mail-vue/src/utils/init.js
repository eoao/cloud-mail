import { useUserStore } from "@/store/user.js";
import { useSettingStore } from "@/store/setting.js";
import { useAccountStore } from "@/store/account.js";
import { loginUserInfo } from "@/request/my.js";
import { permsToRouter } from "@/utils/perm.js";
import router from "@/router";
import { settingQuery } from "@/request/setting.js";
import {cvtR2Url} from "@/utils/convert.js";
import {ElMessage} from "element-plus";

export async function init() {
    document.title = '-'

    const settingStore = useSettingStore();
    const userStore = useUserStore();
    const accountStore = useAccountStore();

    const token = localStorage.getItem('token');

    let setting = null;

    if (token) {
        const userPromise = loginUserInfo().catch(e => {
            console.error(e);
            return null;
        });

        const [s, user] = await Promise.all([settingQuery(), userPromise]);
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
        setting = await settingQuery();
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

