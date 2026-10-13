// Shared arm rig for the toy family (Bao, Reed, Tofu): two small stubby arms that swing from shoulder pivots.
// Each arm is a capsule hung from a ball joint sunk into the body, with a mitten hand on the end. Poses are two angles:
// out (sideways, 0 = hanging, PI/2 = level, PI = straight up) and fwd (swing forward), plus a hand wave. Every angle
// runs through a slightly underdamped spring, behind a short lag that is longer on the screen-right arm, so the arms
// overlap and settle instead of snapping. Characters only choose length, thickness, shoulder position and rest angle.
import * as THREE from 'three'
import { THINK_PERIOD } from '../engine.js'

const TAU = Math.PI * 2
const L = -1, R = 1 // screen-left, screen-right

/** Pose targets for one arm. s is the side; a is motion amplitude (0 under reduced motion); c the personality. */
function armTarget(o, s, f, rest, a, think, c) {
  const t = f.t, age = f.moodAge, lvl = f.level
  o.out = rest; o.fwd = 0.1; o.wave = 0; o.grip = 0
  switch (f.mood) {
    case 'resting':
      o.out = rest * 0.55; o.fwd = -0.04 + a * 0.03 * Math.sin(f.clock * 0.6 + s); break
    case 'sleepy':
      o.out = rest * 0.35; o.fwd = 0.06 + a * 0.05 * Math.sin(t * 0.8); break // droop with the nodding
    case 'idle':
      o.out = rest + a * 0.06 * Math.sin(f.clock * 0.8 + s * 1.3); o.fwd = 0.12 + a * 0.05 * Math.sin(f.clock * 0.55 + s); break
    case 'listening':
      // The screen-right hand cups the ear; the other hangs relaxed.
      if (s === R) { o.out = 2.3; o.fwd = 0.5; o.wave = -0.35 } else { o.out = rest + 0.12; o.fwd = 0.18 }
      break
    case 'thinking': {
      const ph = f.think * TAU
      if (think === 'chin') {
        // Hand to the chin, tapping; the other arm folded across the tummy to prop the elbow.
        if (s === R) { o.out = -0.3; o.fwd = 2.0 + (c.chin || 0) - a * 0.1 * Math.max(0, Math.sin(ph * 4)); o.wave = 0.3 } else { o.out = c.fold ?? rest + 0.05; o.fwd = c.fold !== undefined ? 1.05 : 0.5; o.wave = 0.2 }
      } else if (think === 'twirl') {
        // Rolling hands in front of the chest, around each other twice a loop.
        const p = ph * 2 + (s === R ? Math.PI : 0)
        o.out = 0.32 + a * 0.24 * Math.cos(p); o.fwd = 1.2 + a * 0.26 * Math.sin(p) * s
      } else {
        // Juggling: hands at chest height, scooping in small circles; each hand throws three times a loop.
        const p = ph * 3 + (s === R ? Math.PI : 0)
        o.out = 0.55 + a * 0.16 * Math.sin(p); o.fwd = 1.1 + a * 0.2 * Math.cos(p); o.grip = 1
      }
      break
    }
    case 'talking': {
      // Small gestures that follow the voice, one arm then the other.
      const turn = Math.floor(t / 1.7 + f.seed * 3) % 2 === 0 ? L : R
      if (s === turn) { o.out = rest + 0.5 + 0.35 * lvl * a; o.fwd = 0.75 + 0.25 * lvl * a * Math.sin(t * 3); o.wave = 0.2 * lvl * a }
      else { o.out = rest + 0.1; o.fwd = 0.25 }
      break
    }
    case 'done': {
      // A fist-pump on the screen-right arm: wind up, pump, hold the "yes", then settle contented.
      if (s === R) {
        if (!a) { o.out = 2.5; o.fwd = 0.35 }
        else if (age < 0.22) { o.out = 1.1; o.fwd = 0.5 }
        else if (age < 2.3) { o.out = 2.55 + 0.22 * Math.max(0, Math.sin((age - 0.22) * 9)) * (age < 1.4 ? 1 : 0); o.fwd = 0.35; o.grip = 1 }
        else { o.out = rest + 0.25; o.fwd = 0.35 }
      } else { o.out = rest + 0.3; o.fwd = 0.2 }
      break
    }
    case 'needs-you':
      // The screen-left arm up and waving for attention.
      if (s === L) { o.out = 2.7; o.fwd = 0.22; o.out += a * 0.26 * Math.sin(t * 7.2); o.wave = a * 0.45 * Math.sin(t * 7.2 + 0.9) } else { o.out = rest + 0.15; o.fwd = 0.2 }
      break
    case 'worried':
      // Pulled in close, a slight tremble.
      o.out = 0.1 + a * 0.03 * Math.sin(t * 37 + s); o.fwd = 0.45 + a * 0.025 * Math.sin(t * 29 + s * 2); o.wave = 0.25; break
    case 'celebrating': {
      // Both arms up, flapping with the hop.
      const hop = Math.min(1, -f.bounce / 0.09)
      o.out = 2.5 + a * (0.2 * hop + 0.12 * Math.sin(t * 13 + s)); o.fwd = 0.18; o.wave = a * 0.3 * Math.sin(t * 13 + s); break
    }
  }
  return o
}

/**
 * spec: { len, rad, hand (arm length, thickness, mitten size), rest (hanging angle out from the body),
 *         k (spring stiffness), zeta (damping: lower is bouncier), chin (extra swing for the chin pose), toss (juggle height) }
 * The character kit places the shoulders (spec.y, spec.angle, spec.sink) and passes them to update every frame.
 */
export function makeArms({ kit, look, size, bodyMat, spec, clearZ = () => -9 }) {
  const small = size !== 'big'
  const rad = spec.rad * (small ? 1.22 : 1), hand = spec.hand * (small ? 1.15 : 1), len = spec.len
  const geos = [], mats = []
  const armGeo = new THREE.CapsuleGeometry(rad, len, 8, 18)
  armGeo.translate(0, -len / 2, 0) // the top ball sits on the pivot, so it turns in place like a joint
  const handGeo = new THREE.SphereGeometry(hand, 20, 14)
  handGeo.scale(1, 0.92, 0.86)
  geos.push(armGeo, handGeo)
  const handMat = kit.solid(look.tint.body, look, { sheen: 0.35 })
  mats.push(handMat)
  const group = new THREE.Group()
  const arms = [L, R].map((s) => {
    const pivot = new THREE.Group()
    const limb = new THREE.Mesh(armGeo, bodyMat)
    const wrist = new THREE.Group()
    wrist.position.y = -len
    const mitt = new THREE.Mesh(handGeo, handMat)
    mitt.position.set(s * hand * 0.12, -hand * 0.25, hand * 0.1)
    wrist.add(mitt)
    pivot.add(limb, wrist)
    group.add(pivot)
    const ch = {}
    for (const k of ['out', 'fwd', 'wave', 'grip']) ch[k] = { x: 0, v: 0, lag: 0 }
    return { s, pivot, wrist, mitt, ch, tgt: {} }
  })

  // Juggling balls: three small bright beads.
  const ballGeo = new THREE.SphereGeometry(small ? 0.12 : 0.095, 18, 12)
  geos.push(ballGeo)
  const ballMats = [0, 1, 2].map(() => { const m = kit.solid('#ffffff', look, { roughness: 0.25, clearcoat: 1 }); mats.push(m); return m })
  const balls = ballMats.map((m) => { const b = new THREE.Mesh(ballGeo, m); b.visible = false; group.add(b); return b })

  let lastT = null, jw = 0
  const K = spec.k ?? 90, Z = spec.zeta ?? 0.62
  const handPos = [new THREE.Vector3(), new THREE.Vector3()]
  const e = new THREE.Euler(), v = new THREE.Vector3()

  function setLook(l, bodyColor, accentColor) {
    handMat.color.copy(l.accentArms ? accentColor : bodyColor)
    kit.updateSolid(handMat, l)
    handMat.envMapIntensity *= 0.35
    handMat.sheen = l.dark ? 0.5 : 0.15
    // Three cheerful beads that stand out on any body: the accent, a sunny yellow and a white.
    const cols = [accentColor, new THREE.Color('#ffc93c'), new THREE.Color('#f4f6fb')]
    ballMats.forEach((m, i) => { m.color.copy(cols[i]); kit.updateSolid(m, l, { roughness: 0.25 }); m.envMapIntensity *= 0.6; m.emissive.copy(cols[i]).multiplyScalar(0.18) })
  }
  setLook(look, look.tint.body, look.accent)

  /** Where a hand is, in the group's space, for a given shoulder and pose. */
  function handAt(out, fwd, s, sh, target) {
    e.set(-fwd, 0, s * out, 'XYZ')
    return target.set(0, -len, 0).applyEuler(e).add(sh)
  }

  /** shoulders: [left, right] Vector3 in the group's space (already following the body's squash). */
  function update(f, look, shoulders) {
    const snap = lastT === null || f.rm || Math.abs(f.t - f.dt - lastT) > 0.25
    lastT = f.t
    const a = f.rm ? 0 : Math.min(1.6, 0.55 + f.P * 0.5)
    const think = look.think || 'juggle'
    const dt = Math.min(0.1, f.dt || 1 / 60)
    for (const [i, arm] of arms.entries()) {
      armTarget(arm.tgt, arm.s, f, spec.rest, a, think, spec)
      // Mirror: a positive out swings each arm away from the body on its own side.
      const lagT = arm.s === R ? 0.07 : 0.04
      for (const [k, c] of Object.entries(arm.ch)) {
        const target = arm.tgt[k]
        if (snap) { c.x = c.lag = target; c.v = 0; continue }
        c.lag += (target - c.lag) * (1 - Math.exp(-dt / lagT))
        // Spring, in small substeps so a slow frame never blows it up.
        const n = Math.ceil(dt / (1 / 240))
        const h = dt / n, kk = K * (k === 'wave' ? 1.6 : 1), cc = 2 * Z * Math.sqrt(kk)
        for (let j = 0; j < n; j++) { c.v += (kk * (c.lag - c.x) - cc * c.v) * h; c.x += c.v * h }
      }
      const { out, fwd, wave } = { out: arm.ch.out.x, fwd: arm.ch.fwd.x, wave: arm.ch.wave.x }
      arm.pivot.position.copy(shoulders[i])
      arm.pivot.rotation.set(-fwd, 0, arm.s * out, 'XYZ')
      // Follow-through: the mitten trails the arm's swing a little, then catches up.
      arm.wrist.rotation.set(arm.ch.fwd.v * 0.02, 0, arm.s * (wave - arm.ch.out.v * 0.025))
      arm.mitt.scale.setScalar(1 - 0.08 * arm.ch.grip.x)
      handAt(out, fwd, arm.s, shoulders[i], handPos[i])
    }

    // Juggling balls ride a three-ball cascade: a throw every sixth of a loop, alternating hands.
    jw += ((f.mood === 'thinking' && think === 'juggle' ? 1 : 0) - jw) * (snap ? 1 : 1 - Math.exp(-8 * dt))
    const show = jw > 0.02
    const D = 1 / 6 // one throw, as a fraction of the loop
    for (const [i, b] of balls.entries()) {
      b.visible = show
      if (!show) continue
      const time = f.think + (f.rm ? i * 0.11 : 0)
      const local = (((time - i * D) % (3 * D)) + 3 * D) % (3 * D)
      const n = Math.floor((((time - i * D) % 1) + 1) % 1 / (3 * D))
      const from = (i + n) % 2 === 0 ? 0 : 1, to = 1 - from
      if (local < 2 * D) {
        const u = local / (2 * D)
        v.lerpVectors(handPos[from], handPos[to], u)
        v.y += 4 * (spec.toss ?? 0.5) * u * (1 - u) + 0.06
        v.z += 0.08 + 0.06 * Math.sin(u * Math.PI)
        v.z = Math.max(v.z, clearZ(v.x, v.y))
      } else v.copy(handPos[to]).add({ x: 0, y: 0.07, z: 0.06 })
      b.position.copy(v)
      b.scale.setScalar(jw)
    }
  }

  return {
    group,
    update,
    setLook,
    dispose() { for (const g of geos) g.dispose(); for (const m of mats) m.dispose() },
  }
}
