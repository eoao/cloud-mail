import http from '@/axios/index.js';

export function oauthLinuxDoLogin(code) {
    return http.post('/oauth/linuxDo/login',{code})
}

export function oauthGithubLogin(code) {
    return http.post('/oauth/github/login',{code})
}

export function oauthGitlabLogin(code) {
    return http.post('/oauth/gitlab/login',{code})
}

export function oauthGoogleLogin(code) {
    return http.post('/oauth/google/login',{code})
}

export function oauthBindUser(form) {
    return http.put('/oauth/bindUser', form)
}
