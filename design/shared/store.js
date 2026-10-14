// Remembered settings for the design pages. Every read and write is wrapped: with storage blocked (a private
// window, cleared or blocked site data, a sandboxed preview) the page still works and simply forgets.

/** The saved object for key, merged over the defaults. Never throws. */
export function load(key, defaults = {}) {
  try {
    const raw = window.localStorage.getItem(key)
    const saved = raw ? JSON.parse(raw) : null
    return saved && typeof saved === 'object' ? { ...defaults, ...saved } : { ...defaults }
  } catch {
    return { ...defaults }
  }
}

/** Save an object under key. Quietly does nothing when storage is unavailable. */
export function save(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage blocked or full: keep going without it.
  }
}

/** A media query that also works where matchMedia is missing. */
export const media = (q) => (window.matchMedia ? window.matchMedia(q) : { matches: false, addEventListener() {} })
