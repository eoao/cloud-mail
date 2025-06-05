import {createApp} from 'vue';
import App from './App.vue';
import router from './router';
import 'element-plus/dist/index.css';
import './style.css';
import ElementPlus from 'element-plus';
import VueCropper from 'vue-cropper';
import 'vue-cropper/dist/index.css'
import { init } from '@/utils/init.js';
import { createPinia } from 'pinia';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import piniaPersistedState from 'pinia-plugin-persistedstate';
import perm from "@/directives/perm.js";
const pinia = createPinia().use(piniaPersistedState)
const app = createApp(App).use(pinia)
app.use(ElementPlus, {
    locale: zhCn,
});
await init()

app.use(router).use(VueCropper).directive('perm',perm)
app.config.devtools = true;

app.mount('#app');
