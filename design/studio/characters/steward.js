// Steward: a glass butler. A rounded glass head with a smoked visor band (eyes of light are drawn into the visor's
// emissive map, so they stay crisp at peek size), floating over a slim tapered glass torso. A brushed metal collar
// ring and a satin bow tie sit between them; two frosted gloves float at its sides and gesture: a tray when idle,
// hand to chin when thinking, an approval card when it needs you, a bow when done, a flourish when celebrating.
//
// Layers and three.js transmission:
// - head + torso: the only two transmissive materials. The torso is a decanter: an opaque luminous liquid inside it
//   (refracted by the glass) sloshes, ripples while talking, swirls while thinking, warms when worried and fizzes
//   when celebrating. The visor, collar, bow, gloves and props are opaque and sit outside the glass.
// - poses are a pure function of the face (mood, prevMood, moodAge, t), so stills and live views agree.
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

const HEAD_Y = 0.55
const HEAD_R = 0.5
const VIS_PHI = 2.5 // radians of visor band around the head
const VIS_W = 512
const VIS_H = Math.round((VIS_W * 0.74) / VIS_PHI) // square texels at the band's center
const VIS_THETA = (VIS_PHI * VIS_H) / VIS_W
const WARM_EYE = new THREE.Color('#ffc07a')
const WARM_GLOW = new THREE.Color('#ff8a2a')
const WHITE = new THREE.Color(1, 1, 1)
const WARM = new THREE.Color('#ffb870')

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x) }
const css = (c) => `rgb(${(clamp(c.r) * 255) | 0},${(clamp(c.g) * 255) | 0},${(clamp(c.b) * 255) | 0})`

/* ---------------- poses ---------------- */
// A pose: body lean/tilt, head nod/tilt, and two gloves {x,y,z, rx,ry,rz}. Right glove is index 0 (screen right).
const P_KEYS = ['bx', 'bz', 'hx', 'hz', 'hy', 'r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'l0', 'l1', 'l2', 'l3', 'l4', 'l5', 'tray', 'card']
function blank() { const o = {}; for (const k of P_KEYS) o[k] = 0; return o }
function setHand(o, side, x, y, z, rx, ry, rz) {
  const p = side ? 'l' : 'r'
  o[p + 0] = x; o[p + 1] = y; o[p + 2] = z; o[p + 3] = rx; o[p + 4] = ry; o[p + 5] = rz
}
// Gloves hang palm-in by default. rz tips the fingers, rx turns the palm up (negative) or toward the viewer.
function pose(o, mood, f) {
  const t = f.rm ? 0 : f.t, A = f.rm ? 0 : f.P
  for (const k of P_KEYS) o[k] = 0
  const sway = Math.sin(t * 1.1) * 0.02 * A
  switch (mood) {
    case 'resting':
      o.hx = 0.1; o.hy = -0.05
      setHand(o, 0, 0.16, -0.5, 0.36, 0.2, 0, 0.9)
      setHand(o, 1, -0.16, -0.54, 0.34, 0.2, 0, -0.9)
      break
    case 'listening':
      o.hx = 0.1; o.hz = -0.1; o.bx = 0.05
      setHand(o, 0, 0.13, -0.42, 0.4, 0.3, 0, 1.1)
      setHand(o, 1, -0.13, -0.46, 0.38, 0.3, 0, -1.1)
      break
    case 'thinking':
      o.hx = -0.05; o.hz = -0.1
      setHand(o, 0, 0.2, 0.1 + Math.sin(t * 2.2) * 0.012 * A, 0.5, -0.4, 0, 2.3 + Math.sin(t * 2.2) * 0.08 * A)
      setHand(o, 1, -0.06, -0.3, 0.42, 0.2, 0, -1.5)
      break
    case 'talking': {
      const g = Math.sin(t * 2.3) * A, lv = f.level
      o.hz = Math.sin(t * 1.3) * 0.05 * A
      setHand(o, 0, 0.66 + g * 0.05, -0.2 + lv * 0.06 * (0.5 + A), 0.25, -1.1 - lv * 0.2, 0, 0.6 + g * 0.15)
      setHand(o, 1, -0.5, -0.4, 0.15, 0.1, 0, -0.25)
      break
    }
    case 'done': {
      // A polite bow: lean in, hold, come back up. Right glove on the chest.
      const bow = f.rm ? 0.5 : Math.sin(Math.PI * clamp(f.moodAge / 2.2)) * 0.9 + 0.1 + 0.15 * Math.max(0, Math.sin(t * 0.7))
      o.bx = 0.28 * bow; o.hx = 0.12 * bow
      setHand(o, 0, 0.1, -0.24, 0.42, 0.2, 0, 1.3)
      setHand(o, 1, -0.48, -0.5, -0.1, 0, 0, -0.2)
      break
    }
    case 'needs-you': {
      const lift = Math.sin(t * 3.2) * 0.025 * A
      o.hz = 0.08; o.hx = -0.04
      setHand(o, 0, 0.72, 0.12 + lift, 0.3, -1.25, 0, 0.25)
      setHand(o, 1, -0.5, -0.42, 0.1, 0, 0, -0.2)
      o.card = 1
      break
    }
    case 'worried': {
      const j = Math.sin(t * 7) * 0.02 * A
      o.hx = 0.08; o.hz = Math.sin(t * 1.7) * 0.05 * A
      setHand(o, 0, 0.1 + j, -0.34, 0.42, 0.3, 0, 1.4 + j * 3)
      setHand(o, 1, -0.1 - j, -0.36, 0.44, 0.3, 0, -1.4 + j * 3)
      break
    }
    case 'celebrating': {
      const s = Math.sin(t * 4.2)
      o.hx = -0.1
      o.hz = s * 0.06 * A
      setHand(o, 0, 0.72 + s * 0.06 * A, 0.52 + Math.cos(t * 4.2) * 0.06 * A, 0.2, -0.9, 0, -0.2 + s * 0.35 * A)
      setHand(o, 1, -0.7 - s * 0.05 * A, 0.3 - Math.cos(t * 4.2) * 0.05 * A, 0.2, -0.9, 0, 0.3 + s * 0.3 * A)
      break
    }
    case 'sleepy': {
      const nod = f.rm ? 0.6 : 0.5 + 0.5 * Math.sin(t * 0.8)
      o.hx = 0.14 + nod * 0.1; o.hz = 0.12 * nod; o.bx = 0.05
      setHand(o, 0, 0.44, -0.62, 0.05, 0, 0, 0.1)
      setHand(o, 1, -0.44, -0.62, 0.05, 0, 0, -0.1)
      break
    }
    default: // idle: carries a small tray
      o.hz = sway
      setHand(o, 0, 0.6, -0.16 + Math.sin(t * 1.4) * 0.015 * A, 0.2, -1.45, 0, 0.12)
      setHand(o, 1, -0.5, -0.46, 0.08, 0, 0, -0.18)
      o.tray = 1
  }
  return o
}

/* ---------------- geometry ---------------- */
// Torso profile (radius, y), top to bottom: square-ish shoulders tapering to a soft point.
const TORSO = [[0, 0.02], [0.2, 0.012], [0.305, -0.025], [0.35, -0.1], [0.345, -0.24], [0.305, -0.44], [0.24, -0.62], [0.17, -0.74], [0.1, -0.805], [0.04, -0.828], [0, -0.832]]
function torsoProfile(scale = 1) {
  const curve = new THREE.CatmullRomCurve3(TORSO.map(([x, y]) => new THREE.Vector3(x * scale, y, 0)), false, 'centripetal')
  const prof = curve.getPoints(40).map((p) => new THREE.Vector2(Math.max(0, p.x), p.y))
  prof[0].x = 0
  prof[prof.length - 1].x = 0
  return prof
}
function torsoGeometry() { return new THREE.LatheGeometry(torsoProfile(), 48) }
const LIQ = -0.17 // liquid level (torso space)
// The liquid: the torso's profile inset, cut at the level. Sides and a flat top share one shader.
function liquidGeometries() {
  const prof = torsoProfile(0.88).filter((p) => p.y < LIQ - 0.004).map((p) => new THREE.Vector2(p.x, p.y + 0.012))
  let r = 0
  const all = torsoProfile(0.88)
  for (let i = 1; i < all.length; i++) if (all[i].y <= LIQ && all[i - 1].y > LIQ) { const a = all[i - 1], b = all[i]; r = a.x + ((LIQ - a.y) / (b.y - a.y)) * (b.x - a.x) }
  prof.unshift(new THREE.Vector2(r, LIQ))
  const sides = new THREE.LatheGeometry(prof, 48)
  const top = new THREE.CircleGeometry(r, 48)
  top.rotateX(-Math.PI / 2)
  top.translate(0, LIQ, 0)
  return { sides, top }
}
const LIQ_VERT = /* glsl */ `
uniform float uLevel, uClock, uRip, uSwirl, uLv;
uniform vec2 uTilt;
varying vec3 vP;
varying vec3 vN;
varying vec3 vV;
varying float vTopN;
void main() {
  vec3 p = position;
  float top = smoothstep(uLevel - 0.14, uLevel - 0.001, p.y);
  float r = length(p.xz);
  float a = atan(p.z, p.x);
  float d = p.x * uTilt.x + p.z * uTilt.y;
  d += sin(r * 34.0 - uClock * 9.0) * uRip * (0.35 + uLv) * 0.009;
  d += sin(a * 2.0 + uClock * 3.0 - r * 16.0) * uSwirl * r * 0.05;
  p.y += d * top;
  vP = p;
  vTopN = normal.y;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`
const LIQ_FRAG = /* glsl */ `
uniform vec3 uCol, uDeep, uHi;
uniform float uLevel, uClock, uRip, uSwirl, uLv, uSpark, uGlow;
varying vec3 vP;
varying vec3 vN;
varying vec3 vV;
varying float vTopN;
void main() {
  vec3 n = normalize(vN);
  float ndv = max(dot(n, normalize(vV)), 0.0);
  vec3 col;
  if (vTopN > 0.98) {
    float r = length(vP.xz);
    float a = atan(vP.z, vP.x);
    float rings = pow(0.5 + 0.5 * sin(r * 34.0 - uClock * 9.0), 4.0) * uRip * (0.3 + uLv);
    float arms = pow(0.5 + 0.5 * sin(2.0 * a - r * 26.0 + uClock * 5.0), 5.0) * uSwirl * smoothstep(0.0, 0.05, r);
    col = mix(uCol, uHi, 0.45 + 0.5 * rings + 0.55 * arms);
  } else {
    float h = clamp((vP.y + 0.82) / (uLevel + 0.82), 0.0, 1.0);
    col = mix(uDeep, uCol, smoothstep(0.0, 1.0, h));
    col = mix(col, uHi, pow(1.0 - ndv, 2.5) * 0.35 + smoothstep(0.86, 1.0, h) * 0.35);
    // bubbles: a few always, many when celebrating
    float a = atan(vP.z, vP.x);
    vec2 q = vec2(a * 2.6, vP.y * 10.0 - uClock * (1.2 + uSpark * 2.5));
    vec2 id = floor(q);
    vec2 cell = fract(q) - 0.5;
    float rnd = fract(sin(dot(id, vec2(12.9898, 78.233))) * 43758.5453);
    float b = smoothstep(0.16, 0.06, length(cell + vec2(rnd - 0.5, fract(rnd * 7.0) - 0.5) * 0.5)) * step(0.84 - uSpark * 0.22, rnd);
    col = mix(col, uHi, b * (0.35 + uSpark * 0.5));
  }
  gl_FragColor = vec4(col * uGlow, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`
// A slim tailored glove: wrist cuff up (+y), four fingers down, thumb toward +x.
function gloveGeometry() {
  const parts = []
  const palm = new THREE.SphereGeometry(1, 20, 14)
  palm.applyMatrix4(new THREE.Matrix4().makeScale(0.072, 0.08, 0.036))
  parts.push(palm)
  for (let i = 0; i < 4; i++) {
    const len = [0.05, 0.062, 0.058, 0.044][i]
    const fg = new THREE.CapsuleGeometry(0.0175, len, 4, 10)
    fg.applyMatrix4(new THREE.Matrix4().makeRotationZ((i - 1.5) * 0.08))
    fg.applyMatrix4(new THREE.Matrix4().makeTranslation((i - 1.5) * 0.036, -0.075 - len * 0.5 + Math.abs(i - 1.5) * 0.006, 0))
    parts.push(fg)
  }
  const thumb = new THREE.CapsuleGeometry(0.019, 0.045, 4, 10)
  thumb.applyMatrix4(new THREE.Matrix4().makeRotationZ(0.75))
  thumb.applyMatrix4(new THREE.Matrix4().makeTranslation(0.075, -0.035, 0.01))
  parts.push(thumb)
  const cuff = new THREE.CylinderGeometry(0.06, 0.068, 0.045, 24, 1)
  cuff.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0.085, 0))
  parts.push(cuff)
  return mergeGeometries(parts.map((x) => (x.index ? x.toNonIndexed() : x)))
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

/* ---------------- the visor face ---------------- */
function visorFace() {
  const canvas = document.createElement('canvas')
  canvas.width = VIS_W
  canvas.height = VIS_H
  const g = canvas.getContext('2d')
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  function draw(f, look, eyeCol, glowCol, small) {
    const W = VIS_W, H = VIS_H, m = f.mood
    g.globalCompositeOperation = 'source-over'
    g.fillStyle = '#000'
    g.fillRect(0, 0, W, H)
    // A wash of light across the whole visor carries the mood's color at any size.
    const wash = m === 'needs-you' ? (f.rm ? 0.3 : 0.2 + 0.14 * Math.sin(f.t * 5)) : m === 'worried' ? 0.16 : m === 'celebrating' ? 0.16 : m === 'done' ? 0.1 : m === 'listening' ? 0.07 : 0
    if (wash > 0) {
      const gr = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.42)
      gr.addColorStop(0, css(glowCol)); gr.addColorStop(1, 'rgba(0,0,0,0)')
      g.globalAlpha = wash
      g.fillStyle = gr
      g.fillRect(0, 0, W, H)
      g.globalAlpha = 1
    }
    const k = small ? 1.55 : 1 // enlarge features at peek/header size
    const sep = 64 * (small ? 1.12 : 1)
    const ew = 30 * k, eh = (m === 'listening' ? 52 : 46) * k
    const lx = f.lookX * 30, ly = f.lookY * 13
    const cy = H * 0.47 + ly
    const eye = css(eyeCol), glow = css(glowCol)
    g.lineCap = g.lineJoin = 'round'
    g.shadowColor = glow
    g.shadowBlur = 18 * k
    g.fillStyle = g.strokeStyle = eye
    for (const side of [-1, 1]) {
      const cx = W / 2 + side * sep + lx
      if (m === 'done' || m === 'celebrating') {
        // happy closed eyes: a bright arch
        g.lineWidth = 12 * k
        g.beginPath(); g.arc(cx, cy + 10 * k, 18 * k, Math.PI * 1.15, Math.PI * 1.85); g.stroke()
      } else if (m === 'resting') {
        g.globalAlpha = 0.7
        g.lineWidth = 7 * k
        g.beginPath(); g.moveTo(cx - 14 * k, cy + 6 * k); g.quadraticCurveTo(cx, cy + 11 * k, cx + 14 * k, cy + 6 * k); g.stroke()
        g.globalAlpha = 1
      } else {
        const open = Math.max(0.08, f.open * f.blink)
        g.save()
        g.translate(cx, cy)
        g.beginPath()
        if (look.eyes === 'dots') { const r = ew * 0.62; g.ellipse(0, 0, r * Math.min(1.1, Math.max(1, open)), Math.max(r * 0.18, r * open), 0, 0, Math.PI * 2) }
        else if (look.eyes === 'arcs') { const r = ew * 0.8, ah = Math.max(r * 0.2, r * 1.1 * Math.min(1.15, open)); g.ellipse(0, ah * 0.4, r, ah, 0, Math.PI, Math.PI * 2); g.closePath() }
        else { const hh = Math.max(ew * 0.3, eh * open); g.roundRect(-ew / 2, -hh / 2, ew, hh, Math.min(ew, hh) / 2) }
        g.fill()
        // Lids: worried slants down to the outside; sleepy is a heavy flat lid.
        if (m === 'worried' || m === 'sleepy') {
          g.globalCompositeOperation = 'destination-out'
          g.shadowBlur = 0
          g.fillStyle = '#000'
          g.save()
          if (m === 'worried') { g.rotate(side * 0.42); g.fillRect(-60, -eh * 0.5 - 60 - 2 * k, 120, 60 + eh * 0.12) }
          else { g.rotate(side * 0.12); g.fillRect(-60, -80 - eh * 0.04, 120, 80) }
          g.restore()
          g.globalCompositeOperation = 'source-over'
          g.shadowBlur = 18 * k
          g.fillStyle = eye
        }
        g.restore()
      }
    }
    // Mouth of light: only when speaking, plus a small worried wobble.
    const my = H * 0.86
    if (m === 'talking') {
      // a pill of light that opens with the voice level
      const mw = (30 + f.level * 10) * k, mh = (5 + f.level * 15) * k
      g.beginPath(); g.roundRect(W / 2 - mw / 2 + lx * 0.5, my - mh / 2 - 4 * k, mw, mh, mh / 2); g.fill()
    } else if (m === 'thinking') {
      // a comet of light circling up by the corner the eyes look at
      const sx = W / 2 + sep + 44 * k, sy = H * 0.3, R = 14 * k, a0 = f.rm ? 0 : f.t * 5
      g.lineWidth = 5 * k
      for (let i = 0; i < 8; i++) {
        g.globalAlpha = (1 - i / 8) * 0.95
        g.beginPath(); g.arc(sx, sy, R, a0 - i * 0.32, a0 - i * 0.32 + 0.3); g.stroke()
      }
      g.globalAlpha = 1
    } else if (m === 'needs-you') {
      // An attention mark in the visor: a soft bar between the eyes.
      const pulse = f.rm ? 1 : 0.6 + 0.4 * Math.sin(f.t * 5)
      g.globalAlpha = pulse
      g.beginPath(); g.roundRect(W / 2 - 5 * k, H * 0.5 - 26 * k, 10 * k, 30 * k, 5 * k); g.fill()
      g.beginPath(); g.arc(W / 2, H * 0.5 + 15 * k, 5.5 * k, 0, Math.PI * 2); g.fill()
      g.globalAlpha = 1
    }
    if (m === 'worried') {
      // a bead of sweat by the left eye
      const dy = f.rm ? 0 : ((f.t * 0.6) % 1) * 8 * k
      const dx = W / 2 - sep - 40 * k, dyy = H * 0.24 + dy, r = 6 * k
      g.beginPath(); g.moveTo(dx, dyy - r * 2.1); g.quadraticCurveTo(dx + r * 1.1, dyy - r * 0.3, dx + r, dyy + r * 0.2); g.arc(dx, dyy + r * 0.2, r, 0, Math.PI); g.quadraticCurveTo(dx - r * 1.1, dyy - r * 0.3, dx, dyy - r * 2.1); g.fill()
    } else if (m === 'sleepy') {
      // a small z drifting up
      const ph = f.rm ? 0.4 : (f.t * 0.35) % 1
      g.globalAlpha = Math.sin(ph * Math.PI) * 0.9
      g.lineWidth = 4 * k
      const zx = W / 2 + sep + 50 * k + ph * 10, zy = H * 0.34 - ph * 16, z = 9 * k
      g.beginPath(); g.moveTo(zx - z, zy - z); g.lineTo(zx + z, zy - z); g.lineTo(zx - z, zy + z); g.lineTo(zx + z, zy + z); g.stroke()
      g.globalAlpha = 1
    } else if (m === 'celebrating') {
      // glints in the visor
      for (let i = 0; i < 4; i++) {
        const ph = f.rm ? 0.5 : (f.t * 1.3 + i * 0.27) % 1
        const gx = W / 2 + [-1.9, 1.85, -0.9, 0.95][i] * sep, gy = H * [0.22, 0.28, 0.8, 0.76][i], r = (5 + 7 * Math.sin(ph * Math.PI)) * k * 0.9
        g.beginPath(); g.moveTo(gx, gy - r); g.quadraticCurveTo(gx, gy, gx + r, gy); g.quadraticCurveTo(gx, gy, gx, gy + r); g.quadraticCurveTo(gx, gy, gx - r, gy); g.quadraticCurveTo(gx, gy, gx, gy - r); g.fill()
      }
    }
    // Light-pipe trim along the visor's edges.
    g.shadowBlur = 0
    g.globalAlpha = 0.28
    g.fillStyle = glow
    g.fillRect(0, 0, W, 2)
    g.fillRect(0, H - 2, W, 2)
    g.globalAlpha = 1
    texture.needsUpdate = true
  }
  return { texture, draw }
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

/* ---------------- character ---------------- */
export default {
  id: 'steward',
  name: 'Steward',
  vibe: 'A glass butler with a smoked visor, a brushed collar and a bow tie: composed, attentive, at your service.',
  eyes: ['pills', 'dots', 'arcs'],
  frame: { height: 2.45, y: 0.06, peek: { height: 1.36, y: 0.47 }, header: { height: 1.5, y: 0.42 } },
  create({ kit, look, size }) {
    const small = size !== 'big'
    const object = new THREE.Group()
    const body = new THREE.Group() // leans for bows
    object.add(body)

    // Head: transmissive glass with a smoked visor band.
    const head = new THREE.Group()
    head.position.y = HEAD_Y
    body.add(head)
    const headGeo = new THREE.SphereGeometry(HEAD_R, small ? 40 : 64, small ? 28 : 48)
    const headMat = kit.glass(look, { thickness: 0.35, iridescence: 0.3 })
    const headMesh = new THREE.Mesh(headGeo, headMat)
    headMesh.scale.set(1.06, 0.95, 1)
    head.add(headMesh)
    const headRimMat = rimMaterial()
    const headRim = new THREE.Mesh(headGeo, headRimMat)
    headRim.scale.set(1.065, 0.955, 1.005)
    head.add(headRim)

    const face = visorFace()
    const visorGeo = new THREE.SphereGeometry(HEAD_R * 1.018, 64, 16, Math.PI / 2 - VIS_PHI / 2, VIS_PHI, Math.PI / 2 - VIS_THETA / 2 + 0.13, VIS_THETA)
    const visorMat = new THREE.MeshPhysicalMaterial({ color: 0x0b0d12, roughness: 0.3, metalness: 0.1, clearcoat: 0.6, clearcoatRoughness: 0.18, emissive: 0xffffff, emissiveMap: face.texture, emissiveIntensity: 1.5 })
    const visor = new THREE.Mesh(visorGeo, visorMat)
    visor.scale.copy(headMesh.scale)
    head.add(visor)


    // Beacon on the crown (needs you).
    const beaconMat = kit.light(look.tint.glow, 2)
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), beaconMat)
    beacon.position.set(0.37, HEAD_Y + 0.38, 0.22)
    const beaconGlow = kit.glowSprite(look.tint.glow, 0.5, 0.9)
    beaconGlow.position.copy(beacon.position)
    body.add(beacon, beaconGlow)

    // Collar ring and bow tie.
    const metal = new THREE.MeshPhysicalMaterial({ color: 0x76746f, metalness: 1, roughness: 0.42, envMapIntensity: 0.75, anisotropy: 0.7, clearcoat: 0.5, clearcoatRoughness: 0.2 })
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.275, 0.042, 20, 72), metal)
    collar.rotation.x = Math.PI / 2 + 0.14
    collar.position.y = -0.01
    body.add(collar)
    const bowMat = new THREE.MeshPhysicalMaterial({ color: 0x15161a, roughness: 0.42, sheen: 1, sheenRoughness: 0.35, sheenColor: 0x8890a0, clearcoat: 0.25 })
    const bow = new THREE.Mesh(bowGeometry(), bowMat)
    bow.position.set(0, -0.06, 0.31)
    bow.rotation.x = 0.1
    body.add(bow)

    // Torso, buttons, gloves, props: the big view only.
    let torsoMat = null, liqMat = null, liquid = null, torso = null, torsoRim = null, studs = null, gloves = [], gloveMat = null, tray = null, card = null, cardTex = null, sparks = null
    if (!small) {
      const torsoGeo = torsoGeometry()
      torsoMat = kit.glass(look, { thickness: 0.5 })
      torso = new THREE.Mesh(torsoGeo, torsoMat)
      torso.position.y = -0.05
      torsoRim = new THREE.Mesh(torsoGeo, headRimMat)
      torsoRim.position.copy(torso.position)
      torsoRim.scale.setScalar(1.006)
      body.add(torso, torsoRim)
      const lg = liquidGeometries()
      liqMat = new THREE.ShaderMaterial({
        vertexShader: LIQ_VERT, fragmentShader: LIQ_FRAG,
        uniforms: {
          uLevel: { value: LIQ }, uClock: { value: 0 }, uRip: { value: 0 }, uSwirl: { value: 0 }, uLv: { value: 0 }, uSpark: { value: 0 }, uGlow: { value: 1 },
          uTilt: { value: new THREE.Vector2() }, uCol: { value: new THREE.Color() }, uDeep: { value: new THREE.Color() }, uHi: { value: new THREE.Color() },
        },
      })
      liquid = new THREE.Group()
      liquid.add(new THREE.Mesh(lg.sides, liqMat), new THREE.Mesh(lg.top, liqMat))
      liquid.position.copy(torso.position)
      body.add(liquid)
      const stud = new THREE.SphereGeometry(0.024, 12, 8)
      studs = new THREE.Mesh(stud.translate(0, -0.13, 0.345), bowMat)
      body.add(studs)

      gloveMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.5, sheen: 1, sheenRoughness: 0.5, clearcoat: 0.4, clearcoatRoughness: 0.3 })
      const gloveGeo = gloveGeometry()
      gloves = [0, 1].map((i) => { const m = new THREE.Mesh(gloveGeo, gloveMat); if (i) m.scale.x = -1; object.add(m); return m })

      tray = new THREE.Group()
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.24, 0.022, 48), metal)
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.04, 0.12, 24), torsoMat)
      cup.position.set(0.05, 0.07, 0)
      tray.add(plate, cup)
      object.add(tray)

      const ct = cardTexture(look)
      cardTex = ct
      card = new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(0.5, 0.35, 0.05)), new THREE.MeshBasicMaterial({ map: ct.tex, toneMapped: false }))
      // ShapeGeometry UVs are in shape units: remap to 0..1.
      const uv = card.geometry.attributes.uv, pos = card.geometry.attributes.position
      for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 0.5 + 0.5, pos.getY(i) / 0.35 + 0.5)
      object.add(card)

      const N = 16
      const sg = new THREE.BufferGeometry()
      sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3))
      sparks = new THREE.Points(sg, new THREE.PointsMaterial({ map: starTexture(), size: 0.4, transparent: true, depthWrite: false, color: 0xffffff }))
      sparks.userData.n = N
      object.add(sparks)
    }

    // Reused state.
    const A = blank(), B = blank()
    const eyeCol = new THREE.Color(), glowCol = new THREE.Color(), tmp = new THREE.Color(), tmpGray = new THREE.Color()
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

    function applyLook(l) {
      cur = l
      kit.updateGlass(headMat, l, { thickness: 0.35 })
      headMat.thickness = 0.35
      if (torsoMat) kit.updateGlass(torsoMat, l)
      headRimMat.uniforms.dark.value = l.dark ? 1 : 0
      headRimMat.uniforms.color.value.copy(l.dark ? l.tint.glow : l.tint.ink).lerp(l.dark ? WHITE : l.tint.ink, 0.4)
      headRimMat.uniforms.intensity.value = l.dark ? 2.2 : 0.75
      visorMat.color.set(l.dark ? 0x1b2029 : 0x0a0c11).lerp(l.tint.ink, l.tint.key === 'graphite' ? 0.1 : l.dark ? 0.3 : 0.22)
      visorMat.roughness = 0.25 + l.frost * 0.25
      visorMat.clearcoatRoughness = 0.16 + l.frost * 0.2
      visorMat.envMapIntensity = small ? 0.3 : 0.5
      bowMat.color.copy(l.tint.ink).lerp(tmpGray.setRGB(0.05, 0.05, 0.06), 0.25).multiplyScalar(l.tint.key === 'graphite' ? 0.6 : 0.8)
      bowMat.sheenColor.copy(l.tint.soft).multiplyScalar(0.6)
      if (gloveMat) { gloveMat.color.copy(WHITE).lerp(l.tint.soft, 0.25); gloveMat.sheenColor.copy(l.tint.soft) }
      if (cardTex) cardTex.paint(l)
      if (sparks) {
        sparks.material.color.copy(l.dark ? WHITE : l.tint.glow).lerp(l.tint.glow, 0.4)
        sparks.material.blending = l.dark ? THREE.AdditiveBlending : THREE.NormalBlending
        sparks.material.needsUpdate = true
      }
      beaconGlow.material.color.copy(l.tint.glow)
      beaconGlow.material.blending = l.dark ? THREE.AdditiveBlending : THREE.NormalBlending
      beaconGlow.material.opacity = l.dark ? 0.9 : 0.55
    }
    applyLook(look)

    const placeGlove = (m, o, p) => {
      m.position.set(o[p + 0], o[p + 1], o[p + 2])
      m.rotation.set(o[p + 3], o[p + 4], o[p + 5])
    }

    return {
      object,
      update(f, l) {
        if (l && l !== cur && (l.tint !== cur.tint || l.dark !== cur.dark)) applyLook(l)
        const t = f.rm ? 0 : f.t
        // Pose: blend from the previous mood's pose over ~0.6 s.
        pose(A, f.prevMood, f)
        pose(B, f.mood, f)
        const k = f.rm ? 1 : smooth(f.moodAge / 0.6)
        for (const key of P_KEYS) A[key] += (B[key] - A[key]) * k

        // Float (not a bounce): a slow drift. Only celebrating bounces.
        const drift = f.rm ? 0 : Math.sin(f.clock * 1.2) * 0.025 * (0.5 + f.P * 0.5)
        object.position.y = drift + f.bounce
        body.rotation.x = A.bx
        body.rotation.z = A.bz
        head.rotation.set(A.hx + f.lookY * 0.04, A.hy + f.lookX * 0.18, A.hz)
        head.position.y = HEAD_Y + (f.mood === 'resting' ? -0.04 * k : 0) + (f.rm ? 0 : Math.sin(f.clock * 1.2 + 0.8) * 0.012)
        // Liquid glass: a slow wobble of the head, ripples while talking.
        const w = f.rm ? 0 : f.wob * 0.012 * Math.sin(f.clock * 2.3) + f.rip * f.level * 0.012 * Math.sin(t * 20)
        headMesh.scale.set(1.06 * (1 + w), 0.95 * (1 - w), 1 + w * 0.5)
        headRim.scale.set(headMesh.scale.x * 1.005, headMesh.scale.y * 1.005, headMesh.scale.z * 1.005)
        visor.scale.copy(headMesh.scale)


        // Colors: tint glow, warm when worried, dim when resting or sleepy.
        const dim = f.mood === 'resting' ? 0.55 : f.mood === 'sleepy' ? 0.7 : 1
        const bright = f.mood === 'needs-you' ? 1.25 : f.mood === 'listening' ? 1.1 : 1
        eyeCol.copy(WHITE).lerp(l.tint.soft, 0.35).lerp(WARM_EYE, f.warm)
        glowCol.copy(l.tint.glow).lerp(WARM_GLOW, f.warm)
        face.draw(f, l, eyeCol, glowCol, small)
        visorMat.emissiveIntensity = 2 * dim * bright
        tmp.copy(l.tint.glass).lerp(WARM, f.warm * 0.6)
        headMat.attenuationColor.copy(tmp)
        headMat.color.copy(tmp).lerp(WHITE, l.dark ? 0.15 : 0.45)

        if (liqMat) {
          const u = liqMat.uniforms
          u.uClock.value = f.rm ? 1 : f.clock
          u.uRip.value = f.rip
          u.uLv.value = f.level
          u.uSwirl.value = f.swirl
          u.uSpark.value = f.spark
          u.uGlow.value = dim
          // Keep the surface level while the body leans, plus a slow slosh.
          const sl = f.rm ? 0 : f.wob * 0.09
          u.uTilt.value.set(Math.tan(A.bz) + Math.sin(f.clock * 1.7) * sl, -Math.tan(A.bx) + Math.cos(f.clock * 1.3) * sl * 0.6)
          u.uCol.value.copy(glowCol)
          u.uDeep.value.copy(glowCol).lerp(l.tint.ink, l.dark ? 0.55 : 0.4)
          u.uHi.value.copy(eyeCol).lerp(WHITE, 0.4)
        }
        // Beacon: needs-you only, pulsing.
        const nv = f.mood === 'needs-you' ? smooth(f.moodAge / 0.3) : f.prevMood === 'needs-you' ? 1 - smooth(f.moodAge / 0.3) : 0
        const pulse = f.rm ? 1 : 0.75 + 0.25 * Math.sin(f.t * 5)
        beacon.visible = beaconGlow.visible = nv > 0.01
        beacon.scale.setScalar(nv * (0.9 + 0.2 * pulse) * (small ? 1.5 : 1))
        beaconGlow.scale.setScalar(nv * (0.45 + 0.2 * pulse) * (small ? 1.4 : 1))
        beaconMat.color.copy(l.tint.glow).lerp(WHITE, 0.2).multiplyScalar(2.2)

        if (!small) {
          placeGlove(gloves[0], A, 'r')
          placeGlove(gloves[1], A, 'l')
          // Tray rests on the right palm.
          tray.visible = A.tray > 0.02
          tray.scale.setScalar(Math.max(0.001, A.tray))
          tray.position.set(A.r0 + 0.02, A.r1 + 0.075, A.r2)
          tray.rotation.set(0, 0.4, (A.r5 - 0.12) * 0.5)
          // Card stands in the right glove.
          card.visible = A.card > 0.02
          card.scale.setScalar(Math.max(0.001, A.card))
          card.position.set(A.r0 - 0.04, A.r1 + 0.26, A.r2 + 0.04)
          card.rotation.set(-0.08, -0.25, -0.08 + (f.rm ? 0 : Math.sin(f.t * 3.2) * 0.03 * f.P))
          // Sparkles: celebrating.
          sparks.visible = f.spark > 0.02
          if (sparks.visible) {
            const arr = sparks.geometry.attributes.position.array, n = sparks.userData.n
            for (let i = 0; i < n; i++) {
              const ph = ((f.rm ? 0.5 : t * 0.45) + i / n) % 1
              const a = i * 2.4 + ph * 1.5
              const r = 0.85 + 0.35 * ((i * 0.37) % 1)
              arr[i * 3] = Math.cos(a) * r * 1.05
              arr[i * 3 + 1] = Math.min(1.1, HEAD_Y + 0.05 - 0.15 + Math.sin(a) * r * 0.7 + ph * 0.25)
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
          if (o.material) { o.material.map?.dispose(); o.material.dispose() }
        })
        face.texture.dispose()
      },
    }
  },
}
