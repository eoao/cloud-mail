import http from '@/axios/index.js';

// Cloudflare API round-trips can be slow; these are admin actions, so a long
// timeout is better than a spurious failure.
const LONG = {timeout: 60 * 1000}

export function cfStatus() {
    return http.get('/cf/status', LONG)
}

export function cfUsage(days) {
    return http.get('/cf/usage', {params: {days}, ...LONG})
}

export function cfFix(action) {
    return http.post('/cf/fix', {action}, LONG)
}

export function cfProbe(cfApiToken) {
    return http.post('/cf/probe', {cfApiToken}, LONG)
}

export function cfCredentials(form) {
    return http.post('/cf/credentials', form)
}
