// 7. The notch island, round 4: Peeking, as one joined island. The user picked Peeking, and asked for every size to be one
// continuous black shape joined to the notch, like the iPhone's Dynamic Island: no floating pill, no gap. The shape is
// flush with the top of the screen and grows out of the notch with springs, wider and taller, so the size follows the
// message: a compact island while Claude runs, a wider one with a line for a short note, a big one for an approval, the
// biggest for a review. At rest Steward peeks from behind the notch's left edge; when the island grows big, Steward
// slides into it and becomes part of it (its body melts into the black, leaving the lit eyes in an avatar spot), and when
// it shrinks Steward steps back out. The notch has no pixels: the join is the black meeting the notch's edges.
// Only transforms, opacity and clip paths move. Reduced Motion fades instead.
import { setMood } from '../pill/eyes.js'
import { palette } from '../pill/render.js'
import { crop, blob, NOTCH, CX } from '../notch/notch.js'
import { wait, demo, esc } from '../shared/activity.js'
import { S, onChange, stage, card } from './state.js'
import { HW, px, clamp, div, Spring, soft, makeLoop, makeEyes, makeContents, makePanel } from './island-kit.js'
import { rightSide, RIGHT_MODES } from './mascot.js'

export const PSTATES = [
  ['rest', 'At rest', 'No island. Steward peeks out from behind the notch\'s left edge, breathing, looking around.'],
  ['hover', 'Hover', 'The cursor is on it: Steward leans out and looks at the cursor. A click opens the side panel.'],
  ['working', 'Working', 'The compact island grows out of the notch: Steward steps into the left side, a spinner and the time on the right.'],
  ['finished', 'Finished', 'The island widens a little with one line: "haven: Claude finished". It settles back to compact after a few seconds, with a check on the right.'],
  ['needs', 'Steward asks', 'Steward\'s own request (it needs your OK to run a command). The big island: Steward slides in and becomes part of it, with the command and Allow and Deny, which really work. After a few seconds it settles to compact with an amber mark. It is still waiting.'],
  ['wait', 'A session waits', 'A Claude Code session needs your OK. The same big island, but Steward cannot answer a session, so no Allow or Deny: Open and Later. After a few seconds it settles to compact with an amber mark until the session moves on.'],
  ['ask', 'Needs input', 'A session asks you something (a question, no Allow or Deny). The big island with the question, Open and Later, Steward confused. It settles to compact with an amber question mark until the session resumes.'],
  ['fail', 'Build failed', 'A deploy failed. The big island with what broke, "Want me to look?" and Later, Steward mad. It settles to compact with a red mark until a deploy for that project works.'],
  ['good', 'Deployed or merged', 'Good news. The note size with one line, Steward celebrating, a spark on the right. It settles away to rest after a few seconds; nothing waits.'],
  ['first', 'First launch', 'Once ever, the first time Steward hides: the note size says how to bring it out. It stays at least 10 seconds, longer while the cursor is on it, then goes back to rest.'],
  ['other', 'Anything else', 'The catch-all: any alert with no size of its own opens as a note with its title and one line. Nothing ever uses the old pill under the notch.'],
  ['review', 'Review ready', 'The biggest island: Steward joins it, before and after, what Claude says changed, Looks good. It settles to compact with a thumbnail.'],
  ['two', 'Two projects', 'A short note, "api started", then compact with two spinners and a count.'],
  ['quiet', 'Quiet mode', 'Asleep: Steward tucked behind the notch, no island. Resting the cursor wakes it.'],
]
const CTX = { rest: 'idle', hover: 'idle', working: 'working', finished: 'finished', needs: 'needs', wait: 'needs', ask: 'ask', fail: 'fail', good: 'good', first: 'idle', other: 'idle', review: 'review', two: 'two', quiet: 'idle', open: 'idle' }
const MOOD = { rest: ['resting'], hover: ['idle'], working: ['thinking', 'sweep'], finished: ['celebrating'], needs: ['needs-you'], wait: ['needs-you'], ask: ['confused'], fail: ['mad'], good: ['celebrating'], first: ['idle'], other: ['idle'], review: ['idle'], two: ['thinking', 'sweep'], quiet: ['resting'], open: ['idle'] }
const LOOK_RIGHT = { x: 0.6, y: 0.08 }

/** The island's size for each step, in points: width and height. The width and height are of the one black shape. */
export const SIZES = { rest: [NOTCH.w, NOTCH.h], compact: [324, 32], note: [380, 60], approval: [420, 124], review: [440, 172] }
export const STEPS = [
  ['compact', 'Compact', 'Claude is running. A spinner and the time, like the call timer.'],
  ['note', 'Note', 'A short message: one line under the notch.'],
  ['approval', 'Approval', 'Needs you: the command, Deny and Allow, like the call card.'],
  ['review', 'Review', 'A review: before and after, what changed, Looks good, like the music player.'],
]

const abs = (x, y, w, h, cls, inner = '') => `<div class="a ${cls}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px">${inner}</div>`
const pill = (t, pri) => `<span class="pillbtn${pri ? ' pri' : ''}">${t}</span>`
const THUMBS = '<span class="thumbs"><i class="tb"></i><i class="ta"></i></span>'

export function createPeeking(screen, o) {
  const { kind, color, rm = () => false } = o
  const lit = palette(kind, { color, lit: true }).lit
  const root = div('isl pk2', `left:${px(CX)};--lit:${[1, 3, 5].map((i) => parseInt(lit.slice(i, i + 2), 16)).join(',')}`)
  const shape = div('isl-shape')
  root.append(shape)
  let look = null
  const g = stage.group({ seed: o.seed ?? 1, anchor: o.anchor ?? screen, mood: 'resting', think: o.think ?? 'dots', mouth: o.mouth ?? true, owner: o.owner, look: () => look })
  let state = 'rest', hovered = false, settled = false, joined = false
  let rightMode = o.rightMode ?? 'smart', panelSide = o.panelSide ?? 'right'
  let apply2 = () => {}
  const loop = makeLoop(root, () => { ey.apply(); apply2() })
  const ey = makeEyes({ root, kind, color, mouth: o.mouth ?? true }, loop.add)
  const ct = makeContents(root, rm, () => state)

  // the one black shape: flush with the top of the screen, bottom corners continuous, joined to the notch
  const body = blob(shape, { w0: 460, h0: 180, rt: 0, rb: 24, top: 0, cls: 'pk2body' })
  const W = loop.add(new Spring(NOTCH.w, 170, 16)), H = loop.add(new Spring(NOTCH.h, 170, 16))

  // the avatar spot the eyes sit in once Steward has joined the island
  const avatar = div('pk2-avatar'); root.append(avatar)
  const A = { x: loop.add(soft(-160)), y: loop.add(soft(78)), o: loop.add(soft(0)) }
  // Steward's body, peeking: the solid Pill (glass needs something to refract)
  const pillHost = div('mc-pill'); root.append(pillHost)
  const v = stage.view(g, kind === 'glass' ? 'flat' : kind, pillHost, 64, 54, { color, tinted: true, light: !o.dark, mouth: o.mouth ?? true })
  v.el.style.position = 'absolute'; v.el.style.left = '-32px'; v.el.style.top = '-27px'
  const P = { x: loop.add(soft(-66)), y: loop.add(soft(16)), s: loop.add(soft(0.8)), r: loop.add(new Spring(0, 130, 11)), o: loop.add(soft(0)) }
  const eyes = ey.mk('main', g)
  // the right side: the status, beside the notch (or at the island's top right when it is big)
  const rs = div('mc-rs'); const rsIn = div('mc-rs-in'); rs.append(rsIn); root.append(rs)
  const RX = loop.add(soft(HW + 34)), RO = loop.add(soft(0))
  let rsHtml = ''
  const panelBits = o.panel ? makePanel({ root, kind, color, mouth: o.mouth ?? true, dark: o.dark }, g) : null
  const hot = div('sh-hot'); root.append(hot)

  apply2 = () => {
    body.size(Math.max(NOTCH.w, W.v), Math.max(NOTCH.h, H.v))
    body.el.style.visibility = H.v <= NOTCH.h + 0.6 && W.v <= NOTCH.w + 0.6 ? 'hidden' : ''
    pillHost.style.transform = `translate(${px(P.x.v)},${px(P.y.v)}) rotate(${+P.r.v.toFixed(2)}deg) scale(${Math.max(0.01, P.s.v)})`
    pillHost.style.opacity = String(clamp(P.o.v, 0, 1))
    avatar.style.transform = `translate(${px(A.x.v)},${px(A.y.v)})`
    avatar.style.opacity = String(clamp(A.o.v, 0, 1))
    rs.style.transform = `translate(${px(RX.v)},${px(NOTCH.h / 2)})`
    rs.style.opacity = String(clamp(RO.v, 0, 1))
  }

  const levelOf = (st) => {
    if (st === 'quiet' && !hovered) return 'asleep'
    if (st === 'rest' || st === 'hover' || st === 'open' || st === 'quiet') return 'rest'
    if (!settled) {
      if (st === 'finished' || st === 'two' || st === 'good' || st === 'first' || st === 'other') return 'note'
      if (st === 'needs' || st === 'wait' || st === 'ask' || st === 'fail') return 'approval'
      if (st === 'review') return 'review'
    }
    if (st === 'good' || st === 'first' || st === 'other') return 'rest' // nothing waits: back to the notch
    return 'compact'
  }
  function plan(st) {
    const c = CTX[st]
    const lv = levelOf(st)
    const hov = hovered || st === 'hover'
    const [bw, bh] = lv === 'asleep' ? SIZES.rest : SIZES[lv]
    const big = lv === 'approval' || lv === 'review'
    const p = { lv, W: bw + (hov && (lv === 'compact') ? 12 : 0), H: bh, pill: { x: -66, y: NOTCH.h / 2, s: 0.8, r: 0, o: 1 }, eyes: {}, avatar: { x: -160, y: 78, o: 0 }, rs: null, rsX: HW + 34, contents: [], hot: null, look: null, joined: big, panel: st === 'open' }
    if (lv === 'asleep') { p.pill = { x: -66, y: NOTCH.h / 2, s: 0.8, r: 0, o: 1 } }
    else if (lv === 'rest') { p.pill = { x: hov ? -108 : -100, y: NOTCH.h / 2, s: 0.8, r: hov ? -12 : -8, o: 1 } }
    else if (big) {
      const top = 34
      const ay = top + (bh - top) / 2 - (lv === 'review' ? 14 : 0)
      p.avatar = { x: -bw / 2 + 46, y: ay, o: 1 }
      p.pill = { x: p.avatar.x, y: ay, s: 1.15, r: 0, o: 0 }
      p.eyes.main = { x: p.avatar.x, y: ay, s: 1.45, o: 1 }
    } else p.pill = { x: -(HW + 34), y: NOTCH.h / 2, s: 0.8, r: 0, o: 1 }
    // the right side: beside the notch while compact or a note, at the island's top right when big
    if (lv !== 'asleep' && lv !== 'rest') { p.rs = rightSide(c, rightMode); p.rsX = big ? bw / 2 - 30 : HW + 34 + (hov && lv === 'compact' ? 6 : 0) }
    // the words under the notch
    if (lv === 'note') {
      const line = { two: '<b>api</b> <span class="mut">started · Running tests</span>', good: '<b>haven</b> <span class="mut">deployed · haven.vercel.app</span>', first: '<b>Rest the cursor on the notch</b> <span class="mut">or press ⌥Space</span>', other: '<b>haven</b> <span class="mut">Something happened · click to open</span>' }[st] ?? '<b>haven</b> <span class="mut">Claude finished · 3 files changed</span>'
      const html = `<div class="ic-row" style="justify-content:center">${line}</div>`
      p.contents.push({ id: 'note', html, x: -bw / 2, y: 33, w: bw, h: 27, eyes: false })
    } else if (lv === 'approval') {
      const T = { wait: ['haven is waiting on you', 'Claude wants to run <code>npm install</code>', 'Open haven', 'Later'], ask: ['haven needs your input', 'Which database should the new table use?', 'Open haven', 'Later'], fail: ['haven deploy failed', 'Missing environment variable DATABASE_URL', 'Want me to look?', 'Later'] }[st]
      const html = T
        ? abs(96, 6, bw - 96 - 46, 48, '', `<div class="pk2-t"><b>${T[0]}</b><div>${T[1]}</div></div>`) + abs(96, 58, bw - 130, 28, 'pk2-acts', pill(T[2], 1) + pill(T[3]))
        : abs(96, 14, 210, 70, '', '<div class="pk2-t"><b>Steward needs your OK</b><div>Run <code>npm install</code> in haven?</div></div>') +
          abs(bw - 118, 24, 44, 44, 'pk2-btn deny', '<svg viewBox="0 0 14 14"><path d="M3.5 3.5l7 7M10.5 3.5l-7 7"/></svg>') + abs(bw - 62, 24, 44, 44, 'pk2-btn allow', '<svg viewBox="0 0 14 14"><path d="M3 7.5l2.8 2.8L11 4.5"/></svg>')
      p.contents.push({ id: 'approval', html, x: -bw / 2, y: 34, w: bw, h: bh - 34, eyes: false })
    } else if (lv === 'review') {
      const html = abs(96, 6, 206, 70, '', '<div class="pk2-t"><b>haven changed</b><div><b>Claude says:</b> I made the Start button blue and added a row of logos.</div></div>') +
        abs(bw - 128, 10, 102, 64, 'pk2-th', THUMBS) + abs(96, 92, 300, 34, 'pk2-acts', pill('Open big', 1) + pill('Looks good'))
      p.contents.push({ id: 'review', html, x: -bw / 2, y: 34, w: bw, h: bh - 34, eyes: false })
    }
    // where the pointer counts as on the island
    p.hot = lv === 'asleep' || lv === 'rest' ? { x: -150, y: 0, w: 252, h: 46 } : { x: -p.W / 2 - 6, y: 0, w: p.W + 12, h: p.H + 8 }
    if (st === 'open') p.look = { x: panelSide === 'left' ? -0.7 : panelSide === 'right' ? 0.7 : 0.4, y: 0.2 }
    else if (!hov && lv !== 'asleep' && lv !== 'rest') p.look = LOOK_RIGHT
    return p
  }
  const sideOf = () => ({ right: { x: 348, y: 70, cls: 'side-r' }, left: { x: -748, y: 70, cls: 'side-l' }, drag: { x: -456, y: 150, cls: 'pop' } })[panelSide]
  function aim(p, st, snap) {
    const set = (s, val) => (snap ? s.snap(val) : s.set(val))
    // the hand-off: Steward joining the island, or stepping back out. The body melts into the black and the lit eyes carry on from the same spot.
    if (p.joined !== joined && !snap) {
      if (p.joined) { eyes.x.snap(P.x.v); eyes.y.snap(P.y.v); eyes.s.snap(P.s.v * 0.9); eyes.o.snap(0.0) }
      else { P.x.snap(eyes.x.v); P.y.snap(eyes.y.v); P.s.snap(eyes.s.v / 1.45 * 1.15); P.o.snap(0) }
    }
    joined = p.joined
    set(W, p.W); set(H, p.H)
    set(P.x, p.pill.x); set(P.y, p.pill.y); set(P.s, p.pill.s); set(P.r, p.pill.r); set(P.o, p.pill.o)
    set(A.x, p.avatar.x); set(A.y, p.avatar.y); set(A.o, p.avatar.o)
    ey.aim(p.eyes, snap)
    const html = p.rs ? p.rs.h : ''
    if (html !== rsHtml) {
      rsHtml = html
      rsIn.classList.add('out')
      clearTimeout(aim.t)
      aim.t = setTimeout(() => { rsIn.innerHTML = html; rsIn.classList.remove('out') }, snap || rm() ? 0 : 110)
    }
    if (p.rs && RO.t < 0.5) RX.snap(p.rsX)
    set(RX, p.rsX); set(RO, p.rs ? 1 : 0)
    ct.set(p.contents)
    look = p.look
    if (panelBits) {
      const sd = sideOf()
      Object.assign(panelBits.panel.style, { left: px(sd.x), top: px(sd.y), width: '400px', height: '620px' })
      panelBits.panel.classList.remove('side-r', 'side-l', 'pop'); panelBits.panel.classList.add(sd.cls)
      panelBits.panel.classList.toggle('on', !!p.panel)
    }
    Object.assign(hot.style, { left: px(p.hot.x), top: px(p.hot.y), width: px(p.hot.w), height: px(p.hot.h) })
    root.dataset.st = st; root.dataset.lv = p.lv
    loop.kick()
  }
  function show(st, first) {
    const p = plan(st)
    const hov = hovered || st === 'hover'
    const [mood, glint] = hov ? ['idle'] : (MOOD[st] ?? MOOD.rest)
    setMood(g.st, mood, glint)
    if (rm() && !first) {
      root.classList.add('rm-out')
      clearTimeout(show.t)
      show.t = setTimeout(() => { aim(plan(state), state, true); apply2(); ey.apply(); void root.offsetWidth; root.classList.remove('rm-out') }, 130)
      return
    }
    aim(p, st, first)
    if (first) { apply2(); ey.apply() }
  }
  let tSettle = 0
  const peak = (st) => ['finished', 'two', 'needs', 'wait', 'ask', 'fail', 'good', 'first', 'other', 'review'].includes(st)
  function armSettle(ms) {
    clearTimeout(tSettle)
    if (!o.autoSettle || !peak(state) || settled) return
    tSettle = setTimeout(() => { if (hovered) return armSettle(1500); settled = true; show(state, false) }, ms ?? (['needs', 'wait', 'ask', 'fail', 'review'].includes(state) ? 9000 : state === 'first' ? 10000 : 4500))
  }
  function go(st, { first = false } = {}) {
    state = st
    settled = false
    show(st, first)
    if (!first && !rm() && st === 'finished') { P.y.x = -110; eyes.y.x = -110 }
    armSettle()
  }
  function setHover(val) { if (hovered === val) return; hovered = val; show(state, false); if (!val) armSettle(1500) }
  let tIn = 0, tOut = 0
  hot.addEventListener('pointerenter', () => { clearTimeout(tOut); clearTimeout(tIn); tIn = setTimeout(() => setHover(true), 120) })
  hot.addEventListener('pointerleave', () => { clearTimeout(tIn); clearTimeout(tOut); tOut = setTimeout(() => setHover(false), 350) })
  hot.addEventListener('click', () => {
    root.classList.add('squash'); setTimeout(() => root.classList.remove('squash'), 320)
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
    setSpeed(x) { loop.scale = x },
    remove() { clearTimeout(show.t); clearTimeout(tSettle); clearTimeout(tIn); clearTimeout(tOut); clearTimeout(aim.t); ct.clear(); loop.stop(); root.remove() },
  }
}

/* ---------------- the section ---------------- */
const STORY = [['rest', 1800], ['hover', 1700], ['working', 2400], ['two', 3200], ['working', 1400], ['finished', 4800], ['needs', 5200], ['working', 1600], ['review', 5600], ['rest', 2400], ['quiet', 2400]]
const staticRight = (c, mode) => `<span class="mc-demo"><span class="blk">${rightSide(c, mode).h}</span></span>`
const COVER = { compact: 70, note: 97, approval: 118, review: 128 }
/** Every alert and the island size it opens as. peek: which choices of "Alerts that peek out" let it come out (needs = Needs me). */
const ALERTS = [
  { st: 'finished', name: 'A session finished', key: 'finished:', size: 'Note', steward: 'Happy, a nod or proud (by the turn)', after: 'Compact with a check, until opened', stays: '4.5 s, kept while the cursor is on it, 1.5 s after it leaves', click: 'Opens the panel', peek: 'status', sw: 'Session finished', built: 'Phase 2' },
  { st: 'two', name: 'A second project starts', key: '(first prompt of a second turn)', size: 'Note', steward: 'Focusing, then juggling', after: 'Compact with two spinners and a count', stays: '4.5 s', click: 'Opens the panel', peek: 'status', sw: 'none (it is status)', built: 'Phase 2' },
  { st: 'wait', name: 'A session waits for your OK', key: 'approval:', size: 'Approval, no Allow or Deny', steward: 'Needs you', after: 'Compact with an amber !, until the session moves on', stays: '9 s, kept while the cursor is on it', click: 'Opens the panel on that session. Open does the same, Later settles now', peek: 'needs', sw: 'Session needs me', built: 'Phase 3' },
  { st: 'ask', name: 'A session needs input', key: 'input:', size: 'Approval, no Allow or Deny', steward: 'Confused', after: 'Compact with an amber ?, until the session resumes', stays: '9 s, kept while the cursor is on it', click: 'Opens the panel on that session. Open does the same, Later settles now', peek: 'needs', sw: 'Session needs me', built: 'Phase 3' },
  { st: 'needs', name: 'Steward needs your OK', key: 'agent-approval:', size: 'Approval, with Allow and Deny', steward: 'Needs you', after: 'Compact with an amber !, until you answer', stays: '9 s, kept while the cursor is on it', click: 'Allow and Deny work on the island. A click elsewhere opens the panel', peek: 'needs', sw: 'none (always)', built: 'Phase 3' },
  { st: 'review', name: 'A review is ready (Visual Review Phase 2)', key: 'review:', size: 'Review', steward: 'Idle, looking at the picture', after: 'Compact with a thumbnail, until decided', stays: '9 s, kept while the cursor is on it', click: 'Open big opens the viewer; a click elsewhere opens the panel on the card', peek: 'needs', sw: 'none (always)', built: 'Phase 3' },
  { st: 'fail', name: 'A build failed', key: 'deploy-failed:', size: 'Approval-size card, with "Want me to look?"', steward: 'Mad, then worried', after: 'Compact with a red !, until a deploy for that project works (or 30 minutes)', stays: '9 s, kept while the cursor is on it', click: 'Opens the panel. "Want me to look?" also opens it and asks Steward\'s agent to read the build log, as the old card did. Later settles now', peek: 'fail', sw: 'Build failed', built: 'Phase 3' },
  { st: 'good', name: 'Deployed, or a PR merged', key: 'deploy-ready: and pr-merged:', size: 'Note', steward: 'Celebrating', after: 'Nothing waits: back to the notch', stays: '4.5 s. Several within a moment join into one note with "and 2 more"', click: 'Opens the panel (the page\'s screenshot is in the tray)', peek: 'all', sw: 'Celebrations', built: 'Phase 3' },
  { st: 'first', name: 'First launch', key: '(not an alert)', size: 'Note', steward: 'Looking at where to rest the cursor', after: 'Back to the notch', stays: 'At least 10 s; longer while the cursor is on it; ends once it has left after touching it', click: 'Opens the panel and counts as learned', peek: 'always', sw: 'none (shows once ever)', built: 'Phase 3' },
  { st: 'other', name: 'Anything else', key: 'any key with no size of its own', size: 'Note: its title and one line', steward: 'Idle', after: 'Back to the notch', stays: '4.5 s', click: 'Opens the panel', peek: 'all', sw: 'its own switch, if it has one', built: 'Phase 3' },
]
const popsOut = (a, choice, failNeeds) => {
  if (a.peek === 'always') return 'Yes, once ever'
  if (choice === 'none') return a.peek === 'status' ? 'No (status only)' : 'No'
  if (choice === 'all') return 'Yes'
  return a.peek === 'needs' || a.peek === 'status' || (a.peek === 'fail' && failNeeds) ? 'Yes' : 'No: waits in the menu bar'
}

export function render(host) {
  const ladder = `<div class="pk2-ladder">${STEPS.map(([id, l, d]) => { const [w, h] = SIZES[id]; return `<figure><div class="shp" style="width:${Math.round(w * 0.78)}px;height:${Math.round(h * 0.78)}px"></div><figcaption><b>${l}</b> ${w} by ${h} pt · covers about ${COVER[id]} pt of menu bar each side of the notch<br><span>${esc(d)}</span></figcaption></figure>` }).join('')}</div>`
  host.insertAdjacentHTML('beforeend', `<div class="grid">
    ${card({ id: 'p-main', section: 7, title: 'Peeking, as one joined island', status: 'planned', from: ['notch.html', 'notch-styles.html'], cls: 'wide',
      desc: 'Every size is one continuous black shape, flush with the top of the screen and joined to the notch with no gap, growing out of it with springs. The size follows the message. At rest Steward peeks from behind the notch\'s left edge. When the island grows big, Steward slides into it and becomes part of it: its body melts into the black and the lit eyes carry on in an avatar spot, like the caller\'s photo. When it shrinks, Steward steps back out. Pick a state, play the story, or watch the hand-off in slow motion. The menu bar here is a busy one so you can see what each size covers.',
      tools: '<button class="btn" id="p-play">▶ Play the story</button> <button class="btn" id="p-hero">Steward joins the island</button>',
      body: `${ladder}
        <div class="istates" id="p-states">${PSTATES.map(([id, l]) => `<button data-st="${id}" aria-pressed="false">${l}</button>`).join('')}</div>
        <p class="istate" id="p-state"></p>
        <div class="ibar"><span class="lbl">Right side shows</span><span class="iseg" id="p-right">${RIGHT_MODES.map(([id, l], i) => `<button data-v="${id}" aria-pressed="${i === 0}">${l}</button>`).join('')}</span>
          <span class="lbl">Speed</span><span class="iseg" id="p-speed"><button data-v="1" aria-pressed="true">Normal</button><button data-v="0.3" aria-pressed="false">Slow motion</button></span></div>
        <div class="icrop pk2-fig" id="p-fig"></div>` })}
    ${card({ id: 'p-alerts', section: 7, title: 'Every alert opens as the island', status: 'planned', from: null, cls: 'wide',
      desc: 'Decided: in Island mode nothing ever uses the old pill that hangs under the notch (black starting under the menu bar, rounded top corners, concave ears beside the notch). Every message opens as the island: flush with the top, full width from the top edge, bottom corners only, sized by the message, Steward joining for the big ones. Click a row to see it above. Change Alerts that peek out to see which come out.',
      tools: '<span class="lbl">Alerts that peek out</span> <span class="iseg" id="p-peek"><button data-v="needs-me" aria-pressed="true">Needs me</button><button data-v="all" aria-pressed="false">Everything</button><button data-v="none" aria-pressed="false">Nothing</button></span> <label class="pk-pick"><input type="checkbox" id="p-failneeds" checked> Count a failed build as Needs me</label>',
      body: `<div class="pk-tw"><table class="itable pk-alerts"><thead><tr><th>Alert</th><th>Island size</th><th>Steward</th><th>When it settles</th><th>Stays</th><th>A click</th><th>Pops out?</th><th>Switch</th><th>Built in</th></tr></thead><tbody>${ALERTS.map((a) => `<tr data-st="${a.st}" tabindex="0"><td><b>${esc(a.name)}</b><br><span class="pk-key">${esc(a.key)}</span></td><td>${esc(a.size)}</td><td>${esc(a.steward)}</td><td>${esc(a.after)}</td><td>${esc(a.stays)}</td><td>${esc(a.click)}</td><td class="pk-pop"></td><td>${esc(a.sw)}</td><td>${a.built}</td></tr>`).join('')}</tbody></table></div>
        <p class="inote"><b>The rule.</b> In Island mode no alert uses the old under-notch pill, from Phase 3 on. An alert with no size of its own opens as a note with its title and one line, so a new kind of alert can never bring the old pill back. A Mac without a notch keeps the edge tab and its cards; this is only the island.</p>
        <p class="inote"><b>How "Alerts that peek out" works with it.</b> The Notifications switches come first: a switched-off kind never reaches the island and only lands in the history. Then the choice. <b>Needs me:</b> sessions that wait or ask, Steward's own requests and reviews come out big; the finished and started notes still show (they are the island's status); good news and failed builds wait in the menu bar dot, unless the failed-build pick above is on. <b>Everything:</b> all of it. <b>Nothing:</b> no notes and no big sizes; only the compact island's own status stays (spinner, check, amber or red mark), so you can still see at a glance, and the menu bar shows a number and a dot. Hidden by hand or stepped aside: nothing comes out, as today.</p>
        <p class="inote"><b>What the island cannot do.</b> Steward cannot answer a Claude Code session (its hooks reply before it looks), so a session's approval has no Allow or Deny here, only Open and Later. Allow and Deny are only for Steward's own requests, which it can answer.</p>` })}
    ${card({ id: 'p-right', section: 7, title: 'The right side: something else', status: 'planned', from: null, cls: 'wide',
      desc: 'Decided: the Smart choice. The tile at rest, a spinner with the time while Claude works, a check when done, an amber mark for an approval, a thumbnail for a review, a spinner with a count for two projects. It stays in the right of the island at every size, at the top right once the island is big, like the Dynamic Island\'s trailing view.',
      body: `<table class="itable"><thead><tr><th>Choice</th><th>Idle</th><th>Working</th><th>Finished</th><th>Needs you</th><th>Review</th><th>Two projects</th></tr></thead><tbody>${[['smart', 'Smart (decided)'], ['status', 'Status'], ['timer', 'Timer'], ['count', 'Count'], ['thumb', 'Thumbnail']].map(([m, l]) => `<tr><td>${l}</td>${['idle', 'working', 'finished', 'needs', 'review', 'two'].map((c) => `<td>${staticRight(c, m)}</td>`).join('')}</tr>`).join('')}</tbody></table>` })}
    ${card({ id: 'p-hand', section: 7, title: 'Hand-off: the island to the side panel and back', status: 'planned', from: 'notch.html', cls: 'wide',
      desc: 'Decided: the chat stays in the side panel. A click on the island opens today\'s side panel on its edge, left or right, or where you dragged it, with its usual entrance, never centered under the notch. The island goes back to Steward peeking, looking toward the panel. The small and big islands only deliver a message; they never replace the panel.',
      tools: '<button class="btn" id="p-openbtn">Click the island</button> <button class="btn" id="p-closebtn">Close the panel</button>',
      body: `<div class="ibar"><span class="lbl">Panel</span><span class="iseg" id="p-oside"><button data-v="right" aria-pressed="true">Right edge</button><button data-v="left" aria-pressed="false">Left edge</button><button data-v="drag" aria-pressed="false">Dragged</button></span></div>
        <div class="icrop" id="p-ocrop"></div>` })}
    ${card({ id: 'p-choose', section: 7, title: 'What is decided, what it covers, how hard it is to build', status: 'planned', from: null, cls: 'wide',
      desc: 'The decisions so far and the cost of making this real in the notch window.',
      body: `<table class="itable"><thead><tr><th>Decided</th><th>What</th></tr></thead><tbody>
        <tr><td>Mascot</td><td>Peeking: half of Steward peeks out from behind the notch's left edge</td></tr>
        <tr><td>Island</td><td>One continuous black shape joined to the notch at every size, sized by the message</td></tr>
        <tr><td>Steward and the island</td><td>Steward steps into the island's left side for compact and a note, and becomes part of the island (an avatar spot with its eyes) for approvals and reviews</td></tr>
        <tr><td>Right side</td><td>Smart</td></tr>
        <tr><td>Main chat</td><td>The side panel, left or right or dragged; never centered</td></tr></tbody></table>
        <p class="inote"><b>What it covers.</b> The price of "one shape joined to the notch" is that every size wider than the notch sits over the menu bar, because the join is flush with the top of the screen: compact covers about 70 pt each side of the notch, a note about 97, an approval about 118, a review about 128. The earlier version hung the message under the menu bar line and covered nothing, but it read as a separate pill, which is what was rejected. The mitigations: compact is slim; the big sizes only come for a message and settle after a few seconds; hovering the menu bar items is not blocked (the island is click-through except over its shape), and the bigger sizes are rare.</p>
        <p class="inote"><b>How hard in the real notch window.</b> <b>The joined shape: moderate.</b> It is one black rounded shape that grows from the notch (the same black pieces the Wings and the alert under the notch use), so the join is straightforward; the careful part is matching the real notch's bottom corners (10 pt, not reported by macOS) where the island's first pixels start, and keeping the corners continuous while it springs. The notch window must grow from 360 by 96 to about 460 by 190 and stay click-through everywhere but the shape. <b>Steward's hand-off: moderate to hard.</b> It is two views of the same character (the Pill's body and its lit eyes) crossfading while one slides, which the Showcase does on one frame loop. In the app both live in one window, so it is the same trick; the risk is the body view (glass) over a light wallpaper, so Peeking uses the solid flat body. Hiding the body behind the notch edge needs the real notch's edge (measured 185 by 32). It is a few days of careful work, not a rewrite: most of the pieces exist (the black shapes, the Pill views, the eyes, the alert cards from 3b and Visual Review).</p>
        <p class="inote"><b>Replaces:</b> the Chin and Wings looks; the alert under the notch (3b) becomes the approval and review sizes. The panel never opens centered under the notch. Notch 3e is not needed and stays on hold.</p>` })}
  </div>`)
  const INFO = Object.fromEntries(PSTATES.map(([id, l, d]) => [id, [l, d]]))
  let cur = 'rest', rightMode = 'smart', speed = 1
  let main = null, hand = null, panelOpen = false, hside = 'right'
  const label = (st) => { host.querySelector('#p-state').innerHTML = `<b>${INFO[st][0]}.</b> ${esc(INFO[st][1])}`; host.querySelectorAll('#p-states button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.st === st))) }
  const setMain = (st) => { cur = st; label(st); main?.go(st) }
  function build() {
    stage.clear('p'); main?.remove()
    const c = host.querySelector('#p-fig'); c.replaceChildren()
    const zoom = clamp((c.clientWidth || 640) / 520, 0.8, 1.35)
    const { screen } = crop(c, { cw: 520, ch: 214, zoom, wall: S.dark ? 'dark' : 'light', busy: true })
    main = createPeeking(screen, { kind: S.version, color: S.color, owner: 'p', seed: 201, anchor: c, mouth: S.mouth, think: S.think, rm: () => S.rm, dark: S.dark, state: cur, rightMode, autoSettle: true })
    main.setSpeed(speed)
    label(cur)
    buildHand()
  }
  function buildHand() {
    stage.clear('po'); hand?.remove()
    const c = host.querySelector('#p-ocrop'); c.replaceChildren()
    const { screen } = crop(c, { cw: 1512, ch: 800, zoom: 0.5, wall: S.dark ? 'dark' : 'light', busy: true })
    hand = createPeeking(screen, { kind: S.version, color: S.color, owner: 'po', seed: 221, anchor: c, mouth: S.mouth, think: S.think, rm: () => S.rm, dark: S.dark, panel: true, panelSide: hside, state: panelOpen ? 'open' : 'rest', rightMode, onClick: () => toggle() })
  }
  const toggle = () => { handRun.cancel(); panelOpen = !panelOpen; hand.go(panelOpen ? 'open' : 'rest') }
  host.querySelector('#p-openbtn').onclick = () => { handRun.cancel(); panelOpen = true; hand.go('open') }
  host.querySelector('#p-closebtn').onclick = () => { handRun.cancel(); panelOpen = false; hand.go('rest') }
  const seg = (id, fn) => host.querySelector(id).addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]')
    if (!b) return
    host.querySelectorAll(`${id} button`).forEach((x) => x.setAttribute('aria-pressed', String(x === b)))
    fn(b.dataset.v)
  })
  seg('#p-oside', (v) => { handRun.cancel(); hside = v; hand.setSide(v) })
  seg('#p-right', (v) => { rightMode = v; main.setRight(v); hand?.setRight(v) })
  seg('#p-speed', (v) => { speed = Number(v); main.setSpeed(speed) })
  const handRun = demo(host.querySelector('#f-p-hand'), host.querySelector('#f-p-hand'), async (_, tok) => {
    panelOpen = false; hand.go('rest'); await wait(1400, tok)
    hand.go('hover'); await wait(1200, tok)
    panelOpen = true; hand.go('open'); await wait(3400, tok)
    panelOpen = false; hand.go('rest'); await wait(1600, tok)
  }, { clear: false, gap: 600 })
  const cardEl = host.querySelector('#f-p-main')
  const run = demo(cardEl, cardEl, async (_, tok) => { for (const [st, ms] of STORY) { setMain(st); await wait(ms / (speed < 1 ? speed * 1.6 : 1), tok) } }, { clear: false, gap: 700 })
  host.querySelector('#p-play').onclick = () => run.replay()
  host.querySelector('#p-states').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-st]')
    if (!b) return
    run.cancel(); setMain(b.dataset.st)
  })
  // the hero: Steward joins the island and steps back out, in slow motion if chosen
  const hero = demo(cardEl, cardEl, async (_, tok) => {
    setMain('rest'); await wait(1200 / (speed < 1 ? speed : 1), tok)
    setMain('working'); await wait(2200 / (speed < 1 ? speed : 1), tok)
    setMain('needs'); await wait(4200 / (speed < 1 ? speed : 1), tok)
    setMain('working'); await wait(2600 / (speed < 1 ? speed : 1), tok)
    setMain('rest'); await wait(2000 / (speed < 1 ? speed : 1), tok)
  }, { clear: false, auto: false, once: true })
  host.querySelector('#p-hero').onclick = () => { run.cancel(); hero.replay() }
  host.querySelector('#p-states').addEventListener('click', () => hero.cancel())
  const pop = () => {
    const choice = host.querySelector('#p-peek [aria-pressed=true]').dataset.v, failNeeds = host.querySelector('#p-failneeds').checked
    host.querySelectorAll('.pk-alerts tbody tr').forEach((tr, i) => { const t = popsOut(ALERTS[i], choice, failNeeds); const td = tr.querySelector('.pk-pop'); td.textContent = t; td.className = `pk-pop ${t.startsWith('Yes') ? 'y' : 'n'}` })
  }
  host.querySelector('#p-peek').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]'); if (!b) return
    host.querySelectorAll('#p-peek button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)))
    pop()
  })
  host.querySelector('#p-failneeds').addEventListener('change', pop)
  const pick = (tr) => { run.cancel(); hero.cancel(); setMain(tr.dataset.st); host.querySelector('#p-fig').scrollIntoView({ block: 'center', behavior: S.rm ? 'auto' : 'smooth' }) }
  host.querySelector('.pk-alerts').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-st]'); if (tr) pick(tr) })
  host.querySelector('.pk-alerts').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('tr[data-st]')) pick(e.target) })
  pop()
  build()
  let rt = 0
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(build, 250) })
  onChange(['color', 'version', 'dark', 'mouth', 'think'], build)
}
