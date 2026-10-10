// Steward: a glass gentleman's gentleman. A clear glass head whose face is light: two calm eyes and fine brows
// under a soft smoked veil (no hard visor), over a glass tailcoat: lapels, a shirt front with onyx studs, a wing
// collar, a satin bow tie, a brushed collar ring and tails at the back. Small glass hands with shirt cuffs
// gesture: a silver tray and towel when idle, a pocket watch when thinking, the approval card presented on the
// tray when it needs you, a bow (and a hat tip) when done, a raised hat when celebrating.
// Accessories (look.hat, look.glasses): bowler or top hat; half-moon readers, round frames or a monocle on a chain.
//
// Layers and three.js transmission:
// - head + torso glass: the only two transmissive materials (tails, hands and the tray glass share the torso's).
// - face: a transparent shell just outside the head, drawn after the glass so the eyes stay crisp at 50x44.
// - everything else (collar, bow, lapels, shirt, hats, frames, props) is opaque and sits outside the glass.
// - poses are a pure function of the face (mood, prevMood, moodAge, t) and the hat, so stills and live views agree.
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

const HEAD_Y = 0.55
const HR = 0.5
const HEAD_S = [1.02, 1, 0.98]
const FACE_PHI = 2.2 // radians of face shell around the head
const FACE_TH0 = 0.78 // from the top of the head
const FACE_TH = 1.5
const FW = 512
const FH = Math.round((FW * FACE_TH) / FACE_PHI)
const EYE_PHI = 0.3 // eyes sit this far either side of the front
const EYE_TH = Math.PI / 2 - 0.05
const EX = (EYE_PHI / FACE_PHI) * FW
const EY = ((EYE_TH - FACE_TH0) / FACE_TH) * FH
const HAT_Y = 0.33 // head-local height where a hat sits
const WARM_EYE = new THREE.Color('#ffc07a')
const WARM_GLOW = new THREE.Color('#ff8a2a')
const WARM = new THREE.Color('#ffb870')
const WHITE = new THREE.Color(1, 1, 1)

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x) }
const css = (c, a = 1) => `rgba(${(clamp(c.r) * 255) | 0},${(clamp(c.g) * 255) | 0},${(clamp(c.b) * 255) | 0},${a})`

/** A point on the head (head-local), at angle phi from the front and theta from the top, pushed out by `out`. */
function headPoint(phi, theta, out, v) {
  const r = HR * (1 + out)
  return v.set(r * Math.sin(theta) * Math.sin(phi) * HEAD_S[0], r * Math.cos(theta) * HEAD_S[1], r * Math.sin(theta) * Math.cos(phi) * HEAD_S[2])
}

/* ---------------- poses ---------------- */
// Body lean (bx, bz), head (hx, hy, hz), right hand r0..r5 and left hand l0..l5 {x,y,z, rx,ry,rz} in body space,
// prop amounts, hat offset (hat*, head space) and glasses offset (g*).
const P_KEYS = ['bx', 'bz', 'hx', 'hy', 'hz', 'r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'l0', 'l1', 'l2', 'l3', 'l4', 'l5',
  'tray', 'card', 'towel', 'watch', 'htx', 'hty', 'htz', 'hrx', 'hrz', 'gdx', 'gdy', 'grz']
function setHand(o, side, x, y, z, rx, ry, rz) {
  const p = side ? 'l' : 'r'
  o[p + 0] = x; o[p + 1] = y; o[p + 2] = z; o[p + 3] = rx; o[p + 4] = ry; o[p + 5] = rz
}
// Hands hang fingers down, palm in. rx -1.4 turns the palm up (to carry), rz tips the fingers.
function pose(o, mood, f, hat) {
  const t = f.rm ? 0 : f.t, A = f.rm ? 0 : f.P
  for (const k of P_KEYS) o[k] = 0
  o.hrz = 0.05 // a slight, deliberate tilt
  switch (mood) {
    case 'resting':
      o.hx = 0.1
      setHand(o, 0, 0.1, -0.5, 0.3, 0.2, 0, 0.9)
      setHand(o, 1, -0.1, -0.53, 0.29, 0.2, 0, -0.9)
      break
    case 'listening':
      o.hx = 0.08; o.hz = -0.1; o.bx = 0.04
      setHand(o, 0, 0.1, -0.44, 0.33, 0.3, 0, 1.05)
      setHand(o, 1, -0.1, -0.47, 0.32, 0.3, 0, -1.05)
      break
    case 'thinking':
      o.hx = -0.04; o.hz = -0.08
      // the pocket watch, open on the right palm; the left hand at the chin
      setHand(o, 0, 0.52, 0.06 + Math.sin(t * 1.6) * 0.01 * A, 0.3, -1.25, 0.2, 0.15)
      setHand(o, 1, -0.17, 0.07, 0.42, -0.35, 0, -2.4)
      o.watch = 1
      o.gdy = -0.02
      break
    case 'talking': {
      const g = Math.sin(t * 2.3) * A, lv = f.level
      o.hz = Math.sin(t * 1.3) * 0.05 * A
      setHand(o, 0, 0.6 + g * 0.04, -0.2 + lv * 0.05 * (0.5 + A), 0.25, -1.1 - lv * 0.2, 0, 0.55 + g * 0.12)
      setHand(o, 1, -0.44, -0.4, 0.12, 0.1, 0, -0.2)
      break
    }
    case 'done': {
      // a small bow; with a hat, a tip of the brim
      const bow = f.rm ? 0.6 : Math.sin(Math.PI * clamp(f.moodAge / 2.4)) * 0.85 + 0.15
      o.bx = 0.22 * bow; o.hx = 0.1 * bow
      if (hat) {
        o.hty = 0.07 * bow; o.hrx = -0.25 * bow; o.htz = 0.04 * bow
        setHand(o, 0, 0.3, HEAD_Y + HAT_Y + 0.05 + 0.07 * bow, 0.24, -0.2, 0, 2.6)
      } else setHand(o, 0, 0.1, -0.22, 0.38, 0.2, 0, 1.3)
      setHand(o, 1, -0.44, -0.46, -0.06, 0, 0, -0.2)
      break
    }
    case 'needs-you': {
      const lift = Math.sin(t * 3.2) * 0.02 * A
      o.hz = 0.06; o.hx = 0.02
      // the approval card, presented on the tray
      setHand(o, 0, 0.62, -0.12 + lift, 0.34, -1.45, 0, 0.1)
      setHand(o, 1, -0.44, -0.4, 0.08, 0, 0, -0.2)
      o.tray = 1; o.card = 1
      o.gdy = -0.025
      break
    }
    case 'worried': {
      const j = Math.sin(t * 7) * 0.02 * A
      o.hx = 0.06; o.hz = Math.sin(t * 1.7) * 0.05 * A
      setHand(o, 0, 0.09 + j, -0.34, 0.38, 0.3, 0, 1.4 + j * 3)
      setHand(o, 1, -0.09 - j, -0.36, 0.4, 0.3, 0, -1.4 + j * 3)
      o.hrx = -0.12; o.hrz = -0.06
      o.grz = 0.16; o.gdx = 0.015; o.gdy = -0.012
      break
    }
    case 'celebrating': {
      const s = Math.sin(t * 4.2)
      o.hx = -0.08
      if (hat) {
        // the hat raised high in the right hand
        o.htx = 0.52; o.hty = 0.12 + Math.cos(t * 4.2) * 0.03 * A; o.htz = 0.08; o.hrz = -0.45 + s * 0.12 * A
        setHand(o, 0, 0.52 + 0.04, HEAD_Y + HAT_Y + 0.07 + Math.cos(t * 4.2) * 0.03 * A, 0.12, -0.2, 0, 2.7)
      } else setHand(o, 0, 0.66 + s * 0.05 * A, 0.48 + Math.cos(t * 4.2) * 0.05 * A, 0.2, -0.9, 0, -0.2 + s * 0.35 * A)
      setHand(o, 1, -0.64 - s * 0.05 * A, 0.26 - Math.cos(t * 4.2) * 0.05 * A, 0.2, -0.9, 0, 0.3 + s * 0.3 * A)
      break
    }
    case 'sleepy': {
      const nod = f.rm ? 0.6 : 0.5 + 0.5 * Math.sin(t * 0.8)
      o.hx = 0.12 + nod * 0.08; o.hz = 0.1 * nod; o.bx = 0.04
      setHand(o, 0, 0.4, -0.58, 0.05, 0, 0, 0.1)
      setHand(o, 1, -0.4, -0.58, 0.05, 0, 0, -0.1)
      // the hat slips over the eyes, the readers slide down
      o.hrx = 0.32; o.hty = -0.05; o.htz = 0.05
      o.gdy = -0.06
      break
    }
    default: // idle: a silver tray, a towel over the left wrist
      o.hz = Math.sin(t * 1.1) * 0.02 * A
      setHand(o, 0, 0.56, -0.14 + Math.sin(t * 1.4) * 0.012 * A, 0.22, -1.45, 0, 0.12)
      setHand(o, 1, -0.44, -0.36, 0.1, 0, 0, -0.15)
      o.tray = 1; o.towel = 1
  }
  return o
}

/* ---------------- geometry ---------------- */
// Torso profile (radius, y), top to bottom: square shoulders, a waist, a short rounded hem.
const TORSO = [[0, 0.02], [0.19, 0.012], [0.29, -0.025], [0.325, -0.1], [0.315, -0.24], [0.265, -0.42], [0.215, -0.56], [0.2, -0.66], [0.18, -0.73], [0.11, -0.775], [0, -0.785]]
const TORSO_Y = -0.05
const torsoProf = (() => {
  const curve = new THREE.CatmullRomCurve3(TORSO.map(([x, y]) => new THREE.Vector3(x, y, 0)), false, 'centripetal')
  const prof = curve.getPoints(48).map((p) => new THREE.Vector2(Math.max(0, p.x), p.y))
  prof[0].x = 0
  prof[prof.length - 1].x = 0
  return prof
})()
function rAt(y) {
  for (let i = 1; i < torsoProf.length; i++) {
    const a = torsoProf[i - 1], b = torsoProf[i]
    if (y <= a.y && y >= b.y) return a.x + ((y - a.y) / (b.y - a.y || 1)) * (b.x - a.x)
  }
  return 0
}
/** A surface patch on the torso: fn(u, v) -> [phi, y]; out pushes it off the glass. */
function torsoPatch(nu, nv, fn, out) {
  const pos = [], uv = [], idx = []
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const [phi, y] = fn(i / nu, j / nv)
    const r = rAt(y) + out
    pos.push(r * Math.sin(phi), y, r * Math.cos(phi))
    uv.push(i / nu, 1 - j / nv)
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1
    idx.push(a, c, b, b, c, d)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g.toNonIndexed()
}
const V_TOP = -0.005, V_PT = -0.46 // the coat's V opening, torso-local
const shirtW = (y) => 0.5 * Math.pow(clamp((y - V_PT) / (V_TOP - V_PT)), 0.9)
function shirtGeometry() {
  const bib = torsoPatch(10, 16, (u, v) => { const y = V_TOP + (V_PT - V_TOP) * v; const w = shirtW(y); return [(u * 2 - 1) * w, y] }, 0.006)
  // wing collar tips, either side of the bow
  const tip = new THREE.Shape()
  tip.moveTo(0, 0); tip.lineTo(0.085, -0.012); tip.quadraticCurveTo(0.05, -0.03, 0.02, -0.06); tip.closePath()
  const r = new THREE.ExtrudeGeometry(tip, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2, curveSegments: 6 })
  r.rotateX(-0.25)
  const l = r.clone().scale(-1, 1, 1)
  r.translate(0.035, -0.035, 0.3); l.translate(-0.035, -0.035, 0.3)
  return mergeGeometries([bib, r.toNonIndexed(), l.toNonIndexed()])
}
function lapelGeometry() {
  const parts = [-1, 1].map((s) => torsoPatch(6, 16, (u, v) => {
    const y = 0.0 + (V_PT - 0.03) * v
    const w = shirtW(Math.max(y, V_PT))
    const lw = 0.08 + 0.36 * (1 - v) * (1 - v * 0.4) - (v > 0.15 ? 0 : (0.15 - v) * 0.6) // narrow at the neck, a peak, then taper
    return [s * (w + lw * u), y]
  }, 0.016))
  return mergeGeometries(parts)
}
function studsGeometry() {
  const s = new THREE.SphereGeometry(0.019, 12, 8)
  const at = (y, sz = 1) => s.clone().scale(sz, sz, sz * 0.6).translate(0, y, rAt(y) + 0.012)
  return mergeGeometries([at(-0.16), at(-0.28), at(V_PT - 0.035, 1.5)])
}
function tailGeometry() {
  const sh = new THREE.Shape()
  sh.moveTo(-0.1, 0)
  sh.lineTo(0.1, 0)
  sh.quadraticCurveTo(0.08, -0.3, 0.025, -0.56)
  sh.quadraticCurveTo(0.0, -0.585, -0.025, -0.56)
  sh.quadraticCurveTo(-0.07, -0.3, -0.1, 0)
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 3, curveSegments: 10 })
  const mk = (s) => g.clone().scale(0.62, 0.8, 1).rotateZ(s * 0.13).rotateX(0.22).rotateY(s * 0.3).translate(s * 0.065, -0.4, -0.15)
  return mergeGeometries([mk(1), mk(-1)].map((x) => (x.index ? x.toNonIndexed() : x)))
}
// A refined hand: fingers together, thumb resting along the side, a shirt cuff at the wrist (group 1).
function handGeometry() {
  const parts = []
  const palm = new THREE.SphereGeometry(1, 18, 12)
  palm.scale(0.058, 0.07, 0.026)
  parts.push(palm)
  for (let i = 0; i < 4; i++) {
    const len = [0.05, 0.06, 0.057, 0.045][i]
    const fg = new THREE.CapsuleGeometry(0.0135, len, 4, 8)
    fg.translate((i - 1.5) * 0.027, -0.062 - len * 0.5 + Math.abs(i - 1.5) * 0.005, 0)
    parts.push(fg)
  }
  const thumb = new THREE.CapsuleGeometry(0.015, 0.04, 4, 8)
  thumb.rotateZ(0.5).translate(0.058, -0.03, 0.012)
  parts.push(thumb)
  const hand = mergeGeometries(parts.map((x) => (x.index ? x.toNonIndexed() : x)))
  const cuff = new THREE.CylinderGeometry(0.05, 0.056, 0.05, 20, 1)
  cuff.translate(0, 0.085, 0)
  const link = new THREE.SphereGeometry(0.011, 8, 6).translate(0.0, 0.085, 0.056)
  return mergeGeometries([hand, mergeGeometries([cuff.toNonIndexed(), link.toNonIndexed()])], true)
}
function towelGeometry() {
  const front = new THREE.BoxGeometry(0.13, 0.24, 0.012).translate(0, -0.12, 0.03)
  const back = new THREE.BoxGeometry(0.13, 0.15, 0.012).translate(0, -0.075, -0.03)
  const top = new THREE.CylinderGeometry(0.03, 0.03, 0.13, 12, 1, true, 0, Math.PI).rotateZ(Math.PI / 2).rotateX(Math.PI / 2)
  return mergeGeometries([front, back, top].map((x) => (x.index ? x.toNonIndexed() : x)))
}
// Hats: a lathe of felt with a satin band (group 1).
function hatGeometry(kind) {
  const P = (pts) => pts.map(([x, y]) => new THREE.Vector2(x, y))
  let felt, band
  if (kind === 'top') {
    felt = new THREE.LatheGeometry(P([[0, 0.4], [0.2, 0.4], [0.235, 0.395], [0.24, 0.38], [0.225, 0.12], [0.235, 0.03], [0.3, 0.012], [0.4, 0.03], [0.425, 0.05], [0.415, 0.035], [0.3, -0.005], [0.22, 0.0], [0.0, 0.0]]).reverse(), 48)
    band = new THREE.LatheGeometry(P([[0.229, 0.03], [0.231, 0.075], [0.229, 0.1]]).reverse(), 48)
  } else {
    felt = new THREE.LatheGeometry(P([[0, 0.3], [0.12, 0.29], [0.22, 0.24], [0.27, 0.15], [0.275, 0.06], [0.28, 0.025], [0.33, 0.014], [0.39, 0.03], [0.41, 0.05], [0.4, 0.035], [0.32, 0.0], [0.26, 0.0], [0.0, 0.0]]).reverse(), 48)
    band = new THREE.LatheGeometry(P([[0.279, 0.025], [0.281, 0.065], [0.278, 0.09]]).reverse(), 48)
  }
  band.scale(1.012, 1, 1.012)
  return mergeGeometries([felt.toNonIndexed(), band.toNonIndexed()], true)
}
// Glasses, head-local, built around the eye positions. Returns {geo, lens: [centers]}.
function glassesGeometry(kind, small) {
  const tube = small ? 0.013 : 0.0075
  const v = new THREE.Vector3()
  const parts = []
  const rim = (cx, cy, cz, r, arc, rotZ, phi) => {
    const g = new THREE.TorusGeometry(r, tube, 6, 40, arc)
    g.rotateZ(rotZ).rotateY(phi).translate(cx, cy, cz)
    parts.push(g)
  }
  const bar = (a, b, rad = tube * 0.8) => {
    const d = new THREE.Vector3().subVectors(b, a)
    const g = new THREE.CylinderGeometry(rad, rad, d.length(), 6, 1)
    g.translate(0, d.length() / 2, 0)
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()))
    g.translate(a.x, a.y, a.z)
    parts.push(g)
  }
  const out = 0.075
  const eye = (s, dy = 0) => { headPoint(s * EYE_PHI, EYE_TH, out, v); v.y += dy; return v.clone() }
  if (kind === 'round' || kind === 'half-moon') {
    const half = kind === 'half-moon'
    const r = half ? 0.082 : 0.09
    const dy = half ? -0.075 : 0
    const L = eye(-1, dy), R = eye(1, dy)
    for (const [c, s] of [[L, -1], [R, 1]]) rim(c.x, c.y, c.z, r, half ? Math.PI : Math.PI * 2, half ? Math.PI : 0, s * EYE_PHI)
    // bridge
    if (half) bar(new THREE.Vector3(L.x + r * 0.96, L.y, L.z + 0.01), new THREE.Vector3(R.x - r * 0.96, R.y, R.z + 0.01))
    else { const g = new THREE.TorusGeometry(Math.abs(R.x - L.x) / 2 - r, tube, 6, 16, Math.PI); g.translate(0, L.y + 0.005, (L.z + R.z) / 2 + 0.012); parts.push(g) }
    // temples, back to the ears
    for (const [c, s] of [[L, -1], [R, 1]]) {
      const a = new THREE.Vector3(c.x + s * r * Math.cos(s * EYE_PHI), c.y, c.z - s * r * Math.sin(s * EYE_PHI))
      const b = headPoint(s * 1.45, EYE_TH + 0.02, 0.04, new THREE.Vector3())
      bar(a, b)
    }
  } else if (kind === 'monocle') {
    const r = 0.1
    const R = eye(1)
    rim(R.x, R.y, R.z, r, Math.PI * 2, 0, EYE_PHI)
    // a fine chain down to the lapel
    const start = new THREE.Vector3(R.x + r * 0.7, R.y - r * 0.75, R.z)
    const curve = new THREE.CatmullRomCurve3([start, new THREE.Vector3(start.x + 0.07, start.y - 0.18, start.z + 0.02), new THREE.Vector3(0.36, -0.5, 0.3), new THREE.Vector3(0.24, -0.82, 0.3)])
    parts.push(new THREE.TubeGeometry(curve, 40, small ? 0.006 : 0.0035, 5, false))
  }
  return parts.length ? mergeGeometries(parts.map((x) => (x.index ? x.toNonIndexed() : x))) : null
}
function bowGeometry() {
  const wing = new THREE.Shape()
  wing.moveTo(0.02, 0.025)
  wing.quadraticCurveTo(0.09, 0.07, 0.15, 0.072)
  wing.quadraticCurveTo(0.18, 0.07, 0.178, 0)
  wing.quadraticCurveTo(0.18, -0.07, 0.15, -0.072)
  wing.quadraticCurveTo(0.09, -0.07, 0.02, -0.025)
  wing.closePath()
  const ex = { depth: 0.03, bevelEnabled: true, bevelThickness: 0.018, bevelSize: 0.014, bevelSegments: 4, curveSegments: 14 }
  const r = new THREE.ExtrudeGeometry(wing, ex)
  const l = r.clone().applyMatrix4(new THREE.Matrix4().makeScale(-1, 1, 1))
  // Mirroring flips winding: fix the index order.
  const ix = l.index
  if (ix) for (let i = 0; i < ix.count; i += 3) { const a = ix.getX(i + 1); ix.setX(i + 1, ix.getX(i + 2)); ix.setX(i + 2, a) }
  else {
    const pos = l.attributes.position, nor = l.attributes.normal, uv = l.attributes.uv
    for (let i = 0; i < pos.count; i += 3) for (const at of [pos, nor, uv]) {
      for (let c = 0; c < at.itemSize; c++) { const a = at.array[(i + 1) * at.itemSize + c]; at.array[(i + 1) * at.itemSize + c] = at.array[(i + 2) * at.itemSize + c]; at.array[(i + 2) * at.itemSize + c] = a }
    }
  }
  const knot = new THREE.SphereGeometry(1, 16, 12)
  knot.applyMatrix4(new THREE.Matrix4().makeScale(0.038, 0.045, 0.035))
  knot.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0, 0.03))
  const g = mergeGeometries([r, l, knot].map((x) => (x.index ? x.toNonIndexed() : x)))
  g.translate(0, 0, -0.015)
  return g
}
function roundedRect(w, h, r) {
  const s = new THREE.Shape()
  s.moveTo(-w / 2 + r, -h / 2)
  s.lineTo(w / 2 - r, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r)
  s.lineTo(w / 2, h / 2 - r); s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2)
  s.lineTo(-w / 2 + r, h / 2); s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r)
  s.lineTo(-w / 2, -h / 2 + r); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2)
  return s
}
function starTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = gr
  g.beginPath()
  for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4, rr = i % 2 ? 7 : 32; g.lineTo(32 + Math.cos(a) * rr, 32 + Math.sin(a) * rr) }
  g.fill()
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}
function cardTexture(look) {
  const c = document.createElement('canvas')
  c.width = 160; c.height = 112
  const g = c.getContext('2d')
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  const paint = (l) => {
    g.fillStyle = '#fbfcfe'
    g.fillRect(0, 0, 160, 112)
    g.fillStyle = '#d5dae3'
    g.beginPath(); g.roundRect(18, 18, 84, 9, 4.5); g.fill()
    g.beginPath(); g.roundRect(18, 35, 60, 9, 4.5); g.fill()
    g.fillStyle = '#' + l.tint.glow.clone().lerp(new THREE.Color(l.tint.key === 'graphite' ? '#3d4655' : '#000'), l.tint.key === 'graphite' ? 0.6 : 0.12).getHexString()
    g.beginPath(); g.roundRect(18, 64, 124, 30, 15); g.fill()
    g.strokeStyle = '#fff'; g.lineWidth = 6; g.lineCap = g.lineJoin = 'round'
    g.beginPath(); g.moveTo(68, 79); g.lineTo(77, 87); g.lineTo(93, 71); g.stroke()
    tex.needsUpdate = true
  }
  paint(look)
  return { tex, paint }
}

/* ---------------- the face: light in clear glass ---------------- */
// Brows per mood: [lift, inner rise, outer rise, alpha]. Positive = up.
const BROWS = {
  resting: [-5, 0, 0, 0.45], idle: [0, 1, 0, 0.75], listening: [5, 2, 1, 0.85], thinking: [0, 0, 0, 0.8], talking: [2, 1, 0, 0.8],
  done: [3, -1, 2, 0.75], 'needs-you': [9, 2, 2, 0.95], worried: [3, 9, -3, 0.9], celebrating: [8, 1, 3, 0.9], sleepy: [-7, -1, -2, 0.5],
}
function faceTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = FW
  canvas.height = FH
  const g = canvas.getContext('2d')
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  function draw(f, look, eyeCol, glowCol, veilCol, browCol, small) {
    const W = FW, H = FH, m = f.mood
    g.clearRect(0, 0, W, H)
    const k = small ? 1.5 : 1
    // The veil: no band, just a faint smoke across the face and a soft shade behind each eye, so light eyes
    // read on clear glass in a light theme.
    const va = look.dark ? 0.4 : 0.5
    g.save()
    g.translate(W / 2, EY - 6 * k)
    g.scale(1, 0.62)
    let gr = g.createRadialGradient(0, 0, 0, 0, 0, 200)
    gr.addColorStop(0, css(veilCol, va * 0.4)); gr.addColorStop(1, css(veilCol, 0))
    g.fillStyle = gr
    g.fillRect(-200, -200, 400, 400)
    g.restore()
    const wash = m === 'needs-you' ? (f.rm ? 0.5 : 0.36 + 0.2 * Math.sin(f.t * 5)) : m === 'worried' ? 0.32 : m === 'celebrating' ? 0.3 : m === 'done' ? 0.2 : m === 'listening' ? 0.12 : 0
    for (const side of [-1, 1]) {
      const hx = W / 2 + side * EX + f.lookX * 8, hy = EY - 8 * k
      gr = g.createRadialGradient(hx, hy, 0, hx, hy, 44 * k)
      gr.addColorStop(0, css(veilCol, va)); gr.addColorStop(0.55, css(veilCol, va * 0.75)); gr.addColorStop(1, css(veilCol, 0))
      g.fillStyle = gr
      g.fillRect(hx - 50 * k, hy - 50 * k, 100 * k, 100 * k)
      if (wash > 0) {
        gr = g.createRadialGradient(hx, hy, 0, hx, hy, 40 * k)
        gr.addColorStop(0, css(glowCol, wash)); gr.addColorStop(1, css(glowCol, 0))
        g.fillStyle = gr
        g.fillRect(hx - 50 * k, hy - 50 * k, 100 * k, 100 * k)
      }
    }

    const ew = 27 * k, eh = (m === 'listening' ? 46 : 40) * k
    const lx = f.lookX * 15, ly = f.lookY * 9
    const cy = EY + ly
    const eye = css(eyeCol)
    g.lineCap = g.lineJoin = 'round'
    g.shadowColor = css(glowCol)
    g.shadowBlur = 14 * k
    g.fillStyle = g.strokeStyle = eye
    for (const side of [-1, 1]) {
      const cx = W / 2 + side * EX + lx
      if (m === 'done' || m === 'celebrating') {
        g.lineWidth = 9 * k
        g.beginPath(); g.arc(cx, cy + 8 * k, 13 * k, Math.PI * 1.15, Math.PI * 1.85); g.stroke()
      } else if (m === 'resting') {
        g.globalAlpha = 0.7
        g.lineWidth = 6 * k
        g.beginPath(); g.moveTo(cx - 11 * k, cy + 4 * k); g.quadraticCurveTo(cx, cy + 9 * k, cx + 11 * k, cy + 4 * k); g.stroke()
        g.globalAlpha = 1
      } else {
        const open = Math.max(0.08, f.open * f.blink)
        g.save()
        g.translate(cx, cy)
        g.beginPath()
        if (look.eyes === 'dots') { const r = ew * 0.6; g.ellipse(0, 0, r * Math.min(1.1, Math.max(1, open)), Math.max(r * 0.18, r * open), 0, 0, Math.PI * 2) }
        else if (look.eyes === 'arcs') { const r = ew * 0.75, ah = Math.max(r * 0.2, r * 1.1 * Math.min(1.15, open)); g.ellipse(0, ah * 0.4, r, ah, 0, Math.PI, Math.PI * 2); g.closePath() }
        else { const hh = Math.max(ew * 0.3, eh * open); g.roundRect(-ew / 2, -hh / 2, ew, hh, Math.min(ew, hh) / 2) }
        g.fill()
        if (m === 'worried' || m === 'sleepy') {
          // lids: worried slopes down to the outside, sleepy is heavy and flat
          g.globalCompositeOperation = 'destination-out'
          g.shadowBlur = 0
          g.fillStyle = '#000'
          g.save()
          if (m === 'worried') { g.rotate(side * 0.42); g.fillRect(-60, -eh * 0.5 - 60 - 2 * k, 120, 60 + eh * 0.1) }
          else { g.rotate(side * 0.1); g.fillRect(-60, -80 - eh * 0.04, 120, 80) }
          g.restore()
          g.globalCompositeOperation = 'source-over'
          g.shadowBlur = 14 * k
          g.fillStyle = eye
        }
        g.restore()
      }
      // a fine brow
      const [lift, inner, outer, ba] = BROWS[m] || BROWS.idle
      let L = lift, I = inner, O = outer
      if (m === 'thinking') { if (side > 0) { L = 9; O = 3 } else { L = -1; I = -1 } }
      if (m === 'talking') L += f.level * 4
      const by = EY - 36 * k - L * k * 0.9 + ly * 0.6
      const bx = W / 2 + side * EX + lx * 0.7
      g.globalAlpha = ba
      g.shadowBlur = look.dark ? 10 * k : 0
      g.strokeStyle = browCol
      g.lineWidth = 6 * k
      g.beginPath()
      g.moveTo(bx + side * 17 * k, by - O * k)
      g.quadraticCurveTo(bx, by - 6 * k - (I + O) * 0.3 * k, bx - side * 15 * k, by - I * k)
      g.stroke()
      g.globalAlpha = 1
      g.shadowBlur = 14 * k
      g.strokeStyle = eye
    }
    // mouth: only speaking and a quiet smile when done
    const my = EY + 52 * k
    if (m === 'talking') {
      const mw = (18 + f.level * 8) * k, mh = (4 + f.level * 11) * k
      g.beginPath(); g.roundRect(W / 2 - mw / 2 + lx * 0.5, my - mh / 2, mw, mh, mh / 2); g.fill()
    } else if (m === 'done' || m === 'celebrating') {
      g.lineWidth = 4.5 * k
      g.globalAlpha = 0.85
      g.beginPath(); g.arc(W / 2 + lx * 0.5, my - 12 * k, 13 * k, Math.PI * 0.25, Math.PI * 0.75); g.stroke()
      g.globalAlpha = 1
    }
    if (m === 'thinking') {
      // a comet of light circling by the raised brow
      const sx = W / 2 + EX + 44 * k, sy = EY - 40 * k, R = 11 * k, a0 = f.rm ? 0 : f.t * 5
      g.lineWidth = 4 * k
      for (let i = 0; i < 8; i++) {
        g.globalAlpha = (1 - i / 8) * 0.95
        g.beginPath(); g.arc(sx, sy, R, a0 - i * 0.32, a0 - i * 0.32 + 0.3); g.stroke()
      }
      g.globalAlpha = 1
    } else if (m === 'worried') {
      const dy = f.rm ? 0 : ((f.t * 0.6) % 1) * 7 * k
      const dx = W / 2 - EX - 36 * k, dyy = EY - 26 * k + dy, r = 5 * k
      g.beginPath(); g.moveTo(dx, dyy - r * 2.1); g.quadraticCurveTo(dx + r * 1.1, dyy - r * 0.3, dx + r, dyy + r * 0.2); g.arc(dx, dyy + r * 0.2, r, 0, Math.PI); g.quadraticCurveTo(dx - r * 1.1, dyy - r * 0.3, dx, dyy - r * 2.1); g.fill()
    } else if (m === 'sleepy') {
      const ph = f.rm ? 0.4 : (f.t * 0.35) % 1
      g.globalAlpha = Math.sin(ph * Math.PI) * 0.9
      g.lineWidth = 3.5 * k
      const zx = W / 2 + EX + 40 * k + ph * 10, zy = EY - 30 * k - ph * 14, z = 8 * k
      g.beginPath(); g.moveTo(zx - z, zy - z); g.lineTo(zx + z, zy - z); g.lineTo(zx - z, zy + z); g.lineTo(zx + z, zy + z); g.stroke()
      g.globalAlpha = 1
    } else if (m === 'celebrating') {
      for (let i = 0; i < 4; i++) {
        const ph = f.rm ? 0.5 : (f.t * 1.3 + i * 0.27) % 1
        const gx = W / 2 + [-2.1, 2.05, -1.2, 1.25][i] * EX, gy = EY + [-38, -30, 34, 30][i] * k, r = (4 + 6 * Math.sin(ph * Math.PI)) * k * 0.9
        g.beginPath(); g.moveTo(gx, gy - r); g.quadraticCurveTo(gx, gy, gx + r, gy); g.quadraticCurveTo(gx, gy, gx, gy + r); g.quadraticCurveTo(gx, gy, gx - r, gy); g.quadraticCurveTo(gx, gy, gx, gy - r); g.fill()
      }
    }
    g.shadowBlur = 0
    texture.needsUpdate = true
  }
  return { texture, draw }
}

function watchDial() {
  const c = document.createElement('canvas')
  c.width = c.height = 96
  const g = c.getContext('2d')
  g.fillStyle = '#f8f5ee'
  g.beginPath(); g.arc(48, 48, 48, 0, Math.PI * 2); g.fill()
  g.strokeStyle = '#2a2a30'
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    g.lineWidth = i % 3 ? 2 : 4
    g.beginPath(); g.moveTo(48 + Math.cos(a) * 34, 48 + Math.sin(a) * 34); g.lineTo(48 + Math.cos(a) * 42, 48 + Math.sin(a) * 42); g.stroke()
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/* ---------------- character ---------------- */
const HAT_H = { none: 0, bowler: 0.3, top: 0.4 }
const FRAMES = { big: { height: 2.62, y: 0.1 }, peek: { height: 1.36, y: 0.47 }, header: { height: 1.5, y: 0.42 } }

export default {
  id: 'steward',
  name: 'Steward',
  vibe: 'A glass gentleman\'s gentleman: calm eyes of light, a glass tailcoat with a satin bow tie, a tray at the ready.',
  eyes: ['pills', 'dots', 'arcs'],
  accessories: true,
  frame: { ...FRAMES.big, peek: FRAMES.peek, header: FRAMES.header },
  create({ kit, look, size }) {
    const small = size !== 'big'
    const object = new THREE.Group()
    const rig = new THREE.Group() // fits a hat into the small frames
    const body = new THREE.Group() // leans for bows
    object.add(rig)
    rig.add(body)

    // Head: transmissive glass, a face of light just outside it.
    const head = new THREE.Group()
    head.position.y = HEAD_Y
    body.add(head)
    const headGeo = new THREE.SphereGeometry(HR, small ? 40 : 64, small ? 28 : 48)
    const headMat = kit.glass(look, { thickness: 0.35, iridescence: 0.3 })
    const headMesh = new THREE.Mesh(headGeo, headMat)
    headMesh.scale.set(...HEAD_S)
    head.add(headMesh)
    const rimMat = rimMaterial()
    const headRim = new THREE.Mesh(headGeo, rimMat)
    head.add(headRim)
    const face = faceTexture()
    const faceGeo = new THREE.SphereGeometry(HR * 1.012, 48, 32, Math.PI / 2 - FACE_PHI / 2, FACE_PHI, FACE_TH0, FACE_TH)
    const faceMat = new THREE.MeshBasicMaterial({ map: face.texture, transparent: true, depthWrite: false, toneMapped: false })
    const faceMesh = new THREE.Mesh(faceGeo, faceMat)
    faceMesh.renderOrder = 2
    head.add(faceMesh)

    // Materials.
    const metal = new THREE.MeshPhysicalMaterial({ color: 0x8a8882, metalness: 1, roughness: 0.38, anisotropy: 0.7, clearcoat: 0.5, clearcoatRoughness: 0.2, envMapIntensity: 0.8 })
    const gold = new THREE.MeshPhysicalMaterial({ color: 0xd9b46c, metalness: 1, roughness: 0.25, clearcoat: 0.6, clearcoatRoughness: 0.1 })
    const satin = new THREE.MeshPhysicalMaterial({ color: 0x15161a, roughness: 0.42, sheen: 1, sheenRoughness: 0.35, sheenColor: 0x8890a0, clearcoat: 0.25, side: THREE.DoubleSide })
    const shirt = new THREE.MeshPhysicalMaterial({ color: 0xf4f6fa, roughness: 0.55, sheen: 0.6, sheenRoughness: 0.5, clearcoat: 0.2, side: THREE.DoubleSide })
    const felt = new THREE.MeshPhysicalMaterial({ color: 0x1a1b20, roughness: 0.62, sheen: 0.6, sheenRoughness: 0.5, sheenColor: 0x50545e, clearcoat: 0.15, clearcoatRoughness: 0.4, side: THREE.DoubleSide })

    // Collar ring, bow tie, beacon.
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.028, 18, 64), metal)
    collar.rotation.x = Math.PI / 2 + 0.22
    collar.position.y = -0.02
    body.add(collar)
    const bow = new THREE.Mesh(bowGeometry(), satin)
    bow.position.set(0, -0.055, 0.29)
    bow.rotation.x = 0.1
    bow.scale.setScalar(0.92)
    body.add(bow)
    const beaconMat = kit.light(look.tint.glow, 2)
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), beaconMat)
    beacon.position.set(0.47, HEAD_Y + 0.3, 0.2)
    const beaconGlow = kit.glowSprite(look.tint.glow, 0.5, 0.9)
    beaconGlow.position.copy(beacon.position)
    body.add(beacon, beaconGlow)

    // Accessories (rebuilt when the look changes).
    const hatPivot = new THREE.Group() // head-local
    head.add(hatPivot)
    let hat = null, glasses = null, hatKind = 'none', glassesKind = 'none'
    function buildAccessories(l) {
      if ((l.hat || 'none') !== hatKind) {
        if (hat) { hatPivot.remove(hat); hat.geometry.dispose(); hat = null }
        hatKind = l.hat || 'none'
        if (hatKind !== 'none') { hat = new THREE.Mesh(hatGeometry(hatKind), [felt, satin]); hatPivot.add(hat) }
      }
      if ((l.glasses || 'none') !== glassesKind) {
        if (glasses) { head.remove(glasses); glasses.geometry.dispose(); glasses = null }
        glassesKind = l.glasses || 'none'
        const geo = glassesKind === 'none' ? null : glassesGeometry(glassesKind, small)
        if (geo) { glasses = new THREE.Mesh(geo, gold); head.add(glasses) }
      }
    }

    // Tailcoat, hands, props: the big view only.
    let torsoMat = null, hands = [], tray = null, card = null, cardTex = null, towel = null, watch = null, watchHand = null, sparks = null
    if (!small) {
      const torsoGeo = new THREE.LatheGeometry(torsoProf, 48)
      torsoMat = kit.glass(look, { thickness: 0.5 })
      const coat = new THREE.Group()
      coat.position.y = TORSO_Y
      body.add(coat)
      const torso = new THREE.Mesh(torsoGeo, torsoMat)
      const torsoRim = new THREE.Mesh(torsoGeo, rimMat)
      torsoRim.scale.setScalar(1.006)
      coat.add(torso, torsoRim,
        new THREE.Mesh(shirtGeometry(), shirt),
        new THREE.Mesh(lapelGeometry(), satin),
        new THREE.Mesh(studsGeometry(), satin),
        new THREE.Mesh(tailGeometry(), torsoMat))

      const handGeo = handGeometry()
      hands = [0, 1].map((i) => { const m = new THREE.Mesh(handGeo, [torsoMat, shirt]); if (i) m.scale.x = -1; body.add(m); return m })

      tray = new THREE.Group()
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.23, 0.02, 48), metal)
      const rimRing = new THREE.Mesh(new THREE.TorusGeometry(0.255, 0.01, 8, 48), metal)
      rimRing.rotation.x = Math.PI / 2
      rimRing.position.y = 0.012
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.035, 0.11, 24), torsoMat)
      cup.position.set(-0.08, 0.065, 0.02)
      tray.add(plate, rimRing, cup)
      tray.userData.cup = cup
      body.add(tray)
      const ct = cardTexture(look)
      cardTex = ct
      card = new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(0.42, 0.3, 0.045)), new THREE.MeshBasicMaterial({ map: ct.tex, toneMapped: false, side: THREE.DoubleSide }))
      const uv = card.geometry.attributes.uv, pos = card.geometry.attributes.position
      for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 0.42 + 0.5, pos.getY(i) / 0.3 + 0.5)
      card.position.set(0.02, 0.17, -0.02)
      card.rotation.x = -0.28
      tray.add(card)

      towel = new THREE.Mesh(towelGeometry(), shirt)
      towel.scale.setScalar(0.8)
      towel.position.set(0.11, 0.035, 0.03)
      towel.rotation.set(0, -0.4, Math.PI / 2)
      tray.add(towel)

      watch = new THREE.Group()
      const caseM = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.022, 32), gold)
      const dial = new THREE.Mesh(new THREE.CircleGeometry(0.064, 32), new THREE.MeshBasicMaterial({ map: watchDial() }))
      dial.rotation.x = -Math.PI / 2
      dial.position.y = 0.0115
      watchHand = new THREE.Mesh(new THREE.PlaneGeometry(0.006, 0.05).translate(0, 0.022, 0), new THREE.MeshBasicMaterial({ color: 0x1c1c22 }))
      watchHand.rotation.x = -Math.PI / 2
      watchHand.position.y = 0.012
      const bowRing = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.005, 6, 16), gold)
      bowRing.position.set(0, 0, -0.088)
      bowRing.rotation.x = Math.PI / 2
      watch.add(caseM, dial, watchHand, bowRing)
      watch.position.set(0, -0.07, 0.05)
      watch.rotation.set(2.5, 0, 0)
      hands[0].add(watch)

      const N = 16
      const sg = new THREE.BufferGeometry()
      sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3))
      sparks = new THREE.Points(sg, new THREE.PointsMaterial({ map: starTexture(), size: 0.4, transparent: true, depthWrite: false, color: 0xffffff }))
      sparks.userData.n = N
      object.add(sparks)
    }

    // Reused state.
    const A = {}, B = {}
    const eyeCol = new THREE.Color(), glowCol = new THREE.Color(), veilCol = new THREE.Color(), tmp = new THREE.Color()
    let cur = look

    function rimMaterial() {
      return new THREE.ShaderMaterial({
        transparent: true, depthWrite: false,
        uniforms: { color: { value: new THREE.Color() }, dark: { value: 0 }, intensity: { value: 1 } },
        vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
        fragmentShader: `uniform vec3 color; uniform float dark; uniform float intensity; varying vec3 vN; varying vec3 vV;
          void main(){ vec3 n = normalize(vN); float ndv = max(dot(n, normalize(vV)), 0.);
            float f = pow(1. - ndv, 3.0);
            float key = 0.35 + 0.65 * max(dot(normalize(n.xy + 1e-4), normalize(vec2(-0.5, 0.86))), 0.);
            float a = clamp(f * key * intensity, 0., 1.);
            gl_FragColor = dark > 0.5 ? vec4(color * a, a * 0.5) : vec4(color, a * 0.55); }`,
      })
    }

    // In the small frames, shrink the figure so a hat still fits.
    function fit(l) {
      const F = FRAMES[size]
      const hh = HAT_H[l.hat || 'none'] || 0
      if (small && hh) {
        const lo = -0.17, hi = HEAD_Y + HAT_Y + hh + 0.03
        const top = F.y + F.height / 2 - 0.03, bot = F.y - F.height / 2 + 0.05
        const s = Math.min(1, (top - bot) / (hi - lo))
        rig.scale.setScalar(s)
        rig.position.set(0, bot - lo * s, 0)
      } else { rig.scale.setScalar(1); rig.position.set(0, 0, 0) }
    }

    function applyLook(l) {
      cur = l
      kit.updateGlass(headMat, l, { thickness: 0.35 })
      headMat.thickness = 0.35
      if (torsoMat) kit.updateGlass(torsoMat, l)
      rimMat.uniforms.dark.value = l.dark ? 1 : 0
      rimMat.uniforms.color.value.copy(l.dark ? l.tint.glow : l.tint.ink).lerp(l.dark ? WHITE : l.tint.ink, 0.4)
      rimMat.uniforms.intensity.value = l.dark ? 2.2 : 0.8
      tmp.setRGB(0.05, 0.05, 0.06)
      satin.color.copy(l.tint.ink).lerp(tmp, 0.35).multiplyScalar(l.tint.key === 'graphite' ? 0.6 : 0.8)
      satin.sheenColor.copy(l.tint.soft).multiplyScalar(0.55)
      felt.color.copy(l.tint.ink).lerp(tmp, 0.82).multiplyScalar(0.55)
      shirt.color.copy(WHITE).lerp(l.tint.soft, 0.18)
      shirt.sheenColor.copy(l.tint.soft)
      if (cardTex) cardTex.paint(l)
      if (sparks) {
        sparks.material.color.copy(l.dark ? WHITE : l.tint.glow).lerp(l.tint.glow, 0.4)
        sparks.material.blending = l.dark ? THREE.AdditiveBlending : THREE.NormalBlending
        sparks.material.needsUpdate = true
      }
      beaconGlow.material.color.copy(l.tint.glow)
      beaconGlow.material.blending = l.dark ? THREE.AdditiveBlending : THREE.NormalBlending
      beaconGlow.material.opacity = l.dark ? 0.9 : 0.55
      buildAccessories(l)
      fit(l)
    }
    applyLook(look)

    const placeHand = (m, o, p) => {
      m.position.set(o[p + 0], o[p + 1], o[p + 2])
      m.rotation.set(o[p + 3], o[p + 4], o[p + 5])
    }

    return {
      object,
      update(f, l) {
        if (l && l !== cur && (l.tint !== cur.tint || l.dark !== cur.dark || l.hat !== cur.hat || l.glasses !== cur.glasses)) applyLook(l)
        l = cur
        const t = f.rm ? 0 : f.t
        const hasHat = hatKind !== 'none'
        pose(A, f.prevMood, f, hasHat)
        pose(B, f.mood, f, hasHat)
        const k = f.rm ? 1 : smooth(f.moodAge / 0.6)
        for (const key of P_KEYS) A[key] += (B[key] - A[key]) * k

        // Float (not a bounce): a slow drift. Only celebrating bounces.
        const drift = f.rm ? 0 : Math.sin(f.clock * 1.2) * 0.022 * (0.5 + f.P * 0.5)
        object.position.y = drift + f.bounce
        body.rotation.set(A.bx, 0, A.bz)
        head.rotation.set(A.hx + f.lookY * 0.04, A.hy + f.lookX * 0.15, A.hz)
        head.position.y = HEAD_Y + (f.mood === 'resting' ? -0.03 * k : 0) + (f.rm ? 0 : Math.sin(f.clock * 1.2 + 0.8) * 0.01)
        // Liquid glass: a slow wobble of the head, ripples while talking.
        const w = f.rm ? 0 : f.wob * 0.01 * Math.sin(f.clock * 2.3) + f.rip * f.level * 0.01 * Math.sin(t * 20)
        headMesh.scale.set(HEAD_S[0] * (1 + w), HEAD_S[1] * (1 - w), HEAD_S[2] * (1 + w * 0.5))
        headRim.scale.set(headMesh.scale.x * 1.005, headMesh.scale.y * 1.005, headMesh.scale.z * 1.005)
        faceMesh.scale.copy(headMesh.scale)

        // Hat and glasses.
        hatPivot.position.set(A.htx, HAT_Y + A.hty, A.htz)
        hatPivot.rotation.set(A.hrx, 0, A.hrz)
        if (glasses) {
          glasses.position.set(A.gdx, A.gdy, 0)
          glasses.rotation.set(0, 0, A.grz)
        }

        // Colors: tint glow, warm when worried, dim when resting or sleepy.
        const dim = f.mood === 'resting' ? 0.6 : f.mood === 'sleepy' ? 0.75 : 1
        eyeCol.copy(WHITE).lerp(l.dark ? l.tint.soft : l.tint.glow, l.dark ? 0.3 : 0.22).lerp(WARM_EYE, f.warm).multiplyScalar(dim)
        glowCol.copy(l.tint.glow).lerp(WARM_GLOW, f.warm)
        veilCol.copy(l.tint.ink).multiplyScalar(l.dark ? 0.4 : 0.7)
        face.draw(f, l, eyeCol, glowCol, veilCol, l.dark ? css(eyeCol) : css(tmp.copy(l.tint.ink).multiplyScalar(0.8).lerp(WARM_GLOW, f.warm * 0.5)), small)
        tmp.copy(l.tint.glass).lerp(WARM, f.warm * 0.6)
        headMat.attenuationColor.copy(tmp)
        headMat.color.copy(tmp).lerp(WHITE, l.dark ? 0.15 : 0.45)

        // Beacon: needs-you only, pulsing.
        const nv = f.mood === 'needs-you' ? smooth(f.moodAge / 0.3) : f.prevMood === 'needs-you' ? 1 - smooth(f.moodAge / 0.3) : 0
        const pulse = f.rm ? 1 : 0.75 + 0.25 * Math.sin(f.t * 5)
        beacon.visible = beaconGlow.visible = nv > 0.01
        beacon.scale.setScalar(nv * (0.9 + 0.2 * pulse) * (small ? 1.5 : 1))
        beaconGlow.scale.setScalar(nv * (0.45 + 0.2 * pulse) * (small ? 1.4 : 1))
        beaconMat.color.copy(l.tint.glow).lerp(WHITE, 0.2).multiplyScalar(2.2)

        if (!small) {
          placeHand(hands[0], A, 'r')
          placeHand(hands[1], A, 'l')
          tray.visible = A.tray > 0.02
          tray.scale.setScalar(Math.max(0.001, A.tray))
          tray.position.set(A.r0 - 0.02, A.r1 + 0.075, A.r2)
          tray.rotation.set(0.12, 0.3, 0)
          tray.userData.cup.visible = A.card < 0.5
          card.visible = A.card > 0.02
          card.scale.setScalar(Math.max(0.001, A.card))
          towel.visible = A.card < 0.5
          watch.visible = A.watch > 0.02
          watch.scale.setScalar(Math.max(0.001, A.watch))
          watchHand.rotation.z = -(f.rm ? 1 : f.t * 1.2)
          sparks.visible = f.spark > 0.02
          if (sparks.visible) {
            const arr = sparks.geometry.attributes.position.array, n = sparks.userData.n
            for (let i = 0; i < n; i++) {
              const ph = ((f.rm ? 0.5 : t * 0.45) + i / n) % 1
              const a = i * 2.4 + ph * 1.5
              const r = 0.85 + 0.35 * ((i * 0.37) % 1)
              arr[i * 3] = Math.cos(a) * r * 1.05
              arr[i * 3 + 1] = Math.min(1.25, HEAD_Y - 0.1 + Math.sin(a) * r * 0.7 + ph * 0.25)
              arr[i * 3 + 2] = 0.2 + ((i * 0.53) % 1) * 0.3
            }
            sparks.geometry.attributes.position.needsUpdate = true
            sparks.material.opacity = f.spark * (f.rm ? 0.9 : 0.55 + 0.45 * Math.sin(t * 9 + 1))
            sparks.material.size = 0.4 * (0.75 + 0.3 * Math.sin(t * 7))
          }
        }
      },
      setLook(l) { applyLook(l) },
      dispose() {
        object.traverse((o) => {
          if (o.geometry) o.geometry.dispose()
          const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []
          for (const m of ms) { m.map?.dispose(); m.dispose() }
        })
        face.texture.dispose()
      },
    }
  },
}
