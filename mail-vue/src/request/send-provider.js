import http from '@/axios/index.js';

export function providerDrivers() {
    return http.get('/sendProvider/drivers')
}

export function providerList() {
    return http.get('/sendProvider/list')
}

export function providerSet(form) {
    return http.post('/sendProvider/set', form)
}

export function providerDelete(providerId) {
    return http.delete('/sendProvider/delete?providerId=' + providerId)
}

export function providerDns(type, domain) {
    return http.get('/sendProvider/dns', {params: {type, domain}})
}

export function providerTest(providerId, to) {
    return http.post('/sendProvider/test', {providerId, to}, {noMsg: true, timeout: 60 * 1000})
}
