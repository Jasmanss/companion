// Penguin: a dignified penguin valet in its natural tuxedo. Solid soft-touch vinyl body (deep tinted navy / plum /
// forest / rust, true charcoal for graphite) with a crisp white shirt front and face, satin lapels, a bow tie with a
// glass bead at the knot, and small flippers that act as hands: a silver tray (idle), an approval card (needs-you),
// a chin tap (thinking), a bow (done), flaps (celebrating).
//
// Build notes
// - Body and head are two lathes. Their shirt / face markings are painted per pixel on canvases in the lathes' own UV
//   space (u = angle around, v = profile index), so the edges stay crisp and follow the body's curve.
// - The head sits on a pivot at the collar, so it can tilt and nod; the bow tie hides the seam.
// - The one transmissive material is the glass: the bead on the bow tie, and the lenses when glasses are worn.
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

const V2 = THREE.Vector2
const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const ease = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt))
const WARM = new THREE.Color('#ffa64d')
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }

/* ---------------- shape ---------------- */
// Profiles as (radius, y), bottom to top. The head is a little wider than the collar, so a soft neck line reads.
const BODY_PTS = [[0, -1.13], [0.34, -1.11], [0.55, -1.0], [0.645, -0.78], [0.655, -0.55], [0.62, -0.27], [0.55, -0.02], [0.48, 0.2], [0.42, 0.36], [0.36, 0.48], [0.2, 0.57], [0, 0.59]]
const HEAD_PTS = [[0, 0.3], [0.22, 0.32], [0.355, 0.4], [0.42, 0.55], [0.437, 0.7], [0.418, 0.87], [0.35, 1.0], [0.2, 1.09], [0, 1.115]]
const NECK = 0.4 // head pivot height
const EYE_X = 0.13, EYE_Y = 0.725
const BEAK_Y = 0.6

function profile(pts, n) {
  const curve = new THREE.SplineCurve(pts.map(([r, y]) => new V2(r, y)))
  const p = curve.getPoints(n)
  p[0].x = 0; p[p.length - 1].x = 0
  for (const q of p) q.x = Math.max(0, q.x)
  const ys = p.map((q) => q.y), rs = p.map((q) => q.x)
  // radius at height y (profiles are monotonic in y)
  const rAt = (y) => {
    if (y <= ys[0]) return 0
    for (let i = 1; i < ys.length; i++) if (ys[i] >= y) { const t = (y - ys[i - 1]) / Math.max(1e-6, ys[i] - ys[i - 1]); return rs[i - 1] + (rs[i] - rs[i - 1]) * t }
    return 0
  }
  return { pts: p, ys, rs, rAt, n }
}
const BODY = profile(BODY_PTS, 150)
const HEAD = profile(HEAD_PTS, 120)
const surfZ = (P, x, y) => Math.sqrt(Math.max(0, P.rAt(y) ** 2 - x * x))
const headZ = (x, y) => surfZ(HEAD, x, y)
const bodyZ = (x, y) => surfZ(BODY, x, y)

/* ---------------- markings (painted per pixel in lathe UV space) ---------------- */
const sdEllipse = (x, y, cx, cy, rx, ry) => (Math.hypot((x - cx) / rx, (y - cy) / ry) - 1) * Math.min(rx, ry)
const smin = (a, b, k) => { const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1); return b + (a - b) * h - k * h * (1 - h) }

// Shirt front: a V that opens down from the collar into the white belly. Negative inside.
function shirtHalfWidth(y) {
  if (y > 0.41) return -1
  if (y > 0) return 0.03 + 0.31 * Math.pow((0.41 - y) / 0.41, 0.8)
  if (y > -0.55) return 0.34 + 0.15 * smooth(0, -0.55, y)
  return 0.49 - 0.1 * smooth(-0.8, -1.12, y)
}
function shirtSD(x, y) { const hw = shirtHalfWidth(y); return hw < 0 ? 1 : Math.abs(x) - hw }
// Face: two lobes round the eyes melting into a white chin; a dark widow's peak comes down between the eyes.
function faceSD(x, y) {
  const lobe = Math.min(sdEllipse(x, y, -0.13, 0.715, 0.155, 0.175), sdEllipse(x, y, 0.13, 0.715, 0.155, 0.175))
  const chin = sdEllipse(x, y, 0, 0.5, 0.25, 0.19)
  let d = smin(lobe, chin, 0.08)
  const peak = (0.8 + Math.abs(x) * 1.5) - y // > 0 below the widow's peak line
  d = Math.max(d, -peak + 0.0)
  return d
}

function paint(canvas, P, sdf, cols, lapel, patch = false) {
  const W = canvas.width, H = canvas.height
  const g = canvas.getContext('2d')
  const img = g.createImageData(W, H)
  const d = img.data
  const [dr, dg, db] = cols.dark, [wr, wg, wb] = cols.white, [lr, lg, lb] = cols.lapel, [pr, pg, pb] = cols.patch
  for (let j = 0; j < H; j++) {
    const v = 1 - (j + 0.5) / H
    const fi = v * P.n, i0 = Math.floor(fi), i1 = Math.min(P.n, i0 + 1), ft = fi - i0
    const y = P.ys[i0] + (P.ys[i1] - P.ys[i0]) * ft, r = P.rs[i0] + (P.rs[i1] - P.rs[i0]) * ft
    const aa = Math.max(0.004, (Math.PI * 2 * r) / W * 1.2)
    for (let i = 0; i < W; i++) {
      const phi = ((i + 0.5) / W - 0.5) * Math.PI * 2
      const front = Math.cos(phi)
      let R = dr, G = dg, B = db
      if (front > 0) {
        const x = r * Math.sin(phi)
        const s = sdf(x, y)
        // satin lapel band beside the shirt
        if (lapel && s > 0 && s < 0.09 && y > -0.42 && y < 0.42) {
          const k = (1 - smooth(0.05, 0.09, s)) * smooth(-0.42, -0.1, y) * 0.9
          R += (lr - R) * k; G += (lg - G) * k; B += (lb - B) * k
        }
        if (patch) {
          // a soft gold patch at the jaw, like an emperor penguin's (a signature accent)
          const ps = sdEllipse(Math.abs(x), y, 0.33, 0.47, 0.085, 0.12)
          const k = clamp(0.5 - ps / 0.03, 0, 1) * 0.95
          R += (pr - R) * k; G += (pg - G) * k; B += (pb - B) * k
        }
        const c = clamp(0.5 - s / aa, 0, 1) * smooth(0, 0.08, front)
        R += (wr - R) * c; G += (wg - G) * c; B += (wb - B) * c
      }
      const o = (j * W + i) * 4
      d[o] = R; d[o + 1] = G; d[o + 2] = B; d[o + 3] = 255
    }
  }
  g.putImageData(img, 0, 0)
}

/* ---------------- colors ---------------- */
const tmpC = new THREE.Color(), tmpE = new THREE.Color(), WHITE = new THREE.Color(1, 1, 1)
function palette(look) {
  const tn = look.tint
  const graphite = tn.key === 'graphite'
  const body = graphite ? new THREE.Color('#121317') : tn.ink.clone().multiplyScalar(0.24)
  const lapel = graphite ? new THREE.Color('#22252c') : body.clone().lerp(tn.glow, 0.05).multiplyScalar(1.3)
  const shirt = new THREE.Color('#f6f4ef').lerp(tn.soft, 0.1)
  const bow = graphite ? new THREE.Color('#0e0f12') : body.clone().multiplyScalar(0.55)
  const beak = new THREE.Color('#e3a04e')
  return { body, lapel, shirt, bow, beak, graphite }
}
const rgb = (c) => { tmpC.copy(c).convertLinearToSRGB(); return [tmpC.r * 255, tmpC.g * 255, tmpC.b * 255] }

/* ---------------- geometry helpers ---------------- */
function flipperGeometry() {
  const g = new THREE.SphereGeometry(1, 28, 18)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i)
    const t = (1 - y) / 2 // 0 at the shoulder, 1 at the tip
    const taper = 1 - 0.42 * t * t
    x *= 0.12 * taper; z *= 0.055 * (1 - 0.3 * t); y *= 0.41
    x += 0.035 * t * t // a gentle outward curl at the tip
    p.setXYZ(i, x, y - 0.38, z)
  }
  g.computeVertexNormals()
  return g
}
function bowGeometry() {
  const s = new THREE.Shape()
  s.moveTo(0, 0.026)
  s.bezierCurveTo(0.05, 0.05, 0.11, 0.085, 0.14, 0.06)
  s.bezierCurveTo(0.16, 0.03, 0.16, -0.03, 0.14, -0.06)
  s.bezierCurveTo(0.11, -0.085, 0.05, -0.05, 0, -0.026)
  s.bezierCurveTo(-0.05, -0.05, -0.11, -0.085, -0.14, -0.06)
  s.bezierCurveTo(-0.16, -0.03, -0.16, 0.03, -0.14, 0.06)
  s.bezierCurveTo(-0.11, 0.085, -0.05, 0.05, 0, 0.026)
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.018, bevelSize: 0.016, bevelSegments: 4, curveSegments: 16 })
  g.translate(0, 0, -0.015)
  return g
}
function trayGeometry() {
  const tray = new THREE.LatheGeometry([[0, 0], [0.17, 0], [0.2, 0.012], [0.215, 0.03], [0.205, 0.034], [0.185, 0.016], [0, 0.014]].map(([x, y]) => new V2(x, y)), 40)
  const dome = new THREE.SphereGeometry(0.115, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2)
  dome.scale(1, 1.15, 1); dome.translate(0, 0.016, 0)
  const knob = new THREE.SphereGeometry(0.022, 12, 8); knob.translate(0, 0.152, 0)
  return mergeGeometries([tray.toNonIndexed(), dome.toNonIndexed(), knob.toNonIndexed()])
}
function feetGeometry() {
  const parts = [-1, 1].map((s) => { const g = new THREE.SphereGeometry(1, 20, 12); g.scale(0.13, 0.05, 0.17); g.rotateY(s * 0.25); g.translate(s * 0.19, -1.1, 0.33); return g })
  return mergeGeometries(parts)
}
/** Two tailcoat tails behind the feet, splayed so they show in silhouette. */
function tailsGeometry() {
  const parts = [-1, 1].map((s) => {
    const g = new THREE.ConeGeometry(0.15, 0.66, 20)
    g.scale(1, 1, 0.35)
    g.rotateX(Math.PI) // point down
    g.rotateZ(s * 0.62)
    g.rotateX(-0.2)
    g.translate(s * 0.46, -0.92, -0.3)
    return g.toNonIndexed()
  })
  return mergeGeometries(parts)
}
function studsGeometry() {
  const parts = [0.2, 0.02].map((y) => { const g = new THREE.SphereGeometry(0.02, 12, 8); g.scale(1, 1, 0.55); g.translate(0, y, bodyZ(0, y) + 0.003); return g })
  return mergeGeometries(parts)
}
function ring(r, tube, arc = Math.PI * 2, rot = 0) {
  const g = new THREE.TorusGeometry(r, tube, 8, 40, arc)
  g.rotateZ(rot)
  return g
}
function rod(a, b, r) {
  const d = new THREE.Vector3().subVectors(b, a)
  const g = new THREE.CylinderGeometry(r, r, d.length(), 6, 1)
  g.translate(0, d.length() / 2, 0)
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()))
  g.translate(a.x, a.y, a.z)
  return g
}
const yawAt = (x, y) => Math.asin(clamp(x / Math.max(0.01, HEAD.rAt(y)), -1, 1))
/** Glasses in head space (world coords before the neck offset). */
function glassesGeometry(kind) {
  if (!kind || kind === 'none') return null
  const frame = [], lens = []
  const T = 0.009
  const place = (g, s, y, dz) => { g.rotateY(s * yawAt(EYE_X, y) * 0.75); g.translate(s * EYE_X, y, headZ(EYE_X, y) + dz); return g }
  const temple = (s, y) => {
    const a = new THREE.Vector3(s * (EYE_X + 0.09), y, headZ(EYE_X + 0.09, y) + 0.04)
    frame.push(rod(a, new THREE.Vector3(s * 0.42, y + 0.02, 0.0), T * 0.8))
  }
  if (kind === 'round') {
    const r = 0.088
    for (const s of [-1, 1]) {
      frame.push(place(ring(r, T), s, EYE_Y, 0.05))
      lens.push(place(new THREE.CircleGeometry(r, 32), s, EYE_Y, 0.047))
      temple(s, EYE_Y + 0.01)
    }
    const br = EYE_X - r
    frame.push(ring(br, T * 0.9, Math.PI * 0.8, Math.PI * 0.1).translate(0, EYE_Y + 0.0, headZ(0, EYE_Y) + 0.05))
  } else if (kind === 'half-moon') {
    const r = 0.085, y = EYE_Y - 0.04
    for (const s of [-1, 1]) {
      frame.push(place(ring(r, T, Math.PI, Math.PI), s, y, 0.05))
      const bar = new THREE.CylinderGeometry(T, T, r * 2, 6)
      bar.rotateZ(Math.PI / 2)
      frame.push(place(bar, s, y, 0.05))
      lens.push(place(new THREE.CircleGeometry(r, 24, Math.PI, Math.PI), s, y, 0.047))
      temple(s, y)
    }
    const br = EYE_X - r
    frame.push(ring(br, T * 0.9, Math.PI * 0.8, Math.PI * 0.1).translate(0, y - 0.01, headZ(0, y) + 0.05))
  } else if (kind === 'monocle') {
    const r = 0.095, s = 1
    frame.push(place(ring(r, T * 1.2), s, EYE_Y, 0.05))
    lens.push(place(new THREE.CircleGeometry(r, 32), s, EYE_Y, 0.047))
    // a fine chain from the rim down past the cheek to the collar
    const z0 = headZ(EYE_X + 0.06, EYE_Y - r) + 0.05
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(EYE_X + 0.07, EYE_Y - r + 0.02, z0),
      new THREE.Vector3(0.3, 0.55, headZ(0.3, 0.55) + 0.025),
      new THREE.Vector3(0.27, 0.4, bodyZ(0.27, 0.4) + 0.06),
      new THREE.Vector3(0.16, 0.3, bodyZ(0.16, 0.3) + 0.02),
    ])
    frame.push(new THREE.TubeGeometry(curve, 40, 0.005, 5, false))
  }
  return { frame: mergeGeometries(frame.map((g) => (g.index ? g.toNonIndexed() : g))), lens: lens.length ? mergeGeometries(lens.map((g) => (g.index ? g.toNonIndexed() : g))) : null }
}
function hatGeometry(kind) {
  const L = (pts) => new THREE.LatheGeometry(pts.map(([x, y]) => new V2(x, y)), 48)
  if (kind === 'top') {
    const crown = L([[0, 0.5], [0.27, 0.5], [0.285, 0.485], [0.28, 0.25], [0.265, 0.07], [0.27, 0]])
    const brim = L([[0.26, 0.02], [0.4, 0.005], [0.45, 0.03], [0.46, 0.055], [0.445, 0.042], [0.4, 0.022], [0.26, 0.04]])
    const band = new THREE.CylinderGeometry(0.272, 0.268, 0.07, 48, 1, true); band.translate(0, 0.075, 0)
    return { body: mergeGeometries([crown.toNonIndexed(), brim.toNonIndexed()]), band, top: 0.5 }
  }
  if (kind === 'bowler') {
    const crown = new THREE.SphereGeometry(0.3, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2); crown.scale(1, 1.0, 1); crown.translate(0, 0.04, 0)
    const skirt = new THREE.CylinderGeometry(0.3, 0.305, 0.05, 40, 1, true); skirt.translate(0, 0.03, 0)
    const brim = L([[0.29, 0.015], [0.38, 0.005], [0.415, 0.033], [0.425, 0.058], [0.41, 0.044], [0.38, 0.022], [0.29, 0.035]])
    const band = new THREE.CylinderGeometry(0.303, 0.306, 0.05, 40, 1, true); band.translate(0, 0.045, 0)
    return { body: mergeGeometries([crown.toNonIndexed(), skirt.toNonIndexed(), brim.toNonIndexed()]), band, top: 0.345 }
  }
  return null
}

/* ---------------- canvases: approval card, zz ---------------- */
function drawCard(c, look) {
  const g = c.getContext('2d')
  const glow = '#' + look.tint.glow.getHexString(), ink = '#' + look.tint.ink.getHexString()
  g.clearRect(0, 0, c.width, c.height)
  g.fillStyle = '#fbfbf8'
  g.beginPath(); g.roundRect(6, 6, 244, 164, 22); g.fill()
  g.strokeStyle = 'rgba(20,24,32,.12)'; g.lineWidth = 3; g.stroke()
  // two lines of "text"
  g.fillStyle = 'rgba(30,34,44,.28)'
  g.beginPath(); g.roundRect(30, 34, 120, 16, 8); g.fill()
  g.beginPath(); g.roundRect(30, 62, 84, 16, 8); g.fill()
  // badge
  g.fillStyle = glow
  g.beginPath(); g.arc(196, 56, 28, 0, Math.PI * 2); g.fill()
  g.fillStyle = '#ffffff'
  g.beginPath(); g.roundRect(191, 36, 10, 26, 5); g.fill()
  g.beginPath(); g.arc(196, 72, 6, 0, Math.PI * 2); g.fill()
  // approve button
  g.fillStyle = ink
  g.beginPath(); g.roundRect(30, 106, 196, 42, 21); g.fill()
  g.strokeStyle = '#ffffff'; g.lineWidth = 7; g.lineCap = g.lineJoin = 'round'
  g.beginPath(); g.moveTo(112, 127); g.lineTo(124, 138); g.lineTo(146, 116); g.stroke()
}
function zzTexture() {
  const c = document.createElement('canvas')
  c.width = 128; c.height = 128
  const g = c.getContext('2d')
  g.fillStyle = '#ffffff'
  g.font = '800 64px system-ui, sans-serif'
  g.fillText('z', 18, 112)
  g.font = '800 44px system-ui, sans-serif'
  g.fillText('z', 66, 58)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/* ---------------- moods → pose targets ---------------- */
// lean (pitch from the feet), sway (roll), sink, nod/tilt/yaw (head), La/Lb, Ra/Rb (flipper out/forward, screen left /
// right), tray, card, dots, zz, sweat, aura, beak, lid (upper-lid cover), slant (worried brows), happy (∩), closed (∪), eyeS
const KEYS = ['lean', 'sway', 'sink', 'hunch', 'nod', 'tilt', 'yaw', 'La', 'Lb', 'Lz', 'Ra', 'Rb', 'Rz', 'tray', 'card', 'dots', 'zz', 'sweat', 'aura', 'beak', 'lid', 'slant', 'happy', 'closed', 'eyeS', 'confetti', 'bead']
// At rest: chest out, chin a touch up, lids a little heavy (composed, dry).
const REST = { lean: -0.025, sway: 0, sink: 0, hunch: 0, nod: -0.04, tilt: 0, yaw: 0, La: 0.36, Lb: 0.05, Lz: 0, Ra: 0.36, Rb: 0.05, Rz: 0, tray: 0, card: 0, dots: 0, zz: 0, sweat: 0, aura: 0, beak: 0, lid: 0.16, slant: 0, happy: 0, closed: 0, eyeS: 1, confetti: 0, bead: 0 }

function targets(o, f) {
  Object.assign(o, REST)
  const A = f.rm ? 0 : f.P / 0.55 // motion amplitude: 1 calm, ~2.4 lively
  const t = f.t, age = f.moodAge
  switch (f.mood) {
    case 'resting':
      // tucked in: settled low, head down into the shoulders, leaning on the screen edge, eyes shut
      o.sink = 1; o.hunch = 1; o.nod = 0.24; o.sway = 0.06; o.closed = 1; o.lean = 0.02
      o.La = 0.14; o.Lb = -0.2; o.Ra = 0.14; o.Rb = -0.2
      break
    case 'idle':
      o.Ra = 2.45; o.Rb = 0.15; o.tray = 1; o.tilt = -0.04
      break
    case 'listening':
      // leaning in, head tilted into a flipper cupped at the ear, lids up, the bead glowing
      o.lean = 0.08; o.tilt = -0.24; o.nod = 0.04; o.eyeS = 1.1; o.lid = 0
      o.La = 2.8; o.Lb = -0.6; o.Lz = 0.1; o.Ra = 0.22; o.Rb = -0.4; o.bead = 1
      break
    case 'thinking': {
      // flipper to the chin, tapping
      o.La = -0.62; o.Lb = 2.38 - Math.max(0, Math.sin(t * 5.5)) * 0.08 * A; o.Lz = 0.2; o.dots = 1
      o.nod = -0.1; o.tilt = -0.1; o.yaw = 0.1; o.lid = 0.1
      break
    }
    case 'talking':
      // beak open, a palm-up flipper at chest height, leaning in a little
      o.beak = 0.3 + f.level * 0.7; o.lean = 0.05; o.lid = 0.12
      o.Ra = 1.15 + Math.sin(t * 2.3) * 0.1 * A; o.Rb = 0.85 + Math.sin(t * 1.7) * 0.08 * A; o.Rz = 0.08
      o.nod = -f.level * 0.06 * Math.min(1, A + 0.3); o.tilt = Math.sin(t * 0.9) * 0.04 * A
      break
    case 'done': {
      // a deep, courteous bow with the flippers swept back, then a contented, slightly bowed hold
      const bow = f.rm ? 0.75 : Math.sin(Math.PI * clamp(age / 1.4, 0, 1)) * 0.35 + 0.75 * smooth(0.4, 1.2, age)
      o.lean = bow * 0.42; o.nod = bow * 0.3; o.happy = 1
      o.Ra = 0.42; o.Rb = -0.9; o.La = 0.42; o.Lb = -0.9
      break
    }
    case 'needs-you':
      o.La = 2.55; o.Lb = 0.25; o.card = 1; o.eyeS = 1.12; o.lean = 0.04; o.tilt = 0.07; o.lid = 0
      break
    case 'worried':
      // shoulders up, head down, flippers wrung in front, brows up in the middle, an amber halo
      o.slant = 1; o.lid = 0.18; o.sweat = 1; o.aura = 1; o.hunch = 1; o.nod = 0.1
      o.La = 0.1 + Math.sin(t * 6) * 0.05 * A; o.Lb = 0.62; o.Lz = 0.18; o.Ra = 0.1 - Math.sin(t * 6) * 0.05 * A; o.Rb = 0.62; o.Rz = 0.18
      o.sway = Math.sin(t * 2.2) * 0.02 * A
      break
    case 'celebrating': {
      const flap = Math.sin(t * 13) * 0.32 * Math.min(1.4, A)
      o.La = 2.25 + flap; o.Lb = 0.15; o.Ra = 2.25 - flap; o.Rb = 0.15
      o.happy = 1; o.beak = 0.6; o.confetti = 1; o.nod = -0.1
      break
    }
    case 'sleepy':
      o.lid = 0.62; o.sink = 0.6; o.hunch = 0.5; o.zz = 1
      o.nod = 0.2 + Math.sin(t * 0.8) * 0.06 * A; o.tilt = 0.14 + Math.sin(t * 0.55) * 0.05 * A
      o.La = 0.18; o.Lb = 0.1; o.Ra = 0.18; o.Rb = 0.1
      break
  }
  return o
}

export default {
  id: 'penguin',
  name: 'Penguin',
  vibe: 'A dignified penguin valet in his natural tuxedo: silver tray, bow tie, a glass bead at the knot, and very dry manners.',
  eyes: ['pills', 'dots'],
  accessories: true,
  style: 'solid',
  frame: { height: 2.6, y: 0, peek: { height: 1.62, y: 0.47 }, header: { height: 1.7, y: 0.42 } },
  create({ kit, look, size }) {
    const geos = [], mats = [], texs = []
    const G = (g) => (geos.push(g), g)
    const M = (m) => (mats.push(m), m)
    const small = size !== 'big'

    const object = new THREE.Group()
    const fit = new THREE.Group()
    const hop = new THREE.Group()
    const leanP = new THREE.Group(); leanP.position.y = -1.1
    const bodyG = new THREE.Group(); bodyG.position.y = 1.1
    object.add(fit); fit.add(hop); hop.add(leanP); leanP.add(bodyG)

    /* body + head with painted markings */
    const bodyCanvas = document.createElement('canvas'); bodyCanvas.width = 512; bodyCanvas.height = 512
    const headCanvas = document.createElement('canvas'); headCanvas.width = 512; headCanvas.height = 384
    const bodyTex = new THREE.CanvasTexture(bodyCanvas), headTex = new THREE.CanvasTexture(headCanvas)
    for (const t of [bodyTex, headTex]) { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; texs.push(t) }
    const bodyMat = M(kit.solid('#ffffff', look, { map: bodyTex }))
    const headMat = M(kit.solid('#ffffff', look, { map: headTex }))
    const bodyGeo = G(new THREE.LatheGeometry(BODY.pts, 96, -Math.PI, Math.PI * 2))
    const headGeo = G(new THREE.LatheGeometry(HEAD.pts, 96, -Math.PI, Math.PI * 2))
    const body = new THREE.Mesh(bodyGeo, bodyMat)
    const rimMat = M(kit.rim('#ffffff', { power: 2.6, intensity: 0.5 }))
    const bodyRim = new THREE.Mesh(bodyGeo, rimMat); bodyRim.scale.setScalar(1.004)
    bodyG.add(body, bodyRim)

    const neck = new THREE.Group(); neck.position.y = NECK
    const headG = new THREE.Group(); headG.position.y = -NECK
    bodyG.add(neck); neck.add(headG)
    const head = new THREE.Mesh(headGeo, headMat)
    const headRim = new THREE.Mesh(headGeo, rimMat); headRim.scale.setScalar(1.004)
    headG.add(head, headRim)

    /* eyes: glossy black beads, with white upper lids and closed-eye arcs */
    const eyeMat = M(new THREE.MeshPhysicalMaterial({ color: '#0b0c10', roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 1.1 }))
    const lidMat = M(kit.solid('#ffffff', look))
    const eyeGeo = G(new THREE.SphereGeometry(1, 28, 18))
    const lidGeo = G(new THREE.CircleGeometry(1, 28, 0, Math.PI))
    const lashGeo = G(new THREE.BoxGeometry(1.7, 0.07, 0.02))
    const arcGeo = G(new THREE.TorusGeometry(0.048, 0.014, 8, 28, Math.PI))
    const eyes = [-1, 1].map((s) => {
      const g = new THREE.Group()
      const z = headZ(EYE_X, EYE_Y)
      g.position.set(s * EYE_X, EYE_Y, z - 0.004)
      g.rotation.y = s * yawAt(EYE_X, EYE_Y) * 0.85
      const ball = new THREE.Mesh(eyeGeo, eyeMat)
      const lid = new THREE.Mesh(lidGeo, lidMat)
      const arc = new THREE.Mesh(arcGeo, eyeMat)
      const lash = new THREE.Mesh(lashGeo, eyeMat)
      lid.add(lash)
      arc.scale.z = 0.6
      g.add(ball, lid, arc)
      headG.add(g)
      return { g, ball, lid, arc, s }
    })

    /* beak: two mandibles; the lower one drops while talking */
    const beakMat = M(kit.solid('#e3a04e', look))
    const beak = new THREE.Group()
    beak.position.set(0, BEAK_Y, headZ(0, BEAK_Y) - 0.02)
    beak.rotation.x = 0.42
    const upperGeo = G(new THREE.ConeGeometry(0.084, 0.21, 28)); upperGeo.rotateX(Math.PI / 2); upperGeo.scale(1, 0.62, 1); upperGeo.translate(0, 0.014, 0.105)
    const lowerGeo = G(new THREE.ConeGeometry(0.068, 0.16, 24)); lowerGeo.rotateX(Math.PI / 2); lowerGeo.scale(1, 0.5, 1); lowerGeo.translate(0, -0.014, 0.08)
    const upper = new THREE.Mesh(upperGeo, beakMat)
    const lower = new THREE.Mesh(lowerGeo, beakMat)
    const mouthGeo = G(new THREE.SphereGeometry(0.062, 16, 10)); mouthGeo.scale(1, 0.75, 0.8); mouthGeo.translate(0, -0.012, 0.04)
    const mouth = new THREE.Mesh(mouthGeo, M(new THREE.MeshStandardMaterial({ color: '#8a2c2a', roughness: 0.5 })))
    beak.add(upper, lower, mouth)
    headG.add(beak)

    /* bow tie with a glass bead at the knot; shirt studs */
    const bowMat = M(kit.solid('#3060a0', look, { sheen: 0.25, sheenRoughness: 0.4 }))
    const bow = new THREE.Mesh(G(bowGeometry()), bowMat)
    bow.position.set(0, 0.42, bodyZ(0, 0.42) + 0.04)
    bow.rotation.x = -0.12
    const glassMat = M(kit.glass(look, { thickness: 0.12, roughness: 0.04, attenuationDistance: 0.6 }))
    const bead = new THREE.Mesh(G(new THREE.SphereGeometry(0.05, 24, 16)), glassMat)
    bead.position.set(0, 0.42, bodyZ(0, 0.42) + 0.08)
    const studMat = M(kit.solid('#1a1c22', look, { roughness: 0.2, clearcoat: 1 }))
    const studs = new THREE.Mesh(G(studsGeometry()), studMat)
    bodyG.add(bow, bead, studs)

    /* flippers (screen left, screen right) and feet */
    const flipMat = M(kit.solid('#20304a', look))
    const flipGeo = G(flipperGeometry())
    const flippers = [-1, 1].map((s) => {
      const p = new THREE.Group()
      p.position.set(s * 0.43, 0.2, 0.0)
      const m = new THREE.Mesh(flipGeo, flipMat)
      m.scale.x = s
      p.add(m)
      bodyG.add(p)
      return { p, m, s }
    })
    const feet = new THREE.Mesh(G(feetGeometry()), beakMat)
    const tails = new THREE.Mesh(G(tailsGeometry()), flipMat)
    bodyG.add(feet, tails)

    /* silver tray with a cloche (idle, screen-right flipper) */
    const silver = M(new THREE.MeshStandardMaterial({ color: '#d9dde4', metalness: 1, roughness: 0.22 }))
    const tray = new THREE.Mesh(G(trayGeometry()), silver)
    const trayHold = new THREE.Group(); trayHold.position.y = -0.76
    trayHold.add(tray)
    flippers[1].p.add(trayHold)

    /* approval card (needs-you, screen-left flipper) */
    const cardCanvas = document.createElement('canvas'); cardCanvas.width = 256; cardCanvas.height = 176
    const cardTex = new THREE.CanvasTexture(cardCanvas); cardTex.colorSpace = THREE.SRGBColorSpace; texs.push(cardTex)
    const cardMat = M(new THREE.MeshBasicMaterial({ map: cardTex, transparent: true, toneMapped: false }))
    const card = new THREE.Mesh(G(new THREE.PlaneGeometry(0.5, 0.344)), cardMat)
    const cardHold = new THREE.Group(); cardHold.position.y = -0.82
    const cardGlow = kit.glowSprite(look.tint.glow, 0.9, 0.7); mats.push(cardGlow.material)
    cardGlow.position.z = -0.02
    cardHold.add(cardGlow, card)
    flippers[0].p.add(cardHold)

    /* effects: thinking dots, zz, sweat, aura, confetti */
    const fx = new THREE.Group()
    hop.add(fx)
    const dotMat = M(kit.light(look.tint.glow, 1.5))
    const dots = new THREE.InstancedMesh(G(new THREE.SphereGeometry(1, 16, 12)), dotMat, 3)
    dots.frustumCulled = false
    fx.add(dots)
    const zzTex = zzTexture(); texs.push(zzTex)
    const zz = new THREE.Sprite(M(new THREE.SpriteMaterial({ map: zzTex, transparent: true, depthWrite: false })))
    fx.add(zz)
    const sweatGeo = G(new THREE.SphereGeometry(1.5, 16, 12))
    { const p = sweatGeo.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); const k = y > 0 ? 1 - y * 0.75 : 1; p.setXYZ(i, p.getX(i) * k * 0.028, y * 0.042, p.getZ(i) * k * 0.02) } sweatGeo.computeVertexNormals() }
    const sweat = new THREE.Mesh(sweatGeo, M(new THREE.MeshPhysicalMaterial({ color: '#cfe8ff', roughness: 0.05, clearcoat: 1, emissive: '#5a8ab8', emissiveIntensity: 0.25 })))
    headG.add(sweat)
    const aura = kit.glowSprite(new THREE.Color('#ffa64d'), 2.0, 0.0); mats.push(aura.material)
    aura.material.blending = THREE.NormalBlending
    aura.position.set(0, 0.72, -0.5)
    fx.add(aura)
    const ringMat = M(new THREE.MeshBasicMaterial({ color: WARM, transparent: true, toneMapped: false, depthWrite: false }))
    const ring = new THREE.Mesh(G(new THREE.TorusGeometry(0.6, 0.022, 8, 64)), ringMat)
    ring.position.set(0, 0.74, -0.35)
    fx.add(ring)
    const CONF = 22
    const confMat = M(new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }))
    const confetti = new THREE.InstancedMesh(G(new THREE.PlaneGeometry(0.13, 0.075)), confMat, CONF)
    confetti.frustumCulled = false
    const confCols = ['#ffc23d', '#ff6f91', '#3fc8ff', '#5be0a6', '#ffffff']
    const tc = new THREE.Color()
    for (let i = 0; i < CONF; i++) confetti.setColorAt(i, tc.set(confCols[i % confCols.length]).multiplyScalar(1.2))
    fx.add(confetti)

    /* accessories */
    const metal = M(new THREE.MeshStandardMaterial({ color: '#c9a96a', metalness: 1, roughness: 0.25 }))
    const specFrame = new THREE.Mesh(undefined, metal)
    const specLens = new THREE.Mesh(undefined, glassMat)
    headG.add(specFrame, specLens)
    const hatMat = M(kit.solid('#16181d', look, { sheen: 0.7, sheenRoughness: 0.4 }))
    const bandMat = M(kit.solid('#3060a0', look))
    const hat = new THREE.Group()
    const hatBody = new THREE.Mesh(undefined, hatMat), hatBand = new THREE.Mesh(undefined, bandMat)
    hat.add(hatBody, hatBand)
    hat.position.set(0.02, 0.98, -0.02)
    hat.rotation.set(-0.1, 0, -0.1)
    headG.add(hat)
    let hatKind = null, specKind = null, hatTop = 0

    const dummy = new THREE.Object3D()
    const pose = { ...REST }, tg = { ...REST }
    let cur = look, lastT = null

    function setLook(l) {
      cur = l
      const pal = palette(l)
      const cols = { dark: rgb(pal.body), white: rgb(pal.shirt), lapel: rgb(pal.lapel), patch: rgb(pal.beak) }
      paint(bodyCanvas, BODY, shirtSD, cols, false)
      paint(headCanvas, HEAD, faceSD, cols, false, true)
      bodyTex.needsUpdate = headTex.needsUpdate = true
      for (const m of [bodyMat, headMat, lidMat, beakMat, bowMat, flipMat, hatMat, bandMat]) kit.updateSolid(m, l)
      kit.updateSolid(studMat, l, { roughness: 0.2, clearcoat: 1 })
      // satin sheen on the dark cloth
      for (const m of [bodyMat, headMat, flipMat]) { m.sheen = 0.6; m.sheenRoughness = 0.35; m.sheenColor.copy(pal.graphite ? new THREE.Color('#9aa4b8') : l.tint.soft).multiplyScalar(0.3) }
      lidMat.color.copy(pal.shirt)
      flipMat.color.copy(pal.body)
      beakMat.color.copy(pal.beak)
      bowMat.color.copy(pal.bow)
      bowMat.sheen = 0.6; bowMat.sheenRoughness = 0.3; bowMat.sheenColor.copy(l.tint.soft).multiplyScalar(0.4)
      hatMat.color.copy(pal.graphite ? new THREE.Color('#121317') : pal.body.clone().multiplyScalar(0.7))
      bandMat.color.copy(pal.bow)
      // near-clear glass, so lenses don't recolor the eyes; the bead's tint comes from its inner light
      kit.updateGlass(glassMat, l, { thickness: 0.12, roughness: 0.04, attenuationDistance: 4 })
      glassMat.color.lerp(WHITE, 0.85)
      rimMat.uniforms.color.value.copy(l.tint.soft).lerp(new THREE.Color(1, 1, 1), 0.4)
      rimMat.uniforms.intensity.value = l.dark ? 0.55 : 0.26; rimMat.uniforms.power.value = 3.2
      dotMat.color.copy(l.tint.glow).lerp(l.tint.ink, l.dark ? 0 : pal.graphite ? 0.55 : 0.2).multiplyScalar(l.dark ? 1.5 : 1.15)
      cardGlow.material.color.copy(l.tint.glow)
      zz.material.color.copy(l.dark ? l.tint.soft : l.tint.ink)
      drawCard(cardCanvas, l); cardTex.needsUpdate = true
      // eyes
      const dots_ = l.eyes === 'dots'
      for (const e of eyes) e.ball.userData.base = dots_ ? [0.05, 0.053, 0.026] : [0.043, 0.063, 0.024]
      // accessories
      if (specKind !== l.glasses) {
        specKind = l.glasses
        specFrame.geometry?.dispose?.(); specLens.geometry?.dispose?.()
        const g = glassesGeometry(l.glasses)
        specFrame.visible = specLens.visible = !!g
        specFrame.geometry = g ? g.frame : new THREE.BufferGeometry()
        specLens.geometry = g && g.lens ? g.lens : new THREE.BufferGeometry()
      }
      if (hatKind !== l.hat) {
        hatKind = l.hat
        hatBody.geometry?.dispose?.(); hatBand.geometry?.dispose?.()
        const h = hatGeometry(l.hat)
        hat.visible = !!h
        hatBody.geometry = h ? h.body : new THREE.BufferGeometry()
        hatBand.geometry = h ? h.band : new THREE.BufferGeometry()
        hatTop = h ? h.top : 0
      }
      // keep a hat inside the frame
      const top = hatTop ? 0.98 + hatTop + 0.02 : 1.13
      if (size === 'big') {
        const s = Math.min(1, (1.24 + 1.13) / (top + 1.13))
        fit.scale.setScalar(s); fit.position.y = -1.13 * (1 - s)
      } else {
        const fr = size === 'peek' ? { height: 1.62, y: 0.47 } : { height: 1.7, y: 0.42 }
        const lim = fr.y + fr.height / 2 - 0.04
        fit.scale.setScalar(1); fit.position.y = -Math.max(0, top - lim)
      }
    }
    setLook(look)

    return {
      object,
      setLook,
      update(f, l) {
        if (l !== cur && l) cur = l
        targets(tg, f)
        const dt = f.rm ? 1 : Math.min(0.1, f.dt || 1 / 60)
        // the first frame, or a jump in time (mood sheet stills), snaps straight to the pose
        const snap = f.rm || lastT === null || f.t - lastT > 0.25 || f.t < lastT
        lastT = f.t
        for (const k of KEYS) pose[k] = snap ? tg[k] : ease(pose[k], tg[k], k === 'beak' ? 22 : k === 'Lb' || k === 'Rb' || k === 'La' || k === 'Ra' ? 9 : 6, dt)
        const p = pose, A = f.rm ? 0 : f.P / 0.55
        const breathe = f.rm ? 0 : Math.sin(f.clock * 1.3) * (f.mood === 'sleepy' || f.mood === 'resting' ? 0.012 : 0.007)

        hop.position.y = f.mood === 'celebrating' ? -f.bounce * 0.9 : 0
        leanP.rotation.x = p.lean
        leanP.rotation.z = p.sway
        bodyG.position.y = 1.1 - p.sink * 0.04
        bodyG.scale.set(1 + p.sink * 0.04 + breathe * 0.5, 1 - p.sink * 0.08 + breathe, 1 + p.sink * 0.04)
        neck.position.y = NECK - p.hunch * 0.05
        neck.rotation.set(p.nod, p.yaw, -p.tilt)

        // flippers: out angle (a) then forward (b)
        flippers[0].p.rotation.set(-p.Lb, 0, -p.La)
        flippers[1].p.rotation.set(-p.Rb, 0, p.Ra)
        flippers[0].p.position.set(-0.43 + p.Lz * 0.25, 0.2 + p.Lz * 0.2, p.Lz)
        flippers[1].p.position.set(0.43 - p.Rz * 0.25, 0.2 + p.Rz * 0.2, p.Rz)
        // the tray and the card stay level, facing out
        trayHold.visible = p.tray > 0.03
        trayHold.scale.setScalar(Math.max(0.001, p.tray))
        trayHold.rotation.set(p.Rb, 0, -p.Ra, 'ZYX')
        tray.rotation.set(0.32, 0.4, 0)
        tray.scale.setScalar(1.45)
        cardHold.visible = p.card > 0.03
        cardHold.scale.setScalar(Math.max(0.001, p.card))
        cardHold.rotation.set(p.Lb, 0, p.La, 'ZYX')
        card.rotation.z = -0.12 + (f.rm ? 0 : Math.sin(f.t * 2.2) * 0.04)
        cardGlow.material.opacity = 0.55 + (f.rm ? 0 : 0.3 * Math.sin(f.t * 5))

        // eyes
        const open = f.open
        for (const e of eyes) {
          const [bx, by, bz] = e.ball.userData.base
          const big = Math.max(1, open) * p.eyeS
          const shut = Math.max(p.happy, p.closed)
          e.ball.visible = shut < 0.5
          e.arc.visible = shut >= 0.5
          e.ball.scale.set(bx * big, by * big * Math.max(0.08, f.blink), bz)
          e.ball.position.set(f.lookX * 0.03, -f.lookY * 0.025, 0)
          // upper lid: covers from the top; sleepy and worried droop, worried slants up toward the middle
          const cover = clamp(Math.max(p.lid, 1 - Math.min(1, open)) + (f.mood === 'sleepy' ? 0.1 : 0), 0, 0.95)
          const lr = bx * big * 1.55
          e.lid.visible = e.ball.visible && cover > 0.02
          e.lid.scale.set(lr, by * big * 2.3, 1)
          e.lid.position.set(e.ball.position.x, e.ball.position.y + by * big - cover * by * big * 2, bz + 0.004)
          e.lid.rotation.z = -e.s * p.slant * 0.42
          e.arc.rotation.z = p.closed > p.happy ? Math.PI : 0
          e.arc.position.set(0, p.closed > p.happy ? 0.02 : -0.02, 0.022)
        }
        // beak
        lower.rotation.x = p.beak * 0.85
        upper.rotation.x = -p.beak * 0.22
        mouth.visible = p.beak > 0.04

        // thinking dots: three beads rising up-right, lighting in turn
        dots.visible = p.dots > 0.03
        if (dots.visible) {
          for (let i = 0; i < 3; i++) {
            const ph = f.rm ? 1 : 0.6 + 0.4 * Math.max(0, Math.sin(f.t * 3.2 - i * 0.9))
            dummy.position.set(0.5 + i * 0.16, 1.0 + i * 0.09, 0.1)
            dummy.scale.setScalar((0.045 + i * 0.016) * p.dots * ph)
            dummy.updateMatrix()
            dots.setMatrixAt(i, dummy.matrix)
          }
          dots.instanceMatrix.needsUpdate = true
        }
        // zz
        zz.visible = p.zz > 0.03
        if (zz.visible) {
          const k = f.rm ? 0.5 : (f.t * 0.35) % 1
          zz.position.set(0.6 + k * 0.12, 1.0 + k * 0.16, 0.2)
          zz.scale.setScalar(0.52 * p.zz)
          zz.material.opacity = p.zz * (f.rm ? 0.9 : Math.sin(Math.PI * k) * 0.95)
        }
        // worried: a sweat bead and a warm halo
        sweat.visible = p.sweat > 0.05
        if (sweat.visible) {
          const k = f.rm ? 0.3 : (f.t * 0.6) % 1
          sweat.position.set(0.47, 0.98 - k * 0.12, 0.12)
          sweat.scale.setScalar(p.sweat)
        }
        // the glass bead at the knot: a soft tint light while listening, amber when worried
        glassMat.emissive.copy(cur.tint.glow).multiplyScalar(0.3 + p.bead * 0.9).add(tmpE.copy(WARM).multiplyScalar(p.aura * 0.9))
        aura.material.opacity = 0.75 * p.aura * (f.rm ? 1 : 0.8 + 0.2 * Math.sin(f.t * 3))
        aura.visible = p.aura > 0.02
        ring.visible = aura.visible
        if (ring.visible) {
          const k = f.rm ? 0 : (f.t * 0.9) % 1
          ring.scale.setScalar(0.92 + 0.08 * Math.sin(f.t * 4) * (f.rm ? 0 : 1))
          ringMat.opacity = p.aura * (0.85 - 0.25 * k)
        }
        rimMat.uniforms.color.value.copy(cur.tint.soft).lerp(WHITE, 0.4).lerp(WARM, f.warm * 0.85)

        // confetti
        confetti.visible = p.confetti > 0.03
        if (confetti.visible) {
          for (let i = 0; i < CONF; i++) {
            const seed = i * 1.618
            const k = f.rm ? (i / CONF) : ((f.t * 0.45 + (seed % 1)) % 1)
            const ang = (i / CONF) * Math.PI * 2
            const rad = 0.75 + 0.35 * ((seed * 3.1) % 1)
            dummy.position.set(Math.cos(ang) * rad * 1.15, 1.2 - k * 1.5 + Math.sin(ang) * 0.12, -0.15 + Math.sin(ang) * 0.3)
            dummy.rotation.set(f.t * 3 + i, f.t * 2.2 + i * 0.7, i)
            dummy.scale.setScalar(p.confetti * Math.sin(Math.PI * Math.min(1, k * 1.15)))
            dummy.updateMatrix()
            confetti.setMatrixAt(i, dummy.matrix)
          }
          confetti.instanceMatrix.needsUpdate = true
        }
        void A
      },
      dispose() {
        specFrame.geometry?.dispose?.(); specLens.geometry?.dispose?.()
        hatBody.geometry?.dispose?.(); hatBand.geometry?.dispose?.()
        geos.forEach((g) => g.dispose()); mats.forEach((m) => m.dispose()); texs.forEach((t) => t.dispose())
        dots.dispose(); confetti.dispose()
      },
    }
  },
}
