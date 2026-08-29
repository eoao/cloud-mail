import http from '@/axios/index.js';

export function totpStatus() {
    return http.get('/totp/status')
}

export function totpStart() {
    return http.post('/totp/start')
}

export function totpConfirm(code) {
    return http.post('/totp/confirm', {code})
}

export function totpDisable(password, code) {
    return http.post('/totp/disable', {password, code})
}

export function apiKeyScopes() {
    return http.get('/apiKey/scopes')
}

export function apiKeyList() {
    return http.get('/apiKey/list')
}

export function apiKeyCreate(form) {
    return http.post('/apiKey/create', form)
}

export function apiKeyRevoke(keyId) {
    return http.put('/apiKey/revoke', {keyId})
}

export function webhookOutList() {
    return http.get('/webhookOut/list')
}

export function webhookOutSet(form) {
    return http.post('/webhookOut/set', form)
}

export function webhookOutDelete(webhookId) {
    return http.delete('/webhookOut/delete?webhookId=' + webhookId)
}

export function webhookOutTest() {
    return http.post('/webhookOut/test')
}
