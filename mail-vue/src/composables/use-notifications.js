import {ref} from 'vue'

// New-mail alerting: browser notification, sound, and visual badges.
//
// Three independent channels, each separately switchable, because they fail in
// different ways: notifications need an OS-level permission the user may have
// denied, audio is blocked until the page has been interacted with, and the
// title/favicon badge always works. The badge is therefore the fallback that
// never silently does nothing.

const STORAGE_KEY = 'notify-prefs'

const defaults = {
  desktop: false,
  sound: false,
  badge: true,
  volume: 0.4,
  quietFrom: '',
  quietTo: ''
}

function load() {
  try {
    return {...defaults, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')}
  } catch {
    return {...defaults}
  }
}

export const prefs = ref(load())

export function savePrefs(next) {
  prefs.value = {...prefs.value, ...next}
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs.value))
  } catch {
    // Private mode or blocked storage - preferences just do not persist.
  }
}

export function permission() {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
}

export async function requestPermission() {
  if (typeof Notification === 'undefined') {
    return 'unsupported'
  }
  if (Notification.permission === 'granted') {
    return 'granted'
  }
  return Notification.requestPermission()
}

/** True while the user's quiet hours are in effect (handles windows crossing midnight). */
export function inQuietHours(now = new Date()) {
  const {quietFrom, quietTo} = prefs.value

  if (!quietFrom || !quietTo) {
    return false
  }

  const minutes = now.getHours() * 60 + now.getMinutes()
  const toMinutes = (hhmm) => {
    const [h, m] = String(hhmm).split(':').map(Number)
    return (h || 0) * 60 + (m || 0)
  }

  const from = toMinutes(quietFrom)
  const to = toMinutes(quietTo)

  // 22:00 -> 07:00 wraps past midnight, so the test inverts.
  return from <= to ? minutes >= from && minutes < to : minutes >= from || minutes < to
}

// ---- sound --------------------------------------------------------------

let audioContext = null

/**
 * A short two-tone chime synthesised in the browser - no asset to ship, no
 * request to make, and it cannot 404.
 */
export function playChime(volume = prefs.value.volume) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return false

    audioContext ??= new Ctx()

    // Browsers suspend audio until the page has been interacted with.
    if (audioContext.state === 'suspended') {
      audioContext.resume()
    }

    const now = audioContext.currentTime
    const gain = audioContext.createGain()
    gain.connect(audioContext.destination)
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(Math.min(Math.max(volume, 0), 1), now + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45)

    for (const [freq, at] of [[880, 0], [1320, 0.12]]) {
      const osc = audioContext.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = freq
      osc.connect(gain)
      osc.start(now + at)
      osc.stop(now + at + 0.3)
    }

    return true
  } catch {
    return false
  }
}

// ---- visual badge -------------------------------------------------------

let baseTitle = null
let faviconEl = null
let baseFavicon = null

function ensureFavicon() {
  if (faviconEl) return faviconEl

  faviconEl = document.querySelector("link[rel~='icon']")

  if (!faviconEl) {
    faviconEl = document.createElement('link')
    faviconEl.rel = 'icon'
    document.head.appendChild(faviconEl)
  }

  baseFavicon ??= faviconEl.href
  return faviconEl
}

/** Draw the unread count as a dot on top of the existing favicon. */
function paintFavicon(count) {
  const link = ensureFavicon()

  if (!count) {
    if (baseFavicon) link.href = baseFavicon
    return
  }

  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 64
  const ctx = canvas.getContext('2d')

  const draw = () => {
    ctx.fillStyle = '#f56c6c'
    ctx.beginPath()
    ctx.arc(46, 18, 18, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = '#fff'
    ctx.font = 'bold 24px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(count > 9 ? '9+' : String(count), 46, 19)

    link.href = canvas.toDataURL('image/png')
  }

  if (!baseFavicon) {
    draw()
    return
  }

  const img = new Image()
  img.onload = () => {
    ctx.drawImage(img, 0, 0, 64, 64)
    draw()
  }
  // A cross-origin or missing icon must not stop the badge appearing.
  img.onerror = draw
  img.src = baseFavicon
}

export function setBadge(count) {
  baseTitle ??= document.title

  document.title = count > 0 ? `(${count}) ${baseTitle}` : baseTitle
  paintFavicon(count)

  // The OS-level badge, where the browser supports it.
  if (navigator.setAppBadge) {
    count > 0 ? navigator.setAppBadge(count).catch(() => {}) : navigator.clearAppBadge?.().catch(() => {})
  }
}

// ---- entry point --------------------------------------------------------

/**
 * Announce newly arrived mail.
 *
 * @param emails  the messages that just arrived
 * @param unread  total unread count, for the badge
 * @param onOpen  called when the user clicks a desktop notification
 */
export function notifyNewMail(emails, unread, onOpen) {

  if (prefs.value.badge) {
    setBadge(unread)
  }

  if (!emails?.length || inQuietHours()) {
    return
  }

  // Don't interrupt someone who is already looking at the mailbox.
  if (document.visibilityState === 'visible') {
    return
  }

  if (prefs.value.sound) {
    playChime()
  }

  if (prefs.value.desktop && permission() === 'granted') {
    const first = emails[0]
    const title = emails.length === 1
      ? (first.name || first.sendEmail || 'New message')
      : `${emails.length} new messages`

    try {
      const n = new Notification(title, {
        body: first.subject || '',
        tag: 'cloud-mail-new',
        renotify: true
      })
      n.onclick = () => {
        window.focus()
        onOpen?.(first)
        n.close()
      }
    } catch {
      // Some browsers throw for Notification outside a service worker.
    }
  }
}

export default {prefs, savePrefs, permission, requestPermission, notifyNewMail, setBadge, playChime, inQuietHours}
