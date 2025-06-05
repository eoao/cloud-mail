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

export function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
    });
}

export function base64Size(base64String) {
    const padding = (base64String.match(/=*$/) || [''])[0].length;
    const base64Length = base64String.length;
    return (base64Length * 3) / 4 - padding;
}

export function compressImage(file, quality = 0.6) {
    return new Promise((resolve, reject) => {
        new Compressor(file, {
            quality,
            mimeType: 'image/jpeg',
            convertSize: 1024 * 1024,
            success(result) {
                resolve(result);
            },
            error(err) {
                reject(err);
            },
        });
    });
}
