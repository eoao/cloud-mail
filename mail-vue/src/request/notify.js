import http from '@/axios/index.js';

export function notifyTypes() {
	return http.get('/notify/types')
}

export function notifyList() {
	return http.get('/notify/list')
}

export function notifyAdd(params) {
	return http.post('/notify/add', params)
}

export function notifySet(params) {
	return http.put('/notify/set', params)
}

export function notifyDelete(id) {
	return http.delete('/notify/delete', { data: { id } })
}

export function notifyTest(id) {
	return http.post(`/notify/test/${id}`)
}

export function notifyReNotify(emailId) {
	return http.post(`/notify/re-notify/${emailId}`)
}
