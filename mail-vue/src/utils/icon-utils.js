import {getExtName} from "@/utils/file-utils.js";

export function getIconByName(filename) {
    const extName = getExtName(filename)
    if (['zip', 'rar', '7z', 'tar', 'tgz'].includes(extName)) return {
        icon: 'mdi:zip-box',
        width: '24px',
        height: '24px',
        color: '#FBBD08',
    };
    if (['png', 'jpg', 'jpeg','gif','webp','jfif'].includes(extName)) return {
        icon: 'fluent-color:image-24',
        width: '24px',
        height: '24px',
        color: ''
    };
    if (['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv'].includes(extName)) return {
        icon: 'fluent:video-clip-20-filled',
        width: '24px',
        height: '24px',
        color: '#658bff'
    };
    if (['txt','md','ini','conf'].includes(extName)) return {
        icon: 'fluent-color:document-48',
        width: '24px',
        height: '24px',
        color: ''
    };
    if (['doc', 'docx'].includes(extName)) return {
        icon: 'vscode-icons:file-type-word',
        width: '23px',
        height: '23px',
        color: ''
    };
    if (['xls', 'csv', 'xlsx'].includes(extName)) return {
        icon: 'vscode-icons:file-type-excel',
        width: '23px',
        height: '23px',
        color: ''
    };
    if (['mp3', 'wav', 'aac', 'ogg', 'flac', 'm4a'].includes(extName)) return {
        icon: 'lineicons:apple-music',
        width: '24px',
        height: '24px',
        color: '#e91e63'
    };
    if (['ppt', 'pptx', 'pps', 'potx', 'pot'].includes(extName)) return {
        icon: 'vscode-icons:file-type-powerpoint',
        width: '24px',
        height: '24px',
        color: ''
    };
    if (extName === 'pdf') return {
        icon: 'material-icon-theme:pdf',
        width: '24px',
        height: '24px',
        color: ''
    };
    return {
        icon: "solar:paperclip-rounded-2-bold",
        width: '24px',
        height: '24px',
        color: '#1CBBF0'
    };

}
