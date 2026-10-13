// The Pill's eyes: one expression model for every mood, used by the glass, flat and blocky views.
//
// Each eye is a pill shape cut by two lids:
//   - a top lid that drops (lid) and tilts (tilt: + is angry, inner corners down; - is worried, inner corners up)
//   - a bottom lid that pushes up into an arch (happy, the ^ shape) or flat (squint)
// plus size (sx, sy), spacing (gap) and a little rotation (rot). Every value springs toward its mood target with
// a slight overshoot, so a change of mood pops instead of sliding. On top of that: blinks, where the eyes look,
// and small body moves (a hop, a shake, a pop). Blocky gets hand-drawn pixel eyes per mood instead, since
// pixel art reads better drawn than shrunk.
//
// State is plain data, so the app can port this as it is: createEyes(), setMood(), stepEyes() every frame.

export const MOODS = [
  { id: 'idle', label: 'Idle', when: 'Nothing going on. It glances around and follows your cursor.' },
  { id: 'listening', label: 'Listening', when: 'You opened the panel or started talking. Eyes a little bigger.' },
  { id: 'thinking', label: 'Thinking', when: 'Working out a reply or running a tool. Looks up and scans.' },
  { id: 'talking', label: 'Talking', when: 'Answering you. The eyes bounce with the words.' },
  { id: 'done', label: 'Happy', when: 'A task finished. Eyes grow, then turn into happy arches.' },
  { id: 'celebrating', label: 'Celebrating', when: 'A PR merged or a deploy went live. Happy arches and a hop.' },
  { id: 'needs-you', label: 'Surprised', when: 'Something needs your OK. Big round eyes, a pop, then a pulse.' },
  { id: 'worried', label: 'Worried', when: 'Something looks off, like a slow or flaky check. Inner corners up, a slight tremble.' },
  { id: 'mad', label: 'Mad', when: 'A deploy failed or a test broke. Angry lids and a shake.', isNew: true },
  { id: 'confused', label: 'Confused', when: 'It did not understand you. One eye big, one squinting, head tilted.', isNew: true },
  { id: 'resting', label: 'Resting', when: 'Tucked away and quiet. Heavy lids, slow blinks.' },
  { id: 'sleepy', label: 'Sleepy', when: 'You have been away for a while. Eyes closed, slow breathing.' },
]

/** Short stories of real tasks: [mood, seconds, what is happening]. */
export const STORIES = [
  { id: 'works', label: 'A task works', steps: [['listening', 1.6, 'You ask it to fix a failing test'], ['thinking', 2.6, 'Reading the test and the code'], ['talking', 2.4, 'Telling you the plan'], ['thinking', 2.2, 'Running the tests'], ['done', 3.2, 'All tests pass'], ['idle', 2, 'Back to idle']] },
  { id: 'fails', label: 'A deploy fails', steps: [['idle', 1.4, 'All quiet'], ['mad', 3, 'The deploy failed'], ['thinking', 2.4, 'Reading the build log'], ['talking', 2.4, 'Found it: a missing environment variable'], ['idle', 1.6, 'Back to idle']] },
  { id: 'ok', label: 'It needs your OK', steps: [['thinking', 2, 'About to run a command'], ['needs-you', 3.2, 'Waiting for your OK'], ['done', 2.6, 'You said yes'], ['idle', 1.6, 'Back to idle']] },
  { id: 'confused', label: 'It gets confused', steps: [['listening', 1.6, 'You ask something vague'], ['confused', 2.8, 'Not sure what you mean'], ['talking', 2.2, 'Asking you a question'], ['idle', 1.6, 'Back to idle']] },
  { id: 'merge', label: 'A PR merges', steps: [['idle', 1.2, 'All quiet'], ['celebrating', 3.6, 'Your PR merged'], ['idle', 1.6, 'Back to idle']] },
  { id: 'away', label: 'You step away', steps: [['idle', 2, 'All quiet'], ['worried', 2.6, 'A check is running slow'], ['resting', 3, 'Tucked away'], ['sleepy', 4, 'You have been away a while'], ['needs-you', 2.2, 'You are back'], ['idle', 1.6, 'Back to idle']] },
]

/* ---------------- vector targets ---------------- */
const BASE = { sx: 1, sy: 1, lid: 0, tilt: 0, happy: 0, squint: 0, gap: 1, rot: 0 }
const KEYS = Object.keys(BASE)
const V = {
  idle: {},
  listening: { sx: 1.06, sy: 1.12 },
  thinking: { sx: 0.96, sy: 0.86, lid: 0.2 },
  talking: { happy: 0.1 },
  done: { sx: 1.32, sy: 1.16, happy: 0.85 },
  celebrating: { sx: 1.38, sy: 1.2, happy: 1 },
  'needs-you': { sx: 1.32, sy: 1.22 },
  worried: { sx: 0.92, sy: 0.94, lid: 0.12, tilt: -0.45 },
  mad: { sx: 1.08, sy: 0.88, lid: 0.3, tilt: 0.6, squint: 0.24 },
  confused: { L: { sx: 1.12, sy: 1.2 }, R: { sx: 0.9, sy: 0.72, lid: 0.28, tilt: -0.25 } },
  resting: { sy: 0.96, lid: 0.55 },
  sleepy: { lid: 0.76 },
}
/** Seconds between blinks per mood (0: never blinks). */
const BLINK = { idle: 3.6, listening: 4.2, thinking: 5, talking: 3.2, done: 0, celebrating: 0, 'needs-you': 4, worried: 2.4, mad: 5.5, confused: 3, resting: 6, sleepy: 0 }

/* ---------------- blocky eyes ---------------- */
// Left eye sprites, 3 wide by 5 tall. On the 16 x 8 Pill grid the left eye sits on columns 4 to 6 and rows 1 to 5;
// the right eye is the mirror image on columns 11 to 9.
const SPRITES = {
  normal: ['...', '.#.', '.#.', '.#.', '...'],
  short: ['...', '...', '.#.', '.#.', '...'],
  big: ['##.', '##.', '##.', '##.', '...'],
  happy: ['...', '.#.', '#.#', '...', '...'],
  closed: ['...', '...', '...', '###', '...'],
  heavy: ['...', '...', '###', '.#.', '...'],
  mad: ['...', '#..', '##.', '###', '...'],
  worried: ['...', '..#', '.##', '###', '...'],
}
const PX = {
  idle: ['normal', 'normal'], listening: ['big', 'big'], thinking: ['short', 'short'], talking: ['normal', 'normal'],
  done: ['happy', 'happy'], celebrating: ['happy', 'happy'], 'needs-you': ['big', 'big'], worried: ['worried', 'worried'],
  mad: ['mad', 'mad'], confused: ['big', 'short'], resting: ['heavy', 'heavy'], sleepy: ['closed', 'closed'],
}

/* ---------------- state ---------------- */
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
const zero = () => Object.fromEntries(KEYS.map((k) => [k, 0]))
export function createEyes(seed = 1) {
  return {
    mood: 'idle', since: 0, t: 0, rand: rng(seed),
    p: { L: { ...BASE }, R: { ...BASE } }, v: { L: zero(), R: zero() },
    look: { x: 0, y: 0 }, lookV: { x: 0, y: 0 }, glance: { x: 0, y: 0, until: 0, next: 1.5 + seed % 3 },
    blink: 0, blinkAt: -1, nextBlink: 1 + (seed % 5) * 0.4, double: false,
    body: { tx: 0, ty: 0, sc: 1, rot: 0 }, rotV: 0,
  }
}
export function setMood(st, mood) { if (st.mood !== mood) { st.mood = mood; st.since = st.t } }

/** A rough speech rhythm, 0 to 1. */
const voice = (t) => Math.min(1, Math.max(0, 0.5 + 0.5 * Math.sin(t * 13.1) * Math.sin(t * 3.7 + 1) + 0.25 * Math.sin(t * 23.3)))
const spring = (x, v, target, dt, k, zeta) => { const c = 2 * Math.sqrt(k) * zeta; v += (k * (target - x) - c * v) * dt; return [x + v * dt, v] }

/**
 * Advance the eyes. pointer: where the cursor is relative to this Pill, about -1 to 1 on each axis (or null).
 * rm: reduced motion, which snaps to each mood's still pose with no blinks, glances or body moves.
 */
export function stepEyes(st, t, dt, pointer, rm = false) {
  dt = Math.min(Math.max(dt, 0), 1 / 20)
  st.t = t
  const m = st.mood, age = t - st.since, pre = V[m] ?? {}
  const shared = Object.fromEntries(Object.entries(pre).filter(([k]) => k !== 'L' && k !== 'R'))

  for (const side of ['L', 'R']) {
    const tg = { ...BASE, ...shared, ...(pre[side] ?? {}) }
    if (!rm) {
      if (m === 'done' && age < 0.35) tg.happy = 0 // grow first, then smile
      if (m === 'needs-you') { const p = Math.max(0, Math.sin((age - 1.2) * 4)) ** 8 * (age > 1.2 ? 1 : 0); tg.sx += 0.07 * p; tg.sy += 0.07 * p }
      if (m === 'talking') tg.sy *= 0.72 + 0.32 * voice(t)
      if (m === 'sleepy') tg.lid = Math.sin(t * 0.55) > 0.96 ? 0.5 : 0.74 + 0.05 * Math.sin(t * 1.3)
      if (m === 'resting') tg.lid += 0.06 * Math.sin(t * 0.9)
    }
    for (const k of KEYS) {
      if (rm) { st.p[side][k] = tg[k]; st.v[side][k] = 0; continue }
      const soft = k === 'lid' || k === 'tilt' || k === 'squint'
      ;[st.p[side][k], st.v[side][k]] = spring(st.p[side][k], st.v[side][k], tg[k], dt, soft ? 200 : 260, soft ? 0.75 : 0.5)
    }
  }

  // Where it looks.
  let lx = 0, ly = 0
  const px = pointer ? Math.max(-1, Math.min(1, pointer.x)) : 0, py = pointer ? Math.max(-1, Math.min(1, pointer.y)) : 0
  const g = st.glance
  if (t > g.next) { g.x = (st.rand() * 2 - 1) * 0.8; g.y = (st.rand() * 2 - 1) * 0.5; g.until = t + 0.5 + st.rand() * 0.7; g.next = t + 2 + st.rand() * 3.5 }
  const glancing = t < g.until
  switch (m) {
    case 'idle': lx = glancing ? g.x : px * 0.7; ly = glancing ? g.y : py * 0.6; break
    case 'listening': lx = px * 0.9; ly = py * 0.7; break
    case 'thinking': lx = 0.6 * Math.sin((age * Math.PI * 2) / 2.4); ly = -0.6; break
    case 'talking': lx = px * 0.3 + (glancing ? g.x * 0.3 : 0); ly = 0.05; break
    case 'done': case 'celebrating': lx = 0; ly = -0.1; break
    case 'needs-you': lx = -0.35; ly = 0; break
    case 'worried': lx = glancing ? g.x * 0.6 : -0.3; ly = 0.45; break
    case 'mad': lx = 0; ly = 0.12; break
    case 'confused': lx = -0.45; ly = -0.5; break
    case 'resting': lx = 0.1; ly = 0.55; break
    case 'sleepy': lx = 0; ly = 0.6; break
  }
  if (rm) { st.look.x = lx; st.look.y = ly; st.lookV.x = st.lookV.y = 0 }
  else {
    ;[st.look.x, st.lookV.x] = spring(st.look.x, st.lookV.x, lx, dt, 170, 0.8)
    ;[st.look.y, st.lookV.y] = spring(st.look.y, st.lookV.y, ly, dt, 170, 0.8)
  }

  // Blinks: a quick close and a slower open, sometimes twice.
  const gap = BLINK[m] ?? 3.6
  if (rm || !gap || (m === 'needs-you' && age < 2.5)) { st.blink = 0; st.nextBlink = Math.max(st.nextBlink, t + 0.8) }
  else {
    if (t >= st.nextBlink) { st.blinkAt = t; st.double = st.rand() < 0.18; st.nextBlink = t + gap * (0.6 + 0.8 * st.rand()) }
    const dur = m === 'resting' ? 0.5 : 0.19
    const b = (u) => (u < 0 || u > 1 ? 0 : u < 0.37 ? u / 0.37 : 1 - (u - 0.37) / 0.63)
    st.blink = Math.max(b((t - st.blinkAt) / dur), st.double ? b((t - st.blinkAt - dur - 0.07) / dur) : 0)
  }

  // The body: breathing, plus a hop, a pop, a shake or a tilt for some moods.
  const B = st.body
  if (rm) { B.tx = 0; B.ty = 0; B.sc = 1; B.rot = 0; return st }
  B.sc = 1 + 0.012 * Math.sin((t * Math.PI * 2) / 4.2)
  B.tx = 0; B.ty = 0
  if (m === 'celebrating') { const h = Math.abs(Math.sin(t * 6.5)); B.ty = -0.09 * h; B.sc += 0.035 * (1 - h) ** 6 }
  if (m === 'done') B.ty = -0.07 * Math.exp(-age * 4) * Math.abs(Math.sin(age * 11))
  if (m === 'needs-you') B.sc += 0.09 * Math.exp(-age * 5) * Math.cos(age * 17) + 0.02 * Math.max(0, Math.sin((age - 1.2) * 4)) ** 8 * (age > 1.2 ? 1 : 0)
  if (m === 'mad') { B.tx = 0.025 * Math.sin(age * 58) * Math.exp(-age * 3.5); B.ty = 0.01 }
  if (m === 'worried') B.tx = 0.005 * Math.sin(t * 41)
  if (m === 'sleepy') { B.ty = 0.03; B.sc += 0.012 * Math.sin(t * 1.3) }
  if (m === 'resting') B.ty = 0.015
  ;[B.rot, st.rotV] = spring(B.rot, st.rotV, m === 'confused' ? -6 : 0, dt, 120, 0.6)
  return st
}

/**
 * The two eyes for vector drawing. G is the Pill's body box: { cx, cy, W, H }.
 * Returns, per eye: center, size, corner radius, rotation, and a clip path for the lids.
 */
export function vectorEyes(st, G) {
  const w0 = Math.min(11, G.H * 0.21), h0 = Math.min(20, G.H * 0.375), spread = G.W * 0.145
  return ['L', 'R'].map((side) => {
    const p = st.p[side], s = side === 'L' ? 1 : -1 // s: which way is inward, toward the other eye
    const x = G.cx - s * spread * p.gap + st.look.x * G.W * 0.075
    const y = G.cy + st.look.y * G.H * 0.11
    const w = w0 * Math.max(0.2, p.sx), h = h0 * Math.max(0.15, p.sy)
    const top = y - h / 2, bot = y + h / 2, pad = w * 0.8 + 2
    const lid = Math.min(0.94, Math.max(0, p.lid + (1 - p.lid) * st.blink * 0.94))
    const yMid = top + h * lid, slope = p.tilt * h * 0.55
    const topAt = (xx) => yMid + slope * ((xx - x) / (w / 2)) * s
    const be = bot + 1 - Math.max(0, p.squint) * h * 0.45
    const ym = be - Math.min(1, Math.max(0, p.happy)) * (be - (top + h * 0.36))
    const L = x - w / 2 - pad, R = x + w / 2 + pad
    const clip = `M${L.toFixed(2)} ${topAt(L).toFixed(2)} L${R.toFixed(2)} ${topAt(R).toFixed(2)} L${R.toFixed(2)} ${be.toFixed(2)} Q${x.toFixed(2)} ${(2 * ym - be).toFixed(2)} ${L.toFixed(2)} ${be.toFixed(2)} Z`
    return { x, y, w, h, r: Math.min(w, h) / 2, rot: p.rot * s, clip }
  })
}

/** The eye cells for the blocky Pill on its 16 x 8 grid: [[x, y], ...]. */
export function pixelEyes(st) {
  const m = st.mood, age = st.t - st.since
  let [l, r] = PX[m] ?? PX.idle
  if (m === 'done' && age < 0.4) l = r = 'big'
  if (m === 'talking' && voice(st.t) < 0.42) l = r = 'short'
  if (m === 'sleepy' && Math.sin(st.t * 0.55) > 0.96) l = r = 'short'
  if (st.blink > 0.45) l = r = 'closed'
  let dx = Math.round(st.look.x * 1.15), dy = Math.round(st.look.y * 1.1)
  if (m === 'celebrating') dy -= Math.round(Math.abs(Math.sin(st.t * 6.5)))
  const out = []
  for (const [name, side] of [[l, 'L'], [r, 'R']]) {
    SPRITES[name].forEach((row, ry) => [...row].forEach((ch, cx) => {
      if (ch === '#') out.push([(side === 'L' ? 4 + cx : 11 - cx) + dx, 1 + ry + dy])
    }))
  }
  return out
}
