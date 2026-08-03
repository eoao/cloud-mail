import http from '@/axios/index.js';

export function passkeyAuthOptions() {
    return http.post('/passkey/auth/options')
}

export function passkeyAuthVerify(transactionId, response) {
    return http.post('/passkey/auth/verify', {transactionId, response})
}

export function passkeyStatus() {
    return http.get('/my/passkey')
}

export function passkeyRegOptions(password) {
    return http.post('/my/passkey/reg/options', {password})
}

export function passkeyRegVerify(transactionId, response) {
    return http.post('/my/passkey/reg/verify', {transactionId, response})
}

export function passkeyDelete(password) {
    return http.delete('/my/passkey', {data: {password}})
}
