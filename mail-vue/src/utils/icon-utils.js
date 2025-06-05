import {getExtName} from "@/utils/file-utils.js";

export function getIconByName(filename) {
    const extName = getExtName(filename)
    if (['zip', 'rar', '7z', 'tar', 'tgz'].includes(extName)) return 'octicon:file-zip-24';
    if (['png', 'jpg', 'jpeg','gif','webp'].includes(extName)) return 'mingcute:pic-line';
    if (['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv'].includes(extName)) return 'fluent:video-clip-24-regular';
    if (['txt', 'doc', 'docx', 'md','ini','conf'].includes(extName)) return 'hugeicons:google-doc'
    if (['xls', 'csv', 'xlsx'].includes(extName)) return 'codicon:table';
    if (['mp3', 'wav', 'aac', 'ogg', 'flac', 'm4a'].includes(extName)) return 'mynaui:music';
    if (['.ppt', 'pptx', 'pps', 'potx', 'pot'].includes(extName)) return 'lsicon:file-ppt-filled'
    if (extName === 'pdf') return 'hugeicons:pdf-02';
    if (extName === 'apk') return 'proicons:android';
    if (extName === 'exe') return 'bi:filetype-exe';
    return "hugeicons:attachment-01"
}