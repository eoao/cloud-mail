// OAuth 授权地址构造，登录页与申请页共用
function buildAuthorizeUrl(provider, clientId) {
    const redirectUri = encodeURIComponent(window.location.origin + '/login')
    const authorizeUrls = {
        linuxdo: `https://connect.linux.do/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=openid+profile+email&state=${provider}`,
        github: `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=user:email&state=${provider}`,
        google: `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=openid+profile+email&state=${provider}`,
    }
    return authorizeUrls[provider]
}

export function launchOauth(provider, clientId, intent) {
    sessionStorage.setItem('oauthProvider', provider)
    if (intent) {
        sessionStorage.setItem('oauthNext', intent)
    }
    window.location.href = buildAuthorizeUrl(provider, clientId)
}
