import http from '@/axios/index.js';

export function contactList(params) {
    return http.get('/contact/list', {params})
}

export function contactSet(form) {
    return http.post('/contact/set', form)
}

export function contactDelete(contactId) {
    return http.delete('/contact/delete?contactId=' + contactId)
}

export function calendarList(params) {
    return http.get('/calendar/list', {params})
}

export function calendarImport(ics, emailId) {
    return http.post('/calendar/import', {ics, emailId})
}

export function calendarRespond(eventId, response) {
    return http.put('/calendar/respond', {eventId, response})
}

export function calendarDelete(eventId) {
    return http.delete('/calendar/delete?eventId=' + eventId)
}

export function taskList(includeDone) {
    return http.get('/task/list', {params: {includeDone: includeDone ? 1 : undefined}})
}

export function taskSet(form) {
    return http.post('/task/set', form)
}

export function taskDelete(taskId) {
    return http.delete('/task/delete?taskId=' + taskId)
}
