import http from '@/axios/index.js'

export function accountList(accountId, size) {
    return http.get('/account/list', {params: {accountId, size}});
}

export function accountAdd(email,token) {
    return http.post('/account/add', {email,token})
}

export function accountSetName(accountId,name) {
    return http.put('/account/setName', {name,accountId})
}

export function accountDelete(accountId) {
    return http.delete('/account/delete', {params: {accountId}})
}

