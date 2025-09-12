<template>
  <el-config-provider :locale="lang">
    <router-view />
  </el-config-provider>
</template>
<script setup>
import { useI18n } from "vue-i18n";
import { watch, computed } from "vue";
import {useSettingStore} from "@/store/setting.js";
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import zhTW from 'element-plus/es/locale/lang/zh-tw';

const settingStore = useSettingStore()
const { locale } = useI18n()
locale.value = settingStore.lang

watch(() => settingStore.lang, () => locale.value = settingStore.lang)

const lang = computed(() => {
    if (settingStore.lang === 'zh') {
        return zhCn
    } else if (settingStore.lang === 'zhTW') {
        return zhTW
    } else {
        return null
    }
})
</script>
