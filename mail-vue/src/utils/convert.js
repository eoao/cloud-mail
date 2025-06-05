import {useSettingStore} from "@/store/setting.js";
export function cvtR2Url(key) {
    const settingStore = useSettingStore();
    return settingStore.settings.r2Domain + '/' + key
}