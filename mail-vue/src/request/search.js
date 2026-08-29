import http from '@/axios/index.js';

export function searchEmail(params) {
    return http.get('/search/email', {params})
}

export function threadMessages(threadId) {
    return http.get('/thread/messages', {params: {threadId}})
}

export function threadRead(threadId) {
    return http.put('/thread/read', {threadId})
}

export function threadDelete(threadIds) {
    return http.delete('/thread/delete?threadIds=' + threadIds.join(','))
}

export function labelList() {
    return http.get('/label/list')
}

export function labelSet(form) {
    return http.post('/label/set', form)
}

export function labelDelete(labelId) {
    return http.delete('/label/delete?labelId=' + labelId)
}

export function labelAssign(emailIds, labelId, attach = true) {
    return http.post('/label/assign', {emailIds, labelId, attach})
}
