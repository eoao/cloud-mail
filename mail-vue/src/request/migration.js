import http from '@/axios/index.js'

export function migrationStart() {
    return http.post('/migration/start')
}
