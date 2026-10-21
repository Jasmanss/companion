// Visual Review: what the app and its windows share. Pure, so both can use it and the tests can reach it.

/** The only hosts Visual Review will load: this Mac itself. */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])
export const isLoopbackHost = (hostname: string): boolean => LOOPBACK_HOSTS.has(hostname.toLowerCase())

export const MAX_ADDRESS_LENGTH = 300

export type AddressResult = { ok: true; url: string } | { ok: false; reason: string }

/**
 * What someone typed as their app's address, tidied: "localhost:3000" becomes "http://localhost:3000", a path and query
 * are kept ("localhost:3000/pricing"), a #fragment is dropped. Refuses any host that isn't on this Mac, a login in the
 * address, and anything that isn't http(s). Used for what Settings accepts, and again before every capture.
 */
export function parseAppAddress(input: string): AddressResult {
  const text = input.trim()
  if (!text) return { ok: false, reason: 'Type the address your app runs at, such as localhost:3000.' }
  if (text.length > MAX_ADDRESS_LENGTH) return { ok: false, reason: 'That address is too long.' }
  let url: URL
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `http://${text}`)
  } catch {
    return { ok: false, reason: "That doesn't look like an address. Try localhost:3000." }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, reason: 'Only http and https addresses work.' }
  if (url.username || url.password) return { ok: false, reason: 'Leave the login out of the address. Steward does not sign in.' }
  if (!isLoopbackHost(url.hostname)) return { ok: false, reason: 'Only addresses on this Mac work: localhost or 127.0.0.1.' }
  return { ok: true, url: `${url.protocol}//${url.host}${url.pathname === '/' ? '' : url.pathname}${url.search}` }
}

/** Whether a URL is one Visual Review may load, as parseAppAddress would accept it (a captured page's own redirects are checked with this). */
export function isLoopbackUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return (u.protocol === 'http:' || u.protocol === 'https:') && !u.username && !u.password && isLoopbackHost(u.hostname)
  } catch {
    return false
  }
}

/** "http://localhost:3000/pricing" as it is shown: "localhost:3000/pricing". */
export const addressLabel = (url: string): string => url.replace(/^http:\/\//, '')

/** What "Send it back" copies, ready to paste into the Claude Code session: the user's words, and where the pictures are. */
export function reviewNote(r: { project: string; address: string; note: string; afterFile: string; beforeFile: string | null }): string {
  const lines = [`Visual Review of ${r.project} (${addressLabel(r.address)}): please change this.`, r.note.trim() || '(no note)', `What I saw: ${r.afterFile}`]
  if (r.beforeFile) lines.push(`What it looked like before: ${r.beforeFile}`)
  return lines.join('\n')
}

/** The picture in the card shows the top of the page, this wide and 16:10, like the design. */
export const CARD_SHOT = { width: 1440, height: 900 } as const

/** A path that is a login page: /login, /sign-in, /auth/callback, /api/auth/signin, #/login and the like. */
const LOGIN_PATH = /log-?in|log_in|sign-?in|sign_in|\bauth\b|\boauth|\bsso\b/i

/**
 * Where the page ended up, when it isn't the address that was asked for (a redirect, or the app's own router), in words.
 * `login` when it looks like a login page: Steward never signs in, so all it would ever see is that page.
 */
export function landingNote(address: string, landedOn: string | undefined): { login: boolean; text: string } | null {
  if (!landedOn) return null
  let asked: URL
  let landed: URL
  try {
    asked = new URL(address)
    landed = new URL(landedOn)
  } catch {
    return null
  }
  const where = (u: URL) => `${u.pathname === '/' ? '' : u.pathname}${u.search}${u.hash}`
  if (where(asked) === where(landed)) return null
  const path = where(landed) || '/'
  const label = addressLabel(address)
  if (LOGIN_PATH.test(path)) {
    return {
      login: true,
      text: `${label} sends you to ${path}, so Visual Review would only see the login page. Use a page that doesn't need a login, like ${asked.protocol}//${asked.host}/some-page.`,
    }
  }
  return { login: false, text: `${label} goes on to ${path}. Visual Review looks at the page it ends up on.` }
}
