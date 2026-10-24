// Pieces shared by the Island directions (island.js draws A to C, island2.js draws D to H): the sizes, the springs, what
// each state says, and small helpers for the eyes, the words on the black and the panel. Design only.
import { NOTCH, MENU } from '../notch/notch.js'
import { setMood } from '../pill/eyes.js'
import { stage } from './state.js'

export const LIP = NOTCH.h + 22 // the chin: the notch's height plus a lip for the eyes
export const BODY_TOP = MENU + 8 // anything wider than the notch starts under the menu bar line, with a fillet between
export const HW = NOTCH.w / 2
export const R = 10
export const EYE = 14
export const px = (v) => `${+v.toFixed(2)}px`
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
export const div = (cls, css = '') => { const d = document.createElement('div'); d.className = cls; if (css) d.style.cssText = css; return d }

/* ---------------- the springs ---------------- */
export class Spring {
  constructor(v = 0, k = 190, c = 17) { this.v = v; this.t = v; this.x = 0; this.k = k; this.c = c }
  set(t) { this.t = t }
  snap(t) { this.v = this.t = t; this.x = 0 }
  get done() { return Math.abs(this.v - this.t) < 0.02 && Math.abs(this.x) < 0.02 }
  step(dt) {
    // fixed small steps keep the spring stable whatever the frame time
    for (let n = Math.ceil(dt / (1 / 240)); n > 0; n--) {
      const h = dt / Math.ceil(dt / (1 / 240))
      this.x += (-this.k * (this.v - this.t) - this.c * this.x) * h
      this.v += this.x * h
    }
  }
}
export const soft = (v) => new Spring(v, 150, 20) // eyes and fades: less bounce

/* ---------------- what each state shows ---------------- */
export const STATES = [
  ['rest', 'At rest', 'Compact. Steward is there, quietly.'],
  ['hover', 'Hover', 'The cursor is on it: it swells a little and the eyes light up.'],
  ['working', 'Working', 'Claude is editing a file in haven. A live status, a few words.'],
  ['finished', 'Finished', 'haven is done: three files changed.'],
  ['needs', 'Needs you', 'An approval: run npm install? Allow or Deny, right there.'],
  ['review', 'Review ready', 'Visual Review: the page changed, with a before and after and a line on what changed.'],
  ['two', 'Two projects', 'haven and api at once: the island splits into a main shape and a small second one.'],
  ['quiet', 'Quiet mode', 'Only when needed: asleep, it is just the notch. Only "needs you" comes out.'],
]
export const MOODS = { rest: ['resting'], hover: ['idle'], working: ['thinking', 'sweep'], finished: ['celebrating'], needs: ['needs-you'], review: ['idle'], two: ['thinking', 'sweep'], quiet: ['resting'], open: ['idle'] }

export const DOT = '<span class="ic-dot"></span>'
export const CHECK = '<span class="ic-check"></span>'
export const row = (icon, a, b) => `<div class="ic-row">${icon}<span><b>${a}</b> <span class="mut">${b}</span></span></div>`
export const CT = {
  working: row('', 'haven', 'Editing page.tsx'),
  workingDot: row(DOT, 'haven', 'Editing page.tsx'),
  done: row('', 'haven', 'finished · 3 files changed'),
  doneCheck: row(CHECK, 'haven', 'finished · 3 files changed'),
  second: row(DOT, 'api', 'Running tests'),
  needs: `<div class="col"><div class="head"><b>haven needs you</b></div><div class="row2"><span class="mut">Run</span><code>npm install</code><span class="mut">in haven?</span></div><div class="acts"><span class="pillbtn pri">Allow</span><span class="pillbtn">Deny</span></div></div>`,
  review: `<div class="col"><div class="head"><b>haven changed</b><span class="mut">localhost:3000/pricing</span></div><div class="row2"><span class="thumbs"><i class="tb"></i><i class="ta"></i></span><span class="say"><b>Claude says:</b> I made the Start button blue and added a row of logos.</span></div><div class="acts"><span class="pillbtn pri">Open big</span><span class="pillbtn">Looks good</span></div></div>`,
}
export const SIZES = { row: [270, 34], needs: [340, 104], review: [352, 156] }

/* ---------------- helpers for the newer directions ---------------- */
/** A set of springs that a frame loop steps until they settle; apply() writes them to the page. */
export function makeLoop(root, apply) {
  const all = []
  let raf = 0, last = 0
  const api = { scale: 1 }
  const step = (now) => {
    raf = 0
    const dt = Math.min(0.05, (now - last) / 1000) * api.scale
    last = now
    let moving = false
    for (const s of all) if (!s.done) { s.step(dt); moving = true }
    apply()
    if (moving && root.isConnected) kick()
  }
  const kick = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(step) } }
  return Object.assign(api, { add: (s) => { all.push(s); return s }, kick, stop: () => cancelAnimationFrame(raf) })
}

/** Lit eyes: one view per spot, sharing a group's state, each centered on its spot. */
export function makeEyes({ root, kind, color, mouth }, add) {
  const eyes = {}
  const mk = (name, grp, { E = EYE, clipFn = null, parent = root } = {}) => {
    const k = E / 18, W = Math.round(92 * k), H = Math.round(60 * k)
    const w = div('isl-eyes')
    const v = stage.view(grp, kind, w, W, H, { color, tinted: true, light: false, mouth, lit: true, symAt: { x: -999, y: -999 } })
    v.el.style.position = 'absolute'
    v.el.style.left = px(-W / 2)
    v.el.style.top = px(-H / 2)
    parent.append(w)
    const e = { el: w, x: add(soft(0)), y: add(soft(NOTCH.h + 11)), s: add(soft(1)), o: add(soft(0)), clipFn }
    eyes[name] = e
    return e
  }
  const apply = () => {
    for (const e of Object.values(eyes)) {
      e.el.style.transform = `translate(${px(e.x.v)},${px(e.y.v)}) scale(${Math.max(0.01, e.s.v)})`
      e.el.style.opacity = String(clamp(e.o.v, 0, 1))
      if (e.clipFn) e.el.style.clipPath = e.clipFn(e)
    }
  }
  const aim = (targets, snap) => {
    for (const [name, e] of Object.entries(eyes)) {
      const t = targets[name]
      const set = (s, v) => (snap ? s.snap(v) : s.set(v))
      if (t) { set(e.x, t.x); set(e.y, t.y); set(e.s, t.s ?? 1); set(e.o, t.o ?? 1) } else set(e.o, 0)
    }
  }
  return { eyes, mk, apply, aim }
}

/** The words and buttons on the black: two slots, each fading out before the next state's words fade in. */
export function makeContents(root, rm, getState) {
  const cts = [div('isl-ct'), div('isl-ct')]
  root.append(...cts)
  const timers = [0, 0]
  const set = (list) => {
    cts.forEach((el, i) => {
      clearTimeout(timers[i])
      const c = list[i]
      el.classList.remove('on')
      if (!c) return
      timers[i] = setTimeout(() => {
        Object.assign(el.style, { left: px(c.x), top: px(c.y), width: px(c.w), height: px(c.h) })
        el.className = `isl-ct${c.eyes ? ' eyes' : ''}`
        el.innerHTML = c.html
        void el.offsetWidth
        el.classList.add('on')
      }, rm() ? 0 : getState() === 'open' ? 0 : 90)
    })
  }
  return { set, clear: () => timers.forEach(clearTimeout) }
}

/** The panel the island opens into, with the header's Pill. */
export function makePanel({ root, kind, color, mouth, dark }, g) {
  const panel = div('isl-panel glass')
  panel.innerHTML = `<header><span class="hs"></span><span><b>Steward</b><small>haven · idle</small></span></header>
    <div class="bub me">Why did the deploy fail?</div><div class="bub">A missing environment variable: <code>DATABASE_URL</code>. Want me to add it?</div>
    <div class="cmp">Ask Steward…</div>`
  const headView = stage.view(g, kind, panel.querySelector('.hs'), 64, 54, { color, tinted: true, light: !dark, mouth })
  root.append(panel)
  return { panel, headView }
}

/** Where the panel goes: under the notch, or where a dragged panel was left. */
export function placePanel(panel, moved, on) {
  const at = moved ? { x: 70, y: 70 } : { x: -200, y: BODY_TOP }
  Object.assign(panel.style, { left: px(at.x), top: px(at.y), width: '400px', height: '470px' })
  panel.classList.toggle('moved', moved)
  panel.classList.toggle('on', on)
}

export { setMood }
