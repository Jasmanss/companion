// Visual Review: what the app and its windows share. Pure, so both can use it and the tests can reach it.

import type { Rect } from './tab-place'

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

/** "3 files changed": how many files the turn changed, for the card and the viewer. */
export const filesChangedLabel = (n: number): string => `${n} ${n === 1 ? 'file' : 'files'} changed`

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

/** The "Claude says" note is at most this long: one or two sentences. */
export const SAID_MAX = 220

/** Markdown inside a line, as plain words: images and links keep their text, code keeps its text, emphasis goes. */
function plainInline(line: string): string {
  return line
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<(https?:\/\/[^>\s]+)>/g, '$1')
    .replace(/`+([^`]+?)`+/g, '$1')
    .replace(/\*\*(.+?)\*\*|__(.+?)__/g, '$1$2')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/(^|[^\w*])\*(?=\S)([^*]*?\S)\*(?![\w*])/g, '$1$2')
    .replace(/(^|[^\w])_(?=\S)([^_]*?\S)_(?!\w)/g, '$1$2')
}

/** A sentence ends at . ! ? or …, maybe inside quotes or brackets, before the next one starts with a capital or a digit. */
const SENTENCE_END = /(?<=[.!?…]["'”’)\]]?)\s+(?=["'“‘([]?[A-Z0-9])/

/**
 * The "Claude says" note: the first one or two sentences of Claude's last reply (the Stop hook's
 * last_assistant_message), in plain words. Code blocks, headings and tables go; backticks, bold, links and list marks
 * are taken off. A question ("Want me to...?") says nothing about what changed, so it's skipped, and so is a word or two
 * like "Done." when more follows. At most SAID_MAX characters. null when nothing is left to say.
 */
export function sayFrom(text: string | null | undefined): string | null {
  if (!text) return null
  // Each line is a thought of its own, unless it ends with a colon and carries on into the next (a list after "I changed:").
  const units: string[] = []
  let carry = ''
  const lines = text.replace(/(```|~~~)[\s\S]*?(\1|$)/g, '\n').split('\n')
  for (const raw of lines) {
    if (/^\s*#{1,6}\s/.test(raw) || /^\s*\|/.test(raw) || /^\s*([-*_]\s*){3,}$/.test(raw)) continue
    const line = plainInline(raw.replace(/^\s*>+\s?/, '').replace(/^\s*(?:[-*+•]|\d+[.)])\s+/, '').replace(/^\[[ xX]\]\s+/, ''))
      .replace(/\s+/g, ' ')
      .trim()
    if (!line) continue
    carry = carry ? `${carry} ${line}` : line
    if (line.endsWith(':')) continue
    units.push(/[.!?…]["'”’)\]]?$/.test(carry) ? carry : `${carry}.`)
    carry = ''
  }
  const sentences = units
    .flatMap((u) => u.split(SENTENCE_END))
    .map((s) => s.trim())
    .filter((s) => s && !/\?["'”’)\]]?$/.test(s))
  while (sentences.length > 1 && sentences[0].split(' ').length <= 2) sentences.shift()
  const [first, second] = sentences
  if (!first) return null
  if (second && first.length + 1 + second.length <= SAID_MAX) return `${first} ${second}`
  if (first.length <= SAID_MAX) return first
  const cut = first.slice(0, SAID_MAX - 1)
  return `${cut.slice(0, cut.lastIndexOf(' ') > SAID_MAX / 2 ? cut.lastIndexOf(' ') : cut.length).replace(/[\s,;:.]+$/, '')}…`
}

/** The big viewer for a review: the screen's work area less this much all round, so a 1,440 wide page fits at 100%. */
export const REVIEW_VIEWER_GAP = 24

/** Where the big review viewer goes on a screen whose work area is this: centered, the work area less the gap all round. */
export function reviewViewerRect(area: Rect): Rect {
  const gap = REVIEW_VIEWER_GAP
  return { x: area.x + gap, y: area.y + gap, width: Math.max(0, area.width - 2 * gap), height: Math.max(0, area.height - 2 * gap) }
}

/** The full-page pictures of a review, for the viewer: served by main from the review store only. */
export const reviewPictureUrl = (id: string, which: 'before' | 'after'): string => `review://${id}/${which}`
