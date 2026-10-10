// Butler: a portrait. A composed glass head (eyes of light, a trim lacquered mustache and brows, a neatly parted
// sweep of hair) above the shoulders of a smoked-glass tailcoat with silk-faced lapels, a crisp wing collar and a
// satin bow tie. Designed for the 50x44 peek first: the dark brows, mustache and bow tie give the face structure on
// light panels, and the light eyes carry it on dark ones.
//
// Layers and three.js transmission:
// - head + coat are the only two transmissive materials. Everything else (eyes, hair, collar, shirt, bow, hat,
//   glasses, props) is opaque, so the head refracts what sits behind it and the eyes stay crisp on its front surface.
// - mood on the glass: a sheen shell over the head (fresnel rim + ripples from the mouth while talking + a swirl of
//   light while thinking + an amber cast when worried), a slow wobble, and the glass itself warms when worried.
// - poses are a pure function of the face (mood, prevMood, moodAge, t), so the mood sheet stills match live views.
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

const R = 0.5 // head radius before shaping
const HY = 0.28 // head center
const NECK = -0.24 // head pivot (nods and tilts turn around the collar)
const EYE_X = 0.17, EYE_Y = 0.02
const BROW_Y = 0.155
const MUS_Y = -0.165
const NOSE_Y = -0.075
const WHITE = new THREE.Color(1, 1, 1)
const AMBER = new THREE.Color('#ffb15c')
const AMBER_GLASS = new THREE.Color('#ffc890')
const GOLD = new THREE.Color('#d9b26e')

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x) }
const mix = (a, b, k) => a + (b - a) * k

/* ---------------- head shape ---------------- */
// A sphere stretched tall, narrowed toward the chin and flattened in front, so features sit close to the surface.
const SY = 1.1, SZ = 0.86, CHIN = 0.13
function shapeK(y) { return y < 0 ? clamp(-y / (R * SY)) : 0 }
function headGeometry(seg = 64) {
  const g = new THREE.SphereGeometry(R, seg, Math.round(seg * 0.75))
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) * SY
    const k = shapeK(y)
    let x = p.getX(i) * (1 - CHIN * k * k), z = p.getZ(i) * SZ * (1 - 0.12 * k * k)
    // A discreet nose: a soft ridge between the eyes and the mustache.
    if (z > 0) z += nose(x, y) * (z / (R * SZ))
    p.setXYZ(i, x, y, z)
  }
  g.computeVertexNormals()
  return g
}
const nose = (x, y) => Math.exp(-((x / 0.05) ** 2) - (((y - NOSE_Y) / 0.07) ** 2)) * 0.045
/** Front surface z of the shaped head at (x, y), head space. */
function surfZ(x, y) {
  const k = shapeK(y), sx = 1 - CHIN * k * k, sz = SZ * (1 - 0.12 * k * k)
  const x0 = x / sx, y0 = y / SY
  const z = Math.sqrt(Math.max(0, R * R - x0 * x0 - y0 * y0)) * sz
  return z + nose(x, y) * (z / (R * SZ))
}
/** Yaw that turns a flat feature at x to follow the head's curve. */
const yawAt = (x, y) => Math.asin(clamp(x / Math.max(0.2, Math.sqrt(R * R - (y / SY) ** 2)), -1, 1)) * 0.85

// Side-parted hair, as a param surface over the head: theta runs from the left temple (the pole) across the crown,
// phi from the front hairline to the nape. A thin gap at one latitude is the part; the hairline swoops lower on the
// sweep side, and the sweep has a little lift above the forehead.
function paramSurface(nu, nv, fn) {
  const g = new THREE.BufferGeometry()
  const pos = new Float32Array((nu + 1) * (nv + 1) * 3), uv = new Float32Array((nu + 1) * (nv + 1) * 2), idx = []
  const v3 = new THREE.Vector3()
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const k = j * (nu + 1) + i
    fn(i / nu, j / nv, v3)
    pos.set([v3.x, v3.y, v3.z], k * 3)
    uv.set([i / nu, j / nv], k * 2)
    if (i < nu && j < nv) { const a = k, b = k + 1, c = k + nu + 1, d = c + 1; idx.push(a, c, b, b, c, d) }
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}
function shapeHead(v, lift) {
  const y = v.y * SY, k = shapeK(y)
  v.set(v.x * (1 - CHIN * k * k) * lift, y * lift, v.z * SZ * (1 - 0.12 * k * k) * lift)
  return v
}
function hairGeometry(seg = 1) {
  const PART = 0.8, GAP = 0.045, T1 = 2.5
  const front = (th) => Math.PI * (0.745 - 0.05 * smooth((th - PART) / 1.2) + 0.02 * smooth(1 - th / PART))
  const back = Math.PI * 1.72
  const piece = (t0, t1, nu) => paramSurface(Math.round(nu * seg), Math.round(28 * seg), (u, v, out) => {
    const th = t0 + (t1 - t0) * u, ph = mix(front(th), back, v)
    const sx = Math.sin(th)
    out.set(-Math.cos(th) * R, -Math.cos(ph) * sx * R, Math.sin(ph) * sx * R)
    // Volume: fuller on the crown and along the sweep, tucked in at the edges, a soft rise at the front.
    const edge = smooth(v / 0.08) * smooth((1 - v) / 0.1) * smooth((th - t0) / 0.06 + (t0 > 0 ? 0 : 1)) * smooth((t1 - th) / 0.08 + (t1 < T1 ? 0 : 0))
    const rise = Math.exp(-(((v - 0.1) / 0.12) ** 2)) * smooth((th - PART) / 0.5) * smooth((2.2 - th) / 0.6)
    return shapeHead(out, 1.012 + 0.03 * edge + 0.04 * rise)
  })
  return merge([piece(0.0, PART, 10), piece(PART + GAP, T1, 30)])
}
/** Fine comb lines across the hair (running away from the part), as a bump map. */
function combTexture() {
  const c = document.createElement('canvas')
  c.width = 512; c.height = 8
  const g = c.getContext('2d')
  g.fillStyle = '#808080'; g.fillRect(0, 0, 512, 8)
  for (let x = 0; x < 512; x += 5) { g.fillStyle = `rgba(255,255,255,${0.2 + 0.3 * ((x * 37) % 11) / 11})`; g.fillRect(x, 0, 2, 8) }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(1, 1)
  return t
}

function merge(list) {
  const out = mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); return g }))
  list.forEach((g) => g.dispose())
  return out
}

/* ---------------- body ---------------- */
// Coat profile (radius, y), neck to hem; the coat is open in front (a V that widens down the chest).
const COAT = [[0.2, -0.16], [0.235, -0.27], [0.34, -0.39], [0.58, -0.5], [0.82, -0.6], [0.93, -0.72], [0.96, -0.9], [0.95, -1.1], [0.9, -1.18], [0.5, -1.2], [0, -1.2]]
const GAPF = 0.52 // front opening, radians
const COAT_Z = 0.52
function coatProfile(scale = 1, from = 0, to = COAT.length) {
  const pts = COAT.slice(from, to).map(([r, y]) => new THREE.Vector3(r * scale, y, 0))
  return new THREE.CatmullRomCurve3(pts, false, 'centripetal').getPoints(36).map((p) => new THREE.Vector2(Math.max(0, p.x), p.y))
}
// The front opening's half-width at height y: narrow at the collar, widest across the chest, closing toward the
// waist button below the cut, so the shirt reads as a tuxedo V rather than a bib.
const openW = (y) => y > -0.3 ? mix(0.075, 0.1, smooth((-0.16 - y) / 0.14)) : mix(0.1, 0.2, smooth((-0.3 - y) / 0.3)) - 0.13 * smooth((-0.7 - y) / 0.5)
// Lapel width (peaked lapel: widening to a point below the collarbone, then a tapering roll to the button).
const lapelW = (y) => y > -0.28 ? 0.035 : y > -0.62 ? mix(0.05, 0.19, smooth((-0.28 - y) / 0.34)) : mix(0.15, 0.025, smooth((-0.62 - y) / 0.5))
const phiAt = (w, r) => Math.asin(clamp(w / Math.max(r, 1e-3), 0, 0.999))
/** Lathe-like surface whose angular range varies with height: phi from a(y, r) to b(y, r). */
function bandLathe(prof, a, b, nu, zs = COAT_Z) {
  return paramSurface(nu, prof.length - 1, (u, v, out) => {
    const p = prof[Math.round(v * (prof.length - 1))]
    const ph = mix(a(p.y, p.x), b(p.y, p.x), u)
    return out.set(p.x * Math.sin(ph), p.y, p.x * Math.cos(ph) * zs)
  })
}
function coatGeometry() {
  return bandLathe(coatProfile(), (y, r) => phiAt(openW(y), r), (y, r) => Math.PI * 2 - phiAt(openW(y), r), 72)
}
function shirtGeometry() {
  const shirt = bandLathe(coatProfile(0.965, 0, 9), (y, r) => -phiAt(openW(y) + 0.05, r), (y, r) => phiAt(openW(y) + 0.05, r), 12)
  // Wing collar: a band around the neck, open in front, with two folded wings.
  const band = new THREE.CylinderGeometry(0.212, 0.226, 0.1, 40, 1, true, 0.42, Math.PI * 2 - 0.84)
  band.scale(1, 1, COAT_Z * 1.18)
  band.translate(0, -0.205, 0)
  const wings = [-1, 1].map((s) => {
    const sh = new THREE.Shape()
    sh.moveTo(0, 0); sh.lineTo(s * 0.085, -0.02); sh.lineTo(s * 0.03, -0.075); sh.lineTo(0, -0.03)
    const w = new THREE.ExtrudeGeometry(sh, { depth: 0.008, bevelEnabled: false })
    w.rotateX(-0.25)
    w.translate(s * 0.045, -0.2, 0.135)
    return w
  })
  return merge([shirt, band, ...wings])
}
function lapelGeometry() {
  const prof = coatProfile(1.014, 1, 9)
  const zs = COAT_Z * 1.014
  const r = bandLathe(prof, (y, rr) => phiAt(openW(y), rr), (y, rr) => phiAt(openW(y) + lapelW(y), rr), 4, zs)
  const l = bandLathe(prof, (y, rr) => -phiAt(openW(y) + lapelW(y), rr), (y, rr) => -phiAt(openW(y), rr), 4, zs)
  return merge([r, l])
}
function bowGeometry() {
  const s = new THREE.Shape()
  s.moveTo(0.022, 0.018)
  s.quadraticCurveTo(0.075, 0.07, 0.135, 0.06)
  s.quadraticCurveTo(0.162, 0, 0.135, -0.06)
  s.quadraticCurveTo(0.075, -0.07, 0.022, -0.018)
  s.lineTo(-0.022, -0.018)
  s.quadraticCurveTo(-0.075, -0.07, -0.135, -0.06)
  s.quadraticCurveTo(-0.162, 0, -0.135, 0.06)
  s.quadraticCurveTo(-0.075, 0.07, -0.022, 0.018)
  s.closePath()
  const bow = new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.014, bevelSize: 0.012, bevelSegments: 3, curveSegments: 10 })
  bow.translate(0, 0, -0.015)
  const knot = new THREE.SphereGeometry(1, 16, 12)
  knot.scale(0.034, 0.04, 0.034)
  knot.translate(0, 0, 0.022)
  // Two shirt studs below the bow.
  const studs = [0.13, 0.25].map((d) => { const g = new THREE.SphereGeometry(0.016, 10, 8); g.scale(1, 1, 0.6); g.translate(0, -d, -0.005 - d * 0.12); return g })
  return merge([bow, knot, ...studs])
}

/* ---------------- accessories ---------------- */
function hatGeometry(kind) {
  if (kind === 'top') {
    const crown = new THREE.LatheGeometry([[0, 0.6], [0.3, 0.6], [0.315, 0.585], [0.31, 0.3], [0.295, 0.08], [0.3, 0]].map(([x, y]) => new THREE.Vector2(x, y)), 48)
    const brim = new THREE.LatheGeometry([[0.29, 0.02], [0.44, 0.005], [0.5, 0.03], [0.515, 0.06], [0.5, 0.045], [0.44, 0.022], [0.29, 0.04]].map(([x, y]) => new THREE.Vector2(x, y)), 48)
    const band = new THREE.CylinderGeometry(0.302, 0.298, 0.075, 48, 1, true)
    band.translate(0, 0.075, 0)
    return { body: merge([crown, brim]), band, top: 0.6 }
  }
  if (kind === 'bowler') {
    const crown = new THREE.SphereGeometry(0.335, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2)
    crown.scale(1, 1.02, 1)
    crown.translate(0, 0.04, 0)
    const skirt = new THREE.CylinderGeometry(0.335, 0.34, 0.05, 40, 1, true)
    skirt.translate(0, 0.03, 0)
    const brim = new THREE.LatheGeometry([[0.32, 0.015], [0.42, 0.005], [0.46, 0.035], [0.47, 0.06], [0.455, 0.045], [0.42, 0.022], [0.32, 0.035]].map(([x, y]) => new THREE.Vector2(x, y)), 48)
    const band = new THREE.CylinderGeometry(0.338, 0.341, 0.05, 40, 1, true)
    band.translate(0, 0.045, 0)
    return { body: merge([crown, skirt, brim]), band, top: 0.385 }
  }
  return null
}

function ring(r, tube, arc = Math.PI * 2, rot = 0) {
  const g = new THREE.TorusGeometry(r, tube, 6, 40, arc)
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
/** Glasses in head space. Returns {frame, lens} geometries. */
function glassesGeometry(kind, eye) {
  if (kind === 'none') return null
  const frame = [], lens = []
  const T = 0.0085
  const place = (g, s, y, dz = 0.035) => {
    g.rotateY(s * yawAt(EYE_X, EYE_Y) * 0.7)
    g.translate(s * EYE_X, y, surfZ(EYE_X, y) + dz)
    return g
  }
  const temple = (s, y) => {
    const a = new THREE.Vector3(s * (EYE_X + 0.1), y, surfZ(EYE_X + 0.1, y) + 0.03)
    frame.push(rod(a, new THREE.Vector3(s * 0.47, y + 0.03, -0.02), T * 0.8))
  }
  if (kind === 'round') {
    const r = 0.098 * eye
    for (const s of [-1, 1]) {
      frame.push(place(ring(r, T), s, EYE_Y))
      lens.push(place(new THREE.CircleGeometry(r, 32), s, EYE_Y, 0.032))
      temple(s, EYE_Y + 0.02)
    }
    frame.push(place(ring(EYE_X - r, T, Math.PI * 0.5, Math.PI * 0.25), 0, EYE_Y - 0.005, 0.03).translate(0, -(EYE_X - r) * 0.6, 0))
  } else if (kind === 'half-moon') {
    const r = 0.088 * eye, y = EYE_Y - 0.085 * eye
    for (const s of [-1, 1]) {
      frame.push(place(ring(r, T, Math.PI, Math.PI), s, y))
      const bar = new THREE.CylinderGeometry(T, T, r * 2, 6)
      bar.rotateZ(Math.PI / 2)
      frame.push(place(bar, s, y))
      lens.push(place(new THREE.CircleGeometry(r, 24, Math.PI, Math.PI), s, y, 0.032))
      temple(s, y)
    }
    frame.push(place(ring(EYE_X - r, T, Math.PI * 0.6, Math.PI * 0.2), 0, y - (EYE_X - r) * 0.55, 0.03))
  } else if (kind === 'monocle') {
    const r = 0.108 * eye, s = -1
    frame.push(place(ring(r, T * 1.15), s, EYE_Y))
    lens.push(place(new THREE.CircleGeometry(r, 32), s, EYE_Y, 0.032))
    // A fine chain from the rim, down past the jaw toward the lapel.
    const z0 = surfZ(EYE_X, EYE_Y - r) + 0.035
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-EYE_X - 0.02, EYE_Y - r, z0),
      new THREE.Vector3(-0.33, -0.2, surfZ(0.33, -0.2) + 0.03),
      new THREE.Vector3(-0.33, -0.45, 0.26),
      new THREE.Vector3(-0.3, -0.68, 0.3),
    ])
    frame.push(new THREE.TubeGeometry(curve, 40, 0.0045, 5, false))
  }
  return { frame: merge(frame), lens: lens.length ? merge(lens) : null }
}

/* ---------------- props ---------------- */
function gloveGeometry() {
  const palm = new THREE.SphereGeometry(1, 20, 14); palm.scale(0.075, 0.09, 0.04)
  const fingers = new THREE.CapsuleGeometry(0.045, 0.06, 4, 12); fingers.scale(1, 1, 0.75); fingers.translate(0, 0.085, 0.004)
  const thumb = new THREE.CapsuleGeometry(0.022, 0.05, 4, 10); thumb.rotateZ(0.7); thumb.translate(-0.07, 0.03, 0.02)
  const cuff = new THREE.CylinderGeometry(0.07, 0.072, 0.07, 20); cuff.scale(1, 1, 0.65); cuff.translate(0, -0.11, 0)
  return merge([palm, fingers, thumb, cuff])
}
function cardTexture(look) {
  const c = document.createElement('canvas')
  c.width = 256; c.height = 176
  drawCard(c, look)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
function drawCard(c, look) {
  const g = c.getContext('2d')
  const glow = '#' + look.tint.glow.getHexString(), ink = '#' + look.tint.ink.getHexString()
  g.clearRect(0, 0, 256, 176)
  g.fillStyle = '#fbfcfe'
  g.beginPath(); g.roundRect(4, 4, 248, 168, 22); g.fill()
  g.fillStyle = glow
  g.beginPath(); g.roundRect(4, 4, 248, 30, [22, 22, 0, 0]); g.fill()
  g.fillStyle = ink; g.globalAlpha = 0.28
  for (const [y, w] of [[60, 150], [84, 120]]) { g.beginPath(); g.roundRect(28, y, w, 10, 5); g.fill() }
  g.globalAlpha = 1
  // Approve button with a check.
  g.fillStyle = glow
  g.beginPath(); g.roundRect(28, 112, 200, 42, 21); g.fill()
  g.strokeStyle = '#ffffff'; g.lineWidth = 9; g.lineCap = g.lineJoin = 'round'
  g.beginPath(); g.moveTo(108, 133); g.lineTo(122, 146); g.lineTo(148, 120); g.stroke()
}
function watchFaceTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  g.fillStyle = '#fbf7ee'; g.beginPath(); g.arc(64, 64, 64, 0, Math.PI * 2); g.fill()
  g.strokeStyle = '#3a3428'; g.lineCap = 'round'
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, r0 = i % 3 ? 50 : 44
    g.lineWidth = i % 3 ? 3 : 6
    g.beginPath(); g.moveTo(64 + Math.cos(a) * r0, 64 + Math.sin(a) * r0); g.lineTo(64 + Math.cos(a) * 57, 64 + Math.sin(a) * 57); g.stroke()
  }
  g.lineWidth = 7; g.beginPath(); g.moveTo(64, 64); g.lineTo(64, 34); g.stroke()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
function sparkTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  const rg = g.createRadialGradient(32, 32, 0, 32, 32, 30)
  rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.12, 'rgba(255,255,255,.55)'); rg.addColorStop(0.4, 'rgba(255,255,255,.08)'); rg.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = rg; g.fillRect(0, 0, 64, 64)
  g.fillStyle = '#fff'
  g.beginPath()
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 2.6 : (i % 4 ? 18 : 30); g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r) }
  g.fill()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/* ---------------- sheen shell: rim, ripples, swirl, warmth ---------------- */
const SHEEN_VERT = /* glsl */ `
varying vec3 vP; varying vec3 vN; varying vec3 vV;
void main(){
  vP = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.);
  vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`
const SHEEN_FRAG = /* glsl */ `
uniform vec3 uRim, uAccent, uWarmC; uniform float uRimI, uClock, uRip, uSwirl, uWarm, uLight, uMouthY;
varying vec3 vP; varying vec3 vN; varying vec3 vV;
void main(){
  float f = pow(1. - max(dot(normalize(vN), normalize(vV)), 0.), 2.4);
  float front = smoothstep(0.05, 0.3, vP.z);
  float d = length(vP.xy - vec2(0., uMouthY));
  float rip = pow(0.5 + 0.5 * sin(d * 30. - uClock * 9.), 5.) * exp(-d * 2.6) * front * smoothstep(0.03, 0.12, d) * uRip;
  vec2 q = vP.xy - vec2(0.05, 0.12);
  float a = atan(q.y, q.x), r = length(q);
  float sw = pow(0.5 + 0.5 * sin(a * 2. + r * 16. - uClock * 3.4), 10.) * smoothstep(0.42, 0.06, r) * smoothstep(0.0, 0.08, r) * uSwirl * (0.35 + 0.65 * front);
  vec3 rimC = mix(uRim, uWarmC, uWarm * 0.75);
  vec3 col = rimC * f * uRimI + uAccent * (rip * 0.9 + sw * 0.85) + uWarmC * uWarm * 0.06 * front;
  float a2 = clamp(f * uRimI * 0.8 + (rip + sw) * 0.75 + uWarm * 0.05 * front, 0., 1.);
  if (uLight > 0.5) gl_FragColor = vec4(col / max(a2, 0.001), a2);
  else gl_FragColor = vec4(col, 1.);
}`

/* ---------------- poses ---------------- */
// Head nod (hx, + = down), tilt (hz), turn (hy); eyes: open multiplier, closed (0 open, 1 calm arcs, 2 happy arcs);
// brows: lift and slant (+ = inner ends up, worried); mustache tips (+ up); mouth (0..1, open smile);
// hat tip/lift/tilt; glasses slide/askew; prop: hand amount, card, watch; sweat; glow.
const KEYS = ['hx', 'hz', 'hy', 'lean', 'eyeW', 'closed', 'browL', 'browR', 'slant', 'mus', 'smile', 'hatTip', 'hatLift', 'hatTilt', 'gY', 'gTilt', 'hand', 'card', 'watch', 'sweat', 'glow', 'bright', 'peer', 'lid']
function blank(o) { for (const k of KEYS) o[k] = 0; o.bright = 1; o.eyeW = 1; return o }
function pose(o, mood, f) {
  blank(o)
  const t = f.rm ? 0 : f.t, A = f.rm ? 0 : f.P, age = f.rm ? 3 : f.moodAge
  switch (mood) {
    case 'resting':
      o.closed = 1; o.hx = 0.1; o.bright = 0.55; o.browL = o.browR = -0.01; o.mus = -0.04; o.gY = -0.01
      o.hx += Math.sin(t * 0.6) * 0.012 * A
      break
    case 'listening':
      o.hz = -0.09; o.hx = -0.03; o.lean = 0.04; o.browL = o.browR = 0.022; o.bright = 1.12; o.eyeW = 1.05
      break
    case 'thinking':
      // One brow up, looking up and over the glasses, pocket watch in hand.
      o.hz = 0.05; o.hx = 0.05; o.browR = 0.04; o.browL = -0.008; o.slant = -0.05; o.mus = -0.02; o.peer = 1
      o.hand = smooth(age / 0.5); o.watch = 1
      break
    case 'talking':
      o.hz = Math.sin(t * 1.3) * 0.035 * A; o.hx = -Math.sin(t * 1.9) * 0.02 * A
      o.browL = o.browR = 0.008 + f.level * 0.014
      o.mus = 0.03 + f.level * 0.05
      break
    case 'done': {
      // A courteous nod with the hat tipped, then holding a quiet smile.
      const tip = f.rm ? 0.5 : Math.sin(Math.PI * clamp(age / 1.4)) * 0.85 + 0.25
      o.closed = 2; o.hx = 0.07 + 0.08 * Math.sin(Math.PI * clamp(age / 1.4)); o.mus = 0.16; o.browL = o.browR = 0.01
      o.hatTip = tip; o.hatLift = tip * 0.6
      break
    }
    case 'needs-you':
      o.hx = -0.04; o.hz = 0.06; o.browL = o.browR = 0.045; o.bright = 1.4; o.eyeW = 1.08; o.glow = 1; o.peer = 1; o.mus = 0.02
      o.hand = smooth(age / 0.45); o.card = 1
      break
    case 'worried': {
      const j = Math.sin(t * 9) * 0.008 * A
      o.hz = Math.sin(t * 1.7) * 0.05 * A + 0.06; o.hx = 0.04 + j; o.slant = 0.11; o.browL = o.browR = 0.01; o.mus = -0.16
      o.gTilt = -0.13; o.gY = -0.025; o.sweat = 1; o.hatTilt = -0.08
      break
    }
    case 'celebrating': {
      const s = Math.sin(t * 6.5)
      o.closed = 2; o.hx = -0.07; o.hz = s * 0.06 * A; o.browL = o.browR = 0.04; o.mus = 0.24; o.smile = 1; o.bright = 1.35; o.glow = 0.7
      o.hatLift = 1; o.hatTilt = s * 0.12 * A - 0.05; o.hatTip = -0.2
      break
    }
    case 'sleepy': {
      const nod = f.rm ? 0.7 : 0.55 + 0.45 * Math.sin(t * 0.8)
      o.hx = 0.13 + nod * 0.09; o.hz = 0.16 * nod; o.bright = 0.6; o.browL = o.browR = -0.022; o.slant = 0.02; o.mus = -0.06
      o.hatTip = 0.55 + nod * 0.15; o.gY = -0.06 - nod * 0.015; o.gTilt = 0.04; o.lid = 1
      break
    }
    default: // idle
      o.hz = Math.sin(t * 0.9) * 0.02 * A; o.mus = 0.02
  }
  return o
}

/* ---------------- character ---------------- */
// Features that sit in front of the head glass are left out of the transmission pass, so the head doesn't show a
// blurred, refracted double of the eyes, brows or mustache.
function frontOnly(mesh) {
  mesh.onBeforeRender = (renderer, scene, camera, geometry, material) => {
    const main = renderer.getRenderTarget() === null
    material.colorWrite = main
    material.depthWrite = main && !material.transparent
  }
  return mesh
}

export default {
  id: 'butler',
  name: 'Butler',
  vibe: 'A composed glass portrait in a tailcoat: discreet, warm, one brow ready to rise.',
  eyes: ['pills', 'dots', 'arcs'],
  accessories: true,
  frame: { height: 2.6, y: -0.06, header: { height: 1.95, y: 0.12 }, peek: { height: 1.66, y: 0.18 } },
  create({ kit, look, size }) {
    const small = size === 'peek' ? 1.32 : size === 'header' ? 1.16 : 1
    const FR = this.frame[size] || this.frame
    const frameTop = FR.y + FR.height / 2, frameBot = FR.y - FR.height / 2
    const keepBot = size === 'peek' ? -0.47 : size === 'header' ? -0.62 : -1.3
    const seg = size === 'big' ? 1 : 0.6
    const object = new THREE.Group()
    const fit = new THREE.Group() // scales and drops the whole portrait so a hat always stays in frame
    const body = new THREE.Group()
    const pivot = new THREE.Group()
    pivot.position.y = NECK
    const hs = new THREE.Group() // head space: origin at the head center
    hs.position.y = HY - NECK
    object.add(fit); fit.add(body); body.add(pivot); pivot.add(hs)
    const disposables = []
    const own = (x) => { disposables.push(x); return x }

    /* materials */
    const headMat = own(kit.glass(look, { thickness: 0.55 }))
    const coatMat = own(kit.glass(look, { thickness: 0.45 }))
    const inkMat = own(new THREE.MeshPhysicalMaterial({ metalness: 0.55, roughness: 0.32, clearcoat: 0.9, clearcoatRoughness: 0.15 }))
    const silkMat = own(new THREE.MeshPhysicalMaterial({ roughness: 0.42, metalness: 0.1, sheen: 1, sheenRoughness: 0.35, clearcoat: 0.5, clearcoatRoughness: 0.2, side: THREE.DoubleSide }))
    const whiteMat = own(new THREE.MeshPhysicalMaterial({ roughness: 0.48, sheen: 0.6, sheenRoughness: 0.5, clearcoat: 0.25, side: THREE.DoubleSide }))
    const goldMat = own(new THREE.MeshStandardMaterial({ color: GOLD, metalness: 1, roughness: 0.26 }))
    const eyeMat = own(kit.light(look.tint.glow, 1.6))
    const mouthMat = own(kit.light(look.tint.glow, 1.3))
    const bandMat = own(kit.light(look.tint.glow, 1.1))
    const lensMat = own(new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, roughness: 0.05, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide }))
    const sheenMat = own(new THREE.ShaderMaterial({
      vertexShader: SHEEN_VERT, fragmentShader: SHEEN_FRAG, transparent: true, depthWrite: false,
      uniforms: { uRim: { value: new THREE.Color() }, uAccent: { value: new THREE.Color() }, uWarmC: { value: AMBER.clone() }, uRimI: { value: 0.8 }, uClock: { value: 0 }, uRip: { value: 0 }, uSwirl: { value: 0 }, uWarm: { value: 0 }, uLight: { value: 0 }, uMouthY: { value: MUS_Y - 0.06 } },
    }))

    /* head */
    const headGeo = own(headGeometry(Math.round(64 * seg)))
    const head = new THREE.Mesh(headGeo, headMat)
    const sheen = new THREE.Mesh(headGeo, sheenMat)
    sheen.scale.setScalar(1.006)
    sheen.renderOrder = 2
    const hairMat = own(new THREE.MeshPhysicalMaterial({ roughness: 0.42, metalness: 0.2, sheen: 0.6, sheenRoughness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.25, bumpMap: own(combTexture()), bumpScale: 0.7, side: THREE.DoubleSide }))
    const hair = new THREE.Mesh(own(hairGeometry(seg)), hairMat)
    hs.add(head, hair, sheen)

    /* face */
    const face = new THREE.Group()
    hs.add(face)
    const EW = 0.052 * small, EH = 0.15 * small
    const eyeGeos = {
      pills: own(new THREE.CapsuleGeometry(EW, EH - EW * 2, 6, 16).scale(1, 1, 0.4)),
      dots: own(new THREE.SphereGeometry(EW * 1.35, 20, 14).scale(1, 1, 0.4)),
      arcs: own((() => { const g = new THREE.CircleGeometry(EW * 1.45, 24, 0, Math.PI); g.translate(0, -EW * 0.5, 0); return g })()),
    }
    // Heavy lids (sleepy): a half disc with a flat top.
    const lidGeo = own(new THREE.CircleGeometry(EW * 1.5, 24, Math.PI, Math.PI))
    const arcR = 0.058 * small
    const arcGeo = own(new THREE.TorusGeometry(arcR, 0.017 * small, 8, 28, Math.PI * 0.82).rotateZ(Math.PI * 0.09).scale(1, 1, 0.5))
    const eyes = [-1, 1].map((s) => {
      const g = new THREE.Group()
      g.position.set(s * EYE_X, EYE_Y, surfZ(EYE_X, EYE_Y) + 0.008)
      g.rotation.y = s * yawAt(EYE_X, EYE_Y)
      const open = new THREE.Mesh(eyeGeos.pills, eyeMat)
      const shut = new THREE.Mesh(arcGeo, eyeMat)
      g.add(open, shut)
      face.add(g)
      return { g, open, shut, s }
    })
    const browGeo = own(new THREE.CapsuleGeometry(0.017 * small, 0.085 * small, 4, 10).rotateZ(Math.PI / 2).scale(1, 1, 0.6))
    const brows = [-1, 1].map((s) => {
      const m = new THREE.Mesh(browGeo, inkMat)
      m.rotation.y = s * yawAt(EYE_X, BROW_Y)
      face.add(m)
      return m
    })
    // Mustache: two tapered halves pivoting at the center so the tips can lift or droop.
    const musGeo = own((() => {
      const g = new THREE.SphereGeometry(1, 20, 12)
      const p = g.attributes.position
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), taper = 1 - 0.55 * ((x + 1) / 2) ** 1.5; p.setXYZ(i, (x + 1) * 0.5 * 0.12, p.getY(i) * 0.036 * taper, p.getZ(i) * 0.03 * taper) }
      g.computeVertexNormals()
      return g.scale(small, small, 1)
    })())
    const mus = [-1, 1].map((s) => {
      const piv = new THREE.Group()
      piv.position.set(0, MUS_Y, surfZ(0.05, MUS_Y) + 0.012)
      const m = new THREE.Mesh(musGeo, inkMat)
      m.position.x = 0.012
      piv.add(m)
      piv.scale.x = s
      face.add(piv)
      return piv
    })
    const mouth = new THREE.Mesh(own(new THREE.CapsuleGeometry(0.022 * small, 0.06 * small, 4, 12).rotateZ(Math.PI / 2).scale(1, 1, 0.4)), mouthMat)
    mouth.position.set(0, MUS_Y - 0.07 * small, surfZ(0, MUS_Y - 0.07) + 0.004)
    face.add(mouth)
    const sweat = new THREE.Mesh(own((() => { const g = new THREE.SphereGeometry(0.035, 16, 12); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) * (1 - clamp(y / 0.035) * 0.75)); p.setZ(i, p.getZ(i) * (1 - clamp(y / 0.035) * 0.75) * 0.6); p.setY(i, y * 1.5) } g.computeVertexNormals(); return g.scale(small, small, small) })()), own(new THREE.MeshPhysicalMaterial({ color: 0xdff4ff, roughness: 0.05, clearcoat: 1, metalness: 0, transparent: true, opacity: 0.85 })))
    sweat.position.set(0.36, 0.2, surfZ(0.36, 0.2) + 0.02)
    face.add(sweat)
    const faceGlow = kit.glowSprite(look.tint.glow, 1.1, 0)
    own(faceGlow.material)
    faceGlow.position.set(0, 0.0, 0.2)
    hs.add(faceGlow)

    /* body: coat, shirt + collar, lapels, bow */
    const coat = new THREE.Mesh(own(coatGeometry()), coatMat)
    const shirt = new THREE.Mesh(own(shirtGeometry()), whiteMat)
    const lapels = new THREE.Mesh(own(lapelGeometry()), silkMat)
    const bow = new THREE.Mesh(own(bowGeometry()), silkMat)
    bow.position.set(0, -0.3, 0.155)
    bow.scale.setScalar(small > 1 ? 1.15 : 1)
    const coatRim = new THREE.Mesh(coat.geometry, own(kit.rim('#ffffff', { power: 3, intensity: 0.5 })))
    coatRim.scale.setScalar(1.004)
    body.add(coat, coatRim, shirt, lapels, bow)

    /* hand + props */
    const hand = new THREE.Group()
    const glove = new THREE.Mesh(own(gloveGeometry()), whiteMat)
    hand.add(glove)
    const cardTex = own(cardTexture(look))
    const card = new THREE.Mesh(own(new THREE.PlaneGeometry(0.44, 0.3)), own(new THREE.MeshBasicMaterial({ map: cardTex, alphaTest: 0.5, toneMapped: false, side: THREE.DoubleSide })))
    card.position.set(0, 0.2, 0.045)
    card.rotation.z = 0.06
    const cardGlow = kit.glowSprite(look.tint.glow, 0.9, 0.6)
    own(cardGlow.material)
    cardGlow.position.set(0, 0.17, 0.0)
    const watch = new THREE.Group()
    const watchCase = new THREE.Mesh(own((() => {
      const c = new THREE.CylinderGeometry(0.085, 0.085, 0.03, 32).rotateX(Math.PI / 2)
      const bez = new THREE.TorusGeometry(0.085, 0.01, 8, 32)
      const crown = new THREE.CylinderGeometry(0.014, 0.014, 0.03, 10).translate(0, 0.1, 0)
      const bowR = new THREE.TorusGeometry(0.022, 0.005, 6, 16).translate(0, 0.125, 0)
      const chain = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.145, 0), new THREE.Vector3(-0.12, 0.08, -0.04), new THREE.Vector3(-0.22, -0.06, -0.08), new THREE.Vector3(-0.3, -0.04, -0.12)]), 24, 0.004, 4, false)
      return merge([c, bez, crown, bowR, chain])
    })()), own(goldMat.clone()))
    const watchFace = new THREE.Mesh(own(new THREE.CircleGeometry(0.076, 32)), own(new THREE.MeshBasicMaterial({ map: own(watchFaceTexture()), toneMapped: false })))
    watchFace.position.z = 0.016
    const watchHand = new THREE.Mesh(own(new THREE.PlaneGeometry(0.008, 0.06).translate(0, 0.027, 0)), own(new THREE.MeshBasicMaterial({ color: 0x2b261c })))
    watchHand.position.z = 0.017
    watch.add(watchCase, watchFace, watchHand)
    watch.position.set(0.01, 0.16, 0.05)
    watch.scale.setScalar(1.35)
    watch.rotation.x = -0.15
    hand.add(card, cardGlow, watch)
    body.add(hand)

    /* sparkles (celebrating) */
    const N = 9
    const sparkPos = new Float32Array(N * 3)
    const sparkGeo = own(new THREE.BufferGeometry())
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3))
    const sparkMat = own(new THREE.PointsMaterial({ map: own(sparkTexture()), size: 0.28 * (small > 1 ? 1.1 : 1), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffffff }))
    const sparks = new THREE.Points(sparkGeo, sparkMat)
    sparks.frustumCulled = false
    object.add(sparks)

    /* hat + glasses (rebuilt when the look changes) */
    const hat = new THREE.Group()
    const hatMat = own(new THREE.MeshPhysicalMaterial({ roughness: 0.34, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.12, sheen: 0.6, sheenRoughness: 0.4, side: THREE.DoubleSide }))
    const hatBody = new THREE.Mesh(undefined, hatMat)
    const hatBand = new THREE.Mesh(undefined, bandMat)
    hat.add(hatBody, hatBand)
    hs.add(hat)
    const specs = new THREE.Group()
    const specFrame = new THREE.Mesh(undefined, goldMat)
    const specLens = new THREE.Mesh(undefined, lensMat)
    specs.add(specFrame, specLens)
    hs.add(specs)
    let hatKind = null, specKind = null, hatTop = 0
    for (const g of [face, hair, hat, specs]) g.traverse((o) => o.isMesh && frontOnly(o))

    const base = { eye: new THREE.Color(), warmEye: new THREE.Color(), glassAtt: new THREE.Color(), glassCol: new THREE.Color() }
    const tmpC = new THREE.Color()
    const P0 = blank({}), P1 = blank({}), PP = blank({})
    let cur = look, eyeGeo = eyeGeos.pills

    function applyLook(l) {
      cur = l
      const tn = l.tint
      kit.updateGlass(headMat, l, { thickness: 0.55 })
      headMat.thickness = 0.55
      headMat.attenuationDistance = mix(2.4, 1.2, l.frost) * (l.dark ? 1.8 : 1)
      if (l.dark) headMat.color.lerp(WHITE, 0.35)
      if (tn.key === 'graphite' && !l.dark) headMat.color.lerp(WHITE, 0.55)
      headMat.iridescence = 0.3
      base.glassAtt.copy(headMat.attenuationColor)
      base.glassCol.copy(headMat.color)
      // Smoked glass coat: the tint's ink, darker in light theme so it reads as a tailcoat against a pale panel.
      kit.updateGlass(coatMat, l, { thickness: 0.45 })
      coatMat.color.copy(tn.ink).lerp(tn.glass, l.dark ? 0.6 : 0.45)
      coatMat.attenuationColor.copy(tn.ink).lerp(tn.glass, 0.25)
      coatMat.attenuationDistance = mix(0.7, 0.45, l.frost)
      coatMat.roughness = 0.05 + 0.25 * l.frost
      coatMat.envMapIntensity = l.dark ? 1.2 : 1
      coatRim.material.uniforms.color.value.copy(tn.soft).lerp(WHITE, 0.5)
      coatRim.material.uniforms.intensity.value = l.dark ? 0.55 : 0.4
      const ink = tmpC.copy(tn.ink)
      inkMat.color.copy(ink).multiplyScalar(l.dark ? 1.0 : 0.75)
      if (tn.key === 'graphite') inkMat.color.set(l.dark ? '#3a404c' : '#23272f')
      hairMat.color.copy(inkMat.color).multiplyScalar(l.dark ? 1 : 0.8).lerp(tn.glass, l.dark ? 0.14 : 0)
      hairMat.sheenColor.copy(tn.soft).multiplyScalar(0.6)
      silkMat.color.copy(tn.ink).multiplyScalar(l.dark ? 0.75 : 0.55)
      silkMat.sheenColor.copy(tn.glow).multiplyScalar(0.45)
      hatMat.color.copy(tn.ink).multiplyScalar(0.6)
      hatMat.sheenColor.copy(tn.glow).multiplyScalar(0.35)
      whiteMat.color.set(l.dark ? '#d9dee8' : '#fbfcff').lerp(tn.soft, 0.12)
      // Eyes: crisp light in dark theme; a deeper, saturated light in light theme so they hold contrast on pale glass.
      base.eye.copy(tn.glow).lerp(WHITE, l.dark ? 0.35 : 0).multiplyScalar(l.dark ? 1.7 : 1.05)
      if (!l.dark) base.eye.lerp(tn.ink, 0.25)
      if (tn.key === 'graphite') base.eye.set(l.dark ? '#e8f0ff' : '#2f3a4e').multiplyScalar(l.dark ? 1.5 : 1)
      base.warmEye.copy(AMBER).multiplyScalar(l.dark ? 1.6 : 1.0)
      mouthMat.color.copy(base.eye).multiplyScalar(0.9)
      bandMat.color.copy(tn.glow).multiplyScalar(l.dark ? 1.2 : 0.9)
      faceGlow.material.color.copy(tn.glow)
      cardGlow.material.color.copy(tn.glow)
      cardGlow.material.blending = l.dark ? THREE.AdditiveBlending : THREE.NormalBlending
      cardGlow.material.opacity = l.dark ? 0.7 : 0.35
      cardGlow.material.needsUpdate = true
      drawCard(cardTex.image, l); cardTex.needsUpdate = true
      const su = sheenMat.uniforms
      su.uRim.value.copy(l.dark ? tmpC.copy(tn.soft).lerp(WHITE, 0.4) : tmpC.copy(tn.ink).lerp(tn.glow, 0.35))
      su.uAccent.value.copy(tn.glow).lerp(l.dark ? WHITE : tn.ink, l.dark ? 0.2 : 0.2)
      su.uRimI.value = l.dark ? 0.85 : 0.45
      su.uLight.value = l.dark ? 0 : 1
      sheenMat.blending = l.dark ? THREE.AdditiveBlending : THREE.NormalBlending
      sheenMat.needsUpdate = true
      sparkMat.blending = l.dark ? THREE.AdditiveBlending : THREE.NormalBlending
      sparkMat.color.set(l.dark ? '#fff6dc' : '#d99a2b')
      sparkMat.needsUpdate = true
      // Eye style.
      eyeGeo = eyeGeos[l.eyes] || eyeGeos.pills
      // Hat.
      if (hatKind !== l.hat) {
        hatKind = l.hat
        hatBody.geometry?.dispose?.(); hatBand.geometry?.dispose?.()
        const h = hatGeometry(l.hat)
        hat.visible = !!h
        hatBody.geometry = h ? h.body : new THREE.BufferGeometry()
        hatBand.geometry = h ? h.band : new THREE.BufferGeometry()
        hatTop = h ? h.top : 0
      }
      // Glasses.
      if (specKind !== l.glasses) {
        specKind = l.glasses
        specFrame.geometry?.dispose?.(); specLens.geometry?.dispose?.()
        const g = glassesGeometry(l.glasses, small > 1 ? 1.12 : 1)
        specs.visible = !!g
        specFrame.geometry = g ? g.frame : new THREE.BufferGeometry()
        specLens.geometry = g && g.lens ? g.lens : new THREE.BufferGeometry()
        specLens.visible = !!(g && g.lens)
      }
      // Fit: keep the hat (and a lifted hat) inside the frame at every size.
      const HAT_Y = 0.385
      const top = hatTop ? HY + HAT_Y + hatTop + (l.hat === 'top' ? 0.1 : 0.12) : HY + R * SY + 0.06
      const m = FR.height * 0.03
      const s = Math.min(1, (frameTop - m - (frameBot + m)) / (top - keepBot))
      const dy = Math.min(0, frameTop - m - top * s)
      fit.scale.setScalar(s)
      fit.position.y = dy
    }
    applyLook(look)

    function blendPose(f) {
      pose(P1, f.mood, f)
      const k = f.rm ? 1 : smooth(f.moodAge / 0.4)
      if (k >= 1) { for (const key of KEYS) PP[key] = P1[key]; return PP }
      pose(P0, f.prevMood, f)
      for (const key of KEYS) PP[key] = mix(P0[key], P1[key], k)
      PP.closedNow = k > 0.5 ? P1.closed : P0.closed
      return PP
    }

    return {
      object,
      update(f) {
        const p = blendPose(f)
        const closed = p.closedNow ?? p.closed
        const A = f.rm ? 0 : 1
        // Body: still and upright; only celebrating bounces.
        body.position.y = f.bounce * 0.55
        body.position.z = p.lean
        // Head: nod, tilt, turn toward where it looks, and a liquid wobble.
        pivot.rotation.set(p.hx + f.lookY * 0.06, f.lookX * 0.16 + p.hy, p.hz)
        const w = Math.sin(f.clock * 2.3) * 0.012 * f.wob * A
        hs.scale.set(1 + w, 1 - w, 1 + w * 0.5)
        // Eyes.
        const lx = f.lookX * 0.035, ly = -f.lookY * 0.03
        const warm = f.warm
        eyeMat.color.copy(base.eye).lerp(base.warmEye, warm * 0.85).multiplyScalar(p.bright)
        for (const e of eyes) {
          const showShut = closed > 0
          e.open.visible = !showShut
          e.shut.visible = showShut
          e.g.position.x = e.s * EYE_X + lx
          e.g.position.y = EYE_Y + ly + (p.peer ? 0.012 : 0)
          if (showShut) {
            const happy = closed === 2
            e.shut.rotation.z = happy ? 0 : Math.PI
            e.shut.position.y = happy ? -arcR * 0.45 : arcR * 0.55 - 0.01
            e.shut.scale.set(1, happy ? 1 : 0.8, 1)
          } else {
            const o = Math.max(0.12, f.open * f.blink)
            const lid = p.lid > 0.5
            e.open.geometry = lid ? lidGeo : eyeGeo
            e.open.scale.set(p.eyeW, lid ? 0.35 + o * 1.4 : Math.min(1.15, o), 1)
            // Sleepy and low lids sit lower; worried eyes slant.
            e.open.position.y = lid ? 0.012 : -(1 - Math.min(1, o)) * EH * 0.35
            e.open.rotation.z = e.s * (p.slant * 0.9) - (f.mood === 'sleepy' ? e.s * 0.12 : 0)
          }
        }
        // Brows: lift and slant (inner ends up when worried).
        for (const [i, b] of brows.entries()) {
          const s = i ? 1 : -1
          const lift = i ? p.browR : p.browL
          b.position.set(s * EYE_X + lx * 0.5, BROW_Y + lift * 1.6 + ly * 0.4, surfZ(EYE_X, BROW_Y) + 0.008)
          b.rotation.z = s * -p.slant * 2.2 + (i ? p.browR - p.browL : 0) * 2.5
        }
        // Mustache tips and mouth.
        for (const m of mus) m.rotation.z = p.mus - 0.08
        const talk = f.mood === 'talking' ? f.level : 0
        const mo = Math.max(talk, p.smile * 0.65)
        mouth.visible = mo > 0.04
        mouth.scale.set(0.8 + p.smile * 0.6 + talk * 0.25, 0.35 + mo * 1.6, 1)
        mouth.position.y = MUS_Y - (0.06 + mo * 0.025) * small
        // Sweat bead (worried) slides a little.
        sweat.visible = p.sweat > 0.3
        sweat.position.y = 0.2 - ((f.t * 0.12) % 0.12) * A
        // Face glow (needs-you, celebrating).
        faceGlow.material.opacity = p.glow * (cur.dark ? 0.35 : 0.18) * (0.8 + 0.2 * Math.sin(f.t * 5) * A)
        // Hat: tip, lift, tilt; it slides over the eyes when sleepy.
        if (hat.visible) {
          hat.position.set(0.02 + p.hatTilt * 0.1, 0.385 + p.hatLift * 0.1 - p.hatTip * 0.03, -0.03 + p.hatTip * 0.07)
          hat.rotation.set(-0.12 + p.hatTip * 0.32, 0, -0.07 + p.hatTilt)
        }
        // Glasses: perched, slide down when sleepy, askew when worried.
        if (specs.visible) {
          specs.position.set(0, p.gY - (p.peer && cur.glasses === 'half-moon' ? 0.012 : 0), 0)
          specs.rotation.z = p.gTilt
        }
        // Hand and props.
        hand.visible = p.hand > 0.02
        if (hand.visible) {
          const h = p.hand
          card.visible = cardGlow.visible = p.card > 0.5
          watch.visible = p.watch > 0.5
          if (p.card > 0.5) {
            hand.position.set(0.66, mix(-1.0, -0.12, h) + Math.sin(f.t * 3) * 0.012 * A * f.P, 0.42)
            hand.rotation.set(0, -0.25, -0.12)
            cardGlow.material.opacity = (cur.dark ? 0.6 : 0.3) * (0.75 + 0.25 * Math.sin(f.t * 4) * A)
          } else {
            hand.position.set(0.4, mix(-1.1, -0.62, h), 0.5)
            hand.rotation.set(0.1, -0.2, 0.08)
            watchHand.rotation.z = -f.t * 2.5 * A
          }
        }
        // Glass reacts: warm cast, ripples, swirl.
        headMat.attenuationColor.copy(base.glassAtt).lerp(AMBER_GLASS, warm * 0.4)
        headMat.color.copy(base.glassCol).lerp(AMBER_GLASS, warm * 0.1)
        const su = sheenMat.uniforms
        su.uClock.value = f.clock
        su.uRip.value = f.rip * (0.3 + f.level * 0.55) * (cur.dark ? 1 : 0.6)
        su.uSwirl.value = f.swirl
        su.uWarm.value = warm
        // Sparkles orbit the hat line while celebrating.
        sparks.visible = f.spark > 0.02
        if (sparks.visible) {
          sparkMat.opacity = f.spark
          const top = HY + R * SY + (hatTop ? hatTop * 0.6 : 0)
          for (let i = 0; i < N; i++) {
            const a = (i / N) * Math.PI * 2 + f.t * 0.7 * A + i * 0.4
            const ph = (f.t * 0.9 + i * 0.37) % 1
            const r = 0.62 + 0.18 * ((i * 0.53) % 1) + ph * 0.12
            sparkPos[i * 3] = Math.cos(a) * r * 1.05
            sparkPos[i * 3 + 1] = (top - 0.35) * fit.scale.y + fit.position.y + Math.sin(a) * r * 0.55 + f.bounce * 0.55 + ph * 0.15 * A
            sparkPos[i * 3 + 2] = 0.3 + Math.sin(a) * 0.1
          }
          sparkGeo.attributes.position.needsUpdate = true
        }
      },
      setLook(l) { applyLook(l) },
      dispose() {
        for (const d of disposables) d.dispose?.()
        hatBody.geometry?.dispose?.(); hatBand.geometry?.dispose?.()
        specFrame.geometry?.dispose?.(); specLens.geometry?.dispose?.()
      },
    }
  },
}
