// 7. The Island: Steward in the notch redesigned like the iPhone's Dynamic Island. One black shape that merges with the
// hardware notch and changes size and shape with spring motion, instead of separate pieces. Three directions are drawn
// side by side with the same states, so they can be compared live. Everything is in points over the measured 185 x 32
// notch. The notch has no pixels, so nothing is drawn inside it: content goes beside it (Side island) or below it.
//
// How it moves: a small spring loop (below) sets only transforms and opacity, every frame, on black pieces from
// notch/notch.js (blob), so corners stay round while a piece grows. Reduced Motion skips the springs: the island fades
// out, changes and fades back in.
import { setMood } from '../pill/eyes.js'
import { palette } from '../pill/render.js'
import { crop, blob, NOTCH, MENU, CX, SIZE } from '../notch/notch.js'
import { wait, demo, esc } from '../shared/activity.js'
import { S, onChange, stage, card } from './state.js'

import { LIP, BODY_TOP, HW, R, EYE, px, clamp, div, Spring, soft, STATES, MOODS, CT, SIZES } from './island-kit.js'
import { createIsland2, NEW_DIRS } from './island2.js'


/** The wing's eye pair sits so one eye of the pair is in the middle of the wing; the other falls under the notch. */
const K = EYE / 18, VW = Math.round(92 * K), VH = Math.round(60 * K)
const SP = 0.145 * 88 * (VW / 92)

/**
 * Where everything goes for a state. dir: A the Chin island, B the Side island, C the Bubbles. Returns targets:
 * L (the black's height under the notch), ww (the Side island's wing width), body {w,h} or null, bubbles [], eyes by
 * name {x,y,s}, glyph {type,x} or null, contents [{id,html,x,y,w,h,eyes}], panel (open).
 */
function plan(dir, st, { moved = false } = {}) {
  const P = { L: LIP, ww: 0, body: null, bubbles: [], eyes: {}, glyph: null, contents: [], panel: false }
  const eye = (x, y, s = 1) => ({ x, y, s })
  const side = dir === 'B', bub = dir === 'C'
  const wingEyes = (ww, { right = true, s = 1 } = {}) => {
    const wc = HW + ww / 2
    P.eyes.wl = eye(-wc + SP, NOTCH.h / 2, s)
    if (right) P.eyes.wr = eye(wc - SP, NOTCH.h / 2, s)
  }
  /** A card under the notch: A and B grow the black body, C floats a bubble below the chin. */
  const bigCard = (kind, html, [w, h], eyesAtLeft = true) => {
    if (bub) {
      const top = LIP + 8
      P.bubbles.push({ x: 0, top, w, h, from: { x: 0, top: LIP - 12, w: 90, h: 24 } })
      P.eyes.main = eye(0, NOTCH.h + 11)
      P.contents.push({ id: kind, html, x: -w / 2, y: top, w, h, eyes: false })
    } else {
      P.body = { w, h }
      if (side) P.ww = 0
      P.eyes.main = eye(-w / 2 + 28, BODY_TOP + (h > 40 ? 28 : h / 2))
      P.contents.push({ id: kind, html, x: -w / 2, y: BODY_TOP, w, h, eyes: eyesAtLeft })
    }
  }
  const compact = (html, htmlNoEyes, w = 270) => {
    if (bub) {
      const top = LIP + 8
      P.bubbles.push({ x: 0, top, w, h: 34, from: { x: 0, top: LIP - 12, w: 90, h: 24 } })
      P.eyes.main = eye(0, NOTCH.h + 11)
      P.contents.push({ id: 'row', html: htmlNoEyes, x: -w / 2, y: top, w, h: 34, eyes: false })
    } else {
      P.body = { w, h: 34 }
      P.eyes.main = eye(-w / 2 + 25, BODY_TOP + 17)
      P.contents.push({ id: 'row', html, x: -w / 2, y: BODY_TOP, w, h: 34, eyes: true })
    }
  }
  if (side && ['rest', 'hover', 'working', 'finished', 'two', 'quiet'].includes(st)) P.L = NOTCH.h
  switch (st) {
    case 'rest':
      if (side) { P.ww = 28; wingEyes(28) } else P.eyes.main = eye(0, NOTCH.h + 11)
      break
    case 'hover':
      if (side) { P.ww = 36; wingEyes(36, { s: 1.12 }) } else { P.L = LIP + 4; P.eyes.main = eye(0, NOTCH.h + 13, 1.12) }
      break
    case 'working':
      if (side) { P.ww = 58; wingEyes(58, { right: false }); P.glyph = { type: 'spin', x: HW + 29, y: NOTCH.h / 2 } } else compact(CT.working, CT.workingDot)
      break
    case 'finished':
      if (side) { P.ww = 58; wingEyes(58, { right: false }); P.glyph = { type: 'check', x: HW + 29, y: NOTCH.h / 2 } } else compact(CT.done, CT.doneCheck)
      break
    case 'needs':
      bigCard('needs', CT.needs, SIZES.needs)
      break
    case 'review':
      bigCard('review', CT.review, SIZES.review)
      break
    case 'two':
      if (side) {
        P.ww = 58; wingEyes(58, { right: false }); P.glyph = { type: 'spin', x: HW + 29, y: NOTCH.h / 2 }
        P.bubbles.push({ x: 132, top: BODY_TOP, w: 34, h: 34, from: { x: 70, top: 20, w: 20, h: 20 }, mini: true })
      } else if (bub) {
        const top = LIP + 8
        P.eyes.main = eye(0, NOTCH.h + 11)
        P.bubbles.push({ x: 0, top, w: 250, h: 34, from: { x: 0, top: LIP - 12, w: 90, h: 24 } })
        P.bubbles.push({ x: 0, top: top + 42, w: 190, h: 34, from: { x: 0, top: top + 20, w: 90, h: 20 } })
        P.contents.push({ id: 'row', html: CT.workingDot, x: -125, y: top, w: 250, h: 34, eyes: false })
        P.contents.push({ id: 'row2', html: CT.second, x: -95, y: top + 42, w: 190, h: 34, eyes: false })
      } else {
        P.body = { w: 250, h: 34 }
        P.eyes.main = eye(-100, BODY_TOP + 17)
        P.contents.push({ id: 'row', html: CT.working, x: -125, y: BODY_TOP, w: 250, h: 34, eyes: true })
        P.bubbles.push({ x: 152, top: BODY_TOP, w: 34, h: 34, from: { x: 100, top: BODY_TOP + 4, w: 22, h: 26 }, mini: true })
      }
      break
    case 'quiet':
      P.L = NOTCH.h
      break
    case 'open':
      P.panel = true
      if (moved) { P.eyes.main = eye(0, NOTCH.h + 11); P.L = LIP } else if (bub) { P.eyes.main = eye(0, NOTCH.h + 11) } else { P.body = { w: 400, h: 470 }; P.eyes.main = eye(-146, BODY_TOP + 39); P.ww = 0 }
      break
  }
  for (const b of P.bubbles) if (b.mini) P.eyes.b2 = eye(b.x, b.top + b.h / 2, 1)
  return P
}

/* ---------------- one island ---------------- */
export function createIsland(screen, o) {
  const { dir, kind, color, rm = () => false } = o
  const lit = palette(kind, { color, lit: true }).lit
  const root = div('isl', `left:${px(CX)};--lit:${[1, 3, 5].map((i) => parseInt(lit.slice(i, i + 2), 16)).join(',')}`)
  const shape = div('isl-shape')
  root.append(shape)
  const wings = dir === 'B' ? blob(shape, { w0: NOTCH.w + 2 * SIZE.wing, h0: NOTCH.h, rb: R, cls: 'wings' }) : null
  const neck = blob(shape, { w0: NOTCH.w, h0: LIP, rb: R, cls: 'neck' })
  const body = blob(shape, { w0: 340, h0: 46, rt: 14, rb: 16, top: BODY_TOP, cls: 'body' })
  const F = SIZE.fillet
  const fils = [-1, 1].map((s) => {
    const f = div(`fil ${s < 0 ? 'l' : 'r'}`, `left:${px(s < 0 ? -HW - F : HW)};top:${px(MENU)};width:${F}px;height:${F}px;background:radial-gradient(circle at ${s < 0 ? '0 0' : '100% 0'},transparent ${F - 0.5}px,#000 ${F}px)`)
    shape.append(f)
    return f
  })
  const g = stage.group({ seed: o.seed ?? 1, anchor: o.anchor ?? screen, mood: 'resting', think: o.think ?? 'dots', mouth: o.mouth ?? true, owner: o.owner })
  const g2 = stage.group({ seed: (o.seed ?? 1) + 9, anchor: o.anchor ?? screen, mood: 'thinking', glint: 'sweep', think: 'dots', mouth: true, owner: o.owner })

  // the two bubbles (a second project, or a floating card)
  const bubbles = [0, 1].map(() => {
    const wrap = div('isl-bub')
    const b = blob(wrap, { w0: 250, h0: 34, rt: 17, rb: 17, cls: 'bubble' })
    shape.append(wrap)
    return { wrap, b, on: false, x: new Spring(0), y: new Spring(0), w: new Spring(34), h: new Spring(34), s: new Spring(0.3, 220, 20) }
  })

  // the eyes: one lit view per spot, sharing a group's state
  const eyes = {}
  const mkEyes = (name, grp, clipSide, E = EYE) => {
    const k = E / 18, W = Math.round(92 * k), H = Math.round(60 * k)
    const w = div('isl-eyes')
    const v = stage.view(grp, kind, w, W, H, { color, tinted: true, light: false, mouth: o.mouth ?? true, lit: true, symAt: { x: -999, y: -999 } })
    v.el.style.position = 'absolute'
    v.el.style.left = px(-W / 2)
    v.el.style.top = px(-H / 2)
    root.append(w)
    eyes[name] = { el: w, x: soft(0), y: soft(0), s: soft(1), o: soft(0), clip: clipSide }
    eyes[name].y.snap(NOTCH.h + 11)
  }
  mkEyes('main', g)
  if (dir === 'B') { mkEyes('wl', g, -1); mkEyes('wr', g, 1) }
  mkEyes('b2', g2, 0, 9)

  const glyph = div('isl-glyph')
  root.append(glyph)
  const cts = [div('isl-ct'), div('isl-ct')]
  root.append(...cts)
  const ctTimers = [0, 0]

  // the panel it opens into
  let panel = null
  let headView = null
  if (o.panel) {
    panel = div('isl-panel glass')
    panel.innerHTML = `<header><span class="hs"></span><span><b>Steward</b><small>haven · idle</small></span></header>
      <div class="bub me">Why did the deploy fail?</div><div class="bub">A missing environment variable: <code>DATABASE_URL</code>. Want me to add it?</div>
      <div class="cmp">Ask Steward…</div>`
    headView = stage.view(g, kind, panel.querySelector('.hs'), 64, 54, { color, tinted: true, light: !o.dark, mouth: o.mouth ?? true })
    root.append(panel)
  }

  // the spring values
  const P = { L: new Spring(LIP), ww: new Spring(NOTCH.w), bw: new Spring(140), bh: new Spring(30), by: new Spring(-17), fil: new Spring(0, 220, 22) }
  const all = [...Object.values(P), ...bubbles.flatMap((b) => [b.x, b.y, b.w, b.h, b.s]), ...Object.values(eyes).flatMap((e) => [e.x, e.y, e.s, e.o])]

  function apply() {
    neck.size(NOTCH.w, Math.max(NOTCH.h, P.L.v))
    wings?.size(Math.max(NOTCH.w, P.ww.v), NOTCH.h)
    body.size(Math.max(140, P.bw.v), Math.max(30, P.bh.v))
    body.el.style.transform = `translateY(${px(P.by.v)})`
    const f = clamp(P.fil.v, 0, 1.15)
    for (const el of fils) { el.style.opacity = String(clamp(f, 0, 1)); el.style.transform = `scale(${Math.max(0.2, f)})` }
    for (const b of bubbles) {
      const a = clamp((b.s.v - 0.3) / 0.7, 0, 1)
      b.wrap.style.opacity = String(a)
      b.wrap.style.visibility = a < 0.01 && !b.on ? 'hidden' : ''
      b.wrap.style.transform = `translate(${px(b.x.v)},${px(b.y.v)}) scale(${Math.max(0.01, b.s.v)})`
      b.b.size(Math.max(34, b.w.v), Math.max(34, b.h.v))
    }
    for (const e of Object.values(eyes)) {
      const x = e.x.v
      e.el.style.transform = `translate(${px(x)},${px(e.y.v)}) scale(${Math.max(0.01, e.s.v)})`
      e.el.style.opacity = String(clamp(e.o.v, 0, 1))
      if (e.clip) {
        const [x0, x1] = e.clip < 0 ? [-220, -HW - 5.5] : [HW + 5.5, 220]
        e.el.style.clipPath = `polygon(${px(x0 - x)} -40px,${px(x1 - x)} -40px,${px(x1 - x)} 40px,${px(x0 - x)} 40px)`
      }
    }
  }
  let raf = 0, last = 0
  function loop(now) {
    raf = 0
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    let moving = false
    for (const s of all) if (!s.done) { s.step(dt); moving = true }
    apply()
    if (moving && root.isConnected) kick()
  }
  function kick() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop) } }

  let state = null, moved = !!o.moved
  const setContents = (list) => {
    cts.forEach((el, i) => {
      clearTimeout(ctTimers[i])
      const c = list[i]
      el.classList.remove('on')
      if (!c) return
      ctTimers[i] = setTimeout(() => {
        Object.assign(el.style, { left: px(c.x), top: px(c.y), width: px(c.w), height: px(c.h) })
        el.className = `isl-ct${c.eyes ? ' eyes' : ''}`
        el.innerHTML = c.html
        void el.offsetWidth
        el.classList.add('on')
      }, rm() ? 0 : state === 'open' ? 0 : 90)
    })
  }
  /** Aim every spring at a plan; fresh bubbles start small, tucked into the shape they come out of. */
  function aim(p, st, { snap = false } = {}) {
    const set = (s, v) => (snap ? s.snap(v) : s.set(v))
    set(P.L, p.L)
    set(P.ww, Math.max(NOTCH.w, NOTCH.w + 2 * p.ww))
    const b = p.body
    // hidden, the wide black sits tucked up inside the neck, so it can drop out and slide back without a fade
    set(P.bw, b ? b.w : 140)
    set(P.bh, b ? b.h : 30)
    set(P.by, b ? 0 : -(BODY_TOP + 30 - p.L))
    set(P.fil, b ? 1 : 0)
    bubbles.forEach((bb, i) => {
      const t = p.bubbles[i]
      if (t) {
        if (!bb.on || snap) { const f = t.from; bb.x.snap(f.x); bb.y.snap(f.top); bb.w.snap(f.w); bb.h.snap(f.h); bb.s.snap(0.3) }
        bb.on = true
        set(bb.x, t.x); set(bb.y, t.top); set(bb.w, t.w); set(bb.h, t.h); set(bb.s, 1)
        if (snap) { bb.x.snap(t.x); bb.y.snap(t.top); bb.w.snap(t.w); bb.h.snap(t.h); bb.s.snap(1) }
      } else if (bb.on) {
        bb.on = false
        set(bb.s, 0.3)
        set(bb.h, 24); set(bb.w, bb.w.t * 0.6)
      }
    })
    for (const [name, e] of Object.entries(eyes)) {
      const t = p.eyes[name]
      if (t) {
        const was = e.o.t > 0.5
        if (!was && !snap && (name === 'b2' || name === 'wr' || name === 'wl')) { e.x.snap(t.x); e.y.snap(t.y) }
        set(e.x, t.x); set(e.y, t.y); set(e.s, t.s)
        set(e.o, st === 'open' && !moved && dir !== 'C' && name === 'main' ? 0 : 1)
      } else { set(e.o, 0) }
    }
    glyph.className = `isl-glyph ${p.glyph ? `${p.glyph.type} on` : ''}`
    if (p.glyph) { glyph.style.left = px(p.glyph.x); glyph.style.top = px(p.glyph.y) }
    if (panel) {
      const at = moved ? { x: 70, y: 70, w: 400, h: 470 } : { x: -200, y: BODY_TOP, w: 400, h: 470 }
      Object.assign(panel.style, { left: px(at.x), top: px(at.y), width: `${at.w}px`, height: `${at.h}px` })
      panel.classList.toggle('moved', moved)
      panel.classList.toggle('on', p.panel)
    }
    setContents(p.contents)
    root.dataset.st = st
    kick()
  }
  function go(st, { first = false } = {}) {
    const prev = state
    state = st
    let [mood, glint] = MOODS[st] ?? MOODS.rest
    // The dots of thinking need the middle of the face; a wing has none, so the Side island keeps its eyes and shows a spinner.
    if (dir === 'B' && mood === 'thinking') { mood = 'idle'; glint = undefined }
    setMood(g.st, mood, glint)
    const p = plan(dir, st, { moved })
    // Opening a panel that has been moved: the island only acknowledges, a small squash, and the panel pops in place.
    if (st === 'open' && moved) { p.L = LIP + 7; setTimeout(() => { if (state === 'open') P.L.set(LIP); kick() }, 150) }
    if (rm() && !first) {
      root.classList.add('rm-out')
      clearTimeout(go.t)
      go.t = setTimeout(() => { aim(plan(dir, state, { moved }), state, { snap: true }); apply(); void root.offsetWidth; root.classList.remove('rm-out') }, 130)
      return
    }
    aim(p, st, { snap: first })
    if (first) apply()
    void prev
  }
  screen.append(root)
  apply()
  go(o.state ?? 'rest', { first: true })
  return {
    root, group: g, headView, go,
    get state() { return state },
    setMoved(v) { moved = v },
    remove() { clearTimeout(go.t); cts.forEach((_, i) => clearTimeout(ctTimers[i])); cancelAnimationFrame(raf); root.remove() },
  }
}

/* ---------------- the section ---------------- */
export const DIRS = [
  { id: 'A', name: 'Chin island', short: 'Rests as the chin. Grows out of it, under the menu bar line only, into a compact status, a card, a second small shape. Nothing ever covers a menu bar item.', covers: 'Nothing' },
  { id: 'B', name: 'Side island', short: 'Rests as black wings with one eye each side, status shown beside the notch like the phone\'s compact island. Grows down into the same cards. The wings cover menu bar items while they are out.', covers: 'Both sides, 28 to 58 pt each' },
  { id: 'C', name: 'Bubbles', short: 'The chin stays as Steward. Things come out as separate floating black bubbles under it, stacking for two projects. No seams to match, but it is less one shape.', covers: 'Nothing' },
]
export const ALL = [...DIRS, ...NEW_DIRS]
const make = (dir, screen, o) => ('DEFGH'.includes(dir) ? createIsland2 : createIsland)(screen, { ...o, dir })
const STORY = [['rest', 1800], ['hover', 1300], ['working', 2400], ['two', 2600], ['working', 1200], ['finished', 2200], ['needs', 3000], ['review', 3600], ['rest', 1400], ['quiet', 2400]]

export function render(host) {
  host.insertAdjacentHTML('beforeend', `<div class="grid">
    ${card({ id: 'i-compare', section: 7, title: 'Eight islands, side by side', status: 'planned', from: ['notch.html', 'notch-styles.html'], cls: 'wide',
      desc: 'Steward in the notch like the Dynamic Island, drawn eight ways with the same eight states. A to C are the first round, D to H the second. Pick a state to see all eight at once, or play the story. The notch has no pixels, so everything lives beside it or below it. The menu bar here is a busy one, so you can see what each direction covers.',
      tools: '<button class="btn" id="i-play">▶ Play the story</button>',
      body: `<div class="istates" id="i-states">${STATES.map(([id, l]) => `<button data-st="${id}" aria-pressed="false">${l}</button>`).join('')}</div>
        <p class="istate" id="i-state"></p>
        <div class="idirs">${ALL.map((d) => `<figure data-dir="${d.id}"><div class="icrop"></div><figcaption><b>${d.id} · ${d.name}</b> ${esc(d.short)} <i class="cov">Covers: ${esc(d.covers)}</i></figcaption></figure>`).join('')}</div>` })}
    ${card({ id: 'i-open', section: 7, title: 'Opening and closing', status: 'planned', from: 'notch.html', cls: 'wide',
      desc: 'The island grows into the panel and shrinks back into the notch. For a panel you have dragged somewhere else (the movable panel is built), the island does not grow into it: it squashes once, and the panel pops in where you left it. The app draws the island in one window and the panel in another, so the grow is a crossfade between the two.',
      tools: '<button class="btn" id="i-openbtn">Open</button> <button class="btn" id="i-closebtn">Close</button>',
      body: `<div class="ibar"><span class="lbl">Direction</span><span class="iseg" id="i-odir">${ALL.map((d, i) => `<button data-v="${d.id}" title="${d.name}" aria-pressed="${i === 0}">${d.id} · ${d.name}</button>`).join('')}</span>
        <span class="lbl">Panel</span><span class="iseg" id="i-opos"><button data-v="under" aria-pressed="true">Under the notch</button><button data-v="moved" aria-pressed="false">Dragged elsewhere</button></span></div>
        <div class="icrop" id="i-ocrop"></div>` })}
    ${card({ id: 'i-choose', section: 7, title: 'Ranking, what combines, and what it replaces', status: 'planned', from: null, cls: 'wide',
      desc: 'All eight, best first, with what each covers in the menu bar and why.',
      body: `<table class="itable"><thead><tr><th>#</th><th>Direction</th><th>Covers menu bar items</th><th>Why</th></tr></thead><tbody>
        <tr><td>1</td><td>A · Chin island</td><td>Nothing</td><td>Keeps the chin you like, is the safest to build, and gets the island feel from motion and cards. Nearly the pieces already built (the chin and the alert under the notch).</td></tr>
        <tr><td>2</td><td>F · Drip</td><td>Nothing</td><td>The most Dynamic Island thing here: shapes merge, split and drip back the way the phone's do, and the join to the notch is organic, so no corner radius to match. The risk is the goo filter staying smooth in the real notch window; it needs a hand test.</td></tr>
        <tr><td>3</td><td>H · Shelf</td><td>Nothing</td><td>Less a look than a feature: projects, the tray and reviews one hover away. It is the best idea to take from the Mac notch apps, and it pairs well with A.</td></tr>
        <tr><td>4</td><td>E · Peek</td><td>Nothing</td><td>Charming and tiny, good for quiet mode. It is weak at status (a small tag) and the hanging sign is more whimsical than useful.</td></tr>
        <tr><td>5</td><td>D · Halo</td><td>A 3 pt strip</td><td>The lowest footprint, and the ring's color is a good state signal. It cannot stand alone: there is no face at rest.</td></tr>
        <tr><td>6</td><td>C · Bubbles</td><td>Nothing</td><td>Easy to build, but it loses "one island".</td></tr>
        <tr><td>7</td><td>G · One-sided</td><td>The right side, 40 to 260 pt</td><td>Close to the phone's compact view, but it covers real menu extras (the clock, Wi-Fi, battery sit there), and the left side is where people look for app menus.</td></tr>
        <tr><td>8</td><td>B · Side island</td><td>Both sides, 28 to 58 pt each</td><td>The closest to the phone and the most costly: it covers the most.</td></tr>
      </tbody></table>
      <p class="inote"><b>What combines well.</b> <b>A with H:</b> A's chin and compact status for working and finished, and H's shelf when you rest the cursor on it, with approvals and reviews opening the shelf on their tab. This is the strongest pair. <b>A with F's motion:</b> draw A's shapes with Drip's liquid growth if it holds a steady frame rate on the real window, otherwise keep A's springs. <b>A with D:</b> use the Halo's ring only as a signal when the chin is asleep in quiet mode (an amber hairline for "needs you"). The progress line idea is not drawn: a hairline that fills while Claude works fits as the Working state of A or H, not as a direction.</p>
      <p class="inote"><b>My recommendation:</b> build A first, then add H's shelf as a second step, then try F's liquid motion as polish. Wings (B and G) and notch 3e are dropped.</p>
      <p class="inote"><b>What it replaces:</b> the Wings look and notch 3e (the Wings hand-off). Chin becomes the island's resting shape. <b>3e stays on hold</b>: if A is picked it is not needed.</p>
      <p class="inote"><b>How it would be built:</b> the notch window grows from 360 by 96 to about 460 by 240 to draw the compact and card states itself (today the main window draws the nudge under the notch). The motion is drawn by the notch page with transforms and opacity (Drip adds an SVG filter). The panel opening stays a crossfade between two windows (notch 3d); a moved panel skips it.</p>` })}
  </div>`)
  const cardEl = host.querySelector('#f-i-compare')
  const STATE_INFO = Object.fromEntries(STATES.map(([id, l, d]) => [id, [l, d]]))
  let cur = 'rest'
  const islands = []
  const label = (st) => { host.querySelector('#i-state').innerHTML = `<b>${STATE_INFO[st][0]}.</b> ${esc(STATE_INFO[st][1])}`; host.querySelectorAll('#i-states button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.st === st))) }
  function setAll(st) { cur = st; label(st); islands.forEach((i) => i.go(st)) }
  function build() {
    stage.clear('i')
    islands.forEach((i) => i.remove())
    islands.length = 0
    host.querySelectorAll('#f-i-compare .idirs figure').forEach((fig, n) => {
      const c = fig.querySelector('.icrop')
      c.replaceChildren()
      const { screen, el } = crop(c, { cw: 500, ch: 232, wall: S.dark ? 'dark' : 'light', busy: true })
      void el
      islands.push(make(fig.dataset.dir, screen, { kind: S.version, color: S.color, owner: 'i', seed: 71 + n, anchor: fig, mouth: S.mouth, think: S.think, rm: () => S.rm, dark: S.dark, state: cur }))
    })
    label(cur)
    buildOpen()
  }
  /* opening and closing */
  let odir = 'A', opos = 'under', oisl = null
  function buildOpen() {
    stage.clear('io')
    oisl?.remove()
    const c = host.querySelector('#i-ocrop')
    c.replaceChildren()
    const { screen } = crop(c, { cw: 1000, ch: 560, zoom: 0.78, wall: S.dark ? 'dark' : 'light', busy: true })
    oisl = make(odir, screen, { kind: S.version, color: S.color, owner: 'io', seed: 91, anchor: c, mouth: S.mouth, think: S.think, rm: () => S.rm, dark: S.dark, panel: true, moved: opos === 'moved', state: 'rest' })
  }
  host.querySelector('#i-openbtn').onclick = () => { openRun.cancel(); oisl.go('open') }
  host.querySelector('#i-closebtn').onclick = () => { openRun.cancel(); oisl.go('rest') }
  const seg = (id, fn) => host.querySelector(id).addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]')
    if (!b) return
    host.querySelectorAll(`${id} button`).forEach((x) => x.setAttribute('aria-pressed', String(x === b)))
    fn(b.dataset.v)
  })
  seg('#i-odir', (v) => { openRun.cancel(); odir = v; buildOpen(); oisl.go('open') })
  seg('#i-opos', (v) => { openRun.cancel(); opos = v; oisl.setMoved(v === 'moved'); oisl.go('rest'); setTimeout(() => oisl.go('open'), 500) })
  const openRun = demo(host.querySelector('#f-i-open'), host.querySelector('#f-i-open'), async (_, tok) => {
    oisl.go('rest'); await wait(1200, tok)
    oisl.go('open'); await wait(3200, tok)
    oisl.go('rest'); await wait(1400, tok)
  }, { clear: false, gap: 600 })

  /* the story */
  const run = demo(cardEl, cardEl, async (_, tok) => { for (const [st, ms] of STORY) { setAll(st); await wait(ms, tok) } }, { clear: false, gap: 700 })
  host.querySelector('#i-play').onclick = () => run.replay()
  host.querySelector('#i-states').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-st]')
    if (!b) return
    run.cancel()
    setAll(b.dataset.st)
  })
  build()
  onChange(['color', 'version', 'dark', 'mouth', 'think'], build)
  return { openRun }
}
