import http from '@/axios/index.js';

export function jobStats() {
    return http.get('/job/stats')
}

export function jobList(status, size) {
    return http.get('/job/list', {params: {status, size}})
}

export function jobRetry(jobId) {
    return http.put('/job/retry', {jobId})
}

export function jobCancel(jobId) {
    return http.delete('/job/cancel?jobId=' + jobId)
}

export function jobPing() {
    return http.post('/job/ping')
}
