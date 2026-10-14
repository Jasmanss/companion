// The Pill's eyes: one expression model for every mood, drawn by the glass, flat and blocky versions (render.ts).
// Ported from the design page (design/pill/eyes.js), with the thinking style you picked (dots) and without the
// moods the app has no use for yet.
//
// Each eye is a pill shape cut by two lids:
//   - a top lid that drops (lid) and tilts (tilt: + is angry, inner corners down; - is worried, inner corners up)
//   - a bottom lid that pushes up into an arch (happy, the ^ shape) or flat (squint)
// plus size (sx, sy) and spacing (gap). Two values belong to single moods:
//   - dots: the eyes turn into three dots in a wave, like a typing indicator (thinking)
//   - closed: the eyes become soft curved lines (sleepy)
// Every value springs toward its mood target with a slight overshoot, so a change of mood pops instead of
// sliding. On top of that: blinks, where the eyes look, and small body moves. Blocky gets hand-drawn pixel eyes
// per mood instead, since pixel art reads better drawn than shrunk.
//
// Listening slides the eyes apart toward the Pill's edges, like ears turned toward you, and nods them on each key.
// Talking gets a mouth that changes shape with a made-up speech signal: a closed line, wide open, or a round "o".
// Outside the eyes, some moods also get one mark: "!" and a pulsing ring (needs you), confetti (celebrating),
// a sweat drop (worried), Z's (sleepy).
//
// State is plain data: createEyes(), setStyle(), setMood(), then stepEyes() every frame.
import type { Mood } from '../../../shared/types'

/** What thinking is busy with: thinking (a wave), reading a file (lit in turn) or searching the web (circling). */
export type Glint = 'sweep' | 'step' | 'search'
type Side = 'L' | 'R'
const SIDES: Side[] = ['L', 'R']

/* ---------------- vector targets ---------------- */
// ox, oy: this eye's own look offset. talk: how far the talking mouth is out.
const BASE = { sx: 1, sy: 1, lid: 0, tilt: 0, happy: 0, squint: 0, gap: 1, dots: 0, closed: 0, ox: 0, oy: 0, talk: 0 }
type Pose = typeof BASE
type Key = keyof Pose
const KEYS = Object.keys(BASE) as Key[]
const SOFT = new Set<Key>(['lid', 'tilt', 'squint', 'closed', 'ox', 'oy', 'talk'])
/** Spring stiffness and damping per value: the dots form a little slower, the listening slide is soft. */
const SPRING = (k: Key): [number, number] => (k === 'dots' ? [170, 0.5] : k === 'gap' ? [130, 0.55] : SOFT.has(k) ? [200, 0.75] : [260, 0.5])
const V: Record<Mood, Partial<Pose>> = {
  idle: {},
  listening: { gap: 2, sx: 0.92, sy: 1.3 }, // the eyes slide apart toward the edges and grow taller
  thinking: { dots: 1 },
  talking: { happy: 0.08, talk: 1, oy: -0.36, sy: 0.94 }, // the eyes move up and shrink a little to make room for the mouth
  done: { sx: 1.32, sy: 1.16, happy: 0.85 },
  celebrating: { sx: 1.38, sy: 1.2, happy: 1 },
  'needs-you': { sx: 1.45, sy: 1.3 },
  worried: { sx: 0.92, sy: 0.94, lid: 0.12, tilt: -0.45 },
  mad: { sx: 1.08, sy: 0.88, lid: 0.3, tilt: 0.6, squint: 0.24 },
  resting: { sy: 0.96, lid: 0.6 },
  sleepy: { closed: 1 },
}
/** Seconds between blinks per mood (0: never blinks). */
const BLINK: Record<Mood, number> = { idle: 3.6, listening: 4.2, thinking: 0, talking: 3.2, done: 0, celebrating: 0, 'needs-you': 4, worried: 2.4, mad: 5.5, resting: 7, sleepy: 0 }

/* ---------------- blocky eyes ---------------- */
// Left eye sprites, 3 wide by 5 tall. On the 16 x 8 Pill grid the left eye sits on columns 4 to 6 and rows 1 to 5;
// the right eye is the mirror image on columns 11 to 9.
const SPRITES = {
  normal: ['...', '.#.', '.#.', '.#.', '...'],
  short: ['...', '...', '.#.', '.#.', '...'],
  tall: ['.#.', '.#.', '.#.', '.#.', '.#.'], // listening
  squint: ['...', '.#.', '.#.', '...', '...'], // talking, on a stressed word: the bottom lid comes up
  big: ['##.', '##.', '##.', '##.', '...'],
  happy: ['...', '.#.', '#.#', '...', '...'],
  closed: ['...', '...', '...', '###', '...'],
  heavy: ['...', '###', '.#.', '.#.', '...'], // a lid line over an open eye: awake, unlike sleepy's curve
  mad: ['...', '#..', '##.', '###', '...'],
  worried: ['...', '..#', '.##', '###', '...'],
  asleep: ['...', '...', '#.#', '.#.', '...'], // a soft curve, ends up, middle down
}
type Sprite = keyof typeof SPRITES
const PX: Record<Mood, [Sprite, Sprite]> = {
  idle: ['normal', 'normal'], listening: ['normal', 'normal'], thinking: ['normal', 'normal'], talking: ['normal', 'normal'],
  done: ['happy', 'happy'], celebrating: ['happy', 'happy'], 'needs-you': ['big', 'big'], worried: ['worried', 'worried'],
  mad: ['mad', 'mad'], resting: ['heavy', 'heavy'], sleepy: ['asleep', 'asleep'],
}
/** Talking's pixel mouths, as [column, row] cells under the eyes (which move up a row to make room). */
const PX_MOUTH = {
  line: [[6, 5], [7, 5], [8, 5], [9, 5]],
  wide: [[5, 5], [6, 5], [7, 5], [8, 5], [9, 5], [10, 5], [6, 6], [7, 6], [8, 6], [9, 6]],
  o: [[7, 5], [8, 5], [7, 6], [8, 6]],
}
/** Pixel Z's in three sizes. */
export const ZSPRITES = {
  z3: ['###', '.#.', '###'],
  z4: ['####', '..#.', '.#..', '####'],
  z5: ['#####', '...#.', '..#..', '.#...', '#####'],
}
/** Pixel corner symbols: a regular set, and a bold set for the tab at the screen edge. */
export const MARK_SPRITES = {
  // "!" is a badge: a solid disc with the "!" cut out of it, so needs-you stands out most.
  bang: ['.###.', '##.##', '##.##', '##.##', '#####', '##.##', '.###.'],
  drop: ['.#.', '###', '###', '.#.'],
  bold: {
    bang: ['.###.', '##.##', '##.##', '##.##', '#####', '##.##', '.###.'],
    drop: ['.#.', '###', '###', '###', '.#.'],
  },
}

/* ---------------- state ---------------- */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const hash = (i: number, k: number) => {
  const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453
  return v - Math.floor(v)
}
const zero = (): Pose => ({ ...BASE, ...Object.fromEntries(KEYS.map((k) => [k, 0])) })

export interface EyesState {
  mood: Mood
  /** When the mood started, in seconds. */
  since: number
  t: number
  rand: () => number
  glint: Glint
  /** Reduced motion, as of the last step. */
  rm: boolean
  /** Talking shows a mouth. */
  mouth: boolean
  /** Lively glances around more, follows the cursor further and moves bigger; calm keeps mostly still. */
  lively: boolean
  p: Record<Side, Pose>
  v: Record<Side, Pose>
  look: { x: number; y: number }
  lookV: { x: number; y: number }
  glance: { x: number; y: number; until: number; next: number }
  rest: { until: number; next: number }
  blink: number
  blinkAt: number
  nextBlink: number
  double: boolean
  body: { tx: number; ty: number; sc: number; rot: number }
  /** When keys were pressed while listening, and how far the eyes are nodding (1: all the way down). */
  keys: number[]
  nod: number
  /** Talking's mouth: how open, how round (an "o"), and whether this syllable is stressed. */
  say: { open: number; round: number; ov: number; rv: number; stress: number }
}

/** New eyes, starting at time t (seconds, the clock stepEyes will be given). */
export function createEyes(seed = 1, t = 0): EyesState {
  return {
    mood: 'idle', since: t, t, rand: rng(seed), glint: 'sweep', rm: false, mouth: true, lively: true,
    p: { L: { ...BASE }, R: { ...BASE } }, v: { L: zero(), R: zero() },
    look: { x: 0, y: 0 }, lookV: { x: 0, y: 0 }, glance: { x: 0, y: 0, until: 0, next: t + 1.5 + (seed % 3) },
    rest: { until: 0, next: t + 4 + (seed % 4) },
    blink: 0, blinkAt: -1, nextBlink: t + 1 + (seed % 5) * 0.4, double: false,
    body: { tx: 0, ty: 0, sc: 1, rot: 0 },
    keys: [], nod: 0,
    say: { open: 0, round: 0, ov: 0, rv: 0, stress: 0 },
  }
}

/** A key was pressed while listening: the eyes nod once. */
export function pressKey(st: EyesState): void {
  st.keys.push(st.t)
  if (st.keys.length > 8) st.keys.shift()
}

/** mouth: false makes talking bounce the eyes instead of showing a mouth. lively: false is the calm personality. */
export function setStyle(st: EyesState, o: { mouth?: boolean; lively?: boolean }): void {
  if (o.mouth !== undefined) st.mouth = o.mouth
  if (o.lively !== undefined) st.lively = o.lively
}

/** Change mood. glint picks what thinking is busy with: 'sweep' (default), 'step' (reading a file) or 'search'. */
export function setMood(st: EyesState, mood: Mood, glint: Glint = 'sweep'): void {
  if (mood === 'thinking') st.glint = glint
  if (st.mood === mood) return
  // Leaving thinking: the dots turn back into two eyes with a small pop.
  if (st.mood === 'thinking') for (const s of SIDES) { st.v[s].sx += 2.6; st.v[s].sy += 3.4 }
  st.mood = mood
  st.since = st.t
}

/**
 * A made-up speech signal: syllables about six a second, short pauses between words, some syllables stressed.
 * Returns targets for the mouth: open (0 to 1), round (0 is wide open, 1 is an "o") and stress (0 or 1).
 */
const SYL = 0.16
function speech(t: number): { open: number; round: number; stress: number } {
  const n = Math.floor(t / SYL), u = t / SYL - n
  if (hash(n, 1) < 0.17) return { open: 0, round: 0, stress: 0 } // a pause between words
  const k = hash(n, 2)
  if (k < 0.2) return { open: 0.05, round: 0, stress: 0 } // m, b, p: lips together
  const stress = hash(n, 4) < 0.22 ? 1 : 0
  const env = Math.sin(Math.PI * Math.min(1, u * 1.15))
  return { open: (0.55 + 0.3 * hash(n, 3) + 0.15 * stress) * (0.45 + 0.55 * env), round: k < 0.5 ? 1 : 0, stress }
}
/** One nod for a key press: down quickly, then springs back with a small overshoot. 1 is all the way down. */
function keyDip(a: number): number {
  if (a < 0 || a > 0.5) return 0
  if (a < 0.05) return Math.sin(((a / 0.05) * Math.PI) / 2)
  const b = a - 0.05, w = 26, z = 0.45, wd = w * Math.sqrt(1 - z * z)
  return Math.exp(-z * w * b) * (Math.cos(wd * b) + ((z * w) / wd) * Math.sin(wd * b))
}
const spring = (x: number, v: number, target: number, dt: number, k: number, zeta: number): [number, number] => {
  const c = 2 * Math.sqrt(k) * zeta
  v += (k * (target - x) - c * v) * dt
  return [x + v * dt, v]
}

/**
 * Advance the eyes. pointer: where the cursor is relative to this Pill, about -1 to 1 on each axis (or null).
 * rm: reduced motion, which snaps to each mood's still pose with no blinks, glances or body moves.
 * dt may be large (resting runs at a low frame rate); every spring takes small steps inside.
 */
export function stepEyes(st: EyesState, t: number, dt: number, pointer: { x: number; y: number } | null, rm = false): EyesState {
  dt = Math.min(Math.max(dt, 0), 0.25)
  st.t = t
  st.rm = rm
  const m = st.mood, age = t - st.since
  // How big its moves are: calm is half as lively.
  const e = st.lively ? 1 : 0.5
  const pre = V[m] ?? {}
  const px = pointer ? Math.max(-1.5, Math.min(1.5, pointer.x)) : 0, py = pointer ? Math.max(-1.5, Math.min(1.5, pointer.y)) : 0
  const near = !!pointer && Math.hypot(pointer.x, pointer.y) < 0.9
  const talking = m === 'talking', mouth = talking && st.mouth

  // Resting: a lazy glance toward the middle of the screen every 8 to 12 seconds.
  const R = st.rest
  if (m === 'resting' && !rm && t > R.next) { R.until = t + 1.5; R.next = t + 8 + st.rand() * 4 }
  const restGlance = m === 'resting' && !rm && t < R.until

  // Talking: where the mouth is heading this frame. Reduced motion holds it half open.
  const say = !talking ? { open: 0, round: 0, stress: 0 } : rm ? { open: 0.45, round: 0, stress: 0 } : speech(t)
  st.say.stress = say.stress

  const tg: Pose = { ...BASE, ...pre }
  if (talking && !mouth) { tg.talk = 0; tg.oy = 0; tg.sy = 1 } // no mouth, so no room to make for it
  if (!rm) {
    if (m === 'done' && age < 0.35) tg.happy = 0 // grow first, then smile
    if (m === 'needs-you') { const p = Math.max(0, Math.sin((age - 1.2) * 4)) ** 8 * (age > 1.2 ? 1 : 0); tg.sx += 0.07 * p; tg.sy += 0.07 * p }
    if (m === 'listening') tg.sy *= 1 + 0.035 * Math.sin((t * Math.PI * 2) / 3.2) // slow breathing
    if (mouth) tg.squint += 0.36 * say.stress // a small squint on stressed words
    if (talking && !mouth) tg.sy *= 0.72 + 0.32 * st.say.open // no mouth: the eyes bounce with the words
    if (m === 'resting' && near && !restGlance) tg.lid = 0.28 // the cursor came close: lids lift
  }

  // Where it looks. Calm glances less often, and not as far.
  let lx = 0, ly = 0
  const g = st.glance
  if (t > g.next) {
    g.x = (st.rand() * 2 - 1) * 0.8 * (0.4 + 0.6 * e)
    g.y = (st.rand() * 2 - 1) * 0.5 * (0.4 + 0.6 * e)
    g.until = t + 0.5 + st.rand() * 0.7
    g.next = t + (2 + st.rand() * 3.5) / e
  }
  const glancing = !rm && t < g.until // reduced motion: no glances
  switch (m) {
    case 'idle': lx = glancing ? g.x : px * 0.7 * e; ly = glancing ? g.y : py * 0.6 * e; break
    case 'listening': lx = 0; ly = 0.05; break // straight at you: the slide apart does the talking
    case 'thinking': lx = 0; ly = 0; break // the dots do the moving
    case 'talking': lx = px * 0.3 * e + (glancing ? g.x * 0.3 : 0); ly = 0.05; break
    case 'done': case 'celebrating': lx = 0; ly = -0.1; break
    case 'needs-you': lx = 0; ly = 0; break // straight at you
    case 'worried': lx = glancing ? g.x * 0.6 : -0.3; ly = 0.45; break
    case 'mad': lx = 0; ly = 0.12; break
    case 'resting': if (restGlance) { lx = -0.8; ly = 0.05 } else if (near && !rm) { lx = px * 0.4; ly = 0.2 + py * 0.25 } else { lx = 0.1; ly = 0.45 } break
    case 'sleepy': lx = 0; ly = 0.35; break
  }

  // Springs, in small steps so a low frame rate or a slow frame stays stable.
  const n = rm ? 1 : Math.max(1, Math.ceil(dt / (1 / 60))), h = dt / n
  for (let i = 0; i < n; i++) {
    for (const side of SIDES) for (const k of KEYS) {
      if (rm) { st.p[side][k] = tg[k]; st.v[side][k] = 0; continue }
      const [sk, sz] = SPRING(k)
      ;[st.p[side][k], st.v[side][k]] = spring(st.p[side][k], st.v[side][k], tg[k], h, sk, sz)
    }
    if (rm) { st.look.x = lx; st.look.y = ly; st.lookV.x = st.lookV.y = 0 }
    else {
      const lk = m === 'resting' ? 60 : 170 // resting looks around lazily
      ;[st.look.x, st.lookV.x] = spring(st.look.x, st.lookV.x, lx, h, lk, 0.85)
      ;[st.look.y, st.lookV.y] = spring(st.look.y, st.lookV.y, ly, h, lk, 0.85)
    }
    if (rm) { st.say.open = say.open; st.say.round = say.round; st.say.ov = st.say.rv = 0 }
    else {
      ;[st.say.open, st.say.ov] = spring(st.say.open, st.say.ov, say.open, h, 900, 0.75)
      ;[st.say.round, st.say.rv] = spring(st.say.round, st.say.rv, say.round, h, 500, 0.8)
    }
  }

  // Listening: each key press nods the eyes down a couple of pixels and back.
  st.nod = 0
  if (m === 'listening' && !rm) for (const k of st.keys) st.nod += keyDip(t - k)
  st.nod = Math.max(-0.35, Math.min(1.15, st.nod))

  // Blinks: a quick close and a slower open, sometimes twice. Resting blinks slowly.
  const gap = BLINK[m] ?? 3.6
  if (rm || !gap || (m === 'needs-you' && age < 2.5)) { st.blink = 0; st.nextBlink = Math.max(st.nextBlink, t + 0.8) }
  else {
    if (t >= st.nextBlink) { st.blinkAt = t; st.double = m !== 'resting' && st.rand() < 0.18; st.nextBlink = t + gap * (0.6 + 0.8 * st.rand()) }
    const dur = m === 'resting' ? 0.7 : 0.19
    const b = (u: number) => (u < 0 || u > 1 ? 0 : u < 0.37 ? u / 0.37 : 1 - (u - 0.37) / 0.63)
    st.blink = Math.max(b((t - st.blinkAt) / dur), st.double ? b((t - st.blinkAt - dur - 0.07) / dur) : 0)
  }

  // The body: breathing, plus a hop, a pop or a shake for some moods. Resting keeps still to stay cheap.
  const B = st.body
  B.rot = 0
  if (rm || m === 'resting') { B.tx = 0; B.ty = 0; B.sc = 1; return st }
  B.sc = 1 + 0.012 * Math.sin((t * Math.PI * 2) / 4.2)
  B.tx = 0
  B.ty = 0
  if (m === 'celebrating') { const hop = Math.abs(Math.sin(t * 6.5)); B.ty = -0.09 * hop * e; B.sc += 0.035 * (1 - hop) ** 6 * e }
  if (m === 'needs-you') B.sc += (0.09 * Math.exp(-age * 5) * Math.cos(age * 17) + 0.02 * Math.max(0, Math.sin((age - 1.2) * 4)) ** 8 * (age > 1.2 ? 1 : 0)) * e
  if (m === 'mad') { B.tx = 0.025 * Math.sin(age * 58) * Math.exp(-age * 3.5) * e; B.ty = 0.01 }
  if (m === 'worried') B.tx = 0.005 * Math.sin(t * 41) * e
  if (m === 'sleepy') { const br = 0.5 - 0.5 * Math.cos((t * Math.PI * 2) / 4.6); B.sc = 1 + 0.03 * br; B.ty = 0.035 * br } // slow breathing
  return st
}

/* ---------------- thinking ---------------- */
const frac = (v: number) => ((v % 1) + 1) % 1
export interface Dot {
  /** From the middle of the Pill in dot sizes (y: - is up). */
  x: number
  y: number
  /** Size. */
  s: number
  /** How lit (0 to 1). */
  a: number
  /** How far it has moved from the row onto the search circle (0 to 1). */
  orbit: number
}
/**
 * Thinking's three dots, left to right. The variants: a wave (thinking), lighting up in turn (reading a file),
 * circling (searching the web). Reduced motion keeps the three still in a row, at medium height.
 */
export function dotsAt(st: EyesState): Dot[] {
  const age = st.t - st.since, row = [-1.6, 0, 1.6]
  if (st.rm) return row.map((x) => ({ x, y: -0.25, s: 1, a: 1, orbit: 0 }))
  if (st.glint === 'step') {
    // One lit, two lit, three lit, a beat with all three, then none, and over again. A dot pops a little as it lights.
    const n = Math.floor(age / 0.32) % 5, lit = n < 4 ? Math.min(3, n + 1) : 0, inStep = age % 0.32
    return row.map((x, i) => {
      const on = i < lit, fresh = on && i === lit - 1 && n < 3
      return { x, y: 0, s: 1 + (fresh ? 0.2 * Math.exp(-inStep * 12) : 0), a: on ? 1 : 0.3, orbit: 0 }
    })
  }
  if (st.glint === 'search') {
    const k = Math.min(1, age / 0.35), ease = k * k * (3 - 2 * k) // from the row onto the circle
    return row.map((x, i) => {
      const th = (age * Math.PI * 2) / 1.4 + (i * Math.PI * 2) / 3 + Math.PI
      return { x: x * (1 - ease) + 0.72 * Math.cos(th) * ease, y: 0.72 * Math.sin(th) * ease, s: 1 - 0.2 * ease, a: 1, orbit: ease }
    })
  }
  // The wave: each dot hops once in turn, then all three rest for a beat.
  return row.map((x, i) => {
    const ph = frac((age - i * 0.14) / 1.15), lift = ph < 0.42 ? Math.sin((ph / 0.42) * Math.PI) : 0
    return { x, y: -0.5 * lift, s: 1 + 0.06 * lift, a: 0.62 + 0.38 * lift, orbit: 0 }
  })
}

/** The Pill's body box in its drawing's units. */
export interface Geo {
  cx: number
  cy: number
  W: number
  H: number
}
export interface VectorEye {
  /** The eye's rectangle: middle, size, corner radius, opacity. */
  x: number
  y: number
  w: number
  h: number
  r: number
  a: number
  /** The lids, as a clip path. */
  clip: string
  /** How closed (sleepy), and the closed eye's curve. */
  closed: number
  arc: string
  arcWidth: number
  bottom: number
}
export interface VectorFace {
  eyes: [VectorEye, VectorEye]
  /** The middle dot while thinking, and how far the eyes have turned into dots. */
  dots: { k: number; mid: { x: number; y: number; r: number; a: number } } | null
  /** Talking's mouth, hanging from a top line under the eyes. */
  mouth: { x: number; top: number; w: number; h: number; flat: number; talk: number } | null
}

/**
 * The eyes for vector drawing. Per eye: the rectangle (which shrinks into the outer dots while thinking), its
 * corner radius, opacity, a clip path for the lids, and the closed-eye curve for sleepy.
 */
export function vectorEyes(st: EyesState, G: Geo): VectorFace {
  const w0 = Math.min(11, G.H * 0.21), h0 = Math.min(20, G.H * 0.375), spread = G.W * 0.145
  const dz = Math.min(1.1, Math.max(0, (st.p.L.dots + st.p.R.dots) / 2)) // how far the eyes have turned into dots
  const nod = st.nod * G.H * 0.07
  const dp = dz > 0.001 ? dotsAt(st) : null
  const dot = (i: number) => ({ x: G.cx + dp![i].x * w0, y: G.cy + dp![i].y * w0, r: (w0 / 2) * dp![i].s, a: dp![i].a })
  const f = (v: number) => v.toFixed(2)
  const eyes = SIDES.map((side, i): VectorEye => {
    const p = st.p[side], s = side === 'L' ? 1 : -1 // s: which way is inward, toward the other eye
    let x = G.cx - s * spread * p.gap + (st.look.x + p.ox) * G.W * 0.075
    let y = G.cy + (st.look.y + p.oy) * G.H * 0.11 + nod
    let w = w0 * Math.max(0.2, p.sx), h = h0 * Math.max(0.15, p.sy), a = 1
    if (dp) {
      const tg = dot(i ? 2 : 0)
      x += (tg.x - x) * dz
      y += (tg.y - y) * dz
      w += (2 * tg.r - w) * dz
      h += (2 * tg.r - h) * dz
      a += (tg.a - a) * Math.min(1, dz)
    }
    w = Math.max(0.5, w)
    h = Math.max(0.5, h)
    const left = x - w / 2, right = x + w / 2
    const top = y - h / 2, bot = y + h / 2, pad = w * 0.8 + 2
    const lid = Math.min(0.94, Math.max(0, p.lid + (1 - p.lid) * st.blink * 0.94))
    const yMid = top + h * lid, slope = p.tilt * h * 0.55
    const topAt = (xx: number) => yMid + slope * ((xx - x) / (w / 2)) * s
    const be = bot + 1 - Math.max(0, p.squint) * h * 0.45
    const ym = be - Math.min(1, Math.max(0, p.happy)) * (be - (top + h * 0.36))
    const L = left - pad, R = right + pad
    const clip = `M${f(L)} ${f(topAt(L))} L${f(R)} ${f(topAt(R))} L${f(R)} ${f(be)} Q${f(x)} ${f(2 * ym - be)} ${f(L)} ${f(be)} Z`
    // Closed: a soft curve, ends up and middle down, a little wider than the open eye.
    const hw = Math.max(w0 * 0.95, w * 0.9), cy = y + h0 * 0.05
    const arc = `M${f(x - hw)} ${f(cy - h0 * 0.06)} Q${f(x)} ${f(cy + h0 * 0.34)} ${f(x + hw)} ${f(cy - h0 * 0.06)}`
    return { x, y, w, h, r: Math.min(w, h) / 2, a, clip, closed: Math.min(1, Math.max(0, p.closed)), arc, arcWidth: Math.max(2.2, w0 * 0.42), bottom: Math.min(bot, be) }
  }) as [VectorEye, VectorEye]
  // Dots: the middle one grows in between the other two.
  let dots: VectorFace['dots'] = null
  if (dp && dz > 0.02) {
    const c = dot(1)
    dots = { k: Math.min(1, dz), mid: { ...c, r: c.r * Math.min(1, dz) } }
  }
  // Talking's mouth only ever opens downward, so it can never reach the eyes.
  // open: 0 is a closed line; round: 0 is wide open (flat on top, round below), 1 is an "o".
  const talk = Math.min(1, Math.max(0, (st.p.L.talk + st.p.R.talk) / 2))
  let mouth: VectorFace['mouth'] = null
  if (talk > 0.02) {
    const open = Math.min(1, Math.max(0, st.say.open)), round = Math.min(1, Math.max(0, st.say.round))
    const wOpen = G.W * (0.21 + (0.105 - 0.21) * round)
    const w = (G.W * 0.17 + (wOpen - G.W * 0.17) * open) * talk
    const hMax = G.H * (0.17 + 0.01 * round)
    mouth = { x: G.cx + st.look.x * G.W * 0.04, top: Math.max(G.cy + G.H * 0.2, Math.max(eyes[0].bottom, eyes[1].bottom) + G.H * 0.075), w, h: hMax * open * talk, flat: 1 - round, talk }
  }
  return { eyes, dots, mouth }
}

/* ---------------- marks outside the eyes ---------------- */
const easeOutBack = (x: number) => 1 + 2.70158 * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2
const pop = (age: number, rm: boolean) => (rm ? 1 : age >= 0.35 ? 1 : Math.max(0, easeOutBack(age / 0.35)))
export interface Confetti {
  x: number
  y: number
  rot: number
  /** Which of the three confetti colors. */
  c: number
  shape: 'rect' | 'dot'
  a: number
}
// Where confetti comes to rest after the bursts (and the still scatter for reduced motion), in symbol sizes.
const SCATTER: Omit<Confetti, 'a'>[] = [
  { x: 0.55, y: -0.8, rot: 20, c: 0, shape: 'rect' }, { x: 1.15, y: -0.3, rot: -35, c: 1, shape: 'dot' },
  { x: 0.1, y: -1.3, rot: 60, c: 2, shape: 'rect' }, { x: 1.0, y: -1.15, rot: 10, c: 1, shape: 'rect' },
  { x: -0.25, y: -0.6, rot: 0, c: 2, shape: 'dot' },
]
function confetti(age: number, rm: boolean, peek: boolean, lively: boolean): Confetti[] {
  const flip = (p: Confetti): Confetti => (peek ? { ...p, x: -p.x * 0.9 } : p) // in the tab, spray inward instead
  const keep = peek ? 4 : 5
  if (rm) return SCATTER.slice(0, keep).map((p) => flip({ ...p, a: 1 }))
  const out: Confetti[] = []
  // Lively bursts three times, calm once.
  for (const [bi, at] of (lively ? [0, 1.3, 2.6] : [0]).entries()) {
    const a = age - at
    if (a < 0 || a > 1.15) continue
    for (let i = 0; i < (peek ? 6 : 9); i++) {
      const ang = ((-15 - hash(i, bi) * 95) * Math.PI) / 180
      const sp = (peek ? 2.4 : 3) * (0.65 + 0.5 * hash(i, bi + 7))
      out.push(flip({ x: Math.cos(ang) * sp * a, y: Math.sin(ang) * sp * a + 2.75 * a * a, rot: hash(i, bi + 3) * 360 + a * 420, c: i % 3, shape: i % 4 === 0 ? 'dot' : 'rect', a: a > 0.8 ? Math.max(0, 1 - (a - 0.8) / 0.35) : 1 }))
    }
  }
  // A few pieces always sit by the corner, so even a still frame shows confetti; they twinkle once the bursts stop.
  for (const [i, p] of SCATTER.slice(0, keep).entries()) out.push(flip({ ...p, a: age > 3.5 ? 0.75 + 0.25 * Math.sin(age * 3 + i * 1.7) : 1 }))
  return out
}

export type SizeClass = 'peek' | 'header' | 'big'
export interface Marks {
  symbol: { kind: 'bang' | 'drop'; s: number; dy: number; a: number } | null
  zs: { x: number; y: number; size: number; a: number }[]
  confetti: Confetti[]
  /** Capsule outlines spreading from the Pill: u is how far out (0 to 1). */
  rings: { u: number; a: number; kind: 'call' | 'voice' }[]
}

/**
 * What to draw outside the eyes this frame, relative to the Pill's top right corner, in units of the view's symbol
 * size (bigger and bolder in the tab at the screen edge). Only one corner symbol ever shows.
 */
export function marks(st: EyesState, o: { cls: SizeClass; mouth: boolean; glass: boolean }): Marks {
  const m = st.mood, age = st.t - st.since, rm = st.rm
  const out: Marks = { symbol: null, zs: [], confetti: [], rings: [] }
  switch (m) {
    case 'needs-you': {
      const ph = age - 0.4 - Math.floor((age - 0.4) / 2) * 2 // a pulse every 2 seconds
      const bump = rm || age < 0.4 ? 0 : ph < 0.25 ? Math.sin((ph / 0.25) * Math.PI) * 0.14 : 0
      out.symbol = { kind: 'bang', s: pop(age, rm) + bump, dy: 0, a: 1 }
      if (!rm && age > 0.4 && ph < 1.3) out.rings.push({ u: ph / 1.3, a: 1 - ph / 1.3, kind: 'call' })
      break
    }
    case 'worried': {
      // Slides down, fades quickly at the bottom, and starts again: visible for most of every cycle.
      const T = 2.2, u = rm ? 0.3 : (age % T) / T
      out.symbol = { kind: 'drop', s: 1, dy: Math.min(1, u / 0.85), a: rm ? 1 : u < 0.06 ? u / 0.06 : u > 0.85 ? Math.max(0, 1 - (u - 0.85) / 0.12) : 1 }
      break
    }
    case 'celebrating':
      out.confetti = confetti(age, rm, o.cls === 'peek', st.lively)
      break
    case 'sleepy': {
      const fade = rm ? 1 : Math.min(1, age / 0.8)
      if (o.cls !== 'big') {
        const u = rm ? 0.45 : (age / 2.8) % 1
        // At small sizes the one Z never fades below half, so a still frame always shows it.
        const a = rm ? 1 : 0.5 + 0.5 * (u < 0.2 ? u / 0.2 : u > 0.75 ? (1 - u) / 0.25 : 1)
        out.zs = [{ x: 0.1 + u * 0.25, y: -u * 0.45, size: 1, a: a * fade }]
      } else {
        const one = (u: number, a: number) => ({ x: -0.1 + u * 1.2, y: -u * 2.2, size: 0.6 + u * 0.5, a: a * fade })
        out.zs = rm
          ? [one(0.15, 1), one(0.5, 0.8), one(0.85, 0.6)]
          : [0, 1, 2].map((i) => {
              const u = (age / 3.6 + i / 3) % 1
              return one(u, u < 0.15 ? u / 0.15 : u > 0.7 ? (1 - u) / 0.3 : 1)
            })
      }
      break
    }
    case 'talking': // with the mouth off, glass speaks in ripples instead
      if (!o.mouth && o.glass && !rm) for (let i = 0; i < 2; i++) { const u = (age / 1.1 + i / 2) % 1; out.rings.push({ u, a: (1 - u) * (0.35 + 0.65 * st.say.open), kind: 'voice' }) }
      break
  }
  return out
}

/** One cell of the blocky Pill's eyes on its 16 x 8 grid. dim is an unlit thinking dot. */
export interface Cell {
  x: number
  y: number
  dim?: boolean
  mouth?: boolean
}

/** The blocky Pill's eye cells. o.mouth adds talking's pixel mouth. */
export function pixelEyes(st: EyesState, o: { mouth?: boolean } = {}): Cell[] {
  const m = st.mood, age = st.t - st.since
  const dz = (st.p.L.dots + st.p.R.dots) / 2
  const talking = m === 'talking', mouth = talking && !!o.mouth && st.mouth
  let [l, r] = PX[m] ?? PX.idle
  if (m === 'done' && age < 0.4) l = r = 'big'
  if (talking && !mouth && st.say.open < 0.4) l = r = 'short' // no mouth: the eyes bounce with the words
  if (mouth && (st.p.L.squint + st.p.R.squint) / 2 > 0.12) l = r = 'squint'
  if (m === 'listening' && (st.p.L.sy + st.p.R.sy) / 2 > 1.12) l = r = 'tall'
  const blinkable = m !== 'sleepy' && m !== 'thinking'
  if (blinkable && st.blink > 0.45) l = r = 'closed'
  const dx = Math.round(st.look.x * 1.15)
  let dy = Math.round(st.look.y * 1.1)
  if (m === 'celebrating') dy -= Math.round(Math.abs(Math.sin(st.t * 6.5)) * (st.lively ? 1 : 0.5))
  if (m === 'sleepy') dy = 0
  if (m === 'listening' && st.nod > 0.5) dy += 1 // the nod on a key press
  if (mouth) dy -= 1 // up a row, to leave a clear row above the mouth
  const out: Cell[] = []
  // Thinking: three 2 x 2 dots that hop a row, light up in turn, or circle.
  if (dz > 0.5) {
    for (const q of dotsAt(st)) {
      // A dot size is 1.875 cells in the row; the search circle opens up to 2.4 cells across and 1.6 down.
      const cx = 7.5 + q.x * (1.875 + 1.455 * q.orbit), cy = 3.5 + q.y * (1.875 + 0.345 * q.orbit)
      const x0 = Math.round(cx - 1), y0 = Math.round(cy - 1)
      for (const [ax, ay] of [[0, 0], [1, 0], [0, 1], [1, 1]]) out.push({ x: x0 + ax, y: y0 + ay, dim: q.a < 0.6 })
    }
    return out
  }
  if (dz > 0.2) l = r = 'short'
  // Listening: the eyes slide out toward the edges a cell at a time, two cells in all.
  const wide = Math.max(0, Math.min(2, Math.round(((st.p.L.gap + st.p.R.gap) / 2 - 1) * 2.2)))
  for (const [name, side] of [[l, 'L'], [r, 'R']] as [Sprite, Side][]) {
    SPRITES[name].forEach((row, ry) =>
      [...row].forEach((ch, cx) => {
        if (ch === '#') out.push({ x: (side === 'L' ? 4 + cx - wide : 11 - cx + wide) + dx, y: 1 + ry + dy })
      }),
    )
  }
  // Talking's mouth: a closed line, wide open, or a round "o", under a clear row.
  if (mouth) {
    const shape = st.say.open < 0.22 ? 'line' : st.say.round > 0.5 ? 'o' : 'wide'
    for (const [x, y] of PX_MOUTH[shape]) out.push({ x, y, mouth: true })
  }
  return out
}
