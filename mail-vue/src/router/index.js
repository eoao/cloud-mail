import {createRouter, createWebHashHistory} from 'vue-router'
import {loginUserInfo} from "@/request/user.js";
import {useUiStore} from "@/store/ui.js";
import {useAccountStore} from "@/store/account.js";
import {useUserStore} from "@/store/user.js";
import {useSettingStore} from "@/store/setting.js";

const routes = [
    {
        path: '/',
        name: 'layout',
        redirect: '/email',
        component: () => import('@/layout/index.vue'),
        children: [
            {
                path: '/send',
                name: 'SendEmail',
                component: () => import('@/components/SendEmail.vue'),
                meta: {
                    title: '发送邮件',
                    menu: true,
                    icon: 'icon-send'
                }
            },
            {
                path: '/email',
                name: 'email',
                component: () => import('@/views/email/index.vue'),
                meta: {
                    title: '收件箱',
                    name: 'email',
                    menu: true
                }
            },
            {
                path: '/content',
                name: 'content',
                component: () => import('@/views/content/index.vue'),
                meta: {
                    title: '邮件详情',
                    name: 'content',
                    menu: false
                }
            },
            {
                path: '/setting',
                name: 'setting',
                component: () => import('@/views/setting/index.vue'),
                meta: {
                    title: '个人设置',
                    name: 'setting',
                    menu: true
                }
            },
            {
                path: '/sys-setting',
                name: 'sys-setting',
                component: () => import('@/views/sys-setting/index.vue'),
                meta: {
                    title: '系统设置',
                    name: 'sys-setting',
                    menu: true
                }
            },
            {
                path: '/star',
                name: 'star',
                component: () => import('@/views/star/index.vue'),
                meta: {
                    title: '星标邮件',
                    name: 'star',
                    menu: true
                }
            },
        ]

    },
    {
        path: '/login',
        name: 'login',
        component: () => import('@/views/login/index.vue')
    },
    {
        path: '/test',
        name: 'test',
        component: () => import('@/views/test/index.vue')
    }
]


const router = createRouter({
    history: createWebHashHistory(import.meta.env.BASE_URL),
    routes
})

let firstLogin = true

router.beforeEach(async (to, from, next) => {

    const uiStore = useUiStore()

    if (uiStore.init && to.name === 'login') {
        await initSetting()
    }

    const token = localStorage.getItem('token')

    if (!token && to.name !== 'login') {
        return next({
            name: 'login'
        })
    }

    if (!token && to.name === 'login') {
        return next()
    }

    if (uiStore.init && to.name !== 'login') {
        await initSettingAndUserInfo()
        firstLogin = false
        return next()
    }

    if (firstLogin) {
        await initUserInfo()
        firstLogin = false
        return  next()
    }

    next()

})

router.afterEach((to) => {

    const uiStore = useUiStore()
    if (to.meta.menu) {
        if (['content', 'email'].includes(to.meta.name)) {
            uiStore.accountShow = window.innerWidth > 767;
        } else {
            uiStore.accountShow = false
        }
    }

    if (to.name === 'login') {
        firstLogin = true
    }

    if (window.innerWidth < 768) {
        uiStore.asideShow = false
    }
})


async function initSettingAndUserInfo() {
    const uiStore = useUiStore()
    const userStore = useUserStore()
    const settingStore = useSettingStore()
    const accountStore = useAccountStore()
    const [setting,user] = await Promise.all([settingStore.initSetting(),loginUserInfo()])
    uiStore.init = false
    accountStore.currentAccountId = user.accountId
    userStore.user = user
}


async function initUserInfo() {
    const uiStore = useUiStore()
    const userStore = useUserStore()
    try {
        const user = await loginUserInfo()
        const accountStore = useAccountStore()
        accountStore.currentAccountId = user.accountId
        userStore.user = user
        uiStore.loginLoading = false
    } catch (e) {
        uiStore.loginLoading = false
        throw e
    }
}


async function initSetting() {
    const settingStore = useSettingStore()
    const uiStore = useUiStore()
    try {
        await settingStore.initSetting();
        uiStore.init = false
    } catch (e) {
        throw e
    }
}

export default router
