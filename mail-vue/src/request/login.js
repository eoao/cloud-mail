import http from '@/axios/index.js';

export function login(email, password, totpCode) {
    // noMsg: a 428 means "second factor needed", which the caller turns into a
    // prompt rather than an error toast.
    return http.post('/login', {email, password, totpCode}, {noMsg: true})
}

export function logout() {
    return http.delete('/logout')
}

export function register(form) {
    return http.post('/register', form)
}