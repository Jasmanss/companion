// Bean: a designer-vinyl gentleman. A tall soft capsule with a flat, crisply turned top, sculpted waistcoat, shirt front,
// bow tie, brass buttons and a watch chain, a handlebar moustache and expressive brows. Its one glass detail is its eyewear.
// Moods come from brows, eye shape, moustache and posture (a lean-in to listen, a little bow when done), plus three small
// props: thinking beads, a call bead (needs you) and drifting z's (sleepy). Only celebrating bounces (confetti, hat toss).
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

/* ---------------- body profile ---------------- */
const R0 = 0.7 // body radius
const ZS = 0.86 // front-to-back flattening
const Y_BOT = -1.04, Y_TOP = 1.0, Y_C = 0.1
const N_TOP = 6, N_BOT = 3.1 // superellipse exponents: flat top, rounded base
const PROF_R = [], PROF_Y = []
{
  const N = 140
  for (let i = 0; i <= N; i++) {
    const th = -Math.PI / 2 + (Math.PI * i) / N
    const yn = Math.sin(th)
    const top = yn > 0
    const n = top ? N_TOP : N_BOT
    const y = Y_C + (top ? Y_TOP - Y_C : Y_C - Y_BOT) * yn
    let r = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(yn), n)), 1 / n)
    // Shoulders: a touch fuller under the top corner, a slight waist at the middle.
    r *= R0 * (1 + 0.04 * Math.exp(-(((y - 0.66) / 0.2) ** 2)) - 0.025 * Math.exp(-(((y + 0.1) / 0.32) ** 2)))
    PROF_R.push(i === 0 || i === N ? 0 : r)
    PROF_Y.push(y)
  }
}
function rAt(y) {
  if (y <= PROF_Y[0]) return 0
  const n = PROF_Y.length - 1
  if (y >= PROF_Y[n]) return 0
  let lo = 0, hi = n
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (PROF_Y[m] <= y) lo = m; else hi = m }
  const k = (y - PROF_Y[lo]) / (PROF_Y[hi] - PROF_Y[lo] || 1)
  return PROF_R[lo] + (PROF_R[hi] - PROF_R[lo]) * k
}
/** Front surface depth at (x, y). */
function surfZ(x, y) { const r = rAt(y); return ZS * Math.sqrt(Math.max(0, r * r - x * x)) }
/** Yaw that turns a flat feature at (x, y) to face along the surface normal. */
function surfYaw(x, y) { const r = Math.max(0.05, rAt(y)), z = surfZ(x, y); return Math.atan2(x / (r * r), z / (ZS * ZS * r * r)) }

/** A shell that follows the body at an offset: columns over angle (0 = front), rows from the base up to top(angle). */
function shellGeometry(off, a0, a1, yLo, topFn, cols, rows) {
  const pos = [], idx = []
  for (let i = 0; i <= cols; i++) {
    const a = a0 + ((a1 - a0) * i) / cols
    const yT = topFn(a), yB = typeof yLo === 'function' ? yLo(a) : yLo
    for (let j = 0; j <= rows; j++) {
      const s = 1 - Math.cos((Math.PI / 2) * (j / rows)) // denser near the bottom
      const y = yB + (yT - yB) * (yB <= Y_BOT + 0.001 ? s : j / rows)
      const r = rAt(y) * (1 + off / R0)
      pos.push(r * Math.sin(a), y, ZS * r * Math.cos(a))
    }
  }
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const a = i * (rows + 1) + j, b = a + rows + 1
    idx.push(a, b, a + 1, b, b + 1, a + 1)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/* ---------------- face layout ---------------- */
const EX = 0.22, EY = 0.5 // eyes
const BY = 0.675 // brows
const MY = 0.27 // moustache
const MOUTH_Y = 0.14
const BOW_Y = -0.02
const V_Y = -0.42, LAPEL_A = 0.6, COLLAR_Y = -0.06, HIGH_Y = 0.24, HIGH_A = 1.6 // waistcoat neckline

const lapelTop = (a) => {
  const t = Math.abs(a)
  if (t < LAPEL_A) return V_Y + (COLLAR_Y - V_Y) * Math.pow(t / LAPEL_A, 1.05)
  // A high shawl collar: from the V it sweeps up the sides and stays high around the back.
  const k = Math.min(1, (t - LAPEL_A) / (HIGH_A - LAPEL_A))
  return COLLAR_Y + (HIGH_Y - COLLAR_Y) * k * k * (3 - 2 * k)
}
/** Waistcoat hem: two points below the buttons, a notch between them, higher at the sides and back. */
const hemY = (a) => {
  const t = Math.abs(a)
  if (t < 0.2) return -0.86 - 0.09 * (t / 0.2)
  if (t < 0.55) return -0.95 + 0.17 * THREE.MathUtils.smoothstep(t, 0.2, 0.55)
  return -0.78
}

/* ---------------- small geometry helpers ---------------- */
function extrude(shape, depth = 0.02, bevel = 0.008) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 18 })
  g.translate(0, 0, -depth / 2)
  return g
}
/** A curved band (closed-eye line, happy arch). Angles in radians, counterclockwise. */
function bandShape(R, th, a0, a1, cy) {
  const s = new THREE.Shape()
  s.absarc(0, cy, R, a0, a1, false)
  s.absarc(0, cy, R - th, a1, a0, true)
  s.closePath()
  return s
}
// Upper-lid levels: the neutral face wears a heavy, slightly bored lid; listening and needs-you open wide.
const LIDS = { wide: 0, neutral: 0.3, worried: 0.32, sleepy: 0.6 }
function eyeShapes() {
  const pill = new THREE.Shape()
  { const w = 0.11, h = 0.2, r = w / 2; pill.moveTo(-r, -h / 2 + r); pill.lineTo(-r, h / 2 - r); pill.absarc(0, h / 2 - r, r, Math.PI, 0, true); pill.lineTo(r, -h / 2 + r); pill.absarc(0, -h / 2 + r, r, 0, Math.PI, true) }
  const dot = new THREE.Shape(); dot.absellipse(0, 0, 0.08, 0.086, 0, Math.PI * 2)
  const arcs = new THREE.Shape(); arcs.absellipse(0, -0.04, 0.09, 0.12, 0, Math.PI); arcs.closePath()
  const out = {}
  for (const [style, shape] of Object.entries({ pills: pill, dots: dot, arcs })) {
    const pts = shape.getPoints(24)
    if (pts.length > 1 && pts[0].distanceTo(pts[pts.length - 1]) < 1e-4) pts.pop()
    let top = -1, bot = 1
    for (const p of pts) { top = Math.max(top, p.y); bot = Math.min(bot, p.y) }
    let hw = 0
    for (const p of pts) hw = Math.max(hw, Math.abs(p.x))
    const g = extrude(new THREE.Shape(pts))
    g.userData = { top, bot, hw }
    out[style] = g
  }
  // Upper eyelid: a body-coloured sculpted shell, unit height (y from -1 to 0), its lower edge a soft almond curve.
  const lid = new THREE.Shape()
  lid.moveTo(-1, -1); lid.quadraticCurveTo(0, -1.3, 1, -1); lid.bezierCurveTo(1.05, -0.3, 0.6, 0.05, 0, 0.05); lid.bezierCurveTo(-0.6, 0.05, -1.05, -0.3, -1, -1)
  out.lid = new THREE.ExtrudeGeometry(lid, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.1, bevelSegments: 3, curveSegments: 16 })
  out.happy = extrude(bandShape(0.088, 0.036, Math.PI * 0.12, Math.PI * 0.88, -0.045), 0.02, 0.006)
  out.closed = extrude(bandShape(0.12, 0.03, Math.PI * 1.3, Math.PI * 1.7, 0.085), 0.02, 0.006)
  return out
}
/**
 * A tube whose radius follows radFn(t); both ends close to a point, so no open holes. flatZ squashes it against the face.
 */
function taperTube(curve, radFn, flatZ = 0.62, TS = 56, RS = 12) {
  const g = new THREE.TubeGeometry(curve, TS, 1, RS, false)
  const p = g.attributes.position, n = g.attributes.normal, c = new THREE.Vector3()
  for (let i = 0; i <= TS; i++) {
    const t = i / TS
    curve.getPointAt(t, c)
    const rad = radFn(t) * Math.sqrt(Math.min(1, t / 0.05, (1 - t) / 0.05)) + 0.0005
    for (let j = 0; j <= RS; j++) {
      const v = i * (RS + 1) + j
      p.setXYZ(v, c.x + (p.getX(v) - c.x) * rad, c.y + (p.getY(v) - c.y) * rad, c.z + (p.getZ(v) - c.z) * rad * flatZ)
      const nz = n.getZ(v) / flatZ, l = Math.hypot(n.getX(v), n.getY(v), nz)
      n.setXYZ(v, n.getX(v) / l, n.getY(v) / l, nz / l)
    }
  }
  g.deleteAttribute('uv')
  return g
}
/** A tapered brow: full at the inner end, thinning to a point at the outer end, with a slight lift. */
function browGeometry(s) {
  const pts = [[-0.1, -0.012], [-0.04, 0.012], [0.03, 0.02], [0.105, 0.002]]
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, y]) => new THREE.Vector3(x * s, y, 0)))
  return taperTube(curve, (t) => 0.036 * (1 - 0.6 * t), 0.55, 28, 10)
}
/** One half of a handlebar moustache: a tapered tube that follows the face and curls up at the tip. */
function moustacheGeometry(sign) {
  const z0 = surfZ(0, MY)
  const pts = [[-0.05, 0.015], [0.05, 0.004], [0.14, -0.014], [0.22, -0.016], [0.285, 0.008], [0.32, 0.05], [0.305, 0.088], [0.272, 0.09]]
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, y]) => new THREE.Vector3(x * sign, y, surfZ(Math.min(x, 0.6), MY + y) - z0 + 0.01)))
  return taperTube(curve, (t) => 0.062 * (1 - 0.84 * Math.pow(THREE.MathUtils.smoothstep(t, 0.08, 1), 0.8)), 0.62)
}
/** Bow tie: two soft wings and a knot. */
function bowGeometry() {
  const wing = (s) => {
    const pts = [[0.0, 0], [0.03, 0.002], [0.062, 0.03], [0.074, 0.075], [0.06, 0.112], [0.03, 0.128], [0.0, 0.13]].map(([r, y]) => new THREE.Vector2(r, y))
    const g = new THREE.LatheGeometry(pts, 20)
    g.translate(0, 0.012, 0)
    g.rotateZ(-s * Math.PI / 2)
    g.scale(1, 1, 0.55)
    return g
  }
  const knot = new THREE.SphereGeometry(0.042, 16, 12)
  knot.scale(1, 1.05, 0.75)
  knot.translate(0, 0, 0.012)
  for (const g of [knot]) g.deleteAttribute('uv')
  const a = wing(1), b = wing(-1)
  a.deleteAttribute('uv'); b.deleteAttribute('uv')
  return mergeGeometries([a, b, knot])
}
/** Brass: two buttons and a watch chain across the waistcoat. */
function brassGeometry() {
  const parts = []
  for (const y of [-0.5, -0.63, -0.76]) {
    const b = new THREE.SphereGeometry(0.038, 16, 10)
    b.scale(1, 1, 0.45)
    b.rotateY(0)
    b.translate(0, y, surfZ(0, y) + 0.02)
    parts.push(b)
  }
  const chain = []
  for (let i = 0; i <= 10; i++) {
    const t = i / 10, x = 0.02 + t * 0.4, y = -0.63 - Math.sin(t * Math.PI) * 0.1 + t * 0.02
    chain.push(new THREE.Vector3(x, y, surfZ(x, y) + 0.028))
  }
  const ch = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(chain), 40, 0.011, 6, false)
  parts.push(ch)
  // a fob on the end of the chain
  const fob = new THREE.SphereGeometry(0.03, 12, 8)
  fob.scale(1, 1, 0.5)
  const end = chain[chain.length - 1]
  fob.translate(end.x, end.y, end.z)
  parts.push(fob)
  for (const g of parts) for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k)
  return mergeGeometries(parts)
}
function stripTo(g) { for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k); if (!g.index) return g; return g }
function hatGeometry(kind) {
  if (kind !== 'bowler' && kind !== 'top') return null
  const P = kind === 'bowler'
    ? [[0.001, 0.4], [0.12, 0.395], [0.24, 0.372], [0.33, 0.322], [0.385, 0.245], [0.405, 0.15], [0.41, 0.07], [0.415, 0.022], [0.47, 0.012], [0.55, 0.02], [0.6, 0.04], [0.625, 0.064], [0.632, 0.078], [0.618, 0.068], [0.57, 0.04], [0.47, 0.004], [0.41, -0.006], [0.001, -0.006]]
    : [[0.001, 0.68], [0.32, 0.68], [0.342, 0.672], [0.352, 0.645], [0.338, 0.42], [0.342, 0.18], [0.356, 0.024], [0.46, 0.012], [0.56, 0.022], [0.61, 0.05], [0.625, 0.074], [0.61, 0.066], [0.55, 0.036], [0.46, 0.004], [0.36, -0.006], [0.001, -0.006]]
  const body = stripTo(new THREE.LatheGeometry(P.map(([r, y]) => new THREE.Vector2(r, y)), 48))
  const bandR = kind === 'bowler' ? 0.416 : 0.352
  const band = stripTo(new THREE.CylinderGeometry(bandR, bandR + 0.004, kind === 'bowler' ? 0.075 : 0.1, 48, 1, true))
  band.translate(0, kind === 'bowler' ? 0.062 : 0.075, 0)
  return { geo: mergeGeometries([body, band], true), top: P[0][1] }
}
function placeOnFace(g, x, y, lift) {
  g.rotateY(surfYaw(x, y))
  g.translate(x, y, surfZ(x, y) + lift)
  return g
}
function glassesGeometry(kind) {
  if (kind === 'none' || !kind) return null
  const frame = [], lens = []
  const LIFT = 0.085
  const ring = (x, y, R, tube, arc = Math.PI * 2, rot = 0) => { const t = new THREE.TorusGeometry(R, tube, 8, 44, arc); t.rotateZ(rot); return placeOnFace(stripTo(t), x, y, LIFT) }
  const disc = (x, y, R, half) => {
    const s = new THREE.Shape()
    if (half) { s.absarc(0, 0, R, Math.PI, Math.PI * 2, false); s.closePath() } else s.absarc(0, 0, R, 0, Math.PI * 2, false)
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: false, curveSegments: 32 })
    g.translate(0, 0, -0.006)
    return placeOnFace(stripTo(g), x, y, LIFT)
  }
  const rod = (a, b, r) => {
    const d = new THREE.Vector3().subVectors(b, a)
    const g = stripTo(new THREE.CylinderGeometry(r, r, d.length(), 6))
    g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()), new THREE.Vector3(1, 1, 1)))
    return g
  }
  const zl = (x, y) => surfZ(x, y) + LIFT
  if (kind === 'monocle') {
    const x = -EX, R = 0.142
    frame.push(ring(x, EY, R, 0.02))
    lens.push(disc(x, EY, R - 0.006, false))
    const pts = [new THREE.Vector3(x - 0.02, EY - R, zl(x, EY) - 0.01), new THREE.Vector3(x - 0.08, EY - 0.3, zl(x - 0.08, EY - 0.3) - 0.04), new THREE.Vector3(x - 0.1, 0.0, surfZ(x - 0.1, 0.0) + 0.03), new THREE.Vector3(-0.3, -0.24, surfZ(-0.3, -0.24) + 0.032)]
    frame.push(stripTo(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.008, 6, false)))
  } else {
    const half = kind === 'half-moon'
    const R = half ? 0.135 : 0.138, y = half ? EY - 0.03 : EY
    for (const s of [-1, 1]) {
      const x = s * EX
      frame.push(half ? ring(x, y, R, 0.014, Math.PI, Math.PI) : ring(x, y, R, 0.015))
      lens.push(disc(x, y, R - 0.005, half))
      if (half) frame.push(rod(new THREE.Vector3(x - R, y, zl(x - R, y)), new THREE.Vector3(x + R, y, zl(x + R, y)), 0.014)) // the flat top of a reading half-moon
      // temple arm, back into the head
      const ax = s * (EX + R), a = new THREE.Vector3(ax, y + (half ? -0.005 : 0.01), zl(ax, y) - 0.02), b = new THREE.Vector3(s * 0.66, y + 0.04, 0.0)
      frame.push(rod(a, b, 0.012))
    }
    // bridge
    const br = stripTo(new THREE.TorusGeometry(EX - R, 0.013, 6, 18, Math.PI))
    br.scale(1, half ? 0.5 : 0.65, 1)
    frame.push(placeOnFace(br, 0, half ? y - 0.005 : y + 0.015, LIFT + 0.004))
  }
  return { frame: mergeGeometries(frame), lens: mergeGeometries(lens) }
}

/** Z glyph for sleepy. */
function zGeometry() {
  const s = new THREE.Shape(), w = 0.1, h = 0.11, t = 0.028
  s.moveTo(-w / 2, h / 2); s.lineTo(w / 2, h / 2); s.lineTo(w / 2, h / 2 - t); s.lineTo(-w / 2 + t * 1.3, -h / 2 + t); s.lineTo(w / 2, -h / 2 + t); s.lineTo(w / 2, -h / 2); s.lineTo(-w / 2, -h / 2); s.lineTo(-w / 2, -h / 2 + t); s.lineTo(w / 2 - t * 1.3, h / 2 - t); s.lineTo(-w / 2, h / 2 - t); s.closePath()
  return extrude(s, 0.025, 0.008)
}

/* ---------------- colors ---------------- */
const NAVY = new THREE.Color('#1b2233')
const ACCENT = { ice: '#7a1a2a', lilac: '#6e1a2a', mint: '#7a1a2a', peach: '#1f3f66', graphite: '#8a1f30' }
function palette(look) {
  const tn = look.tint, g = tn.key === 'graphite'
  const body = g ? tn.ink.clone().lerp(tn.glass, 0.16) : tn.glow.clone().lerp(tn.ink, 0.5).lerp(tn.glass, 0.1)
  const coat = g ? tn.ink.clone().multiplyScalar(0.5) : tn.ink.clone().lerp(NAVY, 0.5).multiplyScalar(0.8)
  return {
    body, coat,
    shirt: new THREE.Color(g ? '#c4c8cf' : '#f3eee3'),
    trousers: g ? new THREE.Color('#2e3239') : tn.ink.clone().lerp(NAVY, 0.7).multiplyScalar(0.45),
    accent: new THREE.Color(ACCENT[tn.key] ?? ACCENT.ice),
    hair: new THREE.Color(g ? '#e4e0d8' : '#2c211c'),
    eye: new THREE.Color('#121318'),
    eyeLit: false,
    hat: g ? new THREE.Color('#121418') : tn.ink.clone().multiplyScalar(0.42),
    signal: look.dark ? tn.soft.clone() : g ? new THREE.Color('#3a4150') : tn.ink.clone().lerp(NAVY, 0.3),
  }
}

/* ---------------- moods ---------------- */
// Posture: lean (top toward you), tilt (sideways), sink (down), tall (stretch). Face: brow (both up), bL/bR (each),
// bSlant (worried knit), mus (moustache tips up), musL/musR, mouth (held open), cheek, hatTip, hatLift, gY, gTilt.
const KEYS = ['lean', 'tilt', 'sink', 'tall', 'brow', 'bL', 'bR', 'bSlant', 'mus', 'musL', 'musR', 'mouth', 'cheek', 'hatTip', 'hatLift', 'gY', 'gTilt', 'think', 'call', 'sweat', 'zz', 'confetti']
function target(o, f) {
  for (const k of KEYS) o[k] = 0
  o.tall = 1
  const A = f.rm ? 0 : 1, age = f.moodAge
  switch (f.mood) {
    case 'resting':
      o.sink = 0.3; o.tall = 0.96; o.lean = -0.05; o.tilt = -0.1; o.brow = -0.03; o.mus = -0.02; o.gY = -0.015; break
    case 'idle':
      o.mus = 0.06; o.bL = 0.018; break
    case 'listening':
      o.lean = 0.05; o.tilt = 0.14; o.tall = 1.02; o.brow = 0.02; o.bR = 0.07; o.mus = 0.08; break
    case 'thinking':
      o.tilt = -0.07; o.bR = 0.07; o.bL = -0.025; o.musR = 0.2; o.musL = -0.06; o.think = 1; o.gTilt = 0.03; break
    case 'talking':
      o.lean = 0.04; o.mus = 0.1; o.brow = 0.03; break
    case 'done': {
      // A courteous little bow, then hold a contented nod.
      const k = Math.min(1, age / 1.1), bow = A ? Math.sin(k * Math.PI) * 0.22 : 0
      o.lean = 0.1 + bow; o.mus = 0.2; o.brow = 0.02; o.hatTip = 0.25 + bow * 1.4; break
    }
    case 'needs-you':
      o.tall = 1.05; o.sink = -0.04; o.lean = 0.05; o.brow = 0.075; o.mouth = 0.45; o.call = 1; break
    case 'worried':
      o.lean = -0.07; o.tall = 0.965; o.bSlant = 0.36; o.brow = 0.01; o.mus = -0.3; o.sweat = 1; o.gTilt = -0.08; o.gY = -0.012; break
    case 'celebrating':
      o.tall = 1.02; o.brow = 0.08; o.mus = 0.3; o.mouth = 0.6; o.hatLift = 0.14; o.confetti = 1; break
    case 'sleepy':
      o.tilt = 0.06; o.lean = 0.05; o.sink = 0.15; o.tall = 0.97; o.brow = -0.035; o.bSlant = 0.14; o.mus = -0.14; o.zz = 1; o.gY = -0.035; o.gTilt = 0.05; break
  }
  return o
}

export default {
  id: 'bean',
  name: 'Bean',
  vibe: 'A designer-vinyl gentleman: a flat-topped bean in a sculpted waistcoat and bow tie, with a handlebar moustache and real glass spectacles.',
  eyes: ['pills', 'dots', 'arcs'],
  accessories: true,
  style: 'solid',
  frame: { height: 2.45, y: 0.0, peek: { height: 1.62, y: 0.38 }, header: { height: 1.9, y: 0.24 } },
  create({ kit, look, size }) {
    const fr = { height: 2.45, y: 0.0, ...(size === 'peek' ? { height: 1.62, y: 0.38 } : size === 'header' ? { height: 1.9, y: 0.24 } : {}) }
    const geos = [], mats = [], texs = []
    const G = (g) => (geos.push(g), g)
    const M = (m) => (mats.push(m), m)
    const pal = palette(look)

    const object = new THREE.Group()
    const fit = new THREE.Group() // keeps a hat inside the frame
    const base = new THREE.Group() // bounce / sink
    const pivot = new THREE.Group() // lean and tilt around the base
    pivot.position.y = Y_BOT + 0.04
    const body = new THREE.Group()
    body.position.y = -(Y_BOT + 0.04)
    object.add(fit); fit.add(base); base.add(pivot); pivot.add(body)

    /* body + tailoring */
    const bodyGeo = G(new THREE.LatheGeometry(PROF_R.map((r, i) => new THREE.Vector2(r, PROF_Y[i])), 72, Math.PI))
    bodyGeo.scale(1, 1, ZS)
    const bodyMat = M(kit.solid(pal.body, look, { sheen: 0.12 }))
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat)
    const rimMat = M(kit.rim('#ffffff', { power: 2.6, intensity: 0.4 }))
    const rim = new THREE.Mesh(bodyGeo, rimMat)
    rim.scale.setScalar(1.006)
    const coatMat = M(kit.solid(pal.coat, look, { sheen: 0.2 }))
    const coat = new THREE.Mesh(G(shellGeometry(0.032, -Math.PI, Math.PI, hemY, lapelTop, 160, 36)), coatMat)
    const trouserMat = M(kit.solid(pal.trousers, look, { sheen: 0.15 }))
    const trousers = new THREE.Mesh(G(shellGeometry(0.016, -Math.PI, Math.PI, Y_BOT, () => -0.7, 96, 18)), trouserMat)
    const shirtMat = M(kit.solid(pal.shirt, look, { roughness: 0.55 }))
    const shirt = new THREE.Mesh(G(shellGeometry(0.011, -0.72, 0.72, V_Y - 0.1, (a) => 0.06 + 0.1 * (a / 0.72) ** 2, 40, 12)), shirtMat)
    // A rolled collar along the waistcoat's neckline: the crisp, sculpted edge that makes it tailoring, not paint.
    const rollPts = []
    for (let i = 0; i < 160; i++) {
      const a = -Math.PI + (i / 160) * Math.PI * 2, y = lapelTop(a), r = rAt(y) * (1 + 0.036 / R0)
      rollPts.push(new THREE.Vector3(r * Math.sin(a), y, ZS * r * Math.cos(a)))
    }
    const roll = new THREE.Mesh(G(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rollPts, true), 240, 0.026, 8, true)), coatMat)
    body.add(roll)
    const bowMat = M(kit.solid(pal.accent, look, { sheen: 0.45, sheenRoughness: 0.4, roughness: 0.55 }))
    const bow = new THREE.Mesh(G(bowGeometry()), bowMat)
    bow.scale.setScalar(1.3)
    bow.position.set(0, BOW_Y, surfZ(0, BOW_Y) + 0.035)
    const brassMat = M(new THREE.MeshPhysicalMaterial({ color: '#d6a54c', metalness: 1, roughness: 0.3, clearcoat: 0.6 }))
    const brass = new THREE.Mesh(G(brassGeometry()), brassMat)
    body.add(bodyMesh, rim, coat, trousers, shirt, bow, brass)

    /* eyes */
    const EYE = eyeShapes()
    for (const g of Object.values(EYE)) G(g)
    const eyeMat = M(new THREE.MeshPhysicalMaterial({ color: pal.eye, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08 }))
    const hlMat = M(new THREE.MeshBasicMaterial({ color: '#ffffff' }))
    const hlGeo = G(new THREE.SphereGeometry(0.02, 10, 8))
    const eyes = [-1, 1].map((s) => {
      const grp = new THREE.Group()
      const m = new THREE.Mesh(EYE.pills, eyeMat)
      const hl = new THREE.Mesh(hlGeo, hlMat)
      hl.position.set(0.022, 0.048, 0.022)
      m.add(hl)
      const lid = new THREE.Mesh(EYE.lid, bodyMat)
      grp.add(m, lid)
      body.add(grp)
      return { s, grp, m, hl, lid }
    })

    /* brows + moustache + mouth + cheeks */
    const hairMat = M(kit.solid(pal.hair, look, { roughness: 0.5, sheen: 0.1 }))
    const brows = [-1, 1].map((s) => {
      const browGeo = G(browGeometry(s))
      const grp = new THREE.Group()
      grp.position.set(s * EX, BY, surfZ(s * EX, BY) + 0.012)
      grp.rotation.y = surfYaw(s * EX, BY)
      const m = new THREE.Mesh(browGeo, hairMat)
      grp.add(m)
      body.add(grp)
      return { s, grp, m }
    })
    const mus = new THREE.Group()
    mus.position.set(0, MY, surfZ(0, MY))
    const halves = [-1, 1].map((s) => { const m = new THREE.Mesh(G(moustacheGeometry(s)), hairMat); mus.add(m); return m })
    body.add(mus)
    // Mouth: a painted D under the moustache (flat top, round bottom) that opens downward.
    const mouthMat = M(new THREE.MeshPhysicalMaterial({ color: '#2a0b10', roughness: 0.45 }))
    const mShape = new THREE.Shape()
    mShape.moveTo(-1, 0); mShape.lineTo(1, 0); mShape.absellipse(0, 0, 1, 1, 0, -Math.PI, true); mShape.closePath()
    const mouthGeo = G(new THREE.ExtrudeGeometry(mShape, { depth: 0.012, bevelEnabled: false, curveSegments: 20 }))
    mouthGeo.scale(1, 1, 1)
    const mouth = new THREE.Mesh(mouthGeo, mouthMat)
    mouth.position.set(0, MOUTH_Y + 0.06, surfZ(0, MOUTH_Y) - 0.004)
    body.add(mouth)

    /* props: thinking beads / call bead / sweat, z's, confetti */
    const beadMat = M(kit.solid('#ffffff', look, { roughness: 0.3 }))
    const beads = new THREE.InstancedMesh(G(new THREE.SphereGeometry(1, 18, 12)), beadMat, 3)
    beads.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    for (let i = 0; i < 3; i++) beads.setColorAt(i, pal.signal)
    beads.frustumCulled = false
    body.add(beads)
    // Needs you: a bold call badge (red disc, white "!") drawn on a canvas.
    const bc = document.createElement('canvas')
    bc.width = bc.height = 128
    { const g = bc.getContext('2d'); g.fillStyle = '#ffffff'; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill(); g.fillStyle = '#ff3b4f'; g.beginPath(); g.arc(64, 64, 52, 0, 7); g.fill()
      g.fillStyle = '#ffffff'; g.beginPath(); g.roundRect(55, 26, 18, 50, 9); g.fill(); g.beginPath(); g.arc(64, 94, 10, 0, 7); g.fill() }
    const badgeTex = new THREE.CanvasTexture(bc)
    badgeTex.colorSpace = THREE.SRGBColorSpace
    texs.push(badgeTex)
    const badge = new THREE.Sprite(M(new THREE.SpriteMaterial({ map: badgeTex, toneMapped: false })))
    badge.position.set(0.6, 0.78, 0.36)
    body.add(badge)
    const glow = kit.glowSprite(pal.signal, 0.6, 0)
    mats.push(glow.material)
    body.add(glow)
    const zMat = M(kit.solid('#ffffff', look, { roughness: 0.4 }))
    const zs = new THREE.InstancedMesh(G(zGeometry()), zMat, 3)
    zs.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    zs.frustumCulled = false
    body.add(zs)
    const NC = 14
    const confMat = M(new THREE.MeshStandardMaterial({ roughness: 0.45, side: THREE.DoubleSide }))
    const confetti = new THREE.InstancedMesh(G(new THREE.PlaneGeometry(0.16, 0.085)), confMat, NC)
    confetti.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    confetti.frustumCulled = false
    const CONF = Array.from({ length: NC }, (_, i) => {
      const r = (k) => { const v = Math.sin((i + 1) * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v) }
      const side = i % 2 ? 1 : -1
      return { x: side * (0.35 + r(1) * 0.7), z: -0.2 + r(2) * 0.8, ph: r(3), sp: 0.28 + r(4) * 0.2, spin: 2 + r(5) * 5, ax: r(6) * 6, c: i % 5 }
    })
    fit.add(confetti)

    /* hat + glasses */
    const hatGrp = new THREE.Group()
    hatGrp.position.set(0.03, Y_TOP - 0.012, 0)
    const hatMat = M(kit.solid(pal.hat, look, { roughness: 0.4 }))
    hatMat.side = THREE.DoubleSide
    const hat = new THREE.Mesh(undefined, [hatMat, bowMat])
    hatGrp.add(hat)
    body.add(hatGrp)
    const specs = new THREE.Group()
    specs.position.y = 0
    const lensMat = M(kit.glass(look, { thickness: 0.15, roughness: 0.04, attenuationDistance: 3 }))
    const specFrame = new THREE.Mesh(undefined, brassMat)
    const specLens = new THREE.Mesh(undefined, lensMat)
    specs.add(specFrame, specLens)
    body.add(specs)
    let hatKind = null, specKind = null, hatTop = 0

    /* state */
    const pose = {}, tgt = {}
    for (const k of KEYS) pose[k] = 0
    pose.tall = 1
    let lastT = null, curLook = look
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e3 = new THREE.Euler(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3()
    const CALL = new THREE.Color('#ff4a5c'), warmCol = new THREE.Color('#ffa040'), WHITE = new THREE.Color('#ffffff'), tmpCol = new THREE.Color()
    const confCols = [new THREE.Color(), new THREE.Color(), new THREE.Color('#e8b64c'), new THREE.Color('#ffffff'), new THREE.Color()]

    function setLook(l) {
      curLook = l
      const p = palette(l)
      Object.assign(pal, p)
      bodyMat.color.copy(p.body); coatMat.color.copy(p.coat); shirtMat.color.copy(p.shirt); bowMat.color.copy(p.accent)
      hairMat.color.copy(p.hair); hatMat.color.copy(p.hat)
      for (const m of [bodyMat, coatMat, shirtMat, hatMat, beadMat, zMat, trouserMat]) kit.updateSolid(m, l)
      kit.updateSolid(bowMat, l, { roughness: 0.55 })
      trouserMat.color.copy(p.trousers)
      // Dark panels: a cool velvet sheen on the waistcoat so it separates from the background.
      coatMat.sheen = l.dark ? 0.9 : 0.2
      coatMat.sheenColor.copy(l.dark ? l.tint.glow : WHITE)
      kit.updateSolid(hairMat, l, { roughness: 0.5 })
      kit.updateSolid(shirtMat, l, { roughness: 0.55 })
      // Rich vinyl color: the room environment washes saturated solids toward pastel, so use less of it.
      for (const m of [bodyMat, coatMat, shirtMat, bowMat, hatMat, beadMat, zMat, hairMat, trouserMat]) m.envMapIntensity *= 0.55
      eyeMat.color.copy(p.eye)
      eyeMat.emissive.copy(p.eyeLit ? p.eye : new THREE.Color(0)).multiplyScalar(p.eyeLit ? 0.55 : 0)
      kit.updateGlass(lensMat, l, { roughness: 0.04 + 0.1 * l.frost, attenuationDistance: 3 })
      lensMat.color.setRGB(1, 1, 1).lerp(l.tint.glass, 0.25)
      rimMat.uniforms.color.value.copy(l.dark ? l.tint.glow : new THREE.Color('#ffffff'))
      rimMat.uniforms.intensity.value = l.dark ? 0.55 : 0.32
      zMat.color.copy(l.dark ? l.tint.soft : l.tint.ink.clone().lerp(l.tint.glow, 0.35))
      for (let i = 0; i < 3; i++) beads.setColorAt(i, p.signal)
      beads.instanceColor.needsUpdate = true
      glow.material.color.copy(CALL)
      confCols[0].copy(l.tint.glow); confCols[1].copy(p.accent); confCols[4].copy(l.tint.soft)
      for (let i = 0; i < NC; i++) confetti.setColorAt(i, confCols[CONF[i].c])
      confetti.instanceColor.needsUpdate = true
      if (hatKind !== l.hat) {
        hatKind = l.hat
        hat.geometry?.dispose?.()
        const h = hatGeometry(l.hat)
        hat.visible = !!h
        hat.geometry = h ? h.geo : new THREE.BufferGeometry()
        hatTop = h ? h.top : 0
      }
      if (specKind !== l.glasses) {
        specKind = l.glasses
        specFrame.geometry?.dispose?.(); specLens.geometry?.dispose?.()
        const g = glassesGeometry(l.glasses)
        specs.visible = !!g
        specFrame.geometry = g ? g.frame : new THREE.BufferGeometry()
        specLens.geometry = g ? g.lens : new THREE.BufferGeometry()
      }
      // Fit: keep the hat (and a celebrating hat toss) inside the frame.
      const frameTop = fr.y + fr.height / 2
      const need = Y_TOP + (hatTop ? hatTop + 0.06 + (size === 'big' ? 0.2 : 0.04) : 0.04)
      if (size === 'big') {
        const lo = Y_BOT - 0.08, s = Math.min(1, (frameTop - lo) / (need - lo))
        fit.scale.setScalar(s); fit.position.y = lo * (1 - s)
      } else {
        fit.scale.setScalar(1); fit.position.y = Math.min(0, frameTop - need) * 0.6 // in the small tab, let the hat crown crop a little rather than lose the face
      }
    }
    setLook(look)

    function placeEye(e, f, shape) {
      const x = e.s * EX + f.lookX * 0.045, y = EY - f.lookY * 0.04
      e.grp.position.set(x, y, surfZ(x, y) - 0.002)
      e.grp.rotation.set(0, surfYaw(x, y), 0)
      const open = shape !== 'happy' && shape !== 'closed'
      const geo = open ? EYE[curLook.eyes] ?? EYE.pills : EYE[shape]
      if (e.m.geometry !== geo) e.m.geometry = geo
      e.hl.visible = open
      const k = open ? LIDS[shape] : 0
      e.lid.visible = k > 0
      if (open) {
        const { top, bot, hw } = geo.userData, wide = shape === 'wide'
        e.m.scale.set(wide ? 1.08 : 1, Math.max(0.1, f.blink * (wide ? 1.06 : 1)), 1)
        const lidTop = top + 0.008, cut = top - (top - bot) * k * (shape === 'sleepy' ? Math.min(1.15, 1.3 - f.open) : 1)
        e.lid.position.set(0, lidTop, 0.006)
        e.lid.scale.set(hw + 0.014, lidTop - cut, 1)
        e.lid.rotation.z = shape === 'worried' ? -e.s * 0.32 : 0
        e.hl.position.set(0.022, Math.min(0.045, cut - 0.03), 0.022)
      } else e.m.scale.set(1, 1, 1)
    }

    function update(f) {
      const snap = lastT === null || Math.abs(f.t - f.dt - lastT) > 0.02 || f.rm
      lastT = f.t
      target(tgt, f)
      const dt = f.dt || 1 / 60
      for (const k of KEYS) pose[k] = snap ? tgt[k] : pose[k] + (tgt[k] - pose[k]) * (1 - Math.exp(-7 * dt))
      const A = f.rm ? 0 : 1, P = f.P, c = f.clock, lvl = f.level
      const talk = f.mood === 'talking' ? 1 : 0

      /* posture */
      const sway = A * Math.sin(c * 0.9) * 0.018 * f.wob
      const breathe = A * Math.sin(c * 1.7) * 0.007 * (0.5 + f.wob)
      base.position.y = f.bounce - pose.sink * (0.6 + 0.4 * P) * (size === 'big' ? 0.4 : hatTop ? 0.45 : 1) // tuck deeper in the small tab (less under a hat)
      base.position.x = f.mood === 'worried' ? A * Math.sin(f.t * 38) * 0.006 * P : 0
      pivot.rotation.x = pose.lean * (0.75 + 0.35 * P) + talk * lvl * 0.035 * A
      pivot.rotation.z = -pose.tilt * (0.75 + 0.35 * P) + sway + talk * A * Math.sin(c * 2.3) * 0.02
      const st = pose.tall + breathe + (f.mood === 'celebrating' ? -f.bounce * 0.35 : 0)
      pivot.scale.set(1 / Math.sqrt(st), st, 1 / Math.sqrt(st))

      /* body color: warm when worried */
      

      /* eyes */
      const md = f.mood
      const shape = md === 'resting' ? 'closed' : md === 'done' || md === 'celebrating' ? 'happy' : md === 'sleepy' ? 'sleepy' : md === 'worried' ? 'worried' : md === 'listening' || md === 'needs-you' ? 'wide' : 'neutral'
      for (const e of eyes) placeEye(e, f, shape)

      /* brows */
      for (const b of brows) {
        const own = b.s < 0 ? pose.bL : pose.bR
        b.m.position.y = pose.brow + own + talk * lvl * 0.03 + (shape === 'wide' ? 0.025 : 0)
        b.m.rotation.z = -b.s * pose.bSlant + (b.s > 0 ? pose.bR : -pose.bL) * 0.0
      }

      /* moustache + mouth */
      mus.position.y = MY + talk * lvl * 0.025
      halves[0].rotation.z = -(pose.mus + pose.musL)
      halves[1].rotation.z = pose.mus + pose.musR
      const mo = Math.max(talk * (0.45 + lvl * 0.55), pose.mouth)
      mouth.visible = mo > 0.04
      mouth.scale.set(0.08 + mo * 0.05, 0.02 + mo * 0.14, 1)

      /* hat */
      const toss = f.mood === 'celebrating' ? Math.min(1, -f.bounce / 0.09) : 0
      hatGrp.rotation.set(-pose.hatTip * 0.6, pose.hatLift * toss * 2.5, -0.07 - pose.hatLift * 1.6)
      hatGrp.position.y = Y_TOP - 0.012 + pose.hatLift * (0.35 + 0.65 * toss) + pose.hatTip * 0.05

      /* glasses */
      specs.position.y = pose.gY
      specs.rotation.z = pose.gTilt

      /* thinking beads / call bead / sweat drop */
      const showBeads = pose.think > 0.02 || pose.sweat > 0.02
      badge.visible = pose.call > 0.02
      badge.scale.setScalar(0.38 * pose.call * (A ? 1 + 0.07 * Math.sin(f.t * 6) : 1))
      beads.visible = showBeads
      glow.material.opacity = pose.call * (0.55 + 0.3 * A * Math.sin(f.t * 5)) * (curLook.dark ? 1 : 0.6)
      glow.visible = pose.call > 0.02
      if (showBeads) {
        for (let i = 0; i < 3; i++) {
          let x = 0, y = 0, z = 0.1, s = 0, sx = 1
          if (pose.think > 0.02) {
            const pulse = A ? 0.75 + 0.25 * Math.max(0, Math.sin(f.t * 4 - i * 0.9)) : 0.9
            x = 0.52 + i * 0.16; y = 0.8 + i * 0.12; z = 0.25; s = (0.065 + i * 0.024) * pulse * pose.think
          } else if (pose.call > 0.02) {
            
          } else if (i === 0) {
            const drip = A ? (f.t * 0.6) % 1 : 0.3
            x = 0.4; y = 0.7 - drip * 0.06; z = surfZ(0.4, 0.68) + 0.05; s = 0.085 * pose.sweat; sx = 0.78
          }
          v3.set(x, y, z); s3.set(s * sx, s * (sx < 1 ? 1.35 : 1), s); q.identity()
          beads.setMatrixAt(i, m4.compose(v3, q, s3))
        }
        beads.instanceMatrix.needsUpdate = true
        if (pose.sweat > 0.02 && pose.think <= 0.02 && pose.call <= 0.02) { beads.setColorAt(0, warmCol) } else beads.setColorAt(0, pal.signal)
        beads.instanceColor.needsUpdate = true
      }
      glow.position.set(0.6, 0.78, 0.3)
      glow.scale.setScalar(0.7)

      /* z's */
      zs.visible = pose.zz > 0.02
      if (zs.visible) {
        for (let i = 0; i < 3; i++) {
          const ph = A ? (f.t * 0.22 + i / 3) % 1 : 0.15 + i * 0.3
          const s = pose.zz * (1.5 + ph * 1.1) * Math.min(1, Math.sin(ph * Math.PI) * 2.2)
          v3.set(-0.52 - ph * 0.22, 0.74 + ph * 0.3, 0.15)
          e3.set(0, 0, 0.25 - ph * 0.4); q.setFromEuler(e3); s3.set(s, s, s)
          zs.setMatrixAt(i, m4.compose(v3, q, s3))
        }
        zs.instanceMatrix.needsUpdate = true
      }

      /* confetti */
      confetti.visible = pose.confetti > 0.02
      if (confetti.visible) {
        for (let i = 0; i < NC; i++) {
          const p = CONF[i]
          const ph = A ? (p.ph + f.t * p.sp) % 1 : p.ph
          const y = 1.22 - ph * 2.3
          v3.set(p.x + Math.sin(f.t * 2 + i) * 0.06 * A, y, p.z)
          e3.set(p.ax + f.t * p.spin * A, p.ax * 0.7 + f.t * p.spin * 0.6 * A, p.ax)
          q.setFromEuler(e3)
          const s = pose.confetti * Math.min(1, ph * 8, (1 - ph) * 5)
          s3.set(s, s, s)
          confetti.setMatrixAt(i, m4.compose(v3, q, s3))
        }
        confetti.instanceMatrix.needsUpdate = true
      }
    }

    return {
      object,
      update,
      setLook,
      dispose() {
        for (const g of geos) g.dispose()
        hat.geometry?.dispose?.(); specFrame.geometry?.dispose?.(); specLens.geometry?.dispose?.()
        for (const m of mats) m.dispose()
        for (const t of texs) t.dispose()
        beads.dispose(); zs.dispose(); confetti.dispose()
      },
    }
  },
}
