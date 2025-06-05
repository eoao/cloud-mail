import http from '@/axios/index.js';

export function sysEmailAll(params) {
    return http.get('/sys-email/list', {params: {...params}})
}

export function sysEmailDelete(emailIds) {
    return http.delete('/sys-email/delete?emailIds=' + emailIds)
}
