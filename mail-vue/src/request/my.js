import http from '@/axios/index.js';

export function loginUserInfo() {
    return http.get('/my/loginUserInfo')
}

export function resetPassword(password) {
    return http.put('/my/resetPassword', {password})
}

export function userDelete() {
    return http.delete('/my/delete')
}

export function myOAuthAuthorize(provider) {
    return http.get(`/my/oauth/${provider}/authorize`)
}

export function myOAuthCallback(provider, payload) {
    return http.post(`/my/oauth/${provider}/callback`, payload)
}

export function myOAuthUnbind(provider) {
    return http.delete(`/my/oauth/${provider}`)
}

