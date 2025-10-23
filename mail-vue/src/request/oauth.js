import http from '@/axios/index.js'

export function getOauthBindings() {
	return http.get('/oauth/bindings');
}

export function initOauthLogin(provider) {
	return http.post('/auth/oauth/login', { provider });
}

export function initOauthBind(provider) {
	return http.post('/oauth/authorize', { provider });
}

export function bindOauthAccount(provider, oauthData) {
	return http.post('/oauth/bind', { provider, oauthData });
}

export function unbindOauthAccount(provider) {
	return http.delete('/oauth/unbind', { data: { provider } });
}

export function refreshOauthToken(provider) {
	return http.post('/oauth/refresh', { provider });
}
