import http from '@/axios/index.js';

// Interactive tasks run inline (a human is waiting); system work goes through
// the job queue on the worker side.
const LONG = {noMsg: true, timeout: 60 * 1000}

export function aiRun(task, input) {
    return http.post('/ai/run', {task, input}, LONG)
}

export function aiTasks() {
    return http.get('/ai/tasks')
}

export function aiDrivers() {
    return http.get('/ai/drivers')
}

export function aiList() {
    return http.get('/ai/list')
}

export function aiBindings() {
    return http.get('/ai/bindings')
}

export function aiSet(form) {
    return http.post('/ai/set', form)
}

export function aiDelete(aiId) {
    return http.delete('/ai/delete?aiId=' + aiId)
}

export function aiBind(task, aiId) {
    return http.post('/ai/bind', {task, aiId})
}

export function aiTest() {
    return http.post('/ai/test', {}, LONG)
}
