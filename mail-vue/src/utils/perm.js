import {useUserStore} from "@/store/user.js";

export default function hasPerm(permKey) {
    const {permKeys} = useUserStore().user;
    return permKeys.includes('*') || permKeys.includes(permKey);
}


export function permsToRouter(permKeys) {
    const routerList = []
    Object.keys(routers).forEach(perm => {
        if (permKeys.includes(perm) || permKeys.includes('*')) {
            routerList.push(routers[perm])
        }
    })
    return routerList;
}

const routers = {
    'user:query': {
        path: '/sys/user',
        name: 'user',
        component: () => import('@/views/user/index.vue'),
        meta: {
            title: '用户列表',
            name: 'user',
            menu: true
        }
    },
    'role:query': {
        path: '/sys/role',
        name: 'role',
        component: () => import('@/views/role/index.vue'),
        meta: {
            title: '权限控制',
            name: 'role',
            menu: true
        }
    },
    'setting:query': {
        path: '/sys/setting',
        name: 'sys-setting',
        component: () => import('@/views/sys-setting/index.vue'),
        meta: {
            title: '系统设置',
            name: 'sys-setting',
            menu: true
        }
    },
    'sys-email:query': {
        path: '/sys/email',
        name: 'sys-email',
        component: () => import('@/views/sys-email/index.vue'),
        meta: {
            title: '邮件列表',
            name: 'sys-email',
            menu: true
        }
    }
}