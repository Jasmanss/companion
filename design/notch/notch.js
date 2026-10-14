// The notch dock (design): Steward living in the MacBook notch, as one black shape with the real notch and the
// Pill's eyes lit on it. Used by notch.html and the Showcase.
//
// Measured on the MacBook Pro 14" (Mac16,1) at its default 1512 x 982 (Phase 0, from macOS NSScreen: the top safe
// area and the two usable strips beside the notch): the notch is 185 x 32 pt and centered, and the menu bar is 33 pt,
// so its bottom line sits 1 pt under the notch. No API gives the notch's corner radius, so R is an estimate the page
// can change. Everything here is in points: at real size, 1 CSS px is 1 pt.
//
// The rules: the shape is never wider than the notch inside the menu bar band (except layout B, on purpose), anything
// wider only appears below the menu bar line, joined to the notch with concave fillets, and its bottom corners match
// the notch's. Only transform and opacity move: the shape is made of overlapping black pieces (bands and corner
// circles) that each slide or scale, so it grows without its corners squashing. Black on black, the overlaps don't show.
import { setMood } from '../pill/eyes.js'
import { palette } from '../pill/render.js'

export const SCREEN = { w: 1512, h: 982 }
export const NOTCH = { w: 185, h: 32 }
export const MENU = 33
export const CX = SCREEN.w / 2
const HW = NOTCH.w / 2
/** The lip below the notch, each wing beside it, the fillet radius, and how tall the eyes are. */
export const SIZE = { lip: 18, wing: 20, fillet: 8, eye: 10 }
const LIP = NOTCH.h + SIZE.lip // the black's full height at rest: 50
const EYE_Y = NOTCH.h + SIZE.lip / 2 // the eyes' center line, in the middle of the lip: 41
const BODY_TOP = MENU + SIZE.fillet // where anything wider than the notch starts
const PANEL = { w: 380, h: 470 }

export const LAYOUTS = [
  { id: 'chin', key: 'A', name: 'Chin', short: 'The lip below the notch, as wide as the notch, with the eyes in it.' },
  { id: 'wings', key: 'B', name: 'Wings', short: 'One eye on each side of the notch, in the menu bar, with the notch as the bridge.' },
  { id: 'float', key: 'C', name: 'Floating eyes', short: 'No black at rest, just the eyes glowing under the notch. The shape comes out when something happens.' },
]
/** Moods where something is going on, so layout C brings its black shape out. */
const BUSY = new Set(['listening', 'thinking', 'talking', 'done', 'celebrating', 'needs-you', 'worried', 'mad', 'confused'])
/** Moods whose face needs the middle (dots, the bar, the mouth): layout B shows them in a chin. */
const MIDDLE = new Set(['thinking', 'talking'])

const div = (cls, css = '') => { const d = document.createElement('div'); d.className = cls; if (css) d.style.cssText = css; return d }
const px = (v) => `${+v.toFixed(2)}px`

/**
 * A black rounded box built from pieces: anchored at its top center, base size w0 x h0, top corners rt, bottom
 * corners rb. size(w, h) moves the pieces; with a transition on them they grow together, corners staying round.
 */
function blob(parent, { w0, h0, rt = 0, rb, cls = '', top = 0 }) {
  const el = div(`blob ${cls}`, `top:${px(top)}`)
  const parts = []
  const add = (css, origin, fn) => { const p = div('bp', `${css};transform-origin:${origin}`); el.append(p); parts.push([p, fn]) }
  const hm0 = h0 - rt - rb + 1
  add(`left:${px(-w0 / 2)};top:${px(rt - 0.5)};width:${px(w0)};height:${px(hm0)}`, '50% 0', (w, h) => `scale(${w / w0},${Math.max(0.001, (h - rt - rb + 1) / hm0)})`)
  if (rt) {
    add(`left:${px(-(w0 / 2 - rt))};top:0;width:${px(w0 - 2 * rt)};height:${px(rt + 0.5)}`, '50% 0', (w) => `scaleX(${Math.max(0.001, (w - 2 * rt) / (w0 - 2 * rt))})`)
    for (const s of [-1, 1]) add(`left:${px(s * (w0 / 2 - rt) - rt)};top:0;width:${px(2 * rt)};height:${px(2 * rt)};border-radius:50%`, '50% 50%', (w) => `translateX(${px((s * (w - w0)) / 2)})`)
  }
  add(`left:${px(-(w0 / 2 - rb))};top:${px(h0 - rb - 0.5)};width:${px(w0 - 2 * rb)};height:${px(rb + 0.5)}`, '50% 0', (w, h) => `translateY(${px(h - h0)}) scaleX(${Math.max(0.001, (w - 2 * rb) / (w0 - 2 * rb))})`)
  for (const s of [-1, 1]) add(`left:${px(s * (w0 / 2 - rb) - rb)};top:${px(h0 - 2 * rb)};width:${px(2 * rb)};height:${px(2 * rb)};border-radius:50%`, '50% 50%', (w, h) => `translate(${px((s * (w - w0)) / 2)},${px(h - h0)})`)
  parent.append(el)
  return { el, size(w, h) { for (const [p, fn] of parts) p.style.transform = fn(w, h) } }
}

/* ---------------- the desktop ---------------- */
const LEFT = { normal: ['Code', 'File', 'Edit', 'Selection', 'View', 'Go', 'Run', 'Terminal', 'Window', 'Help'],
  busy: ['Photoshop', 'File', 'Edit', 'Image', 'Layer', 'Type', 'Select', 'Filter', '3D', 'View', 'Plugins', 'Window'] }
const ICON = {
  wifi: '<svg viewBox="0 0 16 12"><path d="M8 11.2 5.6 8.7a3.4 3.4 0 0 1 4.8 0zM3.6 6.7a6.2 6.2 0 0 1 8.8 0l-1.3 1.3a4.4 4.4 0 0 0-6.2 0zM1.4 4.5a9.3 9.3 0 0 1 13.2 0l-1.3 1.3a7.5 7.5 0 0 0-10.6 0z" fill="currentColor"/></svg>',
  battery: '<svg viewBox="0 0 26 12"><rect x=".7" y=".7" width="21.6" height="10.6" rx="3" fill="none" stroke="currentColor" stroke-opacity=".5"/><rect x="2.4" y="2.4" width="15" height="7.2" rx="1.6" fill="currentColor"/><rect x="23.4" y="4" width="1.8" height="4" rx=".9" fill="currentColor" fill-opacity=".5"/></svg>',
  cc: '<svg viewBox="0 0 16 14"><rect x=".8" y="1" width="14.4" height="5" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="11.6" cy="3.5" r="1.4" fill="currentColor"/><rect x=".8" y="8" width="14.4" height="5" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="4.4" cy="10.5" r="1.4" fill="currentColor"/></svg>',
  search: '<svg viewBox="0 0 14 14"><circle cx="5.8" cy="5.8" r="4.4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="m9.2 9.2 3.6 3.6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  app: (n) => [
    '<svg viewBox="0 0 14 14"><rect x="1" y="1" width="12" height="12" rx="3" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M4 7h6M7 4v6" stroke="currentColor" stroke-width="1.5"/></svg>',
    '<svg viewBox="0 0 14 14"><circle cx="7" cy="7" r="5.6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M7 3.6V7l2.4 1.6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    '<svg viewBox="0 0 14 14"><path d="M2 10.5 7 2l5 8.5z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
    '<svg viewBox="0 0 14 14"><path d="M1.5 4.5h11v7h-11zM4 4.5V3h6v1.5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
    '<svg viewBox="0 0 14 14"><path d="M7 1.5c3 0 5.5 2.2 5.5 5s-2.5 5-5.5 5c-.8 0-1.6-.2-2.3-.4L2 12l.8-2.4A5 5 0 0 1 1.5 6.5c0-2.8 2.5-5 5.5-5z" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
  ][n % 5],
}
/**
 * The top of a Mac screen around the notch: wallpaper (light or dark), the menu bar (an editor's menus, or a busy one
 * that runs right up to the notch on both sides) and a window, either a normal one or one zoomed to fill the screen.
 */
export function screenHTML({ wall = 'light', busy = false, maxed = false, title = 'notch.html — companion' } = {}) {
  const left = LEFT[busy ? 'busy' : 'normal'].map((m, i) => `<span${i === 0 ? ' class="app"' : ''}>${m}</span>`).join('')
  const extra = busy ? Array.from({ length: 13 }, (_, i) => `<i class="ic">${ICON.app(i)}</i>`).join('') : `<i class="ic">${ICON.app(0)}</i><i class="ic">${ICON.app(1)}</i>`
  return `<div class="wallp ${wall}"></div>
    <div class="win${maxed ? ' maxed' : ''}"><div class="wtb"><i class="tl r"></i><i class="tl y"></i><i class="tl g"></i><span class="wt">${title}</span></div>
      <div class="wbody">${Array.from({ length: 9 }, (_, i) => `<p style="width:${[62, 48, 74, 35, 58, 66, 40, 70, 52][i]}%"></p>`).join('')}</div></div>
    <div class="mb ${wall}"><span class="apple"><svg viewBox="0 0 14 17"><path d="M11.6 9c0-2 1.6-3 1.7-3a3.7 3.7 0 0 0-2.9-1.6c-1.2-.1-2.4.7-3 .7-.6 0-1.6-.7-2.6-.7A3.9 3.9 0 0 0 1.5 6.4c-1.4 2.4-.4 6 1 8 .7 1 1.5 2 2.5 2s1.4-.7 2.6-.7 1.5.7 2.6.6 1.7-1 2.4-2a8 8 0 0 0 1-2.2A3.4 3.4 0 0 1 11.6 9zM9.6 3a3.4 3.4 0 0 0 .8-2.5 3.6 3.6 0 0 0-2.3 1.2 3.3 3.3 0 0 0-.9 2.4A3 3 0 0 0 9.6 3z" fill="currentColor"/></svg></span>${left}
      <span class="grow"></span>${extra}<i class="ic">${ICON.battery}</i><i class="ic">${ICON.wifi}</i><i class="ic">${ICON.search}</i><i class="ic">${ICON.cc}</i><span class="clock">Tue 14 Oct&nbsp;&nbsp;9:41</span></div>`
}
/** The notch itself, on top of everything: whatever is drawn under it can't be seen, like on the real screen. */
export const hardwareHTML = () => '<div class="hw"></div>'

/**
 * A window onto the top of the screen around the notch: cw x ch points, shown at zoom (1 is real size). Returns
 * { el, screen } where screen is the full-width screen to put things in (the notch's center is at x = CX).
 */
export function crop(host, { cw = 440, ch = 110, zoom = 1, wall, busy, maxed, cls = '' } = {}) {
  const el = div(`crop z${zoom} ${cls}`, `width:${cw * zoom}px;height:${ch * zoom}px`)
  const screen = div(`screen ${wall ?? 'light'}`, `height:${ch}px;transform:scale(${zoom}) translateX(${px(-(CX - cw / 2))})`)
  screen.innerHTML = screenHTML({ wall, busy, maxed }) + hardwareHTML()
  el.append(screen)
  host.append(el)
  return { el, screen }
}

/* ---------------- Steward in the notch ---------------- */
/**
 * Steward docked in the notch, in one of the three layouts. Put it in a screen; it sits at the notch's center.
 * o: { layout, kind, color, stage, group (share one eyes state), owner, seed, anchor, mood, mouth, think, r (the
 * corner radius), dark (the page theme, for the open panel), rm() (reduced motion), look() (a scripted cursor) }.
 * go(state) changes its shape; mood(m) its eyes.
 */
export function createNotch(screen, o) {
  const { layout, kind, color, stage, r = 10, rm = () => false } = o
  const lit = palette(kind, { color, lit: true }).lit
  const root = div(`nt ${layout}`, `left:${px(CX)};--lit:${[1, 3, 5].map((i) => parseInt(lit.slice(i, i + 2), 16)).join(',')}`)
  const g = o.group ?? stage.group({ seed: o.seed ?? 1, anchor: o.anchor ?? screen, mood: o.mood ?? 'idle', think: o.think ?? 'dots', mouth: o.mouth ?? true, owner: o.owner, look: o.look })
  const shape = div('nt-shape')
  root.append(shape)
  // The underglow keeps layout C's eyes readable where there's no black behind them.
  const glow = div('nt-glow', `left:-40px;top:${px(EYE_Y - 15)}`)
  shape.append(glow)
  const body = blob(shape, { w0: 340, h0: 46, rt: 14, rb: 16, top: BODY_TOP, cls: 'body' })
  const lip = blob(shape, { w0: NOTCH.w, h0: LIP, rb: r, cls: 'lip' })
  const wings = layout === 'wings' ? blob(shape, { w0: NOTCH.w + 2 * SIZE.wing, h0: NOTCH.h, rb: r, cls: 'wings' }) : null
  const F = SIZE.fillet
  // Concave fillets join the notch's sides to anything wider, just under the menu bar line: black, minus a circle.
  const fils = [-1, 1].map((s) => {
    const f = div(`fil ${s < 0 ? 'l' : 'r'}`, `left:${px(s < 0 ? -HW - F : HW)};top:${px(MENU)};width:${F}px;height:${F}px;background:radial-gradient(circle at ${s < 0 ? '0 0' : '100% 0'},transparent ${F - 0.5}px,#000 ${F}px)`)
    shape.append(f)
    return f
  })
  const mouthEl = div('nt-mouth', `left:-32px;top:${px(LIP + 4)}`)
  const msg = div('nt-msg', `top:${px(BODY_TOP + 16)}`)
  shape.append(mouthEl, msg)

  // The eyes: one lit view per spot, all sharing the group's state. Each view is centered on its spot.
  const E = SIZE.eye, k = E / 18, W = Math.round(92 * k), H = Math.round(60 * k)
  const spots = {}
  const eyes = (name, x, y, { sym = null, clip = null } = {}) => {
    const w = div(`nt-eyes ${name}`, `transform:translate(${px(x)},${px(y)})${clip ? `;clip-path:${clip}` : ''}`)
    // The corner symbol: its center for vector views, the sprite's bottom left for blocky (2 pt pixels, 5 wide).
    const at = !sym ? { x: -999, y: -999 } : kind === 'blocky' ? { x: W / 2 + sym[0] - 5, y: H / 2 + sym[1] + 5 } : { x: W / 2 + sym[0], y: H / 2 + sym[1] }
    const v = stage.view(g, kind, w, W, H, { color, tinted: true, light: false, mouth: o.mouth ?? true, lit: true, symAt: at, markSize: 10, markPx: 2 })
    v.el.style.position = 'absolute'
    v.el.style.left = px(-W / 2)
    v.el.style.top = px(-H / 2)
    root.append(w)
    spots[name] = { el: w, x, y }
    return w
  }
  if (layout === 'wings') {
    const wx = HW + SIZE.wing / 2
    // Each wing shows one eye of a full pair; the other eye falls under the notch, and the clip keeps it there.
    eyes('wl', -wx, NOTCH.h / 2, { clip: `polygon(${px(-140 + wx)} -40px,${px(-HW + wx)} -40px,${px(-HW + wx)} 40px,${px(-140 + wx)} 40px)` })
    eyes('wr', wx, NOTCH.h / 2, { sym: [22, -3], clip: `polygon(${px(HW - wx)} -40px,${px(150 - wx)} -40px,${px(150 - wx)} 40px,${px(HW - wx)} 40px)` })
    eyes('chin', 0, EYE_Y)
  } else eyes('main', 0, EYE_Y, { sym: [68, 0] })

  // The open panel: the black grows into it, then the glass takes over and the eyes become the header's Pill.
  let panel = null, headView = null
  if (o.panel !== false) {
    panel = div('nt-panel glass', `left:${px(-PANEL.w / 2)};top:${px(BODY_TOP)};width:${PANEL.w}px;height:${PANEL.h}px`)
    panel.innerHTML = `<header><span class="hs"></span><span><b>Steward</b><small>companion · idle</small></span></header>
      <div class="bub me">Why did the deploy fail?</div><div class="bub">A missing environment variable: <code>DATABASE_URL</code>. Want me to add it?</div>
      <div class="cmp">Ask Steward…</div>`
    headView = stage.view(g, kind, panel.querySelector('.hs'), 64, 54, { color, tinted: true, light: !o.dark, mouth: o.mouth ?? true })
    root.append(panel)
  }
  screen.append(root)

  let state = null, sig = ''
  const set = (el, on) => el.classList.toggle('on', on)
  /** Where every piece goes for a state, given the current mood: a list of [element, transform, shown]. */
  function plan(st) {
    const busyMood = BUSY.has(g.st.mood) || ['hover', 'nudge', 'mouth', 'gulp', 'tray', 'press', 'think', 'bulge'].includes(st)
    const lipOut = layout === 'chin' || (layout === 'float' && busyMood) || (layout === 'wings' && (['nudge', 'mouth', 'gulp', 'tray', 'think', 'bulge'].includes(st) || MIDDLE.has(g.st.mood)))
    let L = lipOut ? LIP : NOTCH.h
    if (st === 'hover' && layout !== 'wings') L = LIP + 4
    if (st === 'press' && layout !== 'wings') L = LIP - 3
    if (st === 'mouth') L = LIP + 26
    if (st === 'gulp') L = LIP + 3
    if (st === 'bulge') L = LIP + 8
    if (st === 'away' || st === 'open') L = NOTCH.h
    const ww = st === 'away' || st === 'open' ? NOTCH.w : NOTCH.w + 2 * SIZE.wing + (st === 'hover' ? 8 : st === 'press' ? -4 : 0)
    const wide = st === 'nudge' ? [340, 46] : st === 'tray' ? [230, 36] : st === 'bulge' ? [236, 30] : st === 'open' ? [PANEL.w, PANEL.h] : null
    const eyesAt = Object.entries(spots).map(([name, sp]) => {
      let on = st !== 'away' && st !== 'open' && st !== 'bulge', y = sp.y
      if (name === 'chin') on = on && lipOut && (MIDDLE.has(g.st.mood) || st === 'think')
      if ((name === 'wl' || name === 'wr') && MIDDLE.has(g.st.mood)) on = false
      if (name === 'main') y = st === 'hover' ? EYE_Y + 2 : st === 'mouth' ? EYE_Y - 1 : EYE_Y
      // Opening, the eyes slide toward the panel header, where the header's Pill takes over.
      const tx = st === 'open' ? -PANEL.w / 2 + 48 : sp.x, ty = st === 'open' ? BODY_TOP + 39 : y
      return [sp.el, `translate(${px(tx)},${px(ty)})`, on]
    })
    return { L, ww, wide, lipOut, eyesAt, st }
  }
  function commit(p) {
    lip.size(NOTCH.w, p.L)
    if (wings) wings.size(p.ww, NOTCH.h)
    set(body.el, !!p.wide)
    body.size(...(p.wide ?? [140, 30]))
    fils.forEach((f) => set(f, !!p.wide && p.st !== 'open'))
    set(mouthEl, p.st === 'mouth')
    set(msg, p.st === 'nudge' || p.st === 'tray')
    set(glow, layout === 'float' && !p.lipOut && p.st !== 'away' && p.st !== 'open')
    for (const [el, tf, on] of p.eyesAt) { el.style.transform = tf; set(el, on) }
    if (panel) set(panel, p.st === 'open')
    root.dataset.state = p.st
  }
  /** Apply a state. Reduced motion fades out, changes and fades back in, instead of flowing. */
  function change(st, first) {
    const p = plan(st), next = JSON.stringify([p.L, p.ww, p.wide, p.lipOut, p.eyesAt.map((e) => e.slice(1)), p.st])
    if (next === sig) return
    sig = next
    if (first) { root.classList.add('snap'); commit(p); void root.offsetWidth; root.classList.remove('snap'); return }
    if (!rm()) return commit(p)
    root.classList.add('rm-out')
    clearTimeout(inst.t)
    inst.t = setTimeout(() => { root.classList.add('snap'); commit(plan(state)); void root.offsetWidth; root.classList.remove('snap', 'rm-out') }, 150)
  }
  /** How long each change takes, and its curve. */
  const TIMING = { bulge: ['300ms', 'spring'], hover: ['220ms', 'out'], press: ['90ms', 'out'], nudge: ['480ms', 'spring'], mouth: ['380ms', 'spring'], gulp: ['260ms', 'spring'], tray: ['440ms', 'spring'], open: ['520ms', 'soft'], think: ['420ms', 'spring'] }
  const inst = {
    root, group: g, headView, spots,
    get state() { return state },
    go(st, { d, e } = {}) {
      const first = state === null
      state = st
      const [td, te] = TIMING[st] ?? ['380ms', 'out']
      root.style.setProperty('--d', d ?? td)
      root.style.setProperty('--e', `var(--${e ?? te})`)
      change(st, first)
    },
    /** A new mood, and the shape that goes with it (layout C comes out, B shows its chin). */
    mood(m, glint) { setMood(g.st, m, glint); if (state) change(state, false) },
    say(html) { msg.innerHTML = html },
    remove() { root.remove() },
  }
  inst.go(o.state ?? 'rest')
  return inst
}
