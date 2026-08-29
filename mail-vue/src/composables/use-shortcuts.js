import {onMounted, onBeforeUnmount} from 'vue'

// Global keyboard shortcuts.
//
// Single-key shortcuts are only safe if they never fire while the user is
// typing, so every handler is gated on the event not originating from an
// editable element - inputs, textareas, contenteditable (TinyMCE) and anything
// a component has explicitly opted out of with data-no-shortcut.

const EDITABLE = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

export function isTyping(event) {
  const el = event.target

  if (!el || !el.tagName) {
    return false
  }

  if (EDITABLE.has(el.tagName)) {
    return true
  }

  if (el.isContentEditable) {
    return true
  }

  return !!el.closest?.('[data-no-shortcut], .tox, .el-dialog')
}

/** Normalise an event into a comparable key string, e.g. "ctrl+k" or "?". */
export function keyOf(event) {
  const parts = []

  if (event.ctrlKey || event.metaKey) parts.push('mod')
  if (event.altKey) parts.push('alt')
  if (event.shiftKey && event.key.length > 1) parts.push('shift')

  parts.push(event.key.length === 1 ? event.key.toLowerCase() : event.key.toLowerCase())

  return parts.join('+')
}

/**
 * @param map  { "c": fn, "mod+k": fn, ... }. A binding whose key contains a
 *             modifier still fires while typing; bare keys never do.
 */
export function useShortcuts(map) {

  const handler = (event) => {
    const key = keyOf(event)
    const fn = map[key]

    if (!fn) {
      return
    }

    const hasModifier = key.includes('mod') || key.includes('alt')

    if (!hasModifier && isTyping(event)) {
      return
    }

    event.preventDefault()
    fn(event)
  }

  onMounted(() => window.addEventListener('keydown', handler))
  onBeforeUnmount(() => window.removeEventListener('keydown', handler))

  return {handler}
}

export default useShortcuts
