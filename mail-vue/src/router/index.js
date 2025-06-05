    import {createRouter, createWebHistory} from 'vue-router'
import {useUiStore} from "@/store/ui.js";

const routes = [
    {
        path: '/',
        name: 'layout',
        redirect: '/email',
        component: () => import('@/layout/index.vue'),
        children: [
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
                path: '/send',
                name: 'send',
                component: () => import('@/views/send/index.vue'),
                meta: {
                    title: '已发送',
                    name: 'send',
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
    },
    {
        path: '/:pathMatch(.*)*',
        name: '404',
        component: () => import('@/views/404/index.vue')
    }
]


const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes
})

router.beforeEach(async (to, from, next) => {

    const token = localStorage.getItem('token')

    if (!token && to.name !== 'login') {

        return next({
            name: 'login'
        })
    }

    if (!token && to.name === 'login') {
        return next()
    }

    next()

})

router.afterEach((to) => {

    const uiStore = useUiStore()
    if (to.meta.menu) {
        if (['content', 'email', 'send'].includes(to.meta.name)) {
            uiStore.accountShow = window.innerWidth > 767;
        } else {
            uiStore.accountShow = false
        }
    }

    if (window.innerWidth < 1024) {
        uiStore.asideShow = false
    }
})

export default router
