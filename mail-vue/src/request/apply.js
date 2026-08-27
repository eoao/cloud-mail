import http from '@/axios/index.js';

// 申请页接口：noMsg 由页面自行处理提示与跳转（避免轮询 401 时被拦截器踢回登录页）
export function applyMine(token) {
    return http.get('/oauth/apply/mine', {headers: {Authorization: token}, noMsg: true})
}

export function applyAdd(params) {
    return http.post('/oauth/apply/add', params, {headers: {Authorization: sessionStorage.getItem('applyJwt')}, noMsg: true})
}

export function applyList(params) {
    return http.get('/apply/list', {params: {...params}})
}

export function applyApprove(applyId) {
    return http.put('/apply/approve', {applyId})
}

export function applyReject(applyId, remark) {
    return http.put('/apply/reject', {applyId, remark})
}
