import Compressor from "compressorjs";

export function getExtName(fileName) {
    const index = fileName.lastIndexOf('.')
    return index !== -1 ? fileName.slice(index + 1).toLowerCase() : ''
}

export function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const size = (bytes / Math.pow(k, i)).toFixed(2);
    return `${size} ${units[i]}`;
}

export function fileToBase64(file, type = false) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            if (type) {
                const base64 = reader.result;
                resolve(base64);
            } else {
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            }
        };
        reader.onerror = reject;
    });
}

export function base64Size(base64String) {
    const padding = (base64String.match(/=*$/) || [''])[0].length;
    const base64Length = base64String.length;
    return (base64Length * 3) / 4 - padding;
}

export function compressImage(file, config = {}) {
    return new Promise((resolve, reject) => {

        if (file.size < (config.convertSize || 1024 * 1024)) {
            resolve(file)
        }

        new Compressor(file, {
            quality: config.quality || 0.8,
            mimeType: 'image/jpeg',
            success(result) {
                resolve(result);
            },
            error(err) {
                reject(err);
            },
        });
    });
}