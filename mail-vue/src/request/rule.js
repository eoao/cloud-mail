import http from '@/axios/index.js';

export function ruleVocabulary() {
    return http.get('/rule/vocabulary')
}

export function ruleList() {
    return http.get('/rule/list')
}

export function ruleSet(form) {
    return http.post('/rule/set', form)
}

export function ruleDelete(ruleId) {
    return http.delete('/rule/delete?ruleId=' + ruleId)
}

export function templateList() {
    return http.get('/template/list')
}

export function templateSet(form) {
    return http.post('/template/set', form)
}

export function templateDelete(templateId) {
    return http.delete('/template/delete?templateId=' + templateId)
}

export function emailCancelSend(emailId) {
    return http.put('/email/cancelSend', {emailId}, {noMsg: true})
}

export function emailSnooze(emailIds, until) {
    return http.put('/email/snooze', {emailIds, until})
}
