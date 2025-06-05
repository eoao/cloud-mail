import http from '@/axios/index.js';

export function roleAdd(params) {
    return http.post('/role/add',params)
}

export function rolePermTree() {
    return http.get('/role/permTree')
}

export function roleRoleList() {
    return http.get('/role/list')
}

export function roleSet(params) {
    return http.put('/role/set',params)
}

export function roleDelete(roleId) {
    return http.delete('/role/delete',{params:{roleId}})
}

export function roleSetDef(roleId) {
    return http.put('/role/setDefault',{roleId})
}


export function roleSelectUse() {
    return http.get('/role/selectUse')
}
