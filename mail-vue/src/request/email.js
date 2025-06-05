import http from '@/axios/index.js';

export function emailList(accountId, emailId, timeSort, size, type) {
    return http.get('/email/list', {params: {accountId, emailId, timeSort, size, type}})
}

export function emailDelete(emailIds) {
    return http.delete('/email/delete?emailIds=' + emailIds)
}

export function emailLatest(emailId, accountId) {
    return http.get('/email/latest', {params: {emailId, accountId}, noMsg: true })
}

export function emailSend(form,progress) {
    return http.post('/email/send', form,{
        onUploadProgress: (e) => {
            progress(e)
        },
        noMsg: true
    })
}