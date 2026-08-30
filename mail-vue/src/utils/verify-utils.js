export function isEmail(email) {
    const reg = /^[a-zA-Z0-9!#$%&'*+/=?^_`{|}~.-]+@([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;
    return reg.test(email);
}

export function isDomain(str) {
    return /^(?!:\/\/)([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/.test(str);
}

export function isIpUrl(url) {
    if (!url) return false
    try {
        const { hostname } = new URL(url.startsWith('http') ? url : 'https://' + url)
        if (/^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/.test(hostname)) {
            return true
        }
        return hostname.includes(':')
    } catch {
        return false
    }
}