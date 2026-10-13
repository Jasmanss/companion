// The Pill's eyes: one expression model for every mood, used by the glass, flat and blocky views.
//
// Each eye is a pill shape cut by two lids:
//   - a top lid that drops (lid) and tilts (tilt: + is angry, inner corners down; - is worried, inner corners up)
//   - a bottom lid that pushes up into an arch (happy, the ^ shape) or flat (squint)
// plus size (sx, sy), spacing (gap) and a little rotation (rot). Two values belong to single moods:
//   - merge: the eyes stretch toward each other into one bar (thinking), with a glint moving along it
//   - closed: the eyes become soft curved lines (sleepy)
// Every value springs toward its mood target with a slight overshoot, so a change of mood pops instead of
// sliding. On top of that: blinks, where the eyes look, and small body moves. Blocky gets hand-drawn pixel eyes
// per mood instead, since pixel art reads better drawn than shrunk.
//
// State is plain data, so the app can port this as it is: createEyes(), setMood(), stepEyes() every frame.

export const MOODS = [
  { id: 'idle', label: 'Idle', when: 'Nothing going on. It glances around and follows your cursor.' },
  { id: 'listening', label: 'Listening', when: 'You opened the panel or started talking. Eyes a little bigger.' },
  { id: 'thinking', label: 'Thinking', when: 'Working out a reply or running a tool. The eyes join into one bar with a glint sweeping along it.' },
  { id: 'talking', label: 'Talking', when: 'Answering you. The eyes bounce with the words.' },
  { id: 'done', label: 'Happy', when: 'A task finished. Eyes grow, then turn into happy arches.' },
  { id: 'celebrating', label: 'Celebrating', when: 'A PR merged or a deploy went live. Happy arches and a hop.' },
  { id: 'needs-you', label: 'Surprised', when: 'Something needs your OK. Big round eyes, a pop, then a pulse.' },
  { id: 'worried', label: 'Worried', when: 'Something looks off, like a slow or flaky check. Inner corners up, a slight tremble.' },
  { id: 'mad', label: 'Mad', when: 'A deploy failed or a test broke. Angry lids and a shake.', isNew: true },
  { id: 'confused', label: 'Confused', when: 'It did not understand you. One eye big, one squinting, head tilted.', isNew: true },
  { id: 'resting', label: 'Resting', when: 'Tucked away but awake: heavy lids, a slow standby glow, a lazy glance now and then. Wakes a little when your cursor comes near.' },
  { id: 'sleepy', label: 'Sleepy', when: 'You have been away a while. Eyes closed in soft curves, Z\'s drifting up, slow breathing.' },
]

/** The glint that moves along the thinking bar. */
export const GLINTS = { sweep: 'Thinking: a smooth sweep', step: 'Reading a file: a stepped sweep', search: 'Searching the web: a small circle' }

/** Short stories of real tasks: [mood, seconds, what is happening, glint for thinking steps]. */
export const STORIES = [
  { id: 'works', label: 'A task works', steps: [['listening', 1.6, 'You ask it to fix a failing test'], ['thinking', 2.6, 'Working out a plan'], ['talking', 2.4, 'Telling you the plan'], ['thinking', 2.2, 'Running the tests'], ['done', 3.2, 'All tests pass'], ['idle', 2, 'Back to idle']] },
  { id: 'read', label: 'Reading a file', steps: [['listening', 1.4, 'You ask what a file does'], ['thinking', 3.4, 'Reading src/main/agent.ts', 'step'], ['talking', 2.4, 'Explaining it'], ['idle', 1.6, 'Back to idle']] },
  { id: 'search', label: 'Searching the web', steps: [['listening', 1.4, 'You ask about a new API'], ['thinking', 3.6, 'Searching the web', 'search'], ['talking', 2.4, 'Summing up what it found'], ['idle', 1.6, 'Back to idle']] },
  { id: 'fails', label: 'A deploy fails', steps: [['idle', 1.4, 'All quiet'], ['mad', 3, 'The deploy failed'], ['thinking', 2.4, 'Reading the build log', 'step'], ['talking', 2.4, 'Found it: a missing environment variable'], ['idle', 1.6, 'Back to idle']] },
  { id: 'ok', label: 'It needs your OK', steps: [['thinking', 2, 'About to run a command'], ['needs-you', 3.2, 'Waiting for your OK'], ['done', 2.6, 'You said yes'], ['idle', 1.6, 'Back to idle']] },
  { id: 'confused', label: 'It gets confused', steps: [['listening', 1.6, 'You ask something vague'], ['confused', 2.8, 'Not sure what you mean'], ['talking', 2.2, 'Asking you a question'], ['idle', 1.6, 'Back to idle']] },
  { id: 'merge', label: 'A PR merges', steps: [['idle', 1.2, 'All quiet'], ['celebrating', 3.6, 'Your PR merged'], ['idle', 1.6, 'Back to idle']] },
  { id: 'away', label: 'You step away', steps: [['idle', 2, 'All quiet'], ['resting', 5, 'Tucked away'], ['sleepy', 5, 'You have been away a while'], ['needs-you', 2.2, 'You are back'], ['idle', 1.6, 'Back to idle']] },
]

/* ---------------- vector targets ---------------- */
const BASE = { sx: 1, sy: 1, lid: 0, tilt: 0, happy: 0, squint: 0, gap: 1, rot: 0, merge: 0, closed: 0 }
const KEYS = Object.keys(BASE)
const SOFT = new Set(['lid', 'tilt', 'squint', 'closed'])
const V = {
  idle: {},
  listening: { sx: 1.06, sy: 1.12 },
  thinking: { merge: 1, sy: 0.36 }, // sy is how thick the bar is, as a share of an eye's height
  talking: { happy: 0.1 },
  done: { sx: 1.32, sy: 1.16, happy: 0.85 },
  celebrating: { sx: 1.38, sy: 1.2, happy: 1 },
  'needs-you': { sx: 1.32, sy: 1.22 },
  worried: { sx: 0.92, sy: 0.94, lid: 0.12, tilt: -0.45 },
  mad: { sx: 1.08, sy: 0.88, lid: 0.3, tilt: 0.6, squint: 0.24 },
  confused: { L: { sx: 1.12, sy: 1.2 }, R: { sx: 0.9, sy: 0.72, lid: 0.28, tilt: -0.25 } },
  resting: { sy: 0.96, lid: 0.56 },
  sleepy: { closed: 1 },
}
/** Seconds between blinks per mood (0: never blinks). */
const BLINK = { idle: 3.6, listening: 4.2, thinking: 0, talking: 3.2, done: 0, celebrating: 0, 'needs-you': 4, worried: 2.4, mad: 5.5, confused: 3, resting: 7, sleepy: 0 }

/* ---------------- blocky eyes ---------------- */
// Left eye sprites, 3 wide by 5 tall. On the 16 x 8 Pill grid the left eye sits on columns 4 to 6 and rows 1 to 5;
// the right eye is the mirror image on columns 11 to 9.
const SPRITES = {
  normal: ['...', '.#.', '.#.', '.#.', '...'],
  short: ['...', '...', '.#.', '.#.', '...'],
  big: ['##.', '##.', '##.', '##.', '...'],
  happy: ['...', '.#.', '#.#', '...', '...'],
  closed: ['...', '...', '...', '###', '...'],
  heavy: ['...', '###', '.#.', '.#.', '...'], // a lid line over an open eye: awake, unlike sleepy's curve
  mad: ['...', '#..', '##.', '###', '...'],
  worried: ['...', '..#', '.##', '###', '...'],
  asleep: ['...', '...', '#.#', '.#.', '...'], // a soft curve, ends up, middle down
  dash: ['...', '...', '###', '...', '...'], // half way to the thinking bar
}
const PX = {
  idle: ['normal', 'normal'], listening: ['big', 'big'], thinking: ['normal', 'normal'], talking: ['normal', 'normal'],
  done: ['happy', 'happy'], celebrating: ['happy', 'happy'], 'needs-you': ['big', 'big'], worried: ['worried', 'worried'],
  mad: ['mad', 'mad'], confused: ['big', 'short'], resting: ['heavy', 'heavy'], sleepy: ['asleep', 'asleep'],
}
/** Pixel Z's in three sizes. */
export const ZSPRITES = {
  z3: ['###', '.#.', '###'],
  z4: ['####', '..#.', '.#..', '####'],
  z5: ['#####', '...#.', '..#..', '.#...', '#####'],
}

/* ---------------- state ---------------- */
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
const zero = () => Object.fromEntries(KEYS.map((k) => [k, 0]))
export function createEyes(seed = 1) {
  return {
    mood: 'idle', since: 0, t: 0, rand: rng(seed), glint: 'sweep', rm: false,
    p: { L: { ...BASE }, R: { ...BASE } }, v: { L: zero(), R: zero() },
    look: { x: 0, y: 0 }, lookV: { x: 0, y: 0 }, glance: { x: 0, y: 0, until: 0, next: 1.5 + (seed % 3) },
    rest: { until: 0, next: 4 + (seed % 4) },
    blink: 0, blinkAt: -1, nextBlink: 1 + (seed % 5) * 0.4, double: false,
    body: { tx: 0, ty: 0, sc: 1, rot: 0 }, rotV: 0,
  }
}
/** Change mood. glint picks the thinking variant: 'sweep' (default), 'step' or 'search'. */
export function setMood(st, mood, glint = 'sweep') {
  if (mood === 'thinking') st.glint = glint || 'sweep'
  if (st.mood === mood) return
  // Leaving thinking: the bar splits back into two eyes with a small pop.
  if (st.mood === 'thinking') for (const s of ['L', 'R']) { st.v[s].sx += 2.6; st.v[s].sy += 3.4 }
  st.mood = mood
  st.since = st.t
}

/** A rough speech rhythm, 0 to 1. */
const voice = (t) => Math.min(1, Math.max(0, 0.5 + 0.5 * Math.sin(t * 13.1) * Math.sin(t * 3.7 + 1) + 0.25 * Math.sin(t * 23.3)))
const spring = (x, v, target, dt, k, zeta) => { const c = 2 * Math.sqrt(k) * zeta; v += (k * (target - x) - c * v) * dt; return [x + v * dt, v] }

/**
 * Advance the eyes. pointer: where the cursor is relative to this Pill, about -1 to 1 on each axis (or null).
 * rm: reduced motion, which snaps to each mood's still pose with no blinks, glances or body moves.
 * dt may be large (resting runs at a low frame rate); springs take small steps inside.
 */
export function stepEyes(st, t, dt, pointer, rm = false) {
  dt = Math.min(Math.max(dt, 0), 0.25)
  st.t = t
  st.rm = rm
  const m = st.mood, age = t - st.since, pre = V[m] ?? {}
  const shared = Object.fromEntries(Object.entries(pre).filter(([k]) => k !== 'L' && k !== 'R'))
  const px = pointer ? Math.max(-1.5, Math.min(1.5, pointer.x)) : 0, py = pointer ? Math.max(-1.5, Math.min(1.5, pointer.y)) : 0
  const near = !!pointer && Math.hypot(pointer.x, pointer.y) < 0.9

  // Resting: a lazy glance toward the middle of the screen every 8 to 12 seconds.
  const R = st.rest
  if (m === 'resting' && !rm && t > R.next) { R.until = t + 1.5; R.next = t + 8 + st.rand() * 4 }
  const restGlance = m === 'resting' && !rm && t < R.until

  const targets = {}
  for (const side of ['L', 'R']) {
    const tg = { ...BASE, ...shared, ...(pre[side] ?? {}) }
    if (!rm) {
      if (m === 'done' && age < 0.35) tg.happy = 0 // grow first, then smile
      if (m === 'needs-you') { const p = Math.max(0, Math.sin((age - 1.2) * 4)) ** 8 * (age > 1.2 ? 1 : 0); tg.sx += 0.07 * p; tg.sy += 0.07 * p }
      if (m === 'talking') tg.sy *= 0.72 + 0.32 * voice(t)
      if (m === 'resting' && near && !restGlance) tg.lid = 0.28 // the cursor came close: lids lift
    }
    targets[side] = tg
  }

  // Where it looks.
  let lx = 0, ly = 0
  const g = st.glance
  if (t > g.next) { g.x = (st.rand() * 2 - 1) * 0.8; g.y = (st.rand() * 2 - 1) * 0.5; g.until = t + 0.5 + st.rand() * 0.7; g.next = t + 2 + st.rand() * 3.5 }
  const glancing = t < g.until
  switch (m) {
    case 'idle': lx = glancing ? g.x : px * 0.7; ly = glancing ? g.y : py * 0.6; break
    case 'listening': lx = px * 0.9; ly = py * 0.7; break
    case 'thinking': lx = 0; ly = -0.25; break // the glint does the moving
    case 'talking': lx = px * 0.3 + (glancing ? g.x * 0.3 : 0); ly = 0.05; break
    case 'done': case 'celebrating': lx = 0; ly = -0.1; break
    case 'needs-you': lx = -0.35; ly = 0; break
    case 'worried': lx = glancing ? g.x * 0.6 : -0.3; ly = 0.45; break
    case 'mad': lx = 0; ly = 0.12; break
    case 'confused': lx = -0.45; ly = -0.5; break
    case 'resting': if (restGlance) { lx = -0.8; ly = 0.05 } else if (near && !rm) { lx = px * 0.4; ly = 0.2 + py * 0.25 } else { lx = 0.1; ly = 0.45 } break
    case 'sleepy': lx = 0; ly = 0.35; break
  }

  // Springs, in small steps so a low frame rate stays stable.
  const n = rm ? 1 : Math.max(1, Math.ceil(dt / (1 / 60))), h = dt / n
  for (let i = 0; i < n; i++) {
    for (const side of ['L', 'R']) for (const k of KEYS) {
      const tgt = targets[side][k]
      if (rm) { st.p[side][k] = tgt; st.v[side][k] = 0; continue }
      const soft = SOFT.has(k)
      ;[st.p[side][k], st.v[side][k]] = spring(st.p[side][k], st.v[side][k], tgt, h, k === 'merge' ? 150 : soft ? 200 : 260, k === 'merge' ? 0.42 : soft ? 0.75 : 0.5)
    }
    if (rm) { st.look.x = lx; st.look.y = ly; st.lookV.x = st.lookV.y = 0 }
    else {
      const lk = m === 'resting' ? 60 : 170 // resting looks around lazily
      ;[st.look.x, st.lookV.x] = spring(st.look.x, st.lookV.x, lx, h, lk, 0.85)
      ;[st.look.y, st.lookV.y] = spring(st.look.y, st.lookV.y, ly, h, lk, 0.85)
    }
  }

  // Blinks: a quick close and a slower open, sometimes twice. Resting blinks slowly.
  const gap = BLINK[m] ?? 3.6
  if (rm || !gap || (m === 'needs-you' && age < 2.5)) { st.blink = 0; st.nextBlink = Math.max(st.nextBlink, t + 0.8) }
  else {
    if (t >= st.nextBlink) { st.blinkAt = t; st.double = m !== 'resting' && st.rand() < 0.18; st.nextBlink = t + gap * (0.6 + 0.8 * st.rand()) }
    const dur = m === 'resting' ? 0.7 : 0.19
    const b = (u) => (u < 0 || u > 1 ? 0 : u < 0.37 ? u / 0.37 : 1 - (u - 0.37) / 0.63)
    st.blink = Math.max(b((t - st.blinkAt) / dur), st.double ? b((t - st.blinkAt - dur - 0.07) / dur) : 0)
  }

  // The body: breathing, plus a hop, a pop, a shake or a tilt for some moods. Resting keeps still to stay cheap.
  const B = st.body
  if (rm || m === 'resting') { B.tx = 0; B.ty = 0; B.sc = 1; B.rot = rm ? 0 : B.rot * 0.5; st.rotV = 0; return st }
  B.sc = 1 + 0.012 * Math.sin((t * Math.PI * 2) / 4.2)
  B.tx = 0; B.ty = 0
  if (m === 'celebrating') { const hop = Math.abs(Math.sin(t * 6.5)); B.ty = -0.09 * hop; B.sc += 0.035 * (1 - hop) ** 6 }
  if (m === 'done') B.ty = -0.07 * Math.exp(-age * 4) * Math.abs(Math.sin(age * 11))
  if (m === 'needs-you') B.sc += 0.09 * Math.exp(-age * 5) * Math.cos(age * 17) + 0.02 * Math.max(0, Math.sin((age - 1.2) * 4)) ** 8 * (age > 1.2 ? 1 : 0)
  if (m === 'mad') { B.tx = 0.025 * Math.sin(age * 58) * Math.exp(-age * 3.5); B.ty = 0.01 }
  if (m === 'worried') B.tx = 0.005 * Math.sin(t * 41)
  if (m === 'sleepy') { const br = 0.5 - 0.5 * Math.cos((t * Math.PI * 2) / 4.6); B.sc = 1 + 0.03 * br; B.ty = 0.035 * br } // slow breathing
  ;[B.rot, st.rotV] = spring(B.rot, st.rotV, m === 'confused' ? -6 : 0, dt, 120, 0.6)
  return st
}

/** Where the glint is along the thinking bar, 0 (left) to 1 (right), and a small bob for the search circle. */
export function glintAt(st) {
  const age = st.t - st.since
  if (st.rm) return { u: 0.5, bob: 0 }
  if (st.glint === 'step') { const i = Math.floor(age / 0.3) % 6; return { u: Math.min(i, 4) / 4, bob: 0 } } // reads in steps, pauses, starts over
  if (st.glint === 'search') return { u: 0.5 + 0.42 * Math.sin((age * Math.PI * 2) / 2.2), bob: Math.sin((age * Math.PI * 2) / 1.1) }
  return { u: 0.5 - 0.5 * Math.cos((age * Math.PI * 2) / 1.6), bob: 0 }
}

/**
 * The two eyes for vector drawing. G is the Pill's body box: { cx, cy, W, H }.
 * Returns { eyes, merge, glint }. Per eye: the rectangle (which stretches toward the other eye as they merge),
 * its corner radius, rotation, a clip path for the lids, and the closed-eye curve for sleepy.
 */
export function vectorEyes(st, G) {
  const w0 = Math.min(11, G.H * 0.21), h0 = Math.min(20, G.H * 0.375), spread = G.W * 0.145
  const m = (st.p.L.merge + st.p.R.merge) / 2
  const d = 2 * spread
  const eyes = ['L', 'R'].map((side) => {
    const p = st.p[side], s = side === 'L' ? 1 : -1 // s: which way is inward, toward the other eye
    // A merge below zero (the overshoot as the bar splits) pushes the eyes a little apart: the pop.
    const x = G.cx - s * spread * p.gap - s * Math.min(0, m) * d * 0.35 + st.look.x * G.W * 0.075
    const y = G.cy + st.look.y * G.H * 0.11
    const w = w0 * Math.max(0.2, p.sx), h = h0 * Math.max(0.15, p.sy)
    const ext = Math.max(0, Math.min(1.05, m)) * d
    const left = s > 0 ? x - w / 2 : x - w / 2 - ext, right = s > 0 ? x + w / 2 + ext : x + w / 2
    const top = y - h / 2, bot = y + h / 2, pad = w * 0.8 + 2
    const lid = Math.min(0.94, Math.max(0, p.lid + (1 - p.lid) * st.blink * 0.94))
    const yMid = top + h * lid, slope = p.tilt * h * 0.55
    const topAt = (xx) => yMid + slope * ((xx - x) / (w / 2)) * s
    const be = bot + 1 - Math.max(0, p.squint) * h * 0.45
    const ym = be - Math.min(1, Math.max(0, p.happy)) * (be - (top + h * 0.36))
    const L = left - pad, R = right + pad
    const f = (v) => v.toFixed(2)
    const clip = `M${f(L)} ${f(topAt(L))} L${f(R)} ${f(topAt(R))} L${f(R)} ${f(be)} Q${f(x)} ${f(2 * ym - be)} ${f(L)} ${f(be)} Z`
    // Closed: a soft curve, ends up and middle down, a little wider than the open eye.
    const hw = Math.max(w0 * 0.95, w * 0.9), cy = y + h0 * 0.05
    const arc = `M${f(x - hw)} ${f(cy - h0 * 0.06)} Q${f(x)} ${f(cy + h0 * 0.34)} ${f(x + hw)} ${f(cy - h0 * 0.06)}`
    return { x: (left + right) / 2, y, w: right - left, h, r: Math.min(right - left, h) / 2, rot: p.rot * s, clip, closed: Math.min(1, Math.max(0, p.closed)), arc, arcWidth: Math.max(2.2, w0 * 0.42), cx: x }
  })
  let glint = null
  if (m > 0.55 && st.mood === 'thinking') {
    const [a, b] = eyes, x0 = a.x - a.w / 2, x1 = b.x + b.w / 2, hh = (a.h + b.h) / 2, r = hh / 2
    const { u, bob } = glintAt(st)
    glint = { kind: st.glint, x: x0 + r + u * (x1 - x0 - 2 * r), y: (a.y + b.y) / 2 + bob * hh * 0.25, size: hh, alpha: Math.min(1, (m - 0.55) / 0.35) }
  }
  return { eyes, merge: Math.max(0, m), glint }
}

/** The Z's floating up from the Pill's top right corner while sleepy: [{ x, y, s, a }] in design units. */
export function zees(st, G, small) {
  if (st.mood !== 'sleepy') return []
  const age = st.t - st.since, fade = st.rm ? 1 : Math.min(1, age / 0.8)
  const one = (u, a) => ({ x: G.x1 - 10 + u * 16, y: G.y0 + 2 - u * 30, s: 6 + u * 6, a: a * fade })
  if (small) {
    const u = st.rm ? 0.45 : ((age / 2.8) % 1)
    const a = st.rm ? 1 : u < 0.2 ? u / 0.2 : u > 0.75 ? (1 - u) / 0.25 : 1
    return [{ x: G.x1 - 6 + u * 4, y: G.y0 - 5 - u * 7, s: 13, a: a * fade }]
  }
  if (st.rm) return [one(0.15, 1), one(0.5, 0.8), one(0.85, 0.6)]
  return [0, 1, 2].map((i) => {
    const u = ((age / 3.6) + i / 3) % 1
    return one(u, u < 0.15 ? u / 0.15 : u > 0.7 ? (1 - u) / 0.3 : 1)
  })
}

/**
 * The blocky Pill's eye cells on its 16 x 8 grid: [{ x, y, hi }] where hi marks the thinking glint.
 */
export function pixelEyes(st) {
  const m = st.mood, age = st.t - st.since, merge = (st.p.L.merge + st.p.R.merge) / 2
  let [l, r] = PX[m] ?? PX.idle
  if (m === 'done' && age < 0.4) l = r = 'big'
  if (m === 'talking' && voice(st.t) < 0.42) l = r = 'short'
  const blinkable = !['sleepy', 'thinking'].includes(m)
  if (blinkable && st.blink > 0.45) l = r = 'closed'
  let dx = Math.round(st.look.x * 1.15), dy = Math.round(st.look.y * 1.1)
  if (m === 'celebrating') dy -= Math.round(Math.abs(Math.sin(st.t * 6.5)))
  if (m === 'sleepy') dy = 0
  const out = []
  // Thinking: the eyes stretch into dashes, then one bar with a moving highlight.
  if (merge > 0.3) {
    if (merge < 0.7) { l = r = 'dash' }
    else {
      for (let x = 4; x <= 11; x++) out.push({ x, y: 3, hi: false })
      if (m === 'thinking') {
        const { u, bob } = glintAt(st)
        const c = 4 + Math.round(u * 7)
        if (st.glint === 'search') {
          // A small moving plus: dark ticks above and below the bar around a lit center, bobbing a little.
          const by = Math.round(bob * 0.6)
          out.push({ x: c, y: 2 + by, hi: false }, { x: c, y: 4 + by, hi: false })
          const cell = out.find((o) => o.x === c && o.y === 3)
          if (cell) cell.hi = true
        } else {
          const cell = out.find((o) => o.x === c && o.y === 3)
          if (cell) cell.hi = true
        }
      }
      return out
    }
    dx = 0; dy = 0
  }
  const apart = merge < -0.12 ? 1 : 0 // the pop as the bar splits
  for (const [name, side] of [[l, 'L'], [r, 'R']]) {
    SPRITES[name].forEach((row, ry) => [...row].forEach((ch, cx) => {
      if (ch === '#') out.push({ x: (side === 'L' ? 4 + cx - apart : 11 - cx + apart) + dx, y: 1 + ry + dy, hi: false })
    }))
  }
  return out
}

/** The blocky Z's: [{ sprite, x, y, a }] in grid cells, drifting up and right from above the top right corner. */
export function pixelZees(st, small) {
  if (st.mood !== 'sleepy') return []
  const age = st.t - st.since, fade = st.rm ? 1 : Math.min(1, age / 0.8)
  if (small) {
    const u = st.rm ? 0.4 : ((age / 2.8) % 1)
    const a = st.rm ? 1 : u < 0.2 ? u / 0.2 : u > 0.75 ? (1 - u) / 0.25 : 1
    return [{ sprite: 'z4', x: 13, y: -3 - Math.round(u), a: a * fade }]
  }
  const one = (u, a) => ({ sprite: u < 0.34 ? 'z3' : u < 0.67 ? 'z4' : 'z5', x: 13 + Math.round(u * 4), y: -4 - Math.round(u * 8), a: a * fade })
  if (st.rm) return [one(0.1, 1), one(0.5, 0.8), one(0.9, 0.6)]
  return [0, 1, 2].map((i) => { const u = ((age / 3.6) + i / 3) % 1; return one(u, u < 0.15 ? u / 0.15 : u > 0.7 ? (1 - u) / 0.3 : 1) })
}
