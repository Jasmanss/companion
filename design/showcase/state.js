// The Showcase's global controls (theme, motion, transparency, color, version), remembered between visits, and the
// pieces every section shares: the Pill stage, feature cards with status tags, and pausing whatever is off screen.
import { COLORS } from '../pill/render.js'
import { createStage } from '../shared/pill-stage.js'
import { env, esc } from '../shared/activity.js'
import { load, save, media } from '../shared/store.js'

/** The app's six colors first (Silver is its default), then the other eight the design explored. */
const APP = ['Silver', 'Sky', 'Lilac', 'Mint', 'Peach', 'Graphite']
export const PILL_COLORS = [...APP.map((n) => ({ ...COLORS.find((c) => c.name === n), inApp: true })), ...COLORS.filter((c) => !APP.includes(c.name))]
export const VERSIONS = [['glass', 'Glass'], ['flat', 'Flat'], ['blocky', 'Blocky']]

const KEY = 'steward-showcase'
export const S = load(KEY, {
  dark: media('(prefers-color-scheme: dark)').matches,
  rm: media('(prefers-reduced-motion: reduce)').matches,
  rt: media('(prefers-reduced-transparency: reduce)').matches,
  color: PILL_COLORS[0].hex, version: 'glass', mouth: true, think: 'dots',
})
if (!PILL_COLORS.some((c) => c.hex === S.color)) S.color = PILL_COLORS[0].hex
if (!VERSIONS.some(([v]) => v === S.version)) S.version = 'glass'

const listeners = []
/** Run fn(changedKeys) whenever any of keys change. */
export function onChange(keys, fn) { listeners.push({ keys, fn }) }
/** Change some settings, remember them, restyle the page and tell the sections that care. */
export function set(patch) {
  const changed = Object.keys(patch).filter((k) => S[k] !== patch[k])
  if (!changed.length) return
  Object.assign(S, patch)
  save(KEY, S)
  applyRoot()
  for (const l of listeners) if (l.keys.some((k) => changed.includes(k))) l.fn(changed)
}
export function applyRoot() {
  const root = document.documentElement
  root.toggleAttribute('data-dark', S.dark)
  root.dataset.theme = S.dark ? 'dark' : 'light'
  root.toggleAttribute('data-rm', S.rm)
  root.toggleAttribute('data-rt', S.rt)
  env.rm = S.rm
}

/** One stage steps every Pill on the page. everyFrame(fn) runs fn(t, dt) at the start of each of its frames. */
const hooks = []
export const everyFrame = (fn) => hooks.push(fn)
export const stage = createStage({ reduced: () => S.rm, before: (t, dt) => hooks.forEach((f) => f(t, dt)), awake: new URLSearchParams(location.search).has('awake') })
/** The Pill's look for render.js, from the global controls. */
export const look = (extra = {}) => ({ color: S.color, tinted: true, light: !S.dark, mouth: S.mouth, ...extra })
/** One Pill in host at W x H, in the global version unless kind says otherwise; returns its group. */
export function pill(host, W, H, { kind = S.version, owner, mood = 'idle', glint, seed = 1, main = false, anchor = host, follow, color } = {}) {
  const g = stage.group({ seed, anchor, mood, glint, think: S.think, mouth: S.mouth, owner, main, follow })
  stage.view(g, kind, host, W, H, look(color ? { color } : {}))
  return g
}

/* ---------------- feature cards ---------------- */
export const STATUS = {
  app: ['In the app', 'app'],
  picked: ['Picked but not built', 'picked'],
  planned: ['Planned', 'planned'],
  earlier: ['Earlier take', 'earlier'],
}
const REPO = 'https://github.com/Jasmanss/companion/blob/main/'
/** Where a feature came from: a design page, a file in the app, or nowhere yet. */
export function source(from) {
  if (!from) return '<span class="from">No design page yet</span>'
  const links = [].concat(from).map((f) => {
    if (f.startsWith('src/')) return `<a href="${REPO}${f}" target="_blank" rel="noreferrer">${esc(f.split('/').pop())} in the app</a>`
    return `<a href="${f}">${esc(f)}</a>`
  })
  return `<span class="from">From ${links.join(' and ')}</span>`
}
/** Every feature card on the page, for the list at the end. */
export const FEATURES = []
/**
 * A feature card: title, a status tag, where it came from, a line on what it does, and its demo (body HTML).
 * section: which section lists it.
 */
export function card({ id, title, status, from, desc, body = '', section, cls = '', tools = '' }) {
  const [label, key] = STATUS[status]
  FEATURES.push({ id, title, status: label, section, from })
  return `<article class="feat ${cls}" id="f-${id}" data-status="${key}">
    <header><h3>${esc(title)}</h3><span class="tag ${key}">${label}</span></header>
    ${desc ? `<p class="desc">${desc}</p>` : ''}
    <div class="body">${body}</div>
    <footer>${tools}${source(from)}</footer>
  </article>`
}

/* ---------------- off screen ---------------- */
// Anything marked [data-watch] gets .is-off while it's off screen or the tab is hidden, which freezes its CSS
// loops (see activity.css). Timelines check visible() before each step.
const shown = new WeakMap()
const watcher = new IntersectionObserver((list) => {
  for (const e of list) { shown.set(e.target, e.isIntersecting); mark(e.target) }
}, { rootMargin: '60px' })
const mark = (el) => el.classList.toggle('is-off', !shown.get(el) || document.hidden)
export function watch(el) { el.dataset.watch = ''; watcher.observe(el) }
export const visible = (el) => !!shown.get(el) && !document.hidden
document.addEventListener('visibilitychange', () => document.querySelectorAll('[data-watch]').forEach(mark))
