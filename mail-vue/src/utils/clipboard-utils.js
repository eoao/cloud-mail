export async function copyText(text) {
    const value = text == null ? '' : String(text)

    if (typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function') {
        return await navigator.clipboard.writeText(value)
    }

    return new Promise((resolve, reject) => {
        try {
            const ta = document.createElement('textarea')
            ta.value = value
            ta.setAttribute('readonly', '')

            // 避免页面抖动、滚动与可视影响
            const s = ta.style
            s.position = 'fixed'
            s.top = '0'
            s.left = '0'
            s.width = '1px'
            s.height = '1px'
            s.padding = '0'
            s.border = '0'
            s.outline = 'none'
            s.boxShadow = 'none'
            s.background = 'transparent'
            s.opacity = '0'

            document.body.appendChild(ta)

            // 选择内容
            ta.focus()
            ta.select()

            let ok = false
            try {
                ok = document.execCommand('copy')
            } catch (err) {
                return reject(err)
            } finally {
                document.body.removeChild(ta)
            }
            ok ? resolve() : reject(new Error('Copy command unsuccessful'))
        } catch (e) {
            reject(e)
        }
    })
}

