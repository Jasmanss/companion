// 7. The Shelf: Steward's own version of the wide shelf that drops from the notch, in four variations. One black shape
// grows from the notch with spring motion into a shelf with tabs, a session card, an ask box and a round spot for the
// eyes. Same eight states in every variation. Hover opens it (the figures really react to the pointer). The notch has no
// pixels, so nothing is drawn inside it. Only transforms, opacity and clip paths move; Reduced Motion fades instead.
import { setMood } from '../pill/eyes.js'
import { palette } from '../pill/render.js'
import { crop, blob, NOTCH, MENU, CX } from '../notch/notch.js'
import { wait, demo, esc } from '../shared/activity.js'
import { S, onChange, stage, card } from './state.js'
import { LIP, BODY_TOP, HW, px, clamp, div, Spring, CT, MOODS, makeLoop, makeEyes, makeContents, makePanel, placePanel } from './island-kit.js'
import { chinBody } from './island2.js'

/* ---------------- what it says ---------------- */
export const SSTATES = [
  ['rest', 'At rest', 'The chin, as built today. Nothing else.'],
  ['hover', 'Hover', 'Cursor on the notch for a quarter of a second: the shelf opens. It closes half a second after the cursor leaves. Try it: hover any figure on any state and it opens on that state.'],
  ['working', 'Working', 'Glanceable: a compact capsule under the menu bar. Hover and the shelf opens on the live session.'],
  ['finished', 'Finished', 'The same capsule: haven is done. Hover for the shelf.'],
  ['needs', 'Needs you', 'The shelf opens by itself with the approval. It closes 6 seconds after the cursor is not on it.'],
  ['review', 'Review ready', 'The shelf opens on the review: before and after, a line from Claude, Looks good.'],
  ['two', 'Two projects', 'Both projects at once.'],
  ['quiet', 'Quiet mode', 'Asleep: just the notch. Resting the cursor wakes it and opens the shelf; only "needs you" comes out on its own.'],
]
const CTX = { rest: 'idle', hover: 'idle', working: 'working', finished: 'finished', needs: 'needs', review: 'review', two: 'two', quiet: 'idle', open: 'idle' }
const MOOD_OF = { idle: ['idle'], working: ['thinking', 'sweep'], finished: ['celebrating'], needs: ['needs-you'], review: ['idle'], two: ['thinking', 'sweep'] }

const IC = {
  steward: '<svg viewBox="0 0 14 14"><rect x="1.5" y="4" width="11" height="6" rx="3"/><path d="M5 7h.01M9 7h.01"/></svg>',
  chat: '<svg viewBox="0 0 14 14"><path d="M2 3.5h10v6H7.5L5 12V9.5H2z"/></svg>',
  tray: '<svg viewBox="0 0 14 14"><path d="M1.5 8.5l2-5h7l2 5v3h-11zM1.5 8.5h3.5l1 1.5h2l1-1.5h3.5"/></svg>',
  rev: '<svg viewBox="0 0 14 14"><rect x="1.5" y="2.5" width="11" height="8" rx="1.5"/><path d="M1.5 11.5h11M5 6.5l1.5 1.5L9 5.5"/></svg>',
  proj: '<svg viewBox="0 0 14 14"><rect x="1.5" y="1.5" width="4.5" height="4.5" rx="1"/><rect x="8" y="1.5" width="4.5" height="4.5" rx="1"/><rect x="1.5" y="8" width="4.5" height="4.5" rx="1"/><rect x="8" y="8" width="4.5" height="4.5" rx="1"/></svg>',
  gear: '<svg viewBox="0 0 14 14"><circle cx="7" cy="7" r="2.1"/><path d="M7 1.2v1.6M7 11.2v1.6M1.2 7h1.6M11.2 7h1.6M2.9 2.9l1.1 1.1M10 10l1.1 1.1M11.1 2.9L10 4M4 10l-1.1 1.1"/></svg>',
}
const abs = (x, y, w, h, cls, inner = '') => `<div class="a ${cls}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px">${inner}</div>`
const tabs = (names, active, n = 0) => `<div class="sh-tabs">${names.map(([name, ic]) => `<span class="sh-tab${name === active ? ' on' : ''}">${IC[ic]}${name}${name === 'Reviews' && n ? `<i>${n}</i>` : ''}</span>`).join('')}</div>`
const TABS = [['Steward', 'steward'], ['Tray', 'tray'], ['Reviews', 'rev']]
const pill = (t, pri) => `<span class="pillbtn${pri ? ' pri' : ''}">${t}</span>`
const THUMBS = '<span class="thumbs"><i class="tb"></i><i class="ta"></i></span>'

/** The session card: the current Claude session, in the spot of a now-playing card. */
function session(ctx, w = 250) {
  const time = { idle: '12 min ago', working: '2:41', finished: 'just now', needs: '0:58', review: 'just now' }[ctx]
  const l2 = { idle: 'Idle · 3 files last turn', working: 'Editing page.tsx', finished: 'Finished · 3 files changed', needs: 'Run <code>npm install</code>?', review: 'The page changed' }[ctx]
  const acts = { idle: pill('Open'), working: pill('Open'), finished: pill('Open', 1) + pill('Review'), needs: pill('Allow', 1) + pill('Deny'), review: pill('Open big', 1) + pill('Looks good') }[ctx]
  const ring = { idle: '', working: 'live', finished: 'done', needs: 'ask', review: 'rev' }[ctx]
  return `<div class="sh-tile ${ring}">ha</div><div class="sh-txt" style="left:76px;width:${w - 76}px"><div class="l1"><b>haven</b><span class="mut">${time}</span></div><div class="l2">${l2}</div><div class="sh-acts">${acts}</div></div>`
}
const two = () => `<div class="sh-two"><div class="r"><span class="ic-dot"></span><b>haven</b><span class="mut">Editing page.tsx</span></div><div class="r"><span class="ic-dot"></span><b>api</b><span class="mut">Running tests</span></div></div>`
const ask = () => `<div class="sh-ask"><div class="in">Ask Steward…</div><div class="chips"><span>Why did the deploy fail?</span><span>What changed in haven?</span></div></div>`
const REVIEW = `<div class="sh-rev">${THUMBS}<span class="say"><b>haven changed.</b> <b>Claude says:</b> I made the Start button blue and added a row of logos.<span class="sh-acts">${pill('Open big', 1)}${pill('Looks good')}</span></span></div>`

/* ---------------- the four variations ---------------- */
// Each returns { kind: 'flush' | 'below', w, h, html, eye: { x, y, s } } for a context, with x and y in the island's own
// coordinates (x from the notch's center line, y from the top of the screen). 'flush' shelves start at the top of the
// screen and cover the menu bar either side of the notch; 'below' shelves hang under the menu bar line.
const V = {
  1: {
    id: '1', name: 'Dashboard', covers: 'The menu bar between the shelf\'s edges (about 255 pt each side of the notch) while it is open',
    short: 'Closest to the photo: a wide shelf flush with the top of the screen. Tabs at the top left, a gear at the top right, and a row of three widgets: the session card, the ask box with Try prompts, and a round spot with Steward\'s eyes.',
    open(ctx) {
      const W = 700, H = 168
      const main = ctx === 'review' ? abs(18, 44, 476, 112, 'sh-card wide', REVIEW) : abs(18, 44, 250, 112, 'sh-card', ctx === 'two' ? two() : session(ctx)) + abs(284, 44, 210, 112, 'sh-ask-w', ask())
      const html = abs(12, 5, 244, 26, '', tabs(TABS, ctx === 'review' ? 'Reviews' : 'Steward', ctx === 'review' ? 1 : 0)) + abs(658, 6, 24, 24, 'sh-gear', IC.gear) + main + abs(536, 40, 96, 96, 'sh-spot')
      return { kind: 'flush', w: W, h: H, html, eye: { x: -350 + 584, y: 88, s: 1.15 } }
    },
  },
  2: {
    id: '2', name: 'Chat-first', covers: 'The menu bar between the shelf\'s edges (about 255 pt each side) while it is open',
    short: 'The shelf is the panel. Steward\'s face on the left, the last reply and the ask box in the middle, the session on the right. In notch mode it replaces the side panel and grows down into the full chat.',
    open(ctx) {
      const W = 700, H = 188
      const reply = { idle: 'haven finished 12 minutes ago. Want a summary of what changed?', working: 'Working on haven: editing <code>page.tsx</code>. I will tell you when it is done.', finished: 'Done. Three files changed in haven. Want to look at the page?', needs: '', review: 'The pricing page changed. <b>Claude says:</b> blue Start button, a new row of logos.', two: 'Two projects are running: haven (editing) and api (running tests).' }[ctx]
      const mid = ctx === 'needs'
        ? abs(140, 42, 340, 66, 'sh-banner', `<b>haven needs you</b><span>Run <code>npm install</code> in haven?</span><span class="sh-acts">${pill('Allow', 1)}${pill('Deny')}</span>`)
        : abs(140, 42, 340, 66, 'sh-reply', reply)
      const right = ctx === 'review' ? abs(500, 44, 182, 112, 'sh-mini', THUMBS.replace('thumbs', 'thumbs big') + `<div class="sh-acts" style="margin-top:8px">${pill('Open big', 1)}${pill('Looks good')}</div>`) : abs(500, 44, 182, 112, 'sh-mini', ctx === 'two' ? two() : `<div class="l1"><b>haven</b><span class="mut">${{ idle: '12 min ago', working: '2:41', finished: 'just now', needs: '0:58' }[ctx]}</span></div><div class="l2">${{ idle: 'Idle', working: 'Editing page.tsx', finished: 'Finished · 3 files', needs: 'Waiting for you' }[ctx]}</div><div class="sh-acts">${pill('Open')}</div>`)
      const html = abs(12, 5, 244, 26, '', tabs([['Chat', 'chat'], ['Tray', 'tray'], ['Reviews', 'rev']], 'Chat')) + abs(658, 6, 24, 24, 'sh-gear', IC.gear) + abs(18, 50, 104, 104, 'sh-spot') + mid + abs(140, 118, 340, 38, 'sh-askbar', '<span>Ask Steward…</span><b>↑</b>') + right
      return { kind: 'flush', w: W, h: H, html, eye: { x: -350 + 70, y: 102, s: 1.5 } }
    },
    big() {
      const W = 700, H = 470
      const html = abs(12, 5, 244, 26, '', tabs([['Chat', 'chat'], ['Tray', 'tray'], ['Reviews', 'rev']], 'Chat')) + abs(658, 6, 24, 24, 'sh-gear', IC.gear) + abs(18, 50, 104, 104, 'sh-spot') +
        abs(140, 42, 540, 330, 'sh-msgs', '<div class="m me">Why did the deploy fail?</div><div class="m">A missing environment variable: <code>DATABASE_URL</code>. Want me to add it?</div><div class="m me">Yes, add it.</div><div class="m">Added to <code>.env.local</code>. Redeploy when you are ready.</div>') +
        abs(140, 392, 540, 40, 'sh-askbar', '<span>Ask Steward…</span><b>↑</b>') + abs(18, 170, 104, 120, 'sh-mini', `<div class="l1"><b>haven</b></div><div class="l2">Idle</div>`)
      return { kind: 'flush', w: W, h: H, html, eye: { x: -350 + 70, y: 102, s: 1.5 } }
    },
  },
  3: {
    id: '3', name: 'Projects board', covers: 'Nothing: it hangs under the menu bar line',
    short: 'One tile per project, each with its Claude status, like several now-playing cards. Tabs for Projects, Tray and Reviews. It hangs under the menu bar line, joined to the notch with curved fillets, so it covers nothing.',
    open(ctx) {
      const W = 440
      const tile = (name, st) => {
        const body = {
          idle: `<div class="l2">Idle</div><div class="sh-acts">${pill('Open')}</div>`,
          working: `<div class="l2">Editing page.tsx · 2:41</div><div class="sh-acts">${pill('Open')}</div>`,
          finished: `<div class="l2">Finished · 3 files</div><div class="sh-acts">${pill('Open', 1)}</div>`,
          needs: `<div class="l2">Run <code>npm install</code>?</div><div class="sh-acts">${pill('Allow', 1)}${pill('Deny')}</div>`,
          review: `<div class="l2">Page changed</div><div class="sh-acts">${pill('Looks good', 1)}</div>`,
        }[st]
        return `<div class="l1"><span class="sh-dot ${st}"></span><b>${name}</b></div>${body}`
      }
      const first = ctx === 'two' ? 'working' : ctx === 'idle' ? 'idle' : ctx
      const second = ctx === 'two' ? 'working' : 'idle'
      const H = 140
      const html = abs(40, 5, 300, 26, '', tabs([['Projects', 'proj'], ['Tray', 'tray'], ['Reviews', 'rev']], 'Projects', ctx === 'review' ? 1 : 0)) + abs(404, 6, 24, 24, 'sh-gear', IC.gear) +
        abs(14, 38, 204, H - 52, `sh-ptile ${first}`, tile('haven', first)) + abs(226, 38, 200, H - 52, `sh-ptile ${second}`, tile('api', second === 'working' ? 'working' : 'idle'))
      return { kind: 'below', w: W, h: H, html, eye: { x: -220 + 22, y: BODY_TOP + 17, s: 0.8 } }
    },
  },
  4: {
    id: '4', name: 'Small and big', covers: 'Nothing: the small shelf hangs under the menu bar line, and so does the panel',
    short: 'A small shelf on hover: one row with the session and its action, and an ask line. A click grows it into the full panel under the notch. The shelf is the glance, today\'s panel is the chat. It hangs under the menu bar line.',
    open(ctx) {
      const W = 400
      const row = (icon, a, b, acts) => `<div class="sh-row">${icon}<span><b>${a}</b> <span class="mut">${b}</span></span><span class="sh-acts">${acts}</span></div>`
      let body, H
      const tail = '<span class="say"><b>Claude says:</b> I made the Start button blue and added a row of logos.</span>'
      if (ctx === 'needs') { H = 116; body = abs(52, 10, 330, 22, 'sh-line', '<b>haven needs you</b>') + abs(52, 36, 330, 22, 'sh-line', '<span class="mut">Run</span> <code>npm install</code> <span class="mut">in haven?</span>') + abs(52, 70, 330, 32, 'sh-acts', pill('Allow', 1) + pill('Deny')) }
      else if (ctx === 'review') { H = 158; body = abs(52, 8, 330, 22, 'sh-line', '<b>haven changed</b> <span class="mut">pricing page</span>') + abs(14, 38, 372, 64, 'sh-rev', THUMBS + tail) + abs(14, 116, 372, 32, 'sh-acts', pill('Open big', 1) + pill('Looks good')) }
      else if (ctx === 'two') { H = 108; body = abs(52, 10, 330, 90, 'sh-two s', two().replace('<div class="sh-two">', '').replace(/<\/div>$/, '')) }
      else {
        H = 100
        const t = { idle: ['haven', 'Idle · last turn 12 min ago', pill('Open')], working: ['haven', 'Editing page.tsx · 2:41', pill('Open')], finished: ['haven', 'Finished · 3 files changed', pill('Open', 1)] }[ctx]
        body = abs(52, 8, 304, 34, 'sh-r', row('', t[0], t[1], t[2])) + abs(14, 52, 372, 34, 'sh-askbar', '<span>Ask Steward…</span><b>↑</b>')
      }
      return { kind: 'below', w: W, h: H, html: body + abs(362, 8, 24, 20, 'sh-expand', '<svg viewBox="0 0 14 14"><path d="M4 5l3 3 3-3"/></svg>'), eye: { x: -200 + 28, y: BODY_TOP + (ctx === 'needs' ? 21 : ctx === 'review' ? 19 : ctx === 'two' ? 28 : 25), s: 1 } }
    },
  },
}
export const VARIANTS = Object.values(V)

/* ---------------- one shelf ---------------- */
export function createShelf(screen, o) {
  const { variant, kind, color, rm = () => false } = o
  const lit = palette(kind, { color, lit: true }).lit
  const root = div('isl', `left:${px(CX)};--lit:${[1, 3, 5].map((i) => parseInt(lit.slice(i, i + 2), 16)).join(',')}`)
  const shape = div('isl-shape')
  root.append(shape)
  const g = stage.group({ seed: o.seed ?? 1, anchor: o.anchor ?? screen, mood: 'resting', think: o.think ?? 'dots', mouth: o.mouth ?? true, owner: o.owner })
  let state = 'rest', hovered = false, moved = !!o.moved
  let apply2 = () => {}
  const loop = makeLoop(root, () => { ey.apply(); cb.apply(); apply2() })
  const ey = makeEyes({ root, kind, color, mouth: o.mouth ?? true }, loop.add)
  const ct = makeContents(root, rm, () => state)
  const ctx = { shape, loop }
  const cb = chinBody(ctx)
  // the flush shelf: grows from the notch itself, over the menu bar
  const fb = blob(shape, { w0: 700, h0: 470, rt: 0, rb: 26, top: 0, cls: 'fb' })
  const F = { w: loop.add(new Spring(NOTCH.w)), h: loop.add(new Spring(NOTCH.h)) }
  apply2 = () => {
    fb.size(Math.max(NOTCH.w, F.w.v), Math.max(NOTCH.h, F.h.v))
    fb.el.style.visibility = F.h.v <= NOTCH.h + 0.6 ? 'hidden' : ''
  }
  ey.mk('main', g)
  const panelBits = o.panel ? makePanel({ root, kind, color, mouth: o.mouth ?? true, dark: o.dark }, g) : null
  const hot = div('sh-hot')
  root.append(hot)
  let tIn = 0, tOut = 0, tAlert = 0

  function layoutFor(st) {
    const c = CTX[st]
    const v = V[variant]
    const open = hovered || ['hover', 'needs', 'review', 'two'].includes(st)
    return { c, v, open }
  }
  function plan(st) {
    const { c, v, open } = layoutFor(st)
    const p = { L: NOTCH.h, body: null, fb: null, eyes: {}, contents: [], panel: false, hot: { x: -100, y: 0, w: 200, h: 62 } }
    const chin = () => { p.L = LIP; p.eyes.main = { x: 0, y: NOTCH.h + 11 } }
    if (st === 'open') {
      if (moved) { chin(); p.panel = true; return p }
      if (variant === '2') {
        const b = v.big()
        p.fb = { w: b.w, h: b.h }; p.contents.push({ id: 'big', html: b.html, x: -b.w / 2, y: 0, w: b.w, h: b.h, eyes: false }); p.eyes.main = b.eye
        p.hot = { x: -b.w / 2 - 4, y: 0, w: b.w + 8, h: b.h + 4 }
        return p
      }
      p.L = LIP; p.body = { w: 400, h: 470 }; p.panel = true; p.eyes.main = { x: -146, y: BODY_TOP + 39, o: 0 }
      p.hot = { x: -204, y: 0, w: 408, h: BODY_TOP + 474 }
      return p
    }
    if (!open) {
      if (st === 'rest') chin()
      else if (st === 'working' || st === 'finished') { p.L = LIP; p.body = { w: 270, h: 34 }; p.eyes.main = { x: -110, y: BODY_TOP + 17 }; p.contents.push({ id: 'row', html: st === 'working' ? CT.working : CT.done, x: -135, y: BODY_TOP, w: 270, h: 34, eyes: true }); p.hot = { x: -140, y: 0, w: 280, h: BODY_TOP + 38 } }
      return p
    }
    const sh = v.open(c)
    if (sh.kind === 'flush') {
      p.fb = { w: sh.w, h: sh.h }
      p.contents.push({ id: 'shelf', html: sh.html, x: -sh.w / 2, y: 0, w: sh.w, h: sh.h, eyes: false })
      p.hot = { x: -sh.w / 2 - 4, y: 0, w: sh.w + 8, h: sh.h + 4 }
    } else {
      p.L = LIP; p.body = { w: sh.w, h: sh.h }
      p.contents.push({ id: 'shelf', html: sh.html, x: -sh.w / 2, y: BODY_TOP, w: sh.w, h: sh.h, eyes: false })
      p.hot = { x: -sh.w / 2 - 4, y: 0, w: sh.w + 8, h: BODY_TOP + sh.h + 4 }
    }
    p.eyes.main = sh.eye
    p.ctx = c
    return p
  }
  function aim(p, st, snap) {
    const set = (s, v) => (snap ? s.snap(v) : s.set(v))
    cb.aim(p, snap)
    set(F.w, p.fb ? p.fb.w : NOTCH.w); set(F.h, p.fb ? p.fb.h : NOTCH.h)
    ey.aim(p.eyes, snap)
    ct.set(p.contents)
    if (panelBits) placePanel(panelBits.panel, moved, !!p.panel)
    Object.assign(hot.style, { left: px(p.hot.x), top: px(p.hot.y), width: px(p.hot.w), height: px(p.hot.h) })
    root.dataset.st = st
    loop.kick()
  }
  function show(st, first) {
    const { c } = layoutFor(st)
    const [mood, glint] = st === 'open' ? ['idle'] : (hovered || ['hover', 'needs', 'review', 'two'].includes(st)) ? MOOD_OF[c] : (MOODS[st] ?? MOODS.rest)
    setMood(g.st, mood, glint)
    const p = plan(st)
    if (st === 'open' && moved) { root.classList.add('squash'); setTimeout(() => root.classList.remove('squash'), 300) }
    if (rm() && !first) {
      root.classList.add('rm-out')
      clearTimeout(show.t)
      show.t = setTimeout(() => { aim(plan(state), state, true); apply2(); cb.apply(); ey.apply(); void root.offsetWidth; root.classList.remove('rm-out') }, 130)
      return
    }
    aim(p, st, first)
    if (first) { apply2(); cb.apply(); ey.apply() }
  }
  function go(st, { first = false } = {}) {
    state = st
    // an alert opens the shelf by itself and puts it away again after a while if the cursor never came
    clearTimeout(tAlert)
    show(st, first)
    if (['needs', 'review'].includes(st) && o.autoClose) tAlert = setTimeout(() => { if (state === st && !hovered) go('rest') }, 6000)
  }
  function setHover(v) { if (hovered === v) return; hovered = v; show(state, false) }
  hot.addEventListener('pointerenter', () => { clearTimeout(tOut); clearTimeout(tIn); tIn = setTimeout(() => setHover(true), 250) })
  hot.addEventListener('pointerleave', () => { clearTimeout(tIn); clearTimeout(tOut); tOut = setTimeout(() => setHover(false), 500) })
  screen.append(root)
  go(o.state ?? 'rest', { first: true })
  return {
    root, group: g, go,
    get state() { return state },
    setMoved(v) { moved = v },
    remove() { clearTimeout(show.t); clearTimeout(tIn); clearTimeout(tOut); clearTimeout(tAlert); ct.clear(); loop.stop(); root.remove() },
  }
}

/* ---------------- the section ---------------- */
const STORY = [['rest', 1700], ['hover', 2600], ['working', 2000], ['two', 2800], ['working', 1000], ['finished', 1800], ['needs', 3200], ['review', 3600], ['rest', 1400], ['quiet', 2200]]

export function render(host) {
  host.insertAdjacentHTML('beforeend', `<div class="grid">
    ${card({ id: 's-compare', section: 7, title: 'Four shelves, side by side', status: 'planned', from: ['notch.html', 'notch-styles.html'], cls: 'wide',
      desc: 'Steward\'s own version of the wide shelf that drops from the notch: tabs, a session card, an ask box and a round spot for the eyes. Four variations with the same eight states. Pick a state, play the story, or just rest the cursor on a notch: the figures open and close for real (a quarter of a second to open, half a second after you leave to close). The menu bar here is a busy one so you can see what each covers.',
      tools: '<button class="btn" id="s-play">▶ Play the story</button>',
      body: `<div class="istates" id="s-states">${SSTATES.map(([id, l]) => `<button data-st="${id}" aria-pressed="false">${l}</button>`).join('')}</div>
        <p class="istate" id="s-state"></p>
        <div class="idirs sh-figs">${VARIANTS.map((d) => `<figure data-v="${d.id}"><div class="icrop"></div><figcaption><b>${d.id} · ${d.name}</b> ${esc(d.short)} <i class="cov">Covers: ${esc(d.covers)}</i></figcaption></figure>`).join('')}</div>` })}
    ${card({ id: 's-open', section: 7, title: 'Opening, growing into the panel, and closing', status: 'planned', from: 'notch.html', cls: 'wide',
      desc: 'Rest the cursor on the notch: the shelf grows out of it. Click: it becomes the panel (variation 2 grows downward into a wide dark chat, the others become today\'s panel under the notch). Leave and it shrinks back into the notch. For a panel you dragged elsewhere the shelf does not grow into it: the island squashes once and the panel pops in where you left it.',
      tools: '<button class="btn" id="s-openbtn">Open the panel</button> <button class="btn" id="s-closebtn">Close</button>',
      body: `<div class="ibar"><span class="lbl">Variation</span><span class="iseg" id="s-odir">${VARIANTS.map((d, i) => `<button data-v="${d.id}" aria-pressed="${i === 0}">${d.id} · ${d.name}</button>`).join('')}</span>
        <span class="lbl">Panel</span><span class="iseg" id="s-opos"><button data-v="under" aria-pressed="true">Under the notch</button><button data-v="moved" aria-pressed="false">Dragged elsewhere</button></span></div>
        <div class="icrop" id="s-ocrop"></div>` })}
    ${card({ id: 's-choose', section: 7, title: 'What it means, and which one I would pick', status: 'planned', from: null, cls: 'wide',
      desc: 'How each opens, what it does to the side panel, and what it covers.',
      body: `<table class="itable"><thead><tr><th></th><th>1 · Dashboard</th><th>2 · Chat-first</th><th>3 · Projects board</th><th>4 · Small and big</th></tr></thead><tbody>
        <tr><td>Resting look</td><td>The chin (built)</td><td>The chin</td><td>The chin</td><td>The chin</td></tr>
        <tr><td>Opens</td><td>Hover 0.25 s; an alert opens it by itself</td><td>The same</td><td>The same</td><td>The same, small</td></tr>
        <tr><td>Closes</td><td>0.5 s after the cursor leaves; alert-opened: 6 s after the cursor is not on it</td><td>The same</td><td>The same</td><td>The same</td></tr>
        <tr><td>Today's side panel in notch mode</td><td>Stays, for chat. A click on Ask or Open grows the shelf into it.</td><td><b>Replaced</b>: the shelf is the panel, wider and shorter, growing downward into the full chat</td><td>Stays, for chat</td><td>Stays: the shelf is the glance, the panel the chat</td></tr>
        <tr><td>Covers in the menu bar</td><td>About 255 pt each side while open</td><td>The same</td><td>Nothing</td><td>Nothing</td></tr>
        <tr><td>Best at</td><td>Looks like the photo; a calm dashboard</td><td>One surface for everything; fewest clicks to ask</td><td>Several projects at once, each with its own action</td><td>The least intrusive; reuses the panel as it is</td></tr>
        <tr><td>Weak at</td><td>Covers menu items; a lot to build and keep tidy</td><td>Most to build (it is a second panel); covers menu items</td><td>Little room for the ask box and Tray</td><td>Two steps to chat; less like the photo</td></tr>
      </tbody></table>
      <p class="inote"><b>My pick: 1, the Dashboard, with 4's small shelf as the alert tier.</b> 1 is the closest to the photo the user liked, and it keeps the panel for chat, so no second chat surface has to be built. Its cost is the menu bar while open: about 255 pt each side. So the full dashboard should open only on a deliberate hover (a quarter second on the notch) and close quickly, and "needs you" and a review should not throw it open over the menu bar: they come out as 4's small shelf, which hangs under the bar and covers nothing, and the dashboard is one hover away. 3 is the better choice if covering the menu bar bothers the user on a real Mac: it is the same content hanging under the bar. 2 is the boldest and the most work. The Try prompts in the ask box are new (the app has none yet), and "how long" on the session card needs the turn's start time, which Visual Review's hook already tracks.</p>
      <p class="inote"><b>What it replaces:</b> the earlier eight directions (kept below under "Earlier tries"). The chin stays as the resting look and the compact status capsule stays as the glance. Wings and notch 3e are not needed. <b>3e stays on hold.</b></p>
      <p class="inote"><b>Why it is not a copy:</b> the layout is Steward's own: a session card for Claude (not a player), an ask box with Try prompts, tabs for Steward, Tray and Reviews, and Steward's eyes in the round spot. The icons are drawn here and the names are Steward's.</p>` })}
  </div>`)
  const cardEl = host.querySelector('#f-s-compare')
  const INFO = Object.fromEntries(SSTATES.map(([id, l, d]) => [id, [l, d]]))
  let cur = 'rest'
  const shelves = []
  const label = (st) => { host.querySelector('#s-state').innerHTML = `<b>${INFO[st][0]}.</b> ${esc(INFO[st][1])}`; host.querySelectorAll('#s-states button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.st === st))) }
  const setAll = (st) => { cur = st; label(st); shelves.forEach((i) => i.go(st)) }
  function build() {
    stage.clear('s')
    shelves.forEach((i) => i.remove())
    shelves.length = 0
    host.querySelectorAll('#f-s-compare .sh-figs figure').forEach((fig, n) => {
      const c = fig.querySelector('.icrop')
      c.replaceChildren()
      const { screen } = crop(c, { cw: 760, ch: 208, wall: S.dark ? 'dark' : 'light', busy: true })
      shelves.push(createShelf(screen, { variant: fig.dataset.v, kind: S.version, color: S.color, owner: 's', seed: 101 + n, anchor: fig, mouth: S.mouth, think: S.think, rm: () => S.rm, dark: S.dark, state: cur, autoClose: false }))
    })
    label(cur)
    buildOpen()
  }
  let odir = '1', opos = 'under', osh = null
  function buildOpen() {
    stage.clear('so')
    osh?.remove()
    const c = host.querySelector('#s-ocrop')
    c.replaceChildren()
    const { screen } = crop(c, { cw: 1000, ch: 560, zoom: 0.78, wall: S.dark ? 'dark' : 'light', busy: true })
    osh = createShelf(screen, { variant: odir, kind: S.version, color: S.color, owner: 'so', seed: 131, anchor: c, mouth: S.mouth, think: S.think, rm: () => S.rm, dark: S.dark, panel: true, moved: opos === 'moved', state: 'rest' })
  }
  host.querySelector('#s-openbtn').onclick = () => { openRun.cancel(); osh.go('open') }
  host.querySelector('#s-closebtn').onclick = () => { openRun.cancel(); osh.go('rest') }
  const seg = (id, fn) => host.querySelector(id).addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]')
    if (!b) return
    host.querySelectorAll(`${id} button`).forEach((x) => x.setAttribute('aria-pressed', String(x === b)))
    fn(b.dataset.v)
  })
  seg('#s-odir', (v) => { openRun.cancel(); odir = v; buildOpen(); osh.go('open') })
  seg('#s-opos', (v) => { openRun.cancel(); opos = v; osh.setMoved(v === 'moved'); osh.go('rest'); setTimeout(() => osh.go('open'), 500) })
  const openRun = demo(host.querySelector('#f-s-open'), host.querySelector('#f-s-open'), async (_, tok) => {
    osh.go('rest'); await wait(1200, tok)
    osh.go('hover'); await wait(2600, tok)
    osh.go('open'); await wait(3200, tok)
    osh.go('rest'); await wait(1400, tok)
  }, { clear: false, gap: 600 })
  const run = demo(cardEl, cardEl, async (_, tok) => { for (const [st, ms] of STORY) { setAll(st); await wait(ms, tok) } }, { clear: false, gap: 700 })
  host.querySelector('#s-play').onclick = () => run.replay()
  host.querySelector('#s-states').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-st]')
    if (!b) return
    run.cancel()
    setAll(b.dataset.st)
  })
  build()
  onChange(['color', 'version', 'dark', 'mouth', 'think'], build)
}
