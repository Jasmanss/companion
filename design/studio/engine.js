// Character Studio engine: one shared WebGL renderer draws every view (big stage, peek, header, mood sheet)
// into its own 2D canvas, so the page never runs out of WebGL contexts.
//
// A character is an ES module in ./characters/<id>.js whose default export is:
//   {
//     id, name, vibe,                       // vibe: one sentence
//     eyes: ['pills', 'dots', 'arcs'],      // eye styles it supports (the Eyes control); [] if it has its own
//     accessories: true,                    // optional: it draws look.hat and look.glasses (the Hat and Glasses controls)
//     frame: { height: 2.6, y: 0 },         // world units the camera fits vertically, and where it looks
//     style: 'glass' | 'solid',             // optional, shown on the card; solid characters use kit.solid
//     create(ctx) -> instance,
//   }
//   ctx = { THREE, kit, look, size }        // size: 'big' | 'header' | 'peek'
//   instance = {
//     object,                               // THREE.Object3D, centered near the origin
//     update(face, look),                   // every frame: face is the shared mood state below
//     setLook(look),                        // tint, frost, dark or eyes changed (optional: else it's recreated)
//     dispose(),
//   }
//   look = { tint: {key, name, glass, glow, ink, soft, body} (THREE.Color), frost: 0..1, dark: bool, eyes, size,
//            hat: 'none' | 'bowler' | 'top', glasses: 'none' | 'half-moon' | 'round' | 'monocle',
//            eye: {key, hex, color, lit, contrast} (eye color, see eyeFor), accent: THREE.Color, accentArms: bool,
//            think: 'juggle' | 'chin' | 'twirl' (the toy family's thinking loop) }
//   tint.body is the color a solid character is painted; older characters build their own from glass/glow/ink/soft.
//
// face (read-only for characters; Phase 4 ports step() into face-drawing.ts as stepFace):
//   mood, moodAge (s since the mood changed), prevMood, t, dt, clock (liquid time: runs faster when lively/worried),
//   open (eyelid 0..1.15), blink (1 open, dips on blinks), lookX/lookY (-1..1), level (mouth while talking 0..1),
//   droop (upper lids lowered 0..1: resting, sleepy), happy (squinting arc eyes 0..1: done eases back, celebrating),
//   pulse (0..1, needs-you), think (0..1 phase of the thinking loop, one THINK_PERIOD long: eyes and arms share it),
//   wob (wobble amount), rip (ripples, talking), swirl (thinking), warm (worried tint), spark (celebrating),
//   bounce (celebrating hop, world units, <= 0), P (personality amplitude: calm .55, lively 1.35), rm (reduced motion),
//   activity ('read' | 'search' | null), pointer {x, y}
import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

export { THREE }

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

// name, glass, glow, ink, soft, body. The first five keep their hand-tuned tones; the rest derive them from body.
const HEX = {
  ice: ['Ice', '#c8e4ff', '#60beff', '#124678', '#b2dcff', '#a6d4ff'],
  lilac: ['Lilac', '#ded4ff', '#a88cff', '#462e96', '#d6caff', '#c2b0ff'],
  mint: ['Mint', '#c6f2e0', '#46d6a0', '#0c5a40', '#aaeed2', '#8fe2bf'],
  peach: ['Peach', '#ffdac8', '#ff9268', '#883416', '#ffceba', '#ffbd9b'],
  graphite: ['Graphite', '#a8b0be', '#c8d2e4', '#1e222a', '#d6dce8', '#59616f'],
  butter: ['Butter', null, null, null, null, '#ffdf86'],
  rose: ['Rose', null, null, null, null, '#ffa9c6'],
  sky: ['Sky', null, null, null, null, '#5fb0ff'],
  coral: ['Coral', null, null, null, null, '#ff7d6b'],
  sage: ['Sage', null, null, null, null, '#a6c39a'],
  cream: ['Cream', null, null, null, null, '#f5ead6'],
}
export const TINT_KEYS = Object.keys(HEX)
export const WARM = new THREE.Color('#ffb870')
const SRGB = THREE.SRGBColorSpace
const isHex = (s) => typeof s === 'string' && /^#[0-9a-f]{6}$/i.test(s)
const clamp01 = (v) => Math.min(1, Math.max(0, v))
const hsl = (h, s, l) => new THREE.Color().setHSL(((h % 1) + 1) % 1, clamp01(s), clamp01(l), SRGB)
const hexOf = (c) => '#' + c.getHexString()
/** WCAG relative luminance (THREE.Color keeps linear sRGB, which is what the formula wants). */
export const luminance = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
/** WCAG contrast ratio, 1 to 21. 3 is the floor for big shapes like eyes. */
export function contrast(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }

/**
 * A tint from a preset key or any '#rrggbb'. Hex input derives the whole family from the body color: a pale glass,
 * a bright glow, a dark ink and a soft tone of the same hue, so older characters work with any color too.
 */
export function tint(key) {
  const custom = isHex(key)
  const row = custom ? ['Custom', null, null, null, null, key.toLowerCase()] : HEX[key] ?? HEX.ice
  const body = new THREE.Color(row[5])
  const { h, s, l } = body.getHSL({}, SRGB)
  const grey = s < 0.12
  const derived = {
    glass: hsl(h, grey ? s : s * 0.9, 0.85),
    glow: hsl(h, grey ? s * 1.5 : Math.max(0.55, Math.min(1, s * 1.1)), 0.66),
    ink: hsl(h, grey ? s : Math.min(0.7, s * 0.8), 0.17),
    soft: hsl(h, grey ? s : s * 0.9, 0.8),
  }
  const pick = (i, k) => (row[i] ? new THREE.Color(row[i]) : derived[k])
  const t = { key: custom ? key.toLowerCase() : HEX[key] ? key : 'ice', name: row[0], glass: pick(1, 'glass'), glow: pick(2, 'glow'), ink: pick(3, 'ink'), soft: pick(4, 'soft'), body, h, s, l }
  t.hex = { glass: hexOf(t.glass), glow: hexOf(t.glow), ink: hexOf(t.ink), soft: hexOf(t.soft), body: hexOf(body) }
  return t
}

/* ---------------- eye and accent colors (the toy family) ---------------- */
export const EYE_PRESETS = [['auto', 'Auto'], ['ink', 'Ink'], ['white', 'White'], ['glow', 'Glow'], ['warm', 'Warm']]
const INK = (tn) => hsl(tn.h, Math.min(0.45, tn.s * 0.6), 0.09)
const WHITE_EYE = new THREE.Color('#fbfcff')
/**
 * Eye color for a body tint. auto picks ink or white, whichever reads better on the body. glow and warm adapt their
 * lightness to the body so they stay readable; ink, white and custom colors are kept as chosen (contrast is reported).
 */
export function eyeFor(tn, choice = 'auto') {
  const body = tn.body, darkBody = luminance(body) < 0.3
  let color, lit = false, key = choice
  if (isHex(choice)) color = new THREE.Color(choice)
  else if (choice === 'ink') color = INK(tn)
  else if (choice === 'white') color = WHITE_EYE.clone()
  else if (choice === 'glow') { color = darkBody ? hsl(tn.h, Math.max(0.75, tn.s), 0.74) : hsl(tn.h + 0.5, 0.9, 0.36); lit = true }
  else if (choice === 'warm') color = darkBody ? new THREE.Color('#ffc261') : new THREE.Color('#4a2716')
  else { key = 'auto'; const ink = INK(tn); color = contrast(ink, body) >= contrast(WHITE_EYE, body) ? ink : WHITE_EYE.clone() }
  return { key, color, hex: hexOf(color), lit, contrast: contrast(color, body), light: luminance(color) > 0.4 }
}
/** A second color for hands and small trim: the body hue turned around, at a lightness that stands apart from the body. */
export function accentFor(tn, choice = 'auto') {
  if (isHex(choice)) return new THREE.Color(choice)
  if (tn.s < 0.12) return hsl(0.02, 0.75, tn.l > 0.5 ? 0.6 : 0.68) // grey bodies: a coral accent
  const l = tn.l > 0.62 ? tn.l - 0.16 : tn.l + 0.16
  return hsl(tn.h + 0.42, Math.min(0.85, Math.max(0.5, tn.s)), Math.min(0.82, Math.max(0.4, l)))
}
/** A pleasing random body/eye/accent combo: soft-toy saturation and lightness, no muddy or low-contrast results. */
export function randomCombo(rand = Math.random) {
  for (let tries = 0; tries < 40; tries++) {
    const h = rand(), band = rand()
    let s, l
    if (band < 0.45) { s = 0.55 + rand() * 0.35; l = 0.74 + rand() * 0.1 } // pastel
    else if (band < 0.85) { s = 0.55 + rand() * 0.3; l = 0.58 + rand() * 0.1 } // mid
    else { s = 0.4 + rand() * 0.25; l = 0.3 + rand() * 0.12 } // deep
    if (h > 0.1 && h < 0.2 && l < 0.6) continue // olive and brown read as dirty on a toy
    const body = hexOf(hsl(h, s, l))
    const tn = tint(body)
    const eyes = ['auto', 'auto', 'auto', 'glow', 'warm', 'ink', 'white']
    const eye = eyes[Math.floor(rand() * eyes.length)]
    if (eyeFor(tn, eye).contrast < 3.5) continue
    const accent = rand() < 0.5 ? 'auto' : hexOf(hsl(h + [0.08, 0.42, 0.5, 0.58][Math.floor(rand() * 4)], 0.6 + rand() * 0.25, l > 0.6 ? l - 0.18 : l + 0.2))
    if (contrast(accentFor(tn, accent), tn.body) < 1.25) continue
    return { body, eye, accent }
  }
  return { body: '#ffbd9b', eye: 'auto', accent: 'auto' }
}

/* ---------------- mood state (shared by every character) ---------------- */
const FX = {
  resting: { wob: 0.45, sp: 0.35 },
  idle: { wob: 0.6, sp: 1 },
  listening: { wob: 0.7, sp: 1.3 },
  thinking: { wob: 0.5, sp: 0.9, swirl: 1 },
  talking: { wob: 0.55, sp: 1.1, rip: 1 },
  done: { wob: 0.6, sp: 1 },
  'needs-you': { wob: 0.75, sp: 1.4 },
  worried: { wob: 0.9, sp: 1.8, warm: 1 },
  celebrating: { wob: 1, sp: 1.6, spark: 1 },
  sleepy: { wob: 0.3, sp: 0.3 },
}
const ease = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt))
const speaking = (t) => Math.min(1, (Math.abs(Math.sin(t * 9.1)) * 0.6 + Math.abs(Math.sin(t * 3.7 + 1.3)) * 0.4) * (0.65 + 0.35 * Math.sin(t * 1.1)))
/** Stable pseudo-random 0..1, so blinks and glances are irregular but the same on every run. */
const rnd = (a, b) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v) }
/** Seconds for one thinking loop: one eye scan across, and one full juggling cycle, so eyes and arms stay in time. */
export const THINK_PERIOD = 2.4
// Mean seconds between blinks (irregular around it), and slow blinks for drowsy moods. Default 3.2 s and 0.14 s.
const BLINK_GAP = { resting: 5, sleepy: 4.6, listening: 4.4, talking: 2.6, thinking: 3.6, 'needs-you': 4, worried: 2.1 }
const BLINK_LEN = { resting: 0.34, sleepy: 0.46 }

export function newFace(seed = Math.random()) {
  return {
    mood: 'idle', prevMood: 'idle', moodAge: 10, t: 0, dt: 0, clock: seed * 20, open: 1, blink: 1, blinkAt: -9, nextBlink: 1 + seed * 3,
    blinkLen: 0.14, blinkN: 0, droop: 0, happy: 0, pulse: 0, think: 0, glanceAt: 2 + seed * 3, glanceUntil: 0, gx: 0, gy: 0, sacAt: 0, sx: 0, sy: 0,
    lookX: 0, lookY: 0, level: 0, wob: 0.5, sp: 1, rip: 0, swirl: 0, warm: 0, spark: 0, bounce: 0, P: 0.55, pers: 'calm', rm: false,
    activity: null, pointer: { x: 0, y: 0 }, seed,
  }
}

export function step(f, mood, t, dt, pointer, o) {
  if (mood !== f.mood) { f.prevMood = f.mood; f.mood = mood; f.moodAge = 0 } else f.moodAge += dt
  const fx = FX[mood] ?? FX.idle
  f.pers = o.pers
  f.P = o.pers === 'lively' ? 1.35 : 0.55
  f.rm = !!o.rm
  f.activity = o.activity ?? null
  f.pointer = pointer
  f.t = t
  f.dt = dt
  if (f.rm) {
    // Reduced motion: a still pose per mood. No wobble, blinks, glances, loops or bounce; the pose changes stay.
    const lk = mood === 'thinking' ? [0.65, -0.6] : mood === 'resting' || mood === 'sleepy' ? [0, 0.4] : [0, 0]
    Object.assign(f, {
      wob: 0, rip: 0, swirl: fx.swirl ? 0.7 : 0, warm: fx.warm || 0, spark: fx.spark ? 0.8 : 0, bounce: 0, blink: 1,
      level: mood === 'talking' ? 0.6 : 0, lookX: lk[0], lookY: lk[1],
      open: mood === 'sleepy' ? 0.3 : mood === 'worried' ? 0.85 : mood === 'listening' || mood === 'needs-you' ? 1.15 : 1,
      droop: mood === 'sleepy' ? 0.7 : mood === 'resting' ? 0.45 : 0, happy: mood === 'done' || mood === 'celebrating' ? 1 : 0, pulse: 0, think: 0.2,
    })
    return f
  }
  f.wob = ease(f.wob, fx.wob * f.P, 3, dt)
  f.sp = ease(f.sp, fx.sp * (o.pers === 'lively' ? 1.15 : 0.85), 2, dt)
  f.rip = ease(f.rip, fx.rip || 0, 5, dt)
  f.swirl = ease(f.swirl, fx.swirl || 0, 4, dt)
  f.warm = ease(f.warm, fx.warm || 0, 3, dt)
  f.spark = ease(f.spark, fx.spark || 0, 5, dt)
  f.clock += dt * f.sp
  f.think = (((t / THINK_PERIOD) % 1) + 1) % 1
  let look
  let lr = o.pers === 'lively' ? 10 : 6
  if (f.activity === 'read') look = [Math.sin(t * 2.6) * 0.8, 0.3]
  else if (f.activity === 'search') look = [Math.sin(t * 1.4) * 0.85, Math.cos(t * 2.1) * 0.55]
  else if (mood === 'thinking') {
    // Up and to the side, scanning once across per loop, with a small flick at each end. Never a frozen stare.
    const ph = f.think * Math.PI * 2
    look = [0.2 + 0.5 * Math.sin(ph) + 0.08 * Math.sin(ph * 3), -0.58 + 0.07 * Math.sin(ph * 2)]
    lr = 9
  } else if (mood === 'resting' || mood === 'sleepy') {
    // Drifting: slow, aimless, a little low.
    look = [0.24 * Math.sin(t * 0.27 + f.seed * 6), 0.38 + 0.08 * Math.sin(t * 0.19 + f.seed * 3)]
    lr = 2.2
  } else if (mood === 'worried') look = [Math.sin(t * 1.7) * 0.55, 0.15]
  else if (mood === 'talking') {
    // Engaged with you, with small saccades: quick jumps every third of a second or so.
    if (t > f.sacAt || f.sacAt - t > 2) { f.sacAt = t + 0.25 + 0.5 * rnd(f.seed, t); f.sx = (rnd(t, f.seed) - 0.5) * 0.36; f.sy = (rnd(f.seed + 1, t) - 0.5) * 0.22 }
    look = [pointer.x * 0.3 + f.sx, pointer.y * 0.2 + f.sy]
    lr = 22
  } else if (mood === 'needs-you') look = [pointer.x * 0.15, pointer.y * 0.1] // straight at you
  else if (mood === 'idle') {
    // Relaxed, loosely on you, with an occasional glance away and back.
    if (f.glanceAt - t > 9) f.glanceAt = t + 1
    if (t > f.glanceAt) { f.glanceUntil = t + 0.7 + 0.7 * rnd(f.seed, f.glanceAt); f.gx = (rnd(f.glanceAt, f.seed) - 0.5) * 1.6; f.gy = (rnd(f.seed + 2, f.glanceAt) - 0.6) * 0.8; f.glanceAt = f.glanceUntil + 2 + 3.5 * rnd(f.glanceAt, 3) }
    const glancing = t < f.glanceUntil
    look = glancing ? [f.gx, f.gy] : [pointer.x * 0.4, pointer.y * 0.3]
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
  // Celebrating is the only mood that bounces.
  f.bounce = mood === 'celebrating' ? -Math.abs(Math.sin(t * 6.5)) * (o.pers === 'lively' ? 0.16 : 0.09) : ease(f.bounce, 0, 10, dt)
  return f
}

/* ---------------- material kit ---------------- */
function radialTexture(stops) {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  stops.forEach(([at, col]) => gr.addColorStop(at, col))
  g.fillStyle = gr
  g.fillRect(0, 0, 128, 128)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export function makeKit() {
  const glowTex = radialTexture([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,.55)'], [0.6, 'rgba(255,255,255,.12)'], [1, 'rgba(255,255,255,0)']])
  return {
    /** Physical glass. frost 0 = clear, 1 = heavily frosted. Pass the result to updateGlass when the look changes. */
    glass(look, extra = {}) {
      const m = new THREE.MeshPhysicalMaterial({ transmission: 1, thickness: 0.8, ior: 1.45, roughness: 0.1, metalness: 0, iridescence: 0.25, iridescenceIOR: 1.3, clearcoat: 1, clearcoatRoughness: 0.05, transparent: true, ...extra })
      this.updateGlass(m, look, extra)
      return m
    },
    updateGlass(m, look, extra = {}) {
      const tn = look.tint
      m.roughness = extra.roughness ?? 0.06 + 0.42 * look.frost
      m.color.copy(tn.glass).lerp(new THREE.Color(1, 1, 1), look.dark ? 0.15 : 0.45)
      m.attenuationColor.copy(tn.glass)
      m.attenuationDistance = extra.attenuationDistance ?? 1.6 - look.frost * 0.8
      m.envMapIntensity = look.dark ? 0.8 : 1.1
      m.needsUpdate = true
    },
    /**
     * Solid soft-toy material (designer vinyl / soft-touch clay), for opaque characters. look.frost doubles as the finish:
     * 0 = glossy enamel, 1 = soft matte. Pass the result to updateSolid when the look changes.
     */
    solid(color, look, extra = {}) {
      const m = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(color), sheen: 0.5, sheenRoughness: 0.6, sheenColor: new THREE.Color(1, 1, 1), ...extra })
      this.updateSolid(m, look, extra)
      return m
    },
    updateSolid(m, look, extra = {}) {
      m.roughness = extra.roughness ?? 0.28 + 0.45 * look.frost
      m.clearcoat = extra.clearcoat ?? 0.6 * (1 - look.frost)
      m.clearcoatRoughness = 0.25
      m.envMapIntensity = look.dark ? 0.7 : 1
      m.needsUpdate = true
    },
    /** Additive soft glow sprite: put it behind or inside glass to make light. */
    glowSprite(color, size = 1, opacity = 0.8) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }))
      s.scale.setScalar(size)
      return s
    },
    /** Fresnel rim: a bright edge that hugs the silhouette. Use on a mesh sharing the body's geometry, scaled 1.0-1.01. */
    rim(color, { power = 2.4, intensity = 0.9 } = {}) {
      return new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { color: { value: new THREE.Color(color) }, power: { value: power }, intensity: { value: intensity } },
        vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
        fragmentShader: 'uniform vec3 color; uniform float power; uniform float intensity; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.-max(dot(normalize(vN),normalize(vV)),0.),power); gl_FragColor = vec4(color*f*intensity, f*intensity); }',
      })
    },
    /** Self-lit material for eyes and other light. */
    light(color, intensity = 1.6) {
      return new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), toneMapped: false })
    },
    glowTex,
  }
}

/** A 2D face drawn on a canvas, for characters with a screen or visor. Returns a texture and a draw(face, look, colors) function. */
export function faceCanvas(w = 256, h = 160) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const g = canvas.getContext('2d')
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  function draw(f, look, { eye = '#e8f6ff', glow = '#60beff', bg = null, sep = 0.36, eyeW = 0.13, eyeH = 0.42, mouthY = 0.78, mouthW = 0.12, lod = false } = {}) {
    g.clearRect(0, 0, w, h)
    if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h) }
    const ew = w * eyeW * (lod ? 1.15 : 1), eh = h * eyeH, lx = f.lookX * w * 0.06, ly = f.lookY * h * 0.06
    g.save()
    g.lineCap = g.lineJoin = 'round'
    g.shadowColor = glow
    g.shadowBlur = h * 0.08
    g.fillStyle = g.strokeStyle = eye
    for (const side of [-1, 1]) {
      const ex = w / 2 + side * w * sep / 2 + lx, ey = h * 0.42 + ly
      if (f.mood === 'done' || f.mood === 'celebrating') {
        g.lineWidth = ew * 0.42
        g.beginPath(); g.arc(ex, ey + ew * 0.45, ew * 0.66, Math.PI * 1.12, Math.PI * 1.88); g.stroke()
      } else if (f.mood === 'resting') {
        g.lineWidth = ew * 0.36
        g.beginPath(); g.arc(ex, ey - ew * 0.5, ew * 0.62, Math.PI * 0.18, Math.PI * 0.82); g.stroke()
      } else {
        const open = Math.max(0.06, f.open * f.blink)
        g.save(); g.translate(ex, ey)
        if (f.mood === 'worried') g.rotate(side * 0.24)
        g.beginPath()
        if (look.eyes === 'dots') { const r = ew * 0.6; g.ellipse(0, 0, r * Math.min(1.12, Math.max(1, open)), Math.max(r * 0.2, r * open), 0, 0, Math.PI * 2) }
        else if (look.eyes === 'arcs') { const r = ew * 0.72, ah = Math.max(r * 0.2, r * Math.min(1.15, open)); g.ellipse(0, ah * 0.45, r, ah, 0, Math.PI, Math.PI * 2); g.closePath() }
        else { const hh = Math.max(ew * 0.32, eh * open); g.roundRect(-ew / 2, -hh / 2, ew, hh, Math.min(ew, hh) / 2) }
        g.fill(); g.restore()
      }
    }
    const mx = w / 2 + lx * 0.6, my = h * mouthY + ly * 0.8, mw = w * mouthW
    g.lineWidth = mw * 0.24
    g.beginPath()
    switch (f.mood) {
      case 'talking': g.ellipse(mx, my, mw * 0.42, Math.max(mw * 0.12, f.level * mw * 0.42), 0, 0, Math.PI * 2); g.fill(); break
      case 'done': case 'celebrating': { const ww = mw * 0.62; g.moveTo(mx - ww, my - 2); g.quadraticCurveTo(mx, my + mw * 0.95, mx + ww, my - 2); g.closePath(); g.fill(); break }
      case 'worried': { const x0 = mx - mw * 0.6; g.moveTo(x0, my); for (let i = 1; i <= 4; i++) g.quadraticCurveTo(x0 + (i - 0.5) * mw * 0.3, my + (i % 2 ? -mw * 0.2 : mw * 0.3), x0 + i * mw * 0.3, my); g.stroke(); break }
      case 'needs-you': g.ellipse(mx, my, mw * 0.22, mw * 0.28, 0, 0, Math.PI * 2); g.fill(); break
      case 'thinking': g.arc(mx + mw * 0.3, my, mw * 0.18, 0, Math.PI * 2); g.stroke(); break
      case 'sleepy': case 'resting': case 'listening': g.moveTo(mx - mw * 0.22, my); g.lineTo(mx + mw * 0.22, my); g.stroke(); break
      default: g.moveTo(mx - mw * 0.5, my - mw * 0.1); g.quadraticCurveTo(mx, my + mw * 0.5, mx + mw * 0.5, my - mw * 0.1); g.stroke()
    }
    g.restore()
    texture.needsUpdate = true
  }
  return { canvas, texture, draw }
}

/* ---------------- renderer and views ---------------- */
const MAX_W = 760, MAX_H = 660
export class Studio {
  constructor() {
    this.canvas = document.createElement('canvas')
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, preserveDrawingBuffer: true })
    this.renderer.setPixelRatio(1)
    this.renderer.setSize(MAX_W, MAX_H, false)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.setClearColor(0x000000, 0)
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    this.env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    this.kit = makeKit()
    this.views = []
    this.dpr = Math.min(2, window.devicePixelRatio || 1)
  }

  /** Make a scene holding one character instance. */
  stage(def, look, size) {
    const scene = new THREE.Scene()
    scene.environment = this.env
    const key = new THREE.DirectionalLight(0xffffff, 1.4)
    key.position.set(-2, 3, 4)
    const fill = new THREE.DirectionalLight(0xffffff, 0.4)
    fill.position.set(3, -1, 2)
    scene.add(key, fill)
    const fr = { height: 2.6, y: 0, ...(def.frame || {}), ...((def.frame && def.frame[size]) || {}) }
    const camera = new THREE.PerspectiveCamera(26, 200 / 172, 0.1, 50)
    const dist = fr.height / 2 / Math.tan(THREE.MathUtils.degToRad(13))
    camera.position.set(0, fr.y, dist)
    camera.lookAt(0, fr.y, 0)
    const inst = def.create({ THREE, kit: this.kit, look, size })
    scene.add(inst.object)
    const backdrop = def.backdrop === false ? null : this.backdrop(look, dist)
    if (backdrop) scene.add(backdrop)
    return { scene, camera, inst, key, fill, backdrop }
  }

  /**
   * What the glass refracts. With a transparent canvas, three.js fills the transmission buffer with half-transparent
   * white, so glass looks milky gray. This plane sits behind the character, tinted like the panel it lives on, and
   * draws only in the transmission pass: you see it through glass and nowhere else.
   */
  backdrop(look, dist) {
    const key = `${look.tint.key}|${look.dark}`
    this.backdrops ??= new Map()
    let tex = this.backdrops.get(key)
    if (!tex) {
      const c = document.createElement('canvas')
      c.width = c.height = 256
      const g = c.getContext('2d')
      const base = look.dark ? new THREE.Color('#1a1d25').lerp(look.tint.glass, 0.08) : new THREE.Color('#ffffff').lerp(look.tint.glass, 0.35)
      const lin = g.createLinearGradient(0, 0, 0, 256)
      lin.addColorStop(0, '#' + base.clone().lerp(new THREE.Color(look.dark ? '#2a2f3a' : '#ffffff'), 0.5).getHexString())
      lin.addColorStop(1, '#' + base.getHexString())
      g.fillStyle = lin
      g.fillRect(0, 0, 256, 256)
      if (!look.dark) {
        // Light panels are nearly white, so clear glass has nothing to show and reads as milky ceramic. A soft horizon
        // (bright above, a gentle band of panel shadow below) gives the refraction structure, like glass on a desk.
        const band = g.createLinearGradient(0, 120, 0, 256)
        const ink = look.tint.ink
        band.addColorStop(0, 'rgba(255,255,255,0)')
        band.addColorStop(0.35, `rgba(${(ink.r * 255) | 0},${(ink.g * 255) | 0},${(ink.b * 255) | 0},0.16)`)
        band.addColorStop(0.6, `rgba(${(ink.r * 255) | 0},${(ink.g * 255) | 0},${(ink.b * 255) | 0},0.07)`)
        band.addColorStop(1, 'rgba(255,255,255,0)')
        g.fillStyle = band
        g.fillRect(0, 120, 256, 136)
      }
      // Soft colored light, so refraction has something to bend.
      for (const [x, y, r, col, a] of [[60, 70, 120, look.tint.hex.glow, look.dark ? 0.35 : 0.3], [200, 190, 130, look.tint.hex.soft, 0.4], [210, 40, 90, '#ffffff', look.dark ? 0.12 : 0.5]]) {
        const rg = g.createRadialGradient(x, y, 0, x, y, r)
        const cc = new THREE.Color(col)
        rg.addColorStop(0, `rgba(${(cc.r * 255) | 0},${(cc.g * 255) | 0},${(cc.b * 255) | 0},${a})`)
        rg.addColorStop(1, 'rgba(255,255,255,0)')
        g.fillStyle = rg
        g.fillRect(0, 0, 256, 256)
      }
      tex = new THREE.CanvasTexture(c)
      tex.colorSpace = THREE.SRGBColorSpace
      this.backdrops.set(key, tex)
    }
    const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat)
    const z = -3
    const h = 2 * (dist - z) * Math.tan(THREE.MathUtils.degToRad(13)) * 1.6
    plane.scale.set(h * 1.4, h, 1)
    plane.position.z = z
    plane.renderOrder = -10
    plane.onBeforeRender = (renderer) => {
      const inTransmission = renderer.getRenderTarget() !== null
      mat.colorWrite = inTransmission
      mat.depthWrite = inTransmission
    }
    plane.userData.backdropKey = key
    return plane
  }

  render(st, ctx2d, W, H, dark) {
    const w = Math.min(MAX_W, Math.round(W * this.dpr)), h = Math.min(MAX_H, Math.round(H * this.dpr))
    st.camera.aspect = w / h
    st.camera.updateProjectionMatrix()
    st.scene.environmentIntensity = dark ? 0.75 : 1
    st.key.intensity = dark ? 1.1 : 1.4
    const r = this.renderer
    r.setViewport(0, 0, w, h)
    r.setScissor(0, 0, w, h)
    r.setScissorTest(true)
    r.clear()
    r.render(st.scene, st.camera)
    ctx2d.canvas.width !== w && (ctx2d.canvas.width = w)
    ctx2d.canvas.height !== h && (ctx2d.canvas.height = h)
    ctx2d.clearRect(0, 0, w, h)
    ctx2d.drawImage(this.canvas, 0, MAX_H - h, w, h, 0, 0, w, h)
  }
}
