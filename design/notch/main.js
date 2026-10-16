// notch.html: the three notch layouts side by side, every mood, the six colors, the states, and the two big moves
// (from the screen edge into the notch, and opening the panel), at real size and at 2x.
import { createStage } from '../shared/pill-stage.js'
import { COLORS } from '../pill/render.js'
import { MOODS, setMood } from '../pill/eyes.js'
import { load, save, media } from '../shared/store.js'
import { wait, demo, env, esc } from '../shared/activity.js'
import { fitScene } from '../shared/glass.js'
import { createNotch, crop, litEyes, screenHTML, hardwareHTML, setEye, LAYOUTS, CX, NOTCH, SIZE, SCREEN } from './notch.js'

const APP = ['Silver', 'Sky', 'Lilac', 'Mint', 'Peach', 'Graphite']
const PALETTE = APP.map((n) => COLORS.find((c) => c.name === n))
const VERSIONS = [['glass', 'Glass'], ['flat', 'Flat'], ['blocky', 'Blocky']]
const HW = NOTCH.w / 2

const KEY = 'steward-notch'
const S = load(KEY, {
  layout: 'chin', version: 'glass', color: PALETTE[0].hex, wall: 'light', r: 10, eye: 14, edge: 'right', colMood: 'idle', colZoom: 1, stZoom: 1,
  dark: media('(prefers-color-scheme: dark)').matches, rm: media('(prefers-reduced-motion: reduce)').matches,
})
if (!LAYOUTS.some((l) => l.id === S.layout)) S.layout = 'chin'
if (!VERSIONS.some(([v]) => v === S.version)) S.version = 'glass'
if (!PALETTE.some((c) => c.hex === S.color)) S.color = PALETTE[0].hex
if (!(S.r >= 4 && S.r <= 16)) S.r = 10
if (![12, 14, 16].includes(S.eye)) S.eye = 14
setEye(S.eye)

const params = new URLSearchParams(location.search)
const stage = createStage({ reduced: () => S.rm, awake: params.has('awake') })
const rm = () => S.rm
let P = null // the real cursor
const DBG = { states: {} } // handles for screenshots (?debug)
addEventListener('pointermove', (e) => { P = { x: e.clientX, y: e.clientY } }, { passive: true })
/** Where a point is from an eye view, in the units pill-stage uses for the cursor. */
function rel(p, el) {
  const r = el.getBoundingClientRect()
  return { x: (p.x - (r.left + r.width / 2)) / Math.max(90, r.width), y: (p.y - (r.top + r.height / 2)) / Math.max(70, r.height) }
}
/** A look() for a group: the scripted cursor while it shows, else nothing (the stage then uses the real one). */
const follow = (cur, inst) => () => {
  if (!cur.classList.contains('on') || !inst.v) return null
  const c = cur.getBoundingClientRect()
  return rel({ x: c.left, y: c.top }, inst.v.el)
}
const notch = (screen, o) => {
  const box = {}
  const inst = createNotch(screen, { kind: S.version, color: S.color, stage, r: S.r, rm, dark: S.dark, ...o, look: o.look?.(box) })
  box.v = inst.group.views[0]
  return inst
}

/* ---------------- controls ---------------- */
function applyRoot() {
  const root = document.documentElement
  root.toggleAttribute('data-dark', S.dark)
  root.toggleAttribute('data-rm', S.rm)
  root.style.setProperty('--r', `${S.r}px`)
  setEye(S.eye)
  env.rm = S.rm
}
function set(patch) {
  const changed = Object.keys(patch).filter((k) => S[k] !== patch[k])
  if (!changed.length) return
  Object.assign(S, patch)
  save(KEY, S)
  applyRoot()
  controls()
  // Reduced motion is read live; everything else redraws.
  if (changed.some((k) => k !== 'rm')) build()
}
const seg = (key, items) => `<span class="seg">${items.map(([v, l]) => `<button data-k="${key}" data-v="${v}" aria-pressed="${String(S[key]) === String(v)}">${l}</button>`).join('')}</span>`
function controls() {
  document.getElementById('controls').innerHTML = `
    <span class="grp"><span class="lbl">Layout</span>${seg('layout', LAYOUTS.map((l) => [l.id, `${l.key} ${l.name}`]))}</span>
    <span class="grp"><span class="lbl">Version</span>${seg('version', VERSIONS)}</span>
    <span class="grp"><span class="lbl">Color</span>${PALETTE.map((c) => `<button class="sw" data-k="color" data-v="${c.hex}" title="${c.name}" aria-label="${c.name}" aria-pressed="${S.color === c.hex}" style="background:${c.hex}"></button>`).join('')}</span>
    <span class="grp"><span class="lbl">Eyes</span>${seg('eye', [[12, '12'], [14, '14'], [16, '16 pt']])}</span>
    <span class="grp"><span class="lbl">Wallpaper</span>${seg('wall', [['light', 'Light'], ['dark', 'Dark']])}</span>
    <span class="grp"><span class="lbl">Theme</span>${seg('dark', [[false, 'Light'], [true, 'Dark']])}</span>
    <span class="grp"><span class="lbl">Motion</span>${seg('rm', [[false, 'Full'], [true, 'Reduced']])}</span>
    <label class="range" title="The notch's corner radius. No API reports it, so 10 is an estimate: match it to your screen."><span class="lbl">Corners</span><input type="range" min="4" max="16" step="1" value="${S.r}" data-k="r"><span>${S.r} pt</span></label>`
  document.getElementById('col-zoom').innerHTML = seg('colZoom', [[1, 'Real size'], [2, '2×']]).replace(/^<span class="seg">|<\/span>$/g, '')
  document.getElementById('st-zoom').innerHTML = seg('stZoom', [[1, 'Real size'], [2, '2×']]).replace(/^<span class="seg">|<\/span>$/g, '')
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-k]')
  if (!b) return
  const raw = b.dataset.v, cur = S[b.dataset.k]
  set({ [b.dataset.k]: typeof cur === 'boolean' ? raw === 'true' : typeof cur === 'number' ? +raw : raw })
})
document.addEventListener('change', (e) => {
  if (e.target.dataset?.k === 'r') set({ r: +e.target.value })
  if (e.target.id === 'col-mood') set({ colMood: e.target.value })
})

/* ---------------- moving things inside a screen ---------------- */
const CURSOR = '<svg class="fcur" viewBox="0 0 13 20"><path d="M1 1v15.2l3.9-3.7 2.5 5.7 2.3-1-2.4-5.5h5.4z" fill="#111" stroke="#fff" stroke-width="1.3" stroke-linejoin="round"/></svg>'
const tf = (x, y, s = 1) => `translate(${x}px,${y}px)${s !== 1 ? ` scale(${s})` : ''}`
/** Move an element to x, y (and a scale and opacity) over ms; the end state is kept. Reduced motion jumps. */
function move(el, x, y, ms, { s = 1, o, ease = 'cubic-bezier(.45,.05,.3,1)' } = {}) {
  const from = { transform: el.style.transform || tf(x, y, s), opacity: el.style.opacity || '1' }
  const to = { transform: tf(x, y, s), opacity: String(o ?? from.opacity) }
  Object.assign(el.style, to)
  if (!S.rm && ms) el.animate([from, to], { duration: ms, easing: ease })
}
/** A demo that runs as long as its card is on screen. */
const runs = []
function loop(card, play, gap = 900) { const d = demo(card, card, play, { clear: false, gap }); runs.push(d); return d }

/* ---------------- 1. compare ---------------- */
const COVERS = {
  get chin() { return `Nothing in the menu bar. Below it, a strip as wide as the notch (${SIZE.lip} points tall with ${SIZE.eye} point eyes) over whatever is under the notch.` },
  get wings() { return `${SIZE.wing} points of menu bar on each side of the notch (with ${SIZE.eye} point eyes): on a full menu bar, that is the last app menu on the left and the first icon on the right. Its marks (!, Z, the sweat drop) sit another 15 points out, over the menu bar too.` },
  float: 'Nothing at rest: just the eyes, over whatever is under the notch. When it comes out, the same strip as A.',
}
const WORRY = {
  chin: 'On a window zoomed to fill the screen, the lip lands on the title bar, right where macOS centers the window\'s title (shown below).',
  wings: 'The face splits: the eyes end up over 200 points apart with the notch between them, so it reads as two lights more than a face. And the dots and the mouth live in the middle, so thinking and talking need a chin anyway.',
  float: 'With no black behind them, the eyes are only as visible as what is under the notch: on a light wallpaper or a white window they wash out (Silver nearly disappears), even with the soft shadow behind them.',
}
const WORRY_SCENE = { chin: { maxed: true }, wings: { busy: true }, float: { maxed: true } }

function buildCompare() {
  const L = LAYOUTS.find((l) => l.id === S.layout)
  document.getElementById('cmp-which').textContent = `${L.key} ${L.name}, from the Layout control`
  // The whole screen, scaled to fit, with the real cursor: hover the notch, click it to open the panel.
  const wrap = document.getElementById('cmp-full')
  wrap.replaceChildren()
  const screen = document.createElement('div')
  screen.className = `screen gx ${S.wall}`
  screen.style.height = `${SCREEN.h}px`
  screen.innerHTML = screenHTML({ wall: S.wall }) + hardwareHTML()
  wrap.append(screen)
  fitScene(wrap, screen, SCREEN.w, SCREEN.h)
  const inst = notch(screen, { layout: S.layout, anchor: wrap, seed: 3, panel: true, look: (box) => () => (P && box.v ? rel(P, box.v.el) : null) })
  const hit = document.createElement('div')
  hit.style.cssText = `position:absolute;left:${CX - 130}px;top:0;width:260px;height:70px;z-index:35;cursor:pointer`
  screen.append(hit)
  hit.onpointerenter = () => { if (inst.state === 'rest') inst.go('hover') }
  hit.onpointerleave = () => { if (inst.state === 'hover') inst.go('rest') }
  hit.onclick = (e) => { e.stopPropagation(); inst.go(inst.state === 'open' ? 'rest' : 'open') }
  screen.onclick = () => { if (inst.state === 'open') inst.go('rest') }

  const three = document.getElementById('cmp-three')
  three.replaceChildren()
  for (const l of LAYOUTS) {
    const card = document.createElement('div')
    card.className = 'card'
    card.innerHTML = `<header><span class="key">${l.key}</span><h3>${l.name}</h3></header><p class="desc">${esc(l.short)}</p>
      <div class="cap">Real size, light wallpaper</div><div class="c1"></div><div class="cap">Real size, dark wallpaper</div><div class="c2"></div>
      <div class="cap">2×</div><div class="scroll c3"></div>
      <p class="note"><b>What it covers:</b> ${esc(COVERS[l.id])}</p>
      <div class="worry"><b>The one thing that worries me:</b> ${esc(WORRY[l.id])}</div><div class="c4"></div>`
    three.append(card)
    const g = stage.group({ seed: 10 + LAYOUTS.indexOf(l), anchor: card, mood: 'idle', owner: 'cmp' })
    const add = (sel, opts) => notch(crop(card.querySelector(sel), opts).screen, { layout: l.id, group: g })
    add('.c1', { cw: 420, ch: 72, wall: 'light' })
    add('.c2', { cw: 420, ch: 72, wall: 'dark' })
    add('.c3', { cw: 270, ch: 64, zoom: 2, wall: S.wall })
    add('.c4', { cw: 420, ch: 72, wall: 'light', ...WORRY_SCENE[l.id] })
  }
  document.getElementById('rec').innerHTML = `<b>A, the Chin.</b> It is the only one that does what you asked for in every state: one black shape that looks like the notch grew taller, with the whole face on it, and it never touches the menu bar. B splits the face and needs a chin for thinking and talking anyway. C is the calmest at rest, but it can't promise the eyes will be visible. If A feels too present, I would try 12 point eyes (a 20 point lip) before switching to C.`
}

/* ---------------- 2. moods ---------------- */
function buildMoods() {
  const host = document.getElementById('moodlist')
  host.replaceChildren()
  MOODS.forEach((m, i) => {
    const card = document.createElement('div')
    card.className = 'card'
    card.innerHTML = `<div class="mood"><div class="mh"><b>${esc(m.label)}</b><small>${esc(m.when)}</small></div></div>`
    host.append(card)
    const grid = card.firstElementChild
    const g = stage.group({ seed: 20 + i, anchor: card, mood: m.id, owner: 'moods' })
    for (const [kind, name] of VERSIONS) {
      const a = document.createElement('div'), b = document.createElement('div')
      a.className = 'mrow'; b.className = 'mrow scroll'
      a.innerHTML = `<span class="vlabel">${name}</span>`
      grid.append(a, b)
      notch(crop(a, { cw: 300, ch: 64, wall: S.wall }).screen, { layout: S.layout, group: g, kind })
      notch(crop(b, { cw: 300, ch: 64, zoom: 2, wall: S.wall }).screen, { layout: S.layout, group: g, kind })
    }
  })
}

/* ---------------- 3. colors ---------------- */
function buildColors() {
  const sel = document.getElementById('col-mood')
  sel.innerHTML = MOODS.map((m) => `<option value="${m.id}"${m.id === S.colMood ? ' selected' : ''}>${m.label}</option>`).join('')
  const grid = document.getElementById('colgrid')
  grid.replaceChildren()
  grid.insertAdjacentHTML('beforeend', `<span></span>${VERSIONS.map(([, n]) => `<span class="cap">${n}</span>`).join('')}`)
  PALETTE.forEach((c, i) => {
    grid.insertAdjacentHTML('beforeend', `<span class="cn">${c.name}</span>`)
    for (const [kind] of VERSIONS) {
      const cell = document.createElement('div')
      grid.append(cell)
      const { screen } = crop(cell, { cw: 250, ch: 60, zoom: S.colZoom, wall: S.wall })
      notch(screen, { layout: S.layout, kind, color: c.hex, seed: 40 + i, anchor: cell, mood: S.colMood, owner: 'colors' })
    }
  })
}

/* ---------------- 4. states ---------------- */
const STATES = [
  { id: 'rest', title: 'Resting', desc: 'Docked and nothing going on: dim, heavy lids and a slow glow, with a glance now and then.', play: async (c, tok) => {
    c.all((n) => { n.go('rest'); n.mood('idle') }); await wait(1400, tok)
    c.all((n) => n.mood('resting')); c.say('Resting'); await wait(4200, tok)
    c.all((n) => n.mood('idle')); c.say('A glance now and then'); await wait(1600, tok)
  } },
  { id: 'hover', title: 'Hover', desc: 'The cursor comes near: the black grows a little and the eyes follow the cursor.', play: async (c, tok) => {
    c.all((n) => { n.go('rest'); n.mood('idle') }); c.cur(CX + 175, 112, 0, true); c.say('The cursor comes near…'); await wait(500, tok)
    c.cur(CX + 36, 52, 800); await wait(700, tok)
    c.all((n) => n.go('hover')); c.say('…the black grows a little and the eyes follow it'); await wait(300, tok)
    c.cur(CX - 55, 50, 1000); await wait(1150, tok)
    c.cur(CX + 24, 46, 700); await wait(850, tok)
    c.cur(CX + 190, 108, 700); await wait(400, tok)
    c.all((n) => n.go('rest')); c.say('It settles when the cursor leaves'); await wait(700, tok); c.cur(null)
  } },
  { id: 'nudge', title: 'A nudge', desc: 'An alert with one line of text slides out under the menu bar line, never wider than the notch inside the menu bar.', play: async (c, tok) => {
    c.all((n) => { n.go('rest'); n.mood('idle') }); c.say(''); await wait(1000, tok)
    c.all((n) => { n.say('<b>Needs your OK</b> · Run npm test in companion?'); n.mood('needs-you'); n.go('nudge') }); c.say('An alert slides out under the menu bar line…'); await wait(3600, tok)
    c.all((n) => { n.mood('idle'); n.go('rest') }); c.say('…and tucks back in'); await wait(1400, tok)
  } },
  { id: 'drop', title: 'Dropping an image in', desc: 'Drag a screenshot onto the notch: the lip opens like a mouth, swallows it, and says it went into the tray.', play: async (c, tok) => {
    c.all((n) => { n.go('rest'); n.mood('idle') }); c.cur(CX + 196, 120, 0, true); c.thumb(CX + 196, 120, 0, 1); c.say('You drag a screenshot to the notch…'); await wait(500, tok)
    c.cur(CX + 34, 76, 900); c.thumb(CX + 34, 76, 900, 1); await wait(520, tok)
    c.all((n) => { n.mood('listening'); n.go('mouth') }); c.say('…the lip opens like a mouth…'); await wait(520, tok)
    c.thumb(CX, NOTCH.h + SIZE.lip + 12, 300, 0.2, 0); await wait(330, tok)
    c.all((n) => { n.go('gulp'); n.mood('done') }); c.say('…and swallows it'); await wait(420, tok)
    c.all((n) => { n.say('<b>In the tray</b> · Screenshot at 9.41'); n.go('tray') }); c.cur(CX + 190, 112, 600); c.say('It went into the tray'); await wait(1900, tok)
    c.all((n) => { n.go('rest'); n.mood('idle') }); c.cur(null); await wait(800, tok)
  } },
  { id: 'think', title: 'Thinking', desc: 'The eyes turn into the three dots: a wave while thinking, one at a time while reading a file, circling while searching.', play: async (c, tok) => {
    c.all((n) => { n.go('rest'); n.mood('idle') }); c.say(''); await wait(900, tok)
    c.all((n) => { n.mood('thinking', 'sweep'); n.go('think') }); c.say('Thinking: three dots in a wave'); await wait(2600, tok)
    c.all((n) => n.mood('thinking', 'step')); c.say('Reading a file: one dot at a time'); await wait(2400, tok)
    c.all((n) => n.mood('thinking', 'search')); c.say('Searching the web: the dots circle'); await wait(2400, tok)
    c.all((n) => { n.mood('done'); n.go('rest') }); c.say('Done'); await wait(1500, tok)
  } },
  { id: 'sleep', title: 'Sleepy', desc: 'Away for a while: the eyes close into soft curves and Z\'s drift from the spot at the side.', play: async (c, tok) => {
    c.all((n) => { n.go('rest'); n.mood('resting') }); c.say('Resting'); await wait(1800, tok)
    c.all((n) => n.mood('sleepy')); c.say('Away a while: Z\'s from the side'); await wait(5400, tok)
    c.all((n) => n.mood('idle')); c.say('You\'re back'); await wait(1400, tok)
  } },
  { id: 'click', title: 'The click that opens the panel', desc: 'A click squeezes the black, then it drops down and grows into the panel. Only the top of it fits here; the whole move is under "Moving in and opening".', play: async (c, tok) => {
    c.all((n) => { n.go('rest'); n.mood('idle') }); c.cur(CX + 170, 104, 0, true); c.say(''); await wait(400, tok)
    c.cur(CX + 12, 44, 700); await wait(650, tok)
    c.all((n) => n.go('hover')); await wait(350, tok)
    c.all((n) => n.go('press')); c.say('A click…'); await wait(120, tok)
    c.all((n) => n.go('open')); c.say('…the black drops down and becomes the panel'); await wait(2800, tok)
    c.cur(CX + 260, 100, 500); await wait(500, tok)
    c.all((n) => n.go('rest')); c.say('Clicking away tucks it back'); await wait(1300, tok); c.cur(null)
  } },
]

function buildStates() {
  const grid = document.getElementById('stategrid')
  grid.replaceChildren()
  grid.classList.toggle('z2', S.stZoom === 2)
  STATES.forEach((def, si) => {
    const card = document.createElement('div')
    card.className = 'card'
    card.innerHTML = `<header><h3>${esc(def.title)}</h3><button class="btn">↻ Replay</button></header><p class="desc">${esc(def.desc)}</p><div class="rows"></div><p class="step"></p>`
    grid.append(card)
    const rows = card.querySelector('.rows'), curs = [], thumbs = [], insts = []
    LAYOUTS.forEach((l, li) => {
      const row = document.createElement('div')
      row.className = 'lrow scroll'
      row.innerHTML = `<span class="key">${l.key}</span>`
      rows.append(row)
      const { screen } = crop(row, { cw: 440, ch: 112, zoom: S.stZoom, wall: S.wall })
      screen.insertAdjacentHTML('beforeend', CURSOR + '<div class="thumb"></div>')
      const cur = screen.querySelector('.fcur'), th = screen.querySelector('.thumb')
      curs.push(cur); thumbs.push(th)
      insts.push(notch(screen, { layout: l.id, seed: 60 + si * 3 + li, anchor: card, owner: 'states', panel: def.id === 'click', look: (box) => follow(cur, box) }))
    })
    const step = card.querySelector('.step')
    const c = {
      all: (fn) => insts.forEach(fn),
      say: (t) => { step.textContent = t },
      cur: (x, y, ms = 0, show) => curs.forEach((el) => { if (x === null) return el.classList.remove('on'); if (show) el.classList.add('on'); move(el, x, y, ms) }),
      thumb: (x, y, ms, s, o = 1) => thumbs.forEach((el) => move(el, x - 33, y - 22, ms, { s, o })),
    }
    const run = loop(card, (_, tok) => def.play(c, tok))
    card.querySelector('.btn').onclick = () => run.replay()
    DBG.states[def.id] = { c, insts, run }
  })
}

/* ---------------- 5. the big moves ---------------- */
function fullScreen(wrap) {
  wrap.replaceChildren()
  const screen = document.createElement('div')
  screen.className = `screen gx ${S.wall}`
  screen.style.height = `${SCREEN.h}px`
  screen.innerHTML = screenHTML({ wall: S.wall }) + hardwareHTML()
  wrap.append(screen)
  fitScene(wrap, screen, SCREEN.w, SCREEN.h)
  return screen
}

/** The path of the drop from the tab to the notch: [time 0 to 1, x, y, stretch x, stretch y, opacity], for the right edge. */
const PATH = [
  [0, 1483, 407, 1.3, 1.1, 0], [0.1, 1483, 407, 1.05, 1.05, 1], [0.36, 1495, 18, 0.78, 1.3, 1], [0.44, 1478, 13, 1.06, 0.92, 1],
  [0.78, CX + HW + 26, 12, 1.42, 0.78, 1], [0.9, CX + HW + 8, 15, 0.8, 0.86, 1], [1, CX + HW - 8, 18, 0.3, 0.3, 0],
]
function frames(d, side, back, eyes = false) {
  const pts = (back ? [...PATH].reverse().map((p) => [1 - p[0], ...p.slice(1)]) : PATH)
  return pts.map(([t, x, y, sx, sy, o]) => {
    const X = side === 'right' ? x : SCREEN.w - x
    return eyes
      ? { offset: t, transform: `translate(${X}px,${y}px)`, opacity: t > 0.06 && t < 0.86 ? o : 0 }
      : { offset: t, transform: `translate(${X - d / 2}px,${y - d / 2}px) scale(${sx},${sy})`, opacity: o * (d < 30 ? 0.9 : 1) }
  })
}

function buildDock() {
  const wrap = document.getElementById('mv-dock-scene')
  const screen = fullScreen(wrap)
  const side = S.edge
  screen.insertAdjacentHTML('beforeend', `<div class="tab solid ${side}"></div>${[34, 22, 14].map((d) => `<div class="drop" style="width:${d}px;height:${d}px"></div>`).join('')}<div class="deyes"></div>`)
  const tab = screen.querySelector('.tab'), drops = [...screen.querySelectorAll('.drop')], deyes = screen.querySelector('.deyes')
  const tabG = stage.group({ seed: 80, anchor: wrap, mood: 'resting', owner: 'moves' })
  stage.view(tabG, S.version, tab, 50, 44, { color: S.color, tinted: true, light: S.wall === 'light', mouth: true })
  const inst = notch(screen, { layout: S.layout, seed: 81, anchor: wrap, owner: 'moves', state: 'away' })
  litEyes(stage, inst.group, S.version, deyes, { color: S.color, eye: 9 })
  document.getElementById('mv-edge').innerHTML = seg('edge', [['right', 'Right'], ['left', 'Left']]).replace(/^<span class="seg">|<\/span>$/g, '')
  const step = document.getElementById('mv-dock-step'), say = (t) => { step.textContent = t }
  const T = 1700
  const flow = (back) => {
    drops.forEach((d, i) => d.animate(frames(+d.style.width.slice(0, -2), side, back), { duration: T, delay: i * 75, easing: 'cubic-bezier(.45,.05,.35,1)', fill: 'both' }))
    deyes.animate(frames(0, side, back, true), { duration: T, easing: 'cubic-bezier(.45,.05,.35,1)', fill: 'both' })
  }
  const run = loop(document.getElementById('mv-dock'), async (_, tok) => {
    drops.forEach((d) => d.getAnimations().forEach((a) => a.cancel())); deyes.getAnimations().forEach((a) => a.cancel())
    tab.classList.remove('gone'); inst.go('away'); setMood(tabG.st, 'resting')
    say(`Docked at the ${side} edge.`); await wait(1600, tok)
    say('Dragged to the top middle, it turns into a drop of black and runs along the top…')
    tab.classList.add('gone')
    if (S.rm) { await wait(260, tok); inst.go('rest') } else {
      flow(false); await wait(T * 0.86, tok)
      inst.go('bulge'); say('…and the notch bulges as it takes it in.'); await wait(300, tok)
      inst.go('rest')
    }
    inst.mood('done'); await wait(1200, tok); inst.mood('idle'); await wait(1800, tok)
    say('Dragged back toward the edge, a drop pinches off and runs back.')
    if (S.rm) { inst.go('away'); await wait(300, tok) } else {
      inst.go('bulge'); await wait(220, tok)
      inst.go('away'); flow(true); await wait(T, tok)
    }
    tab.classList.remove('gone'); say(`Back at the ${side} edge.`); await wait(1400, tok)
  }, 600)
  document.getElementById('mv-dock-play').onclick = () => run.replay()
  DBG.dock = { inst, tab, flow, run, say, T }
}

function buildOpen() {
  const wrap = document.getElementById('mv-open-scene')
  const screen = fullScreen(wrap)
  screen.insertAdjacentHTML('beforeend', CURSOR)
  const cur = screen.querySelector('.fcur')
  cur.style.transform = 'scale(1.4)'
  const inst = notch(screen, { layout: S.layout, seed: 90, anchor: wrap, owner: 'moves', panel: true, look: (box) => follow(cur, box) })
  const step = document.getElementById('mv-open-step'), say = (t) => { step.textContent = t }
  const to = (x, y, ms) => move(cur, x, y, ms, { s: 1.4 })
  const run = loop(document.getElementById('mv-open'), async (_, tok) => {
    inst.go('rest'); inst.mood('idle'); cur.classList.add('on'); to(CX + 300, 420, 0); say(''); await wait(700, tok)
    to(CX + 10, 46, 1000); say('The cursor comes to the notch…'); await wait(900, tok)
    inst.go('hover'); await wait(500, tok)
    inst.go('press'); say('…a click…'); await wait(130, tok)
    inst.go('open'); say('…the black drops down, grows into the panel, and the glass takes over. The eyes become the Pill in the header.'); await wait(3200, tok)
    to(CX - 420, 560, 900); await wait(950, tok)
    inst.go('rest'); say('A click away (or Esc) tucks it back into the notch.'); await wait(1800, tok)
    cur.classList.remove('on'); await wait(400, tok)
  }, 700)
  document.getElementById('mv-open-play').onclick = () => run.replay()
  DBG.open = { inst, cur, to, run, say }
}

/* ---------------- 6. measurements ---------------- */
function buildMeasure() {
  const rows = [
    ['The notch', '185 × 32 points (370 × 64 pixels), centered: x 663.5 to 848.5', 'macOS NSScreen: the top safe area is 32 pt, and the usable strips beside the notch are 663.5 pt wide each'],
    ['The menu bar', '33 points, so its bottom line sits 1 point under the notch', 'NSScreen: the screen\'s frame minus its visible frame'],
    ['The screen', '1512 × 982 points at 2×, the 14-inch default', 'Your MacBook Pro 14" (M4, Mac16,1)'],
    ['Corner radius', `${S.r} points`, 'An estimate: no API reports it. Change it with Corners at the top until the black matches your notch'],
    ['Layout sizes', `Eyes ${SIZE.eye} pt tall (the edge tab's are about 13), so a lip of ${SIZE.lip} pt below the notch (A) and wings of ${SIZE.wing} pt each side (B); fillets ${SIZE.fillet} pt`, 'Picked here, for you to judge: change Eyes at the top'],
  ]
  document.getElementById('measure').innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:13.5px">${rows.map(([a, b, c]) => `<tr style="border-top:1px solid var(--line)"><th style="text-align:left;padding:8px 10px 8px 0;white-space:nowrap">${a}</th><td style="padding:8px 10px">${esc(b)}</td><td style="padding:8px 0;color:var(--muted)">${esc(c)}</td></tr>`).join('')}</table>`
}

/* ---------------- build ---------------- */
function build() {
  runs.splice(0).forEach((r) => r.stop())
  stage.clear()
  buildCompare(); buildMoods(); buildColors(); buildStates(); buildDock(); buildOpen(); buildMeasure()
  stage.sweep()
}
applyRoot()
controls()
build()
stage.start()
// For screenshots and checks.
if (params.has('debug')) window.__notch = { S, set, stage, runs, DBG }
