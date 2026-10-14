// Mood state for the toy family. A superset of the app's FaceState (src/renderer/src/face-drawing.ts): the same
// open, lookX, lookY, brow, level and blink, with the same meanings, plus the extra values these characters draw from.
// stepFace keeps the app's shape (face, mood, t, dt, pointer) so it can replace the current one with little change.
//
//   open (eyelid 0..1.15) · blink (1 open, dips on blinks) · lookX/lookY (-1..1, + is right/down) · level (talking 0..1)
//   brow (-0.4..0.5, as in the app) · droop (upper lids lowered 0..1: resting, sleepy)
//   happy (squint arcs 0..1: done holds then eases back, celebrating keeps it) · pulse (0..1, needs-you)
//   think (0..1 phase of one THINK_PERIOD loop: the eye scan and the juggling share it)
//   warm (worried tint 0..1) · spark (celebrating 0..1) · bounce (celebrating hop, body heights, <= 0)
//   wob (idle wobble) · clock (time that runs faster when lively) · P (personality: calm .55, lively 1.35) · rm

export const MOODS = [
  ['resting', 'Resting', 'tucked away at the screen edge'],
  ['idle', 'Idle', 'the panel is open and nothing is going on'],
  ['listening', 'Listening', 'while you type'],
  ['thinking', 'Thinking', 'waiting on the model'],
  ['talking', 'Talking', 'a reply is streaming in'],
  ['done', 'Done', 'a task or a Claude Code session just finished'],
  ['needs-you', 'Needs you', 'an approval card, or a session waiting on you'],
  ['worried', 'Worried', 'a build or a command failed'],
  ['celebrating', 'Celebrating', 'a deploy is ready or a PR merged'],
  ['sleepy', 'Sleepy', 'after midnight'],
]
/** The moods that show while Steward is tucked at the screen edge, so they must read at 50x44. */
export const TUCKED = ['resting', 'done', 'needs-you', 'worried', 'celebrating', 'sleepy']
/** Seconds for one thinking loop: one eye scan across and one juggling cycle, so eyes and arms stay in time. */
export const THINK_PERIOD = 2.4

const FX = {
  resting: { wob: 0.45, sp: 0.35 }, idle: { wob: 0.6, sp: 1 }, listening: { wob: 0.7, sp: 1.3 }, thinking: { wob: 0.5, sp: 0.9 },
  talking: { wob: 0.55, sp: 1.1 }, done: { wob: 0.6, sp: 1 }, 'needs-you': { wob: 0.75, sp: 1.4 }, worried: { wob: 0.9, sp: 1.8, warm: 1 },
  celebrating: { wob: 1, sp: 1.6, spark: 1 }, sleepy: { wob: 0.3, sp: 0.3 },
}
// Mean seconds between blinks (irregular around it), and slow blinks for drowsy moods. Default 3.2 s and 0.14 s.
const BLINK_GAP = { resting: 5, sleepy: 4.6, listening: 4.4, talking: 2.6, thinking: 3.6, 'needs-you': 4, worried: 2.1 }
const BLINK_LEN = { resting: 0.34, sleepy: 0.46 }
const BROW = { 'needs-you': 0.5, celebrating: 0.5, listening: 0.35, done: 0.35, worried: 0.3, resting: -0.25, sleepy: -0.4 }

export const ease = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt))
const speaking = (t) => Math.min(1, (Math.abs(Math.sin(t * 9.1)) * 0.6 + Math.abs(Math.sin(t * 3.7 + 1.3)) * 0.4) * (0.65 + 0.35 * Math.sin(t * 1.1)))
/** Stable pseudo-random 0..1: blinks and glances are irregular but repeat the same way every run. */
const rnd = (a, b) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v) }

export function initialFace(seed = Math.random()) {
  return {
    mood: 'idle', prevMood: 'idle', moodAge: 10, t: 0, dt: 0, clock: seed * 20, seed,
    open: 1, blink: 1, blinkAt: -9, nextBlink: 1 + seed * 3, blinkLen: 0.14, blinkN: 0, lookX: 0, lookY: 0, brow: 0, level: 0,
    droop: 0, happy: 0, pulse: 0, think: 0, warm: 0, spark: 0, bounce: 0, wob: 0.5, sp: 1, P: 0.55, rm: false,
    glanceAt: 2 + seed * 3, glanceUntil: 0, gx: 0, gy: 0, sacAt: 0, sx: 0, sy: 0,
  }
}

/** o: { pers: 'calm' | 'lively', rm: reduced motion } */
export function stepFace(f, mood, t, dt, pointer, o = {}) {
  if (mood !== f.mood) { f.prevMood = f.mood; f.mood = mood; f.moodAge = 0 } else f.moodAge += dt
  const fx = FX[mood] ?? FX.idle, lively = o.pers === 'lively'
  f.P = lively ? 1.35 : 0.55
  f.rm = !!o.rm
  f.t = t
  f.dt = dt
  f.brow = ease(f.brow, BROW[mood] ?? 0, 9, dt)
  if (f.rm) {
    // Reduced motion: a still pose per mood. No wobble, blinks, glances, loops or bounce; the pose changes stay.
    const lk = mood === 'thinking' ? [0.65, -0.6] : mood === 'resting' || mood === 'sleepy' ? [0, 0.4] : [0, 0]
    Object.assign(f, {
      wob: 0, warm: fx.warm || 0, spark: fx.spark ? 0.8 : 0, bounce: 0, blink: 1, level: mood === 'talking' ? 0.6 : 0, lookX: lk[0], lookY: lk[1],
      open: mood === 'sleepy' ? 0.3 : mood === 'worried' ? 0.85 : mood === 'listening' || mood === 'needs-you' ? 1.15 : 1,
      droop: mood === 'sleepy' ? 0.7 : mood === 'resting' ? 0.45 : 0, happy: mood === 'done' || mood === 'celebrating' ? 1 : 0, pulse: 0, think: 0.2,
      brow: BROW[mood] ?? 0,
    })
    return f
  }
  f.wob = ease(f.wob, fx.wob * f.P, 3, dt)
  f.sp = ease(f.sp, fx.sp * (lively ? 1.15 : 0.85), 2, dt)
  f.warm = ease(f.warm, fx.warm || 0, 3, dt)
  f.spark = ease(f.spark, fx.spark || 0, 5, dt)
  f.clock += dt * f.sp
  f.think = (((t / THINK_PERIOD) % 1) + 1) % 1

  let look, lr = lively ? 10 : 6
  if (mood === 'thinking') {
    // Up and to the side, scanning across once per loop with a small flick at each end. Never a frozen stare.
    const ph = f.think * Math.PI * 2
    look = [0.2 + 0.5 * Math.sin(ph) + 0.08 * Math.sin(ph * 3), -0.58 + 0.07 * Math.sin(ph * 2)]
    lr = 9
  } else if (mood === 'resting' || mood === 'sleepy') {
    look = [0.24 * Math.sin(t * 0.27 + f.seed * 6), 0.38 + 0.08 * Math.sin(t * 0.19 + f.seed * 3)] // drifting
    lr = 2.2
  } else if (mood === 'worried') look = [Math.sin(t * 1.7) * 0.55, 0.15] // darting
  else if (mood === 'talking') {
    // Engaged with you, with small saccades: a quick jump every third of a second or so.
    if (t > f.sacAt || f.sacAt - t > 2) { f.sacAt = t + 0.25 + 0.5 * rnd(f.seed, t); f.sx = (rnd(t, f.seed) - 0.5) * 0.36; f.sy = (rnd(f.seed + 1, t) - 0.5) * 0.22 }
    look = [pointer.x * 0.3 + f.sx, pointer.y * 0.2 + f.sy]
    lr = 22
  } else if (mood === 'needs-you') look = [pointer.x * 0.15, pointer.y * 0.1] // straight at you
  else if (mood === 'idle') {
    // Relaxed and loosely on you, with an occasional glance away and back.
    if (f.glanceAt - t > 9) f.glanceAt = t + 1
    if (t > f.glanceAt) {
      f.glanceUntil = t + 0.7 + 0.7 * rnd(f.seed, f.glanceAt)
      f.gx = (rnd(f.glanceAt, f.seed) - 0.5) * 1.6; f.gy = (rnd(f.seed + 2, f.glanceAt) - 0.6) * 0.8
      f.glanceAt = f.glanceUntil + 2 + 3.5 * rnd(f.glanceAt, 3)
    }
    look = t < f.glanceUntil ? [f.gx, f.gy] : [pointer.x * 0.4, pointer.y * 0.3]
    lr = 12
  } else look = [pointer.x, pointer.y]
  f.lookX = ease(f.lookX, look[0], lr, dt)
  f.lookY = ease(f.lookY, look[1], lr, dt)

  const open = mood === 'sleepy' ? 0.32 - 0.12 * Math.max(0, Math.sin(t * 0.9)) : mood === 'worried' ? 0.85 : mood === 'listening' || mood === 'needs-you' ? 1.15 : 1
  f.open = ease(f.open, open, mood === 'sleepy' ? 3 : 10, dt)
  // Lids: resting sits half-lidded; sleepy is heavier and now and then nods nearly shut.
  const droop = mood === 'resting' ? 0.45 : mood === 'sleepy' ? 0.62 + 0.3 * Math.max(0, Math.sin(t * 0.9)) ** 3 : 0
  f.droop = ease(f.droop, droop, mood === 'sleepy' || mood === 'resting' ? 2.5 : 8, dt)
  // Done: a happy squint that holds, then eases back to normal. Celebrating keeps it.
  const happy = mood === 'celebrating' || (mood === 'done' && f.moodAge < 1.8) ? 1 : 0
  f.happy = ease(f.happy, happy, happy ? 14 : mood === 'done' ? 2.2 : 8, dt)
  f.pulse = ease(f.pulse, mood === 'needs-you' ? 0.5 + 0.5 * Math.sin(t * 4.2) : 0, 12, dt)
  f.level = ease(f.level, mood === 'talking' ? speaking(t) : 0, 18, dt)

  // Blinks: irregular gaps around a per-mood mean, now and then a quick double; drowsy moods blink slowly.
  if (t > f.nextBlink || f.nextBlink - t > 12) {
    f.blinkAt = t
    f.blinkN++
    f.blinkLen = BLINK_LEN[mood] ?? 0.14
    const double = !BLINK_LEN[mood] && rnd(f.seed * 13.7, f.blinkN) < 0.18
    f.nextBlink = double ? t + f.blinkLen + 0.1 : t + (BLINK_GAP[mood] ?? 3.2) * (0.45 + 1.1 * rnd(f.seed * 5.3, f.blinkN + 0.5))
  }
  const b = (t - f.blinkAt) / f.blinkLen
  f.blink = b >= 0 && b < 1 ? 1 - 0.92 * Math.sin(b * Math.PI) : 1
  // Celebrating is the only mood that hops.
  f.bounce = mood === 'celebrating' ? -Math.abs(Math.sin(t * 6.5)) * (lively ? 0.16 : 0.1) : ease(f.bounce, 0, 10, dt)
  return f
}
