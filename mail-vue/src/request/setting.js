import http from '@/axios/index.js';

export function settingSet(setting) {
    return http.put('/setting/set',setting)
}

export function settingQuery() {
    return http.get('/setting/query')
}

export function setBackground(background) {
    return http.put('/setting/setBackground',{background})
}

export function physicsDeleteAll() {
    return http.delete('/setting/physicsDeleteAll')
}