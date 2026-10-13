// The toy family in 2D: Bao, Reed and Tofu, plus createAvatar / tickAvatar / renderAvatar, the three calls a page
// (or later the app) needs. Flat style: one solid color per toy, small pill eyes, no outlines or shading.
// Body space: x centered, y down, the ground at y = 0.
import { mix, rgba, luminance } from './color.js'
import { initialFace, stepFace } from './face.js'
import { makeRig } from './rig.js'
import { bodyShape, drawArm, drawFace, halo, zees, sparkles, sweat, dot, drawHat, drawGlasses, ease, TAU } from './draw.js'

/* ---------------- Bao: squat and round, a steamed bun with a pinched twist ---------------- */
const BAO = {
  id: 'bao',
  name: 'Bao',
  vibe: 'Squat and round like a steamed bun, with a little twist on top. Calm and friendly: a slow, jelly-like sway.',
  body: { a: 0.92, hT: 0.74, hB: 0.6, mT: 2.05, mB: 2.7, taper: 0.06, lumps: [[2, 0.012, 0.6], [3, 0.01, 2.1]] },
  lean: 0,
  face: { gx: 0.16, ey: -0.86, ex: 0.14, ew: 0.052, eh: 0.125, tilt: -0.22, my: -0.6, mw: 0.085 },
  arms: { y: -0.64, inset: 0.12, len: 0.26, rad: 0.1, hand: 0.12, rest: 0.8, k: 70, zeta: 0.7, chin: 0.0, toss: 0.24 },
  motion: { rate: 5, sway: 0.03, bob: 0, jelly: 1 },
  hat: { y: -1.3, w: 0.8 },
  frames: { big: { cy: -0.68, h: 2.2 }, header: { cy: -0.76, h: 2.0 }, peek: { cy: -0.74, h: 1.45 } },
  extras(g, ctx) {
    // The twist: a small dollop on the crown, leaning a beat behind the body's sway.
    if (ctx.hat) return
    const { f, shape, body } = ctx
    const lean = f.rm ? 0 : Math.sin(f.clock * 2.3 - 0.6) * 0.05 * f.wob
    const y0 = shape.top + 0.07
    g.fillStyle = body
    g.beginPath()
    g.moveTo(-0.15, y0 + 0.04)
    g.bezierCurveTo(-0.14, y0 - 0.1, -0.04 + lean, y0 - 0.14, 0.03 + lean * 1.6, y0 - 0.2)
    g.bezierCurveTo(0.06 + lean, y0 - 0.12, 0.15, y0 - 0.08, 0.15, y0 + 0.04)
    g.closePath(); g.fill()
  },
}

/* ---------------- Reed: tall and narrow, ear nubs and a bow tie ---------------- */
const EAR = { listening: 0.35, 'needs-you': 0.45, celebrating: 0.3, done: 0.15, thinking: 0.1, talking: 0.08, idle: 0, worried: -0.45, resting: -0.3, sleepy: -0.55 }
const REED = {
  id: 'reed',
  name: 'Reed',
  vibe: 'Tall and narrow, with ear nubs and a bow tie. Alert and a little formal: crisp moves, ears up when it needs you.',
  body: { a: 0.54, hT: 1.0, hB: 0.92, mT: 2.2, mB: 2.4, taper: 0.06, lumps: [[2, 0.01, 1.2], [3, 0.008, 0.3]] },
  lean: 0.07,
  face: { gx: 0.1, ey: -1.42, ex: 0.105, ew: 0.045, eh: 0.105, tilt: -0.2, my: -1.2, mw: 0.07 },
  arms: { y: -1.0, inset: 0.1, len: 0.28, rad: 0.088, hand: 0.105, rest: 0.55, k: 125, zeta: 0.6, chin: 0.05, toss: 0.24 },
  motion: { rate: 9, sway: 0.008, bob: 0 },
  hat: { y: -1.86, w: 0.62 },
  frames: { big: { cy: -1.06, h: 2.7 }, header: { cy: -1.16, h: 2.45 }, peek: { cy: -1.42, h: 1.5 } },
  init: () => ({ ears: [0, 0], twitchAt: 3 }),
  update(x, f, dt, snap) {
    if (f.t > x.twitchAt || x.twitchAt - f.t > 10) x.twitchAt = f.t + 2.5 + ((f.seed * 9.1 + f.t * 0.31) % 1) * 4
    const twitch = !f.rm && f.mood === 'idle' && x.twitchAt - f.t > 0 && x.twitchAt - f.t < 0.25 ? 0.3 : 0
    for (const i of [0, 1]) {
      const target = (EAR[f.mood] ?? 0) + (i ? twitch : 0) + (f.mood === 'listening' && i ? 0.15 : 0)
      x.ears[i] = snap ? target : ease(x.ears[i], target, 14, dt)
    }
  },
  extras(g, ctx) {
    // Ears: two round nubs on the crown, upright when alert, tipped out and down when drowsy or worried.
    const { shape, x, lod, body, accent } = ctx
    g.fillStyle = body
    for (const [i, s] of [-1, 1].entries()) {
      const lift = x.ears[i] * (lod ? 1.4 : 1)
      g.save()
      g.translate(s * 0.27, shape.top + 0.16)
      g.rotate(s * (0.55 - lift * 0.55))
      g.beginPath(); g.ellipse(0, -0.12, 0.11, 0.15, 0, 0, TAU); g.fill()
      g.restore()
    }
    // Bow tie at the collar, in the accent color.
    const y = -0.96, w = lod ? 0.19 : 0.16, h = lod ? 0.11 : 0.09
    g.fillStyle = accent
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(0.02, y); g.quadraticCurveTo(0.02 + s * w * 0.5, y - h * 1.1, 0.02 + s * w, y - h * 0.7); g.quadraticCurveTo(0.02 + s * w * 1.12, y, 0.02 + s * w, y + h * 0.7); g.quadraticCurveTo(0.02 + s * w * 0.5, y + h * 1.1, 0.02, y); g.fill() }
    g.beginPath(); g.roundRect(0.02 - w * 0.2, y - h * 0.4, w * 0.4, h * 0.8, w * 0.14); g.fill()
  },
}

/* ---------------- Tofu: a soft-edged block with a springy antenna ---------------- */
const TOFU = {
  id: 'tofu',
  name: 'Tofu',
  vibe: 'A soft-edged block with a springy antenna and a bobble. Lively and bouncy: it bobs, overshoots, and the antenna wobbles after every move.',
  body: { a: 0.8, hT: 0.7, hB: 0.7, mT: 3.4, mB: 3.8, taper: -0.02, lumps: [[2, 0.012, 2.4], [5, 0.006, 0.8]] },
  lean: -0.07,
  face: { gx: 0.14, ey: -0.95, ex: 0.135, ew: 0.05, eh: 0.115, tilt: -0.2, my: -0.7, mw: 0.08 },
  arms: { y: -0.66, inset: 0.12, len: 0.26, rad: 0.1, hand: 0.12, rest: 0.75, k: 150, zeta: 0.42, chin: -0.05, toss: 0.24 },
  motion: { rate: 11, sway: 0.012, bob: 1 },
  hat: { y: -1.36, w: 0.84 },
  frames: { big: { cy: -0.74, h: 2.3 }, header: { cy: -0.86, h: 2.1 }, peek: { cy: -0.92, h: 1.5 } },
  init: () => ({ z: 0, vz: 0 }),
  update(x, f, dt, snap, motion) {
    if (snap || f.rm) { x.z = x.vz = 0; return }
    // The antenna is a damped spring kicked by how the body moves.
    const n = Math.ceil(dt / (1 / 240)), h = dt / n
    for (let i = 0; i < n; i++) { x.vz += (-150 * x.z - 4.5 * x.vz - motion.vTilt * 10 + motion.vY * 3) * h; x.z += x.vz * h }
  },
  back(g, ctx) {
    // Antenna: a thin stalk in the body color with a bobble in the accent, drawn behind so it grows out of the top.
    if (ctx.hat) return
    const { shape, x, f, accent, lod, body } = ctx
    const droop = f.mood === 'sleepy' ? 0.9 : f.mood === 'resting' ? 0.5 : f.mood === 'worried' ? 0.35 : 0
    const ang = Math.max(-0.7, Math.min(0.7, x.z)) + 0.15 + droop
    const L = 0.36, bx = 0.04, by = shape.top + 0.06
    const tx = bx + Math.sin(ang) * L, ty = by - Math.cos(ang) * L
    g.save()
    g.lineCap = 'round'
    g.strokeStyle = body; g.lineWidth = lod ? 0.08 : 0.055
    g.beginPath(); g.moveTo(bx, by + 0.05); g.quadraticCurveTo(bx + Math.sin(ang) * L * 0.2, by - L * 0.55, tx, ty); g.stroke()
    dot(g, tx, ty, lod ? 0.11 : 0.085, accent)
    g.restore()
  },
}

export const CHARACTERS = [BAO, REED, TOFU]
export const byId = (id) => CHARACTERS.find((c) => c.id === id) ?? BAO

/* ---------------- avatar: create, tick, render ---------------- */
export function createAvatar(def, seed = Math.random()) {
  return { def, shape: bodyShape(def.body), face: null, seed, rig: makeRig(def.arms, def.motion), x: def.init ? def.init() : {}, motion: { tilt: 0, y: 0, vTilt: 0, vY: 0 } }
}

/** Advance one frame. look: { think } (the thinking style); o: { pers, rm }. */
export function tickAvatar(av, mood, t, dt, pointer, look, o) {
  av.face ??= initialFace(av.seed)
  const f = stepFace(av.face, mood, t, dt, pointer, o)
  const { snap } = av.rig.update(f, look)
  // How the body moves, for springy extras.
  const b = av.rig.body, nt = b.tilt, ny = -f.bounce + (b.tall - 1)
  const d = Math.max(1e-3, Math.min(0.1, dt))
  av.motion.vTilt = snap ? 0 : (nt - av.motion.tilt) / d
  av.motion.vY = snap ? 0 : (ny - av.motion.y) / d
  av.motion.tilt = nt; av.motion.y = ny
  av.def.update?.(av.x, f, dt, snap, av.motion)
}

/**
 * Draw into a 2D context that's W x H CSS pixels at dpr. size: 'big' | 'header' | 'peek'.
 * look: { pal, eye, accent, accentArms, eyes, hat, glasses, dark, think }
 */
export function renderAvatar(g, W, H, dpr, av, look, size) {
  const { def, shape, rig } = av, f = av.face, pal = look.pal, lod = size !== 'big'
  const fr = def.frames[size] ?? def.frames.big
  const k = Math.min(H / fr.h, W / (fr.h * 1.16))
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  g.clearRect(0, 0, W, H)
  if (!f) return
  // Small sizes exaggerate the body pose, so moods still read at 50x44.
  const ex = size === 'peek' ? 1.35 : size === 'header' ? 1.2 : 1
  const A = f.rm ? 0 : 1, c = f.clock, mo = def.motion, bodyH = def.body.hT + def.body.hB
  const hop = -f.bounce * bodyH
  const land = f.mood === 'celebrating' && A ? Math.max(0, 1 - hop / (bodyH * 0.04)) : 0
  const idleish = f.mood === 'idle' || f.mood === 'talking' || f.mood === 'listening'
  const bob = A * (mo.bob || 0) * (idleish ? 1 : f.mood === 'done' ? 0.6 : 0.25) * Math.abs(Math.sin(c * 3.1)) * (f.mood === 'talking' ? 0.6 + f.level : 1)
  const breathe = A * Math.sin(c * 1.4) * (f.mood === 'sleepy' || f.mood === 'resting' ? 0.016 : 0.01) + A * (mo.jelly || 0) * 0.014 * Math.sin(c * 2.3) * f.wob
  const tall = 1 + (rig.body.tall - 1) * ex + breathe + bob * 0.05 - land * 0.08 + (hop > 0.02 ? 0.04 : 0) + (f.mood === 'talking' ? A * f.level * 0.02 : 0)
  const tilt = def.lean + rig.body.tilt * ex * (0.75 + 0.35 * f.P) + A * Math.sin(c * 0.9) * mo.sway * f.wob
  const sink = rig.body.sink * bodyH // not exaggerated: at peek it would push the face out of the frame
  const shiver = f.mood === 'worried' ? A * Math.sin(f.t * 38) * 0.008 * f.P : 0

  g.save()
  g.translate(W / 2, H / 2)
  g.scale(k, k)
  g.translate(0, -fr.cy)
  const accent = look.accent, body = pal.body
  const ctx = { pal, f, shape, lod, dark: look.dark, x: av.x, accent, body, hat: look.hat && look.hat !== 'none' }

  halo(g, def.face.gx * 0.5, def.face.ey + 0.05, Math.min(def.body.a * 1.05, (def.body.hT + def.body.hB) * 0.5), f.warm, look.dark, f.t, f.rm)
  g.translate(shiver, -hop + sink)
  g.rotate(tilt)
  g.scale(1 / Math.sqrt(tall), tall)

  // Shoulders sit just inside the body's edge, so arms swing from inside the silhouette.
  const sh = [-1, 1].map((s) => [s * (shape.halfWidth(def.arms.y) - def.arms.inset), def.arms.y])
  rig.place(f, sh, def.arms.len, shape.top)
  const backCol = look.accentArms ? accent : body
  // In front of the body, a nub needs a half shade of contrast or it disappears into the body.
  const frontCol = look.accentArms ? accent : mix(body, pal.deep, look.dark ? 0.3 : 0.16)

  def.back?.(g, ctx)
  for (const arm of rig.arms) if (arm.ch.front.x <= 0.5) drawArm(g, arm, def.arms.rad, def.arms.hand, backCol, lod)
  // Flat means no outline, so a body close to the panel's own lightness gets a very soft shadow to hold its edge.
  const lum = luminance(body), px = k * dpr
  g.save()
  if (!look.dark && lum > 0.55) { g.shadowColor = rgba(pal.deep, 0.28); g.shadowBlur = 0.09 * px; g.shadowOffsetY = 0.025 * px }
  else if (look.dark && lum < 0.08) { g.shadowColor = 'rgba(255,255,255,0.22)'; g.shadowBlur = 0.03 * px }
  g.fillStyle = body
  g.fill(shape.path(A * (mo.jelly || 0) * f.wob, c))
  g.restore()
  def.extras?.(g, ctx)
  drawFace(g, def.face, f, look, lod)
  drawGlasses(g, look.glasses, def.face, look.eye.hex, lod)
  if (ctx.hat) drawHat(g, look.hat, def.face.gx * 0.3, def.hat.y, def.hat.w, mix(pal.deep, '#121318', 0.6), accent, f.mood === 'celebrating' ? Math.min(1, hop / (bodyH * 0.06)) * 0.3 : 0)
  for (const arm of rig.arms) if (arm.ch.front.x > 0.5) drawArm(g, arm, def.arms.rad, def.arms.hand, frontCol, lod)

  // Juggling balls: the accent, a sunny yellow and the eye ink.
  const cols = [accent, '#ffc93c', look.dark ? '#f4f6fb' : mix(pal.deep, '#1b1d22', 0.5)]
  for (const [i, b] of rig.balls.entries()) if (b.on > 0.02) dot(g, b.x, b.y, (lod ? 0.1 : 0.075) * b.on, cols[i])

  // Mood props.
  if (f.mood === 'sleepy') zees(g, Math.min(def.body.a * 0.5, 0.36), shape.top + (lod ? 0.12 : 0.02), f, look.dark ? '#e8ebf2' : mix(pal.deep, '#1b1d22', 0.4), lod)
  const sparkAmt = f.mood === 'celebrating' ? 1 : f.mood === 'done' ? (A ? 1 - Math.min(1, Math.max(0, (f.moodAge - 0.6) / 0.8)) : 0.6) : 0
  sparkles(g, 0, shape.yc - 0.05, def.body.a * 1.22, bodyH * 0.62, sparkAmt, f, ['#ffc93c', accent, look.dark ? '#ffffff' : '#ff8fb1'], lod)
  if (f.mood === 'worried') sweat(g, def.face.gx - def.face.ex - 0.16, def.face.ey - 0.06, f, lod)
  g.restore()
}

export const MOOD_TIME = 2.6
