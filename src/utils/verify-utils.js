export function isEmail(email) {
    const reg = /^[a-zA-Z0-9!#$%&'*+/=?^_`{|}~.-]+@([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;
    return reg.test(email);
}

export function isDomain(str) {
    return /^(?!:\/\/)([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/.test(str);
}