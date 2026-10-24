// 7. The notch island, round 3: three sizes and four ways to keep Steward itself in the notch. The user's direction: the
// island is not the main thing; the main chat stays in the side panel. Compact at rest (a slim island hugging the notch:
// Steward on one side, something else on the other), small when something happens (one line), big only for a message
// (an approval, a review). Steward's eyes were the only thing in the notch and it read as missing, so four treatments
// of the mascot are compared on the same three sizes. The notch has no pixels: nothing is drawn inside it; everything
// sits beside it or below it. Only transforms, opacity and clip paths move, on springs; Reduced Motion fades instead.
import { setMood } from '../pill/eyes.js'
import { palette } from '../pill/render.js'
import { crop, blob, NOTCH, MENU, CX } from '../notch/notch.js'
import { wait, demo, esc } from '../shared/activity.js'
import { S, onChange, stage, card } from './state.js'
import { BODY_TOP, HW, R, px, clamp, div, Spring, soft, CT, SIZES, makeLoop, makeEyes, makeContents, makePanel } from './island-kit.js'
import { chinBody } from './island2.js'

/* ---------------- the states ---------------- */
export const MSTATES = [
  ['rest', 'At rest', 'Compact: a slim island hugging the notch. Steward on the left, the project on the right.'],
  ['hover', 'Hover', 'The cursor is on it: the sides widen a little and Steward looks at the cursor. A click opens the side panel.'],
  ['working', 'Working', 'Still compact: the right side shows Claude working (a spinner, or the time). Nothing grows.'],
  ['finished', 'Finished', 'A small island drops in with one line, "haven: Claude finished", then settles back after a few seconds (hover keeps it). The right side keeps a check.'],
  ['needs', 'Needs you', 'The big island, by itself: the command and Allow or Deny. After a few seconds it settles to the amber mark; it is still waiting. A click brings it back.'],
  ['review', 'Review ready', 'The big island: before and after, what Claude says changed, Looks good. It settles to a small thumbnail on the right.'],
  ['two', 'Two projects', 'A small island says "api started", then settles. Compact shows two spinners or a count.'],
  ['quiet', 'Quiet mode', 'Asleep: just the notch, Steward tucked away. Resting the cursor wakes it. Only "needs you" comes out on its own.'],
]
const CTX = { rest: 'idle', hover: 'idle', working: 'working', finished: 'finished', needs: 'needs', review: 'review', two: 'two', quiet: 'idle', open: 'idle' }
const MOOD = { rest: ['resting'], hover: ['idle'], working: ['thinking', 'sweep'], finished: ['celebrating'], needs: ['needs-you'], review: ['idle'], two: ['thinking', 'sweep'], quiet: ['resting'], open: ['idle'] }
const LOOK_RIGHT = { x: 0.6, y: 0.08 }

export const RIGHT_MODES = [['smart', 'Smart (recommended)'], ['status', 'Status'], ['timer', 'Timer'], ['count', 'Count'], ['thumb', 'Thumbnail']]

/** What the right side of the compact island shows ("something else"): a few choices. w is its width in points. */
export function rightSide(c, mode) {
  const tile = { w: 36, h: '<span class="mc-tile">ha</span>' }
  const spin = (n = 1) => ({ w: n === 1 ? 36 : 54, h: '<i class="mc-spin"></i>'.repeat(n) })
  const status = { idle: tile, working: spin(), finished: { w: 36, h: '<i class="mc-check"></i>' }, needs: { w: 36, h: '<i class="mc-ask">!</i>' }, review: { w: 36, h: '<i class="mc-rdot"></i>' }, two: spin(2) }
  const waiting = { idle: 0, working: 0, finished: 1, needs: 1, review: 1, two: 2 }[c]
  const timer = { w: 60, h: '<span class="mc-time">2:41</span>' }
  const thumb = { w: 46, h: '<span class="mc-thumb"></span>' }
  const count = (n) => ({ w: 40, h: `<span class="mc-count">${n}</span>` })
  switch (mode) {
    case 'timer': return c === 'working' || c === 'two' ? timer : status[c]
    case 'count': return waiting ? count(waiting) : tile
    case 'thumb': return c === 'review' ? thumb : status[c]
    case 'smart':
      if (c === 'working') return { w: 62, h: '<i class="mc-spin"></i><span class="mc-time">2:41</span>' }
      if (c === 'review') return thumb
      if (c === 'two') return { w: 62, h: '<i class="mc-spin"></i><span class="mc-count">2</span>' }
      return status[c]
    default: return status[c]
  }
}

export const DESIGNS = [
  { id: '1', name: 'Little Pill', covers: ['Compact: about 48 pt left, 36 to 62 pt right', 'Small: the same, the line hangs under the bar', 'Big: the same, the card hangs under the bar'],
    short: 'The whole Pill, shrunk to fit the menu bar band, sits in a black wing on the left with its moods and blinks. The most Steward at every size. It stays in the wing whatever the island does.' },
  { id: '2', name: 'Peeking', covers: ['Compact: about 34 pt left, 36 to 62 pt right', 'Small: about 24 pt more as it leans out', 'Big: about 40 pt more as it leans right out'],
    short: 'Half of Steward peeks out from behind the notch\'s left edge, as if the notch is where it lives. It leans out for news, further for a message, and slides back in to sleep.' },
  { id: '3', name: 'Hanging', covers: ['Compact: nothing on the left, 36 to 62 pt right', 'Small: the same', 'Big: the same'],
    short: 'Steward hangs from the notch\'s bottom edge by its hands and sways a little. For news it drops lower, hanging from the small or big island instead. Nothing is covered on the left.' },
  { id: '4', name: 'Carrier', covers: ['Compact: about 40 pt left (just the eyes), 36 to 62 pt right', 'Small: Steward steps out below, the left wing closes', 'Big: the same'],
    short: 'At rest only the lit eyes show in the left wing, as today. When there is a message, Steward slides out of the wing, carrying it: it holds the corner of the island, then carries it back. The least at rest.' },
]

/* ---------------- one island ---------------- */
export function createMascot(screen, o) {
  const { design, kind, color, rm = () => false } = o
  const lit = palette(kind, { color, lit: true }).lit
  const root = div('isl mc', `left:${px(CX)};--lit:${[1, 3, 5].map((i) => parseInt(lit.slice(i, i + 2), 16)).join(',')}`)
  const shape = div('isl-shape')
  root.append(shape)
  let look = null
  const g = stage.group({ seed: o.seed ?? 1, anchor: o.anchor ?? screen, mood: 'resting', think: o.think ?? 'dots', mouth: o.mouth ?? true, owner: o.owner, look: () => look })
  let state = 'rest', hovered = false, settled = false
  let rightMode = o.rightMode ?? 'smart'
  let panelSide = o.panelSide ?? 'right'
  let apply2 = () => {}
  const loop = makeLoop(root, () => { ey.apply(); cb.apply(); apply2() })
  const ey = makeEyes({ root, kind, color, mouth: o.mouth ?? true }, loop.add)
  const ct = makeContents(root, rm, () => state)
  const cb = chinBody({ shape, loop })

  // the two wings of the compact island: black, joined to the notch (they include the notch's width, hidden under it)
  const wing = (side) => {
    const wrap = div('mc-wing'); shape.append(wrap)
    const b = blob(wrap, { w0: NOTCH.w + 90, h0: NOTCH.h, rb: R, cls: 'wing' })
    return { wrap, b, side, w: loop.add(new Spring(0)) }
  }
  const WL = wing(-1), WR = wing(1)

  // the right side: "something else"
  const rs = div('mc-rs'); const rsIn = div('mc-rs-in'); rs.append(rsIn); root.append(rs)
  const RW = loop.add(new Spring(0))
  let rsHtml = ''

  // Steward's body (the Pill) for treatments 1 to 4, and the arms for Hanging
  const pillView = (parent) => {
    const host = div('mc-pill')
    // on the black wings it is lit like the notch; over the wallpaper or a window it is the light Pill, so it does not wash out
    // Glass needs something behind it to refract, so outside the black the Pill falls back to its solid flat body.
    const outside = design === '2' || design === '3'
    const v = stage.view(g, outside && kind === 'glass' ? 'flat' : kind, host, 64, 54, { color, tinted: true, light: outside ? !o.dark : false, mouth: o.mouth ?? true })
    v.el.style.position = 'absolute'; v.el.style.left = '-32px'; v.el.style.top = '-27px'
    parent.append(host)
    return host
  }
  const P = { x: loop.add(soft(-100)), y: loop.add(soft(16)), s: loop.add(soft(0.6)), r: loop.add(new Spring(0, 130, 11)), o: loop.add(soft(0)) }
  const Hg = { gx: loop.add(soft(-58)), gy: loop.add(soft(8)), len: loop.add(soft(0)), sw: loop.add(new Spring(0, 60, 3.5)) }
  let pillHost, hang
  if (design === '3') {
    hang = div('mc-hang'); root.append(hang)
    const arms = [-8, 8].map((x) => { const a = div('mc-arm', `left:${x - 1.5}px`); const h = div('mc-hand', `left:${x - 4}px`); hang.append(a, h); return a })
    pillHost = pillView(hang)
    hang._arms = arms
  } else {
    pillHost = pillView(root)
  }
  if (design === '4') ey.mk('main', g)

  apply2 = () => {
    for (const w of [WL, WR]) {
      w.wrap.style.transform = `translateX(${px(w.side * w.w.v / 2)})`
      w.b.size(NOTCH.w + Math.max(0, w.w.v), NOTCH.h)
    }
    rs.style.transform = `translate(${px(HW + RW.v / 2)},${px(NOTCH.h / 2)})`
    if (design === '3') {
      hang.style.transform = `translate(${px(Hg.gx.v)},${px(Hg.gy.v)}) rotate(${+Hg.sw.v.toFixed(2)}deg)`
      for (const a of hang._arms) a.style.height = px(Math.max(0, Hg.len.v + 2))
      pillHost.style.transform = `translate(0,${px(Hg.len.v + 13)}) scale(${Math.max(0.01, P.s.v)})`
      pillHost.style.opacity = String(clamp(P.o.v, 0, 1))
      hang.style.visibility = P.o.v < 0.02 ? 'hidden' : ''
    } else {
      pillHost.style.transform = `translate(${px(P.x.v)},${px(P.y.v)}) rotate(${+P.r.v.toFixed(2)}deg) scale(${Math.max(0.01, P.s.v)})`
      pillHost.style.opacity = String(clamp(P.o.v, 0, 1))
    }
  }

  // the side panel it hands off to
  const panelBits = o.panel ? makePanel({ root, kind, color, mouth: o.mouth ?? true, dark: o.dark }, g) : null
  const hot = div('sh-hot'); root.append(hot)

  /* ---- where everything goes ---- */
  const levelOf = (st) => {
    if (st === 'quiet' && !hovered) return 'asleep'
    if (!settled) {
      if (st === 'finished' || st === 'two') return 'small'
      if (st === 'needs' || st === 'review') return 'big'
    }
    return 'compact'
  }
  function plan(st) {
    const c = CTX[st]
    const lv = levelOf(st)
    const hov = hovered || st === 'hover'
    const p = { lv, WL: 0, WR: 0, L: NOTCH.h, body: null, contents: [], rs: null, eyes: {}, pill: { x: -100, y: 16, s: 0.6, r: 0, o: 0 }, hang: { gx: -58, gy: 8, len: 0 }, hot: null, panel: st === 'open', look: null }
    const rsPick = lv === 'asleep' ? null : rightSide(c, rightMode)
    p.rs = rsPick
    p.WR = rsPick ? rsPick.w + (hov ? 6 : 0) : 0
    // the small and big islands, under the menu bar line
    let bw = 0, bh = 0
    if (lv === 'small') {
      bw = 290; bh = 34
      const html = st === 'two' ? '<div class="ic-row"><b>api</b> <span class="mut">started · Running tests</span></div>' : '<div class="ic-row"><b>haven</b> <span class="mut">Claude finished · 3 files</span></div>'
      p.body = { w: bw, h: bh }; p.L = 46
      p.contents.push({ id: 'line', html, x: -bw / 2, y: BODY_TOP, w: bw, h: bh, eyes: design === '4' })
    } else if (lv === 'big') {
      ;[bw, bh] = SIZES[st]
      p.body = { w: bw, h: bh }; p.L = 46
      p.contents.push({ id: st, html: CT[st], x: -bw / 2, y: BODY_TOP, w: bw, h: bh, eyes: design === '4' })
    }
    const lvN = lv === 'big' ? 2 : lv === 'small' ? 1 : 0
    const away = lv === 'asleep'
    const ahead = !away
    // the mascot
    if (design === '1') {
      p.WL = away ? 0 : hov ? 58 : 52
      p.pill = { x: -(HW + p.WL / 2), y: NOTCH.h / 2, s: 0.7, r: 0, o: away ? 0 : 1 }
    } else if (design === '2') {
      const xs = [hov ? -108 : -100, -112, -126]
      const rs2 = [hov ? -12 : -8, -14, -22]
      p.pill = away ? { x: -66, y: NOTCH.h / 2, s: 0.8, r: 0, o: 1 } : { x: xs[lvN], y: NOTCH.h / 2, s: 0.8, r: rs2[lvN], o: 1 }
    } else if (design === '3') {
      p.pill = { x: 0, y: 0, s: 0.8, r: 0, o: away ? 0 : 1 }
      if (away) p.hang = { gx: -58, gy: 8, len: 0 }
      else if (lv === 'compact') p.hang = { gx: -58, gy: NOTCH.h, len: hov ? 11 : 8 }
      else p.hang = { gx: -bw / 2 + 44, gy: BODY_TOP + bh, len: 8 }
    } else {
      p.WL = away ? 0 : lv === 'compact' ? (hov ? 46 : 40) : 0
      p.eyes.main = { x: -(HW + (hov ? 46 : 40) / 2), y: NOTCH.h / 2, s: 1, o: lv === 'compact' ? 1 : 0 }
      p.pill = lv === 'compact' || away ? { x: -(HW + 20), y: NOTCH.h / 2, s: 0.3, r: 0, o: 0 } : { x: -bw / 2 + 25, y: BODY_TOP + 17, s: 0.62, r: -6, o: 1 }
    }
    // where the pointer counts as on the island
    const left = HW + Math.max(p.WL, design === '2' ? 36 : 0) + 8, right = HW + p.WR + 8
    p.hot = { x: -left, y: 0, w: left + right, h: BODY_TOP + 2 }
    if (p.body) p.hot = { x: -Math.max(left, bw / 2 + 6), y: 0, w: Math.max(left, bw / 2 + 6) + Math.max(right, bw / 2 + 6), h: BODY_TOP + bh + (design === '3' ? 40 : 6) }
    // where Steward looks: toward the status on the right, or toward the panel
    if (st === 'open') p.look = { x: panelSide === 'left' ? -0.7 : panelSide === 'right' ? 0.7 : 0.4, y: 0.2 }
    else if (!hov && ahead && ['working', 'finished', 'needs', 'review', 'two'].includes(st)) p.look = LOOK_RIGHT
    return p
  }

  const sideOf = () => ({ right: { x: 348, y: 70, cls: 'side-r' }, left: { x: -748, y: 70, cls: 'side-l' }, drag: { x: -456, y: 150, cls: 'pop' } })[panelSide]
  function aim(p, st, snap) {
    const set = (s, v) => (snap ? s.snap(v) : s.set(v))
    cb.aim(p, snap)
    set(WL.w, p.WL); set(WR.w, p.WR - 0 > 0 ? p.WR : 0)
    set(RW, p.WR)
    // the right side words, swapped with a short fade
    const html = p.rs ? p.rs.h : ''
    if (html !== rsHtml) {
      rsHtml = html
      rsIn.classList.add('out')
      clearTimeout(aim.t)
      aim.t = setTimeout(() => { rsIn.innerHTML = html; rsIn.classList.remove('out') }, snap || rm() ? 0 : 110)
    }
    ey.aim(p.eyes, snap)
    // the pill: fresh arrivals start small where they come from
    if (design === '3') {
      set(Hg.gx, p.hang.gx); set(Hg.gy, p.hang.gy); set(Hg.len, p.hang.len); set(P.s, p.pill.s); set(P.o, p.pill.o)
    } else {
      if (design === '4' && P.o.t < 0.3 && p.pill.o > 0.5 && !snap) { P.x.snap(-(HW + 20)); P.y.snap(NOTCH.h / 2); P.s.snap(0.3) }
      set(P.x, p.pill.x); set(P.y, p.pill.y); set(P.s, p.pill.s); set(P.r, p.pill.r); set(P.o, p.pill.o)
    }
    ct.set(p.contents)
    look = p.look
    if (panelBits) {
      const sd = sideOf()
      Object.assign(panelBits.panel.style, { left: px(sd.x), top: px(sd.y), width: '400px', height: '620px' })
      panelBits.panel.classList.remove('side-r', 'side-l', 'pop'); panelBits.panel.classList.add(sd.cls)
      panelBits.panel.classList.toggle('on', !!p.panel)
    }
    Object.assign(hot.style, { left: px(p.hot.x), top: px(p.hot.y), width: px(p.hot.w), height: px(p.hot.h) })
    root.dataset.st = st
    root.dataset.lv = p.lv
    loop.kick()
  }
  function show(st, first) {
    const p = plan(st)
    const hov = hovered || st === 'hover'
    let [mood, glint] = hov ? ['idle'] : (MOOD[st] ?? MOOD.rest)
    if (design === '4' && p.lv === 'compact' && mood === 'thinking') { mood = 'idle'; glint = undefined }
    setMood(g.st, mood, glint)
    if (rm() && !first) {
      root.classList.add('rm-out')
      clearTimeout(show.t)
      show.t = setTimeout(() => { aim(plan(state), state, true); apply2(); cb.apply(); ey.apply(); void root.offsetWidth; root.classList.remove('rm-out') }, 130)
      return
    }
    aim(p, st, first)
    if (first) { apply2(); cb.apply(); ey.apply() }
  }
  let tSettle = 0
  const peak = (st) => ['finished', 'two', 'needs', 'review'].includes(st)
  function armSettle(ms) {
    clearTimeout(tSettle)
    if (!o.autoSettle || !peak(state) || settled) return
    tSettle = setTimeout(() => { if (hovered) return armSettle(1500); settled = true; show(state, false) }, ms ?? (state === 'needs' || state === 'review' ? 9000 : 4500))
  }
  function go(st, { first = false } = {}) {
    const was = state
    state = st
    settled = false
    show(st, first)
    // a happy little bounce when Claude finishes, and a wiggle when it needs you
    if (!first && !rm() && st === 'finished') { P.y.x = -110; if (design === '3') Hg.sw.x = 70; if (design === '4') ey.eyes.main.y.x = -110 }
    if (!first && !rm() && st === 'needs' && design === '3') Hg.sw.x = -90
    void was
    armSettle()
  }
  function setHover(v) { if (hovered === v) return; hovered = v; show(state, false); if (!v) armSettle(1500) }
  let tIn = 0, tOut = 0
  hot.addEventListener('pointerenter', () => { clearTimeout(tOut); clearTimeout(tIn); tIn = setTimeout(() => setHover(true), 120) })
  hot.addEventListener('pointerleave', () => { clearTimeout(tIn); clearTimeout(tOut); tOut = setTimeout(() => setHover(false), 350) })
  hot.addEventListener('click', () => {
    root.classList.add('squash'); setTimeout(() => root.classList.remove('squash'), 320)
    // a click on a settled island brings the message back; a click anywhere opens the side panel in the hand-off card
    if (o.onClick) o.onClick(state)
    else if (settled && peak(state)) { settled = false; show(state, false); armSettle(5000) }
  })
  screen.append(root)
  go(o.state ?? 'rest', { first: true })
  return {
    root, group: g, go,
    get state() { return state },
    setRight(m) { rightMode = m; show(state, true) },
    setSide(s) { panelSide = s; show(state, true) },
    remove() { clearTimeout(show.t); clearTimeout(tSettle); clearTimeout(tIn); clearTimeout(tOut); clearTimeout(aim.t); ct.clear(); loop.stop(); root.remove() },
  }
}

/* ---------------- the section ---------------- */
const STORY = [['rest', 1700], ['hover', 1700], ['working', 2000], ['two', 3200], ['working', 1200], ['finished', 4800], ['needs', 4200], ['review', 4600], ['rest', 1400], ['quiet', 2200]]

const staticRight = (c, mode) => `<span class="mc-demo"><span class="blk">${rightSide(c, mode).h}</span></span>`

export function render(host) {
  const sizes = `<div class="msizes"><div><b>Compact</b><span>At rest and while working. A slim island hugging the notch: Steward on one side, something else on the other.</span></div><div><b>Small</b><span>When something happens: one line under the menu bar, "haven: Claude finished". It settles back after a few seconds.</span></div><div><b>Big</b><span>Only for a message: an approval, a review. It opens by itself and settles after a few seconds or on a click. Smaller than the shelf, never the main surface.</span></div></div>`
  host.insertAdjacentHTML('beforeend', `<div class="grid">
    ${card({ id: 'm-compare', section: 7, title: 'Three sizes, four ways to keep Steward in the notch', status: 'planned', from: ['notch.html', 'notch-styles.html'], cls: 'wide',
      desc: 'The island is no longer the main thing: the main chat stays in the side panel. It has three sizes, and the question is how Steward itself lives in the notch. Four treatments on the same three sizes and the same eight states. Pick a state, play the story, or rest the cursor on a notch (Steward looks at the cursor; a settled alert comes back on a click). Eyes go on the left and the project on the right; the other side is a choice below. The menu bar here is a busy one so you can see what each covers.',
      tools: '<button class="btn" id="m-play">▶ Play the story</button>',
      body: `${sizes}<div class="istates" id="m-states">${MSTATES.map(([id, l]) => `<button data-st="${id}" aria-pressed="false">${l}</button>`).join('')}</div>
        <p class="istate" id="m-state"></p>
        <div class="ibar"><span class="lbl">Right side shows</span><span class="iseg" id="m-right">${RIGHT_MODES.map(([id, l], i) => `<button data-v="${id}" aria-pressed="${i === 0}">${l}</button>`).join('')}</span></div>
        <div class="idirs mc-figs">${DESIGNS.map((d) => `<figure data-d="${d.id}"><div class="icrop"></div><figcaption><b>${d.id} · ${d.name}</b> ${esc(d.short)} <i class="cov">Covers: ${d.covers.map(esc).join(' · ')}</i></figcaption></figure>`).join('')}</div>` })}
    ${card({ id: 'm-right', section: 7, title: 'The other side: what it can show', status: 'planned', from: null, cls: 'wide',
      desc: 'Steward\'s eyes (or body) go on the left, and the right side is "something else". The left because that is where you read first: who, then what. The eyes also glance right, toward the status, which is the "reacting" part. If a person\'s app menus run long, a setting can mirror it (eyes right, status left). Five choices; the recommended one adapts.',
      body: `<table class="itable"><thead><tr><th>Choice</th><th>Idle</th><th>Working</th><th>Finished</th><th>Needs you</th><th>Review</th><th>Two projects</th></tr></thead><tbody>${[['status', 'Status'], ['timer', 'Timer'], ['count', 'Count'], ['thumb', 'Thumbnail'], ['smart', 'Smart (recommended)']].map(([m, l]) => `<tr><td>${l}</td>${['idle', 'working', 'finished', 'needs', 'review', 'two'].map((c) => `<td>${staticRight(c, m)}</td>`).join('')}</tr>`).join('')}</tbody></table>
        <p class="inote"><b>Smart</b> shows the project tile at rest, a spinner with the time while Claude works, a check when done, an amber mark for an approval, a thumbnail for a review and a spinner with a count for two projects. Status alone is the simplest; a timer alone helps only while working; a count alone hides what kind of thing is waiting; a thumbnail alone only helps for reviews.</p>` })}
    ${card({ id: 'm-hand', section: 7, title: 'Hand-off: the island to the side panel and back', status: 'planned', from: 'notch.html', cls: 'wide',
      desc: 'Clicking the island opens today\'s side panel on its edge (right or left), or where you dragged it, with its usual entrance. Never centered under the notch. The island stays as the notch character while the panel is open, and Steward looks toward the panel. Closing the panel is today\'s close. The big island and the small island never replace the panel; they only deliver a message.',
      tools: '<button class="btn" id="m-openbtn">Click the island</button> <button class="btn" id="m-closebtn">Close the panel</button>',
      body: `<div class="ibar"><span class="lbl">Treatment</span><span class="iseg" id="m-odir">${DESIGNS.map((d, i) => `<button data-v="${d.id}" aria-pressed="${i === 1}">${d.id} · ${d.name}</button>`).join('')}</span>
        <span class="lbl">Panel</span><span class="iseg" id="m-oside"><button data-v="right" aria-pressed="true">Right edge</button><button data-v="left" aria-pressed="false">Left edge</button><button data-v="drag" aria-pressed="false">Dragged</button></span></div>
        <div class="icrop" id="m-ocrop"></div>` })}
    ${card({ id: 'm-choose', section: 7, title: 'Which Steward, and what it covers', status: 'planned', from: null, cls: 'wide',
      desc: 'How alive each is at each size, what it costs in the menu bar, and my pick.',
      body: `<table class="itable"><thead><tr><th></th><th>1 · Little Pill</th><th>2 · Peeking</th><th>3 · Hanging</th><th>4 · Carrier</th></tr></thead><tbody>
        <tr><td>Steward at rest</td><td>The whole Pill, small, in a wing</td><td>Half the Pill, peeking out</td><td>The whole Pill, hanging below</td><td>Only the lit eyes (as today)</td></tr>
        <tr><td>Compact covers</td><td>about 48 pt left, 36 to 62 pt right</td><td>about 34 pt left, 36 to 62 pt right</td><td>nothing left, 36 to 62 pt right</td><td>about 40 pt left, 36 to 62 pt right</td></tr>
        <tr><td>Small and big cover</td><td>the same, the island is under the bar</td><td>up to about 40 pt more on the left as it leans out</td><td>the same as compact</td><td>the left wing closes: nothing on the left, the same on the right</td></tr>
        <tr><td>How it shows a message</td><td>stays put, the island drops in</td><td>leans out further, tilts</td><td>drops lower and hangs from the island</td><td>steps out holding the island, then carries it back</td></tr>
        <tr><td>Alive without nagging</td><td>blinks and moods; the most visible at rest</td><td>still, breathing, looks at the status</td><td>sways slightly; the most playful</td><td>the calmest at rest</td></tr>
        <tr><td>Fixes "missing mascot"</td><td>yes, fully</td><td>yes, in a way that is about the notch</td><td>yes, fully</td><td><b>no</b>: at rest it is still only eyes</td></tr>
        <tr><td>Hard parts</td><td>a glass Pill that small must stay readable</td><td>it has to hide behind the notch exactly (the real edge)</td><td>arms and sway; overlaps window title bars below</td><td>the travel between wing and island</td></tr>
      </tbody></table>
      <p class="inote"><b>My pick: 2, Peeking, with the reacting behavior from all of them</b> (eyes glance toward the status, sleep when quiet, a happy bounce when done) <b>and 4's carrying for the big island</b> (when a message needs you, Steward leans out and holds the card). It fixes the missing mascot in a way that belongs to the notch ("Steward lives in there"), covers the least of the ones that show a body at rest, and the right side stays a clean status. 3 is the most playful and covers nothing on the left; pick it if the user wants more character and does not mind something hanging under the bar. 1 is the safest and the most literal. 4 alone does not fix the complaint.</p>
      <p class="inote"><b>Eyes on the left, status on the right.</b> You read left to right: who, then what. The eyes can glance right at the status. The right is the better place for something that comes and goes, because the menu bar extras there are less used than the app menus on the left. A setting can mirror it.</p>
      <p class="inote"><b>How the main chat works now:</b> unchanged. The side panel stays on the left or right edge or where you dragged it. The island never replaces it. A click on the island, or the hotkey, opens it. The shelf and the earlier eight tries are kept below.</p>
      <p class="inote"><b>How it would be built:</b> the notch window grows from 360 by 96 pt to about 400 by 240 to draw the three sizes (the big island is about the size of the alert under the notch built in 3b, so most of that is reused). The wings are black pieces like the Wings look. Steward's body is the Pill's existing glass view, scaled, behind the real notch's edge. The motion is a small spring loop (transform, opacity, clip) like the one on this page.</p>` })}
  </div>`)
  const cardEl = host.querySelector('#f-m-compare')
  const INFO = Object.fromEntries(MSTATES.map(([id, l, d]) => [id, [l, d]]))
  let cur = 'rest', rightMode = 'smart'
  const islands = []
  const label = (st) => { host.querySelector('#m-state').innerHTML = `<b>${INFO[st][0]}.</b> ${esc(INFO[st][1])}`; host.querySelectorAll('#m-states button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.st === st))) }
  const setAll = (st) => { cur = st; label(st); islands.forEach((i) => i.go(st)) }
  function build() {
    stage.clear('m')
    islands.forEach((i) => i.remove())
    islands.length = 0
    host.querySelectorAll('#f-m-compare .mc-figs figure').forEach((fig, n) => {
      const c = fig.querySelector('.icrop')
      c.replaceChildren()
      const { screen } = crop(c, { cw: 440, ch: 240, wall: S.dark ? 'dark' : 'light', busy: true })
      islands.push(createMascot(screen, { design: fig.dataset.d, kind: S.version, color: S.color, owner: 'm', seed: 151 + n, anchor: fig, mouth: S.mouth, think: S.think, rm: () => S.rm, dark: S.dark, state: cur, rightMode, autoSettle: true }))
    })
    label(cur)
    buildOpen()
  }
  let odir = '2', oside = 'right', omc = null, panelOpen = false
  function buildOpen() {
    stage.clear('mo')
    omc?.remove()
    const c = host.querySelector('#m-ocrop')
    c.replaceChildren()
    const { screen } = crop(c, { cw: 1512, ch: 800, zoom: 0.5, wall: S.dark ? 'dark' : 'light', busy: true })
    omc = createMascot(screen, { design: odir, kind: S.version, color: S.color, owner: 'mo', seed: 181, anchor: c, mouth: S.mouth, think: S.think, rm: () => S.rm, dark: S.dark, panel: true, panelSide: oside, state: panelOpen ? 'open' : 'rest', rightMode, onClick: () => toggle() })
  }
  const toggle = () => { openRun.cancel(); panelOpen = !panelOpen; omc.go(panelOpen ? 'open' : 'rest') }
  host.querySelector('#m-openbtn').onclick = () => { openRun.cancel(); panelOpen = true; omc.go('open') }
  host.querySelector('#m-closebtn').onclick = () => { openRun.cancel(); panelOpen = false; omc.go('rest') }
  const seg = (id, fn) => host.querySelector(id).addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]')
    if (!b) return
    host.querySelectorAll(`${id} button`).forEach((x) => x.setAttribute('aria-pressed', String(x === b)))
    fn(b.dataset.v)
  })
  seg('#m-odir', (v) => { openRun.cancel(); odir = v; buildOpen() })
  seg('#m-oside', (v) => { openRun.cancel(); oside = v; omc.setSide(v) })
  seg('#m-right', (v) => { rightMode = v; islands.forEach((i) => i.setRight(v)); omc?.setRight(v) })
  const openRun = demo(host.querySelector('#f-m-hand'), host.querySelector('#f-m-hand'), async (_, tok) => {
    panelOpen = false; omc.go('rest'); await wait(1400, tok)
    omc.go('hover'); await wait(1200, tok)
    panelOpen = true; omc.go('open'); await wait(3400, tok)
    panelOpen = false; omc.go('rest'); await wait(1600, tok)
  }, { clear: false, gap: 600 })
  const run = demo(cardEl, cardEl, async (_, tok) => { for (const [st, ms] of STORY) { setAll(st); await wait(ms, tok) } }, { clear: false, gap: 700 })
  host.querySelector('#m-play').onclick = () => run.replay()
  host.querySelector('#m-states').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-st]')
    if (!b) return
    run.cancel()
    setAll(b.dataset.st)
  })
  build()
  onChange(['color', 'version', 'dark', 'mouth', 'think'], build)
}
