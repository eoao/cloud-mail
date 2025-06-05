import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.locale('zh-cn')


export function fromNow(date) {
    const d = dayjs.utc(date).tz('Asia/Shanghai');
    const now = dayjs();
    const diffSeconds = now.diff(d, 'second');
    const diffMinutes = now.diff(d, 'minute');
    const diffHours = now.diff(d, 'hour');
    const isToday = now.isSame(d, 'day');

    if (isToday) {
        if (diffSeconds < 60) return `几秒前`;
        if (diffMinutes < 60) return `${diffMinutes}分钟前`;
        if (diffHours >= 1 && diffHours < 2) return '1小时前';
        return d.format('HH:mm');
    }
    else if (now.subtract(1, 'day').isSame(d, 'day')) {
        return `昨天 ${d.format('HH:mm')}`;
    }
    else if (now.subtract(2, 'day').isSame(d, 'day')) {
        return `前天 ${d.format('HH:mm')}`;
    }
    return d.year() === now.year()
        ? d.format('M月D日')
        : d.format('YYYY/M/D');
}


export function formatDetailDate(time) {
    return dayjs.utc(time).tz('Asia/Shanghai').format('YYYY年M月D日 ddd AH:mm')
}

export function tzDayjs(time) {
    return dayjs.utc(time).tz('Asia/Shanghai')
}