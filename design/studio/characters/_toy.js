// The toy family kit (Bao, Reed, Tofu): soft vinyl bodies with a printed face, two stubby arms (./_arms.js), hats,
// glasses and small mood props. A character supplies its shape, face layout, arm spec and personality; this builds it.
//
// The face is drawn in 2D on a canvas (like the app's face-drawing.ts will) and mapped onto a patch that hugs the
// body, so eyes can take any shape, color or lid and still read as printed on the toy. Eyes come only from the shared
// face state: open, blink, droop, happy, pulse, lookX/lookY, warm and spark.
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { WARM } from '../engine.js'
import { makeArms } from './_arms.js'

const V3 = THREE.Vector3
const sp = (v, p) => Math.sign(v) * Math.pow(Math.abs(v), p)
const ease = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt))
const smooth = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k) }
/**
 * Paint: the studio's key light and tone mapping blow light colors out to near white, so a chosen color is scaled
 * down by its lightness before it becomes a material color. The lit toy then shows the color that was picked.
 */
const HSL = {}
export function paint(c, out = new THREE.Color()) {
  c.getHSL(HSL, THREE.SRGBColorSpace)
  // Very light colors (cream, pale pastels) keep more of their lightness and less of the saturation boost.
  const pale = smooth(0.82, 0.95, HSL.l)
  const l = HSL.l * (0.95 - 0.21 * smooth(0.3, 0.6, HSL.l) + 0.12 * pale)
  return out.setHSL(HSL.h, Math.min(1, HSL.s * (1.15 - 0.4 * pale)), l, THREE.SRGBColorSpace)
}

/* ---------------- body shape: a superellipsoid with its own top and bottom roundness ---------------- */
/**
 * R: half width · yc: waist height · hT/hB: height above/below it · mT/mB: top/bottom exponents (2 round, higher flatter)
 * n: cross-section (2 round, 4 soft square) · ZS: front-to-back depth · taper: narrower top (+) or wider (-)
 */
export function makeShape({ R, yc = 0, hT, hB, mT = 2, mB = 2, n = 2, ZS = 1, taper = 0 }) {
  const top = yc + hT, bottom = yc - hB
  const radial = (y) => R * (1 - taper * (y >= yc ? (y - yc) / hT : (y - yc) / hB))
  function point(th, a, out = new V3()) {
    const s = Math.sin(th), c = Math.cos(th), up = th >= 0, m = up ? mT : mB, h = up ? hT : hB
    const y = yc + h * sp(s, 2 / m)
    const rw = radial(y) * Math.pow(Math.abs(c), 2 / m)
    return out.set(rw * sp(Math.sin(a), 2 / n), y, ZS * rw * sp(Math.cos(a), 2 / n))
  }
  const p0 = new V3(), p1 = new V3(), q0 = new V3(), q1 = new V3()
  function normal(th, a, out = new V3()) {
    if (Math.abs(th) > Math.PI / 2 - 2e-3) return out.set(0, Math.sign(th), 0)
    const d = 1e-3
    point(th + d, a, p1); point(th - d, a, p0); point(th, a + d, q1); point(th, a - d, q0)
    out.crossVectors(q1.sub(q0), p1.sub(p0)).normalize()
    point(th, a, p0)
    if (out.dot(p0.set(p0.x, p0.y - yc, p0.z)) < 0) out.negate()
    return out
  }
  /** Surface parameters of the front point at (x, y). */
  function front(x, y) {
    const up = y >= yc, m = up ? mT : mB, h = up ? hT : hB
    const th = Math.sign(y - yc) * Math.asin(Math.min(1, Math.pow(Math.min(1, Math.abs(y - yc) / h), m / 2)))
    const rw = radial(y) * Math.pow(Math.cos(th), 2 / m)
    const a = Math.sign(x) * Math.asin(Math.min(1, Math.pow(Math.min(1, Math.abs(x) / Math.max(1e-6, rw)), n / 2)))
    return { th, a }
  }
  /** Front point at (x, y), lifted `off` along the normal; also returns the normal. */
  function onFront(x, y, off = 0, out = new V3(), nOut = new V3()) {
    const { th, a } = front(x, y)
    point(th, a, out); normal(th, a, nOut)
    return out.addScaledVector(nOut, off)
  }
  /** Half width of the body at height y (where the sides are). */
  const halfWidth = (y) => { const { th } = front(0, y); return point(th, Math.PI / 2, new V3()).x }
  return { point, normal, front, onFront, halfWidth, top, bottom, yc, R, ZS }
}

function gridGeometry(cols, rows, fn) {
  const pos = [], nor = [], uv = [], idx = []
  const p = new V3(), nn = new V3()
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      fn(i / cols, j / rows, p, nn)
      pos.push(p.x, p.y, p.z); nor.push(nn.x, nn.y, nn.z); uv.push(i / cols, j / rows)
    }
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const a = j * (cols + 1) + i, b = a + cols + 1
    idx.push(a, a + 1, b, a + 1, b + 1, b)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  return g
}
export function bodyGeometry(shape, cols = 96, rows = 64) {
  return gridGeometry(cols, rows, (u, v, p, n) => { const th = -Math.PI / 2 + Math.PI * v, a = -Math.PI + 2 * Math.PI * u; shape.point(th, a, p); shape.normal(th, a, n) })
}
function decalGeometry(shape, reg, off, cols = 40, rows = 32) {
  return gridGeometry(cols, rows, (u, v, p, n) => { shape.onFront(reg.x0 + (reg.x1 - reg.x0) * u, reg.y0 + (reg.y1 - reg.y0) * v, off, p, n) })
}

/* ---------------- the printed face ---------------- */
// Brows only where they help the read: raised for attention, knit for worry, one up for "hmm".
function browFor(mood) {
  switch (mood) {
    case 'worried': return { on: 1, l: 0.15, r: 0.15, slant: 0.42 }
    case 'thinking': return { on: 0.95, l: -0.05, r: 0.55, slant: -0.08 }
    case 'needs-you': return { on: 0.9, l: 0.5, r: 0.5, slant: 0 }
    case 'listening': return { on: 0.6, l: 0.3, r: 0.38, slant: 0 }
    case 'done': case 'celebrating': return { on: 0.55, l: 0.45, r: 0.45, slant: -0.1 }
    case 'talking': return { on: 0.4, l: 0.22, r: 0.22, slant: 0 }
    default: return { on: 0, l: 0, r: 0, slant: 0 }
  }
}

function faceRenderer(reg, F, small) {
  const W = small ? 256 : 512, H = Math.round((W * (reg.y1 - reg.y0)) / (reg.x1 - reg.x0))
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const g = canvas.getContext('2d')
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  const k = W / (reg.x1 - reg.x0)
  const X = (x) => (x - reg.x0) * k, Y = (y) => (reg.y1 - y) * k
  const lod = small ? 1.14 : 1, thick = small ? 1.3 : 1

  function eyePath(style, cx, cy, ew, hh) {
    g.beginPath()
    if (style === 'dots') { const r = ew * 1.2; g.ellipse(cx, cy, r, Math.max(r * 0.12, Math.min(r * 1.05, hh * 0.9)), 0, 0, Math.PI * 2) }
    else if (style === 'arcs') { const r = ew * 1.25, ah = Math.max(r * 0.14, hh * 1.05); g.ellipse(cx, cy + ah * 0.5, r, ah, 0, Math.PI, Math.PI * 2); g.closePath() }
    else { const h2 = Math.max(ew * 0.22, hh); g.roundRect(cx - ew, cy - h2, ew * 2, h2 * 2, Math.min(ew, h2)) }
  }
  function star(x, y, r) {
    g.beginPath()
    for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4 - Math.PI / 2, rr = i % 2 ? r * 0.32 : r; g[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr) }
    g.closePath(); g.fill()
  }

  function mouth(mood, f, mx, my, mw, alpha, col) {
    if (alpha <= 0.01) return
    g.save()
    g.globalAlpha = alpha
    g.fillStyle = g.strokeStyle = col
    g.lineWidth = mw * 0.34 * thick
    g.lineCap = g.lineJoin = 'round'
    const tongue = (cx, cy, rx, ry) => { if (small) return; g.save(); g.clip(); g.fillStyle = '#ff7f95'; g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.fill(); g.restore() }
    g.beginPath()
    switch (mood) {
      case 'talking': { const ry = Math.max(mw * 0.14, f.level * mw * 0.78); g.ellipse(mx, my + ry * 0.3, mw * 0.55, ry, 0, 0, Math.PI * 2); g.fill(); if (ry > mw * 0.4) tongue(mx, my + ry * 1.1, mw * 0.4, ry * 0.5); break }
      case 'done': case 'celebrating': {
        const w = mood === 'celebrating' ? mw * 1.0 : mw * 0.85, d = mood === 'celebrating' ? mw * 1.6 : mw * 1.3
        g.moveTo(mx - w, my - mw * 0.1); g.quadraticCurveTo(mx, my + d, mx + w, my - mw * 0.1); g.closePath(); g.fill()
        tongue(mx, my + d * 0.62, w * 0.5, d * 0.28); break
      }
      case 'needs-you': g.ellipse(mx, my + mw * 0.1, mw * 0.3, mw * 0.38, 0, 0, Math.PI * 2); g.fill(); break
      case 'worried': { const x0 = mx - mw * 0.75; g.moveTo(x0, my + mw * 0.15); for (let i = 1; i <= 4; i++) g.quadraticCurveTo(x0 + (i - 0.5) * mw * 0.375, my + (i % 2 ? -mw * 0.12 : mw * 0.42), x0 + i * mw * 0.375, my + mw * 0.15); g.stroke(); break }
      case 'thinking': g.moveTo(mx - mw * 0.05, my + mw * 0.22); g.quadraticCurveTo(mx + mw * 0.35, my + mw * 0.05, mx + mw * 0.7, my + mw * 0.18); g.stroke(); break
      case 'sleepy': { const yawn = f.rm ? 0 : Math.max(0, Math.sin(f.t * 0.55)) ** 6; g.ellipse(mx, my + mw * 0.1, mw * (0.22 + 0.2 * yawn), mw * (0.16 + 0.55 * yawn), 0, 0, Math.PI * 2); g.fill(); break }
      case 'resting': g.moveTo(mx - mw * 0.45, my); g.quadraticCurveTo(mx, my + mw * 0.3, mx + mw * 0.45, my); g.stroke(); break
      case 'listening': g.moveTo(mx - mw * 0.55, my); g.quadraticCurveTo(mx, my + mw * 0.55, mx + mw * 0.55, my); g.stroke(); break
      default: g.moveTo(mx - mw * 0.8, my - mw * 0.05); g.quadraticCurveTo(mx, my + mw * 0.85, mx + mw * 0.8, my - mw * 0.05); g.stroke()
    }
    g.restore()
  }

  function brows(b, f, cxs, cy, ew, eh, alpha, col) {
    if (alpha * b.on <= 0.01) return
    g.save()
    g.globalAlpha = alpha * b.on
    g.strokeStyle = col
    g.lineCap = 'round'
    g.lineWidth = ew * 0.42 * thick
    for (const [i, s] of [-1, 1].entries()) {
      const raise = (s < 0 ? b.l : b.r) * eh * 0.55
      const x = cxs[i], y = cy - eh * 1.2 - ew * 0.55 - raise
      g.save(); g.translate(x, y); g.rotate(s * b.slant)
      g.beginPath(); g.moveTo(-ew * 0.95, ew * 0.12); g.quadraticCurveTo(0, -ew * 0.3, ew * 0.95, ew * 0.12); g.stroke()
      g.restore()
    }
    g.restore()
  }

  function draw(f, look, blush) {
    g.clearRect(0, 0, W, H)
    const eye = look.eye, col = eye.hex
    const ew = F.ew * k * lod, eh = F.eh * k * lod
    const dx = f.lookX * F.ew * 1.05 * k, dy = f.lookY * F.eh * 0.4 * k
    const md = f.mood
    const worried = md === 'worried' ? 1 : 0
    const sc = (1 + 0.08 * worried) * (1 + 0.07 * f.pulse)
    const open = Math.max(0.08, f.open * f.blink)
    const happy = f.happy

    /* cheeks */
    if (!small && blush) {
      for (const s of [-1, 1]) {
        const cx = X(s * F.cheekX) + dx * 0.3, cy = Y(F.cheekY) + dy * 0.3, rx = F.cheekW * k, ry = F.cheekH * k
        const gr = g.createRadialGradient(cx, cy, 0, cx, cy, rx)
        gr.addColorStop(0, blush.inner); gr.addColorStop(1, blush.outer)
        g.save(); g.fillStyle = gr; g.translate(cx, cy); g.scale(1, ry / rx); g.beginPath(); g.arc(0, 0, rx, 0, Math.PI * 2); g.fill(); g.restore()
      }
    }

    /* eyes */
    const cxs = [], cyE = Y(F.ey) + dy
    for (const s of [-1, 1]) {
      const cx = X(s * F.ex) + dx
      cxs.push(cx)
      g.save()
      g.translate(cx, cyE)
      g.rotate(s * 0.2 * worried)
      g.scale(sc, sc)
      g.fillStyle = g.strokeStyle = col
      if (eye.lit) { g.shadowColor = col; g.shadowBlur = ew * 0.9 }
      // Open eye (shrinks away as the happy squint comes in).
      const hh = eh * open * (1 - happy)
      if (hh > eh * 0.03) {
        g.save()
        const droop = f.droop
        if (droop > 0.01) {
          // Upper lid: clip off the top of the eye along a lid line tilted so the outer corner sits lower
          // (content and drowsy; the other way reads cross), then draw the lash line.
          const lidY = -eh * Math.min(1.15, open) + 2 * eh * Math.min(1.15, open) * droop
          g.rotate(s * 0.2 * Math.min(1, droop * 3))
          g.beginPath(); g.rect(-ew * 3, lidY, ew * 6, eh * 4); g.clip()
          g.rotate(-s * 0.2 * Math.min(1, droop * 3))
        }
        eyePath(look.eyes, 0, 0, ew, hh)
        g.fill()
        if (!eye.light && !eye.lit && hh > ew * 0.55) {
          // Catchlights, clipped to the eye.
          g.save(); g.clip()
          g.shadowBlur = 0
          g.fillStyle = 'rgba(255,255,255,0.92)'
          g.beginPath(); g.arc(ew * 0.34, -Math.max(ew * 0.1, hh * 0.45), ew * 0.36, 0, Math.PI * 2); g.fill()
          g.beginPath(); g.arc(-ew * 0.3, Math.max(ew * 0.05, hh * 0.42), ew * 0.15, 0, Math.PI * 2); g.fill()
          g.restore()
        } else if (eye.lit) {
          g.save(); g.clip(); g.shadowBlur = 0
          const gr = g.createRadialGradient(0, -hh * 0.2, 0, 0, 0, Math.max(ew, hh))
          gr.addColorStop(0, 'rgba(255,255,255,0.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)')
          g.fillStyle = gr; g.fillRect(-ew * 2, -eh * 2, ew * 4, eh * 4); g.restore()
        }
        g.restore()
        if (f.droop > 0.05) {
          const lidY = -eh * Math.min(1.15, open) + 2 * eh * Math.min(1.15, open) * f.droop
          g.save(); g.globalAlpha = Math.min(1, f.droop * 3); g.shadowBlur = 0
          g.rotate(s * 0.2 * Math.min(1, f.droop * 3))
          g.lineWidth = ew * 0.3 * thick; g.lineCap = 'round'
          g.beginPath(); g.moveTo(-ew * 1.2, lidY); g.quadraticCurveTo(0, lidY + ew * 0.12, ew * 1.2, lidY); g.stroke(); g.restore()
        }
      }
      // Happy squint: an upward arc.
      if (happy > 0.02) {
        g.save()
        g.globalAlpha = Math.min(1, happy * 1.4)
        g.lineWidth = ew * 0.62 * thick; g.lineCap = 'round'
        g.beginPath(); g.arc(0, eh * 0.45, ew * 1.15, Math.PI * 1.13, Math.PI * 1.87); g.stroke()
        if (f.spark > 0.05 && !small) {
          g.shadowBlur = 0
          g.fillStyle = '#ffffff'
          const tw = f.rm ? 1 : 0.65 + 0.35 * Math.sin(f.t * 9 + s * 2)
          g.globalAlpha = f.spark * tw
          star(ew * 0.95 * s, -eh * 0.75, ew * 0.55 * tw)
        }
        g.restore()
      }
      g.restore()
    }

    /* brows and mouth: crossfade from the previous mood */
    const fade = f.rm ? 1 : smooth(0, 0.22, f.moodAge)
    const ewB = F.ew * k * lod, ehB = F.eh * k * lod
    brows(browFor(md), f, cxs, cyE, ewB, ehB, fade, col)
    if (fade < 1) brows(browFor(f.prevMood), f, cxs, cyE, ewB, ehB, 1 - fade, col)
    const mx = X(0) + dx * 0.45, my = Y(F.my) + dy * 0.5, mw = F.mw * k * lod
    mouth(md, f, mx, my, mw, fade, col)
    if (fade < 1) mouth(f.prevMood, f, mx, my, mw, 1 - fade, col)
    texture.needsUpdate = true
  }
  return { canvas, texture, draw }
}

/* ---------------- accessories ---------------- */
function strip(g) { for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k); return g.index ? g.toNonIndexed() : g }
function hatGeometry(kind) {
  if (kind !== 'bowler' && kind !== 'top') return null
  const P = kind === 'bowler'
    ? [[0.001, 0.4], [0.12, 0.395], [0.24, 0.372], [0.33, 0.322], [0.385, 0.245], [0.405, 0.15], [0.41, 0.07], [0.415, 0.022], [0.47, 0.012], [0.55, 0.02], [0.6, 0.04], [0.625, 0.064], [0.632, 0.078], [0.618, 0.068], [0.57, 0.04], [0.47, 0.004], [0.41, -0.006], [0.001, -0.006]]
    : [[0.001, 0.68], [0.32, 0.68], [0.342, 0.672], [0.352, 0.645], [0.338, 0.42], [0.342, 0.18], [0.356, 0.024], [0.46, 0.012], [0.56, 0.022], [0.61, 0.05], [0.625, 0.074], [0.61, 0.066], [0.55, 0.036], [0.46, 0.004], [0.36, -0.006], [0.001, -0.006]]
  const body = strip(new THREE.LatheGeometry(P.map(([r, y]) => new THREE.Vector2(r, y)), 48))
  const bandR = kind === 'bowler' ? 0.416 : 0.352
  const band = strip(new THREE.CylinderGeometry(bandR, bandR + 0.004, kind === 'bowler' ? 0.075 : 0.1, 48, 1, true))
  band.translate(0, kind === 'bowler' ? 0.062 : 0.075, 0)
  return { geo: mergeGeometries([body, band], true), top: P[0][1] }
}
const Z_AXIS = new V3(0, 0, 1)
function onFace(shape, g, x, y, lift) {
  const p = new V3(), n = new V3()
  shape.onFront(x, y, lift, p, n)
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Z_AXIS, n))
  g.translate(p.x, p.y, p.z)
  return g
}
function rod(a, b, r) {
  const d = new V3().subVectors(b, a)
  const g = strip(new THREE.CylinderGeometry(r, r, d.length(), 8))
  g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), d.normalize()), new V3(1, 1, 1)))
  return g
}
function glassesGeometry(kind, shape, F) {
  if (!kind || kind === 'none') return null
  const frame = [], lens = []
  const LIFT = 0.05, ex = F.ex, ey = F.ey, R = Math.max(F.ew * 1.25, F.eh) * 1.32, tube = R * 0.11
  const disc = (x, y, half) => {
    const s = new THREE.Shape()
    if (half) { s.absarc(0, 0, R * 0.96, Math.PI, Math.PI * 2, false); s.closePath() } else s.absarc(0, 0, R * 0.96, 0, Math.PI * 2, false)
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.01, bevelEnabled: false, curveSegments: 32 })
    g.translate(0, 0, -0.005)
    return onFace(shape, strip(g), x, y, LIFT)
  }
  const pt = (x, y, lift = LIFT) => shape.onFront(x, y, lift)
  if (kind === 'monocle') {
    frame.push(onFace(shape, strip(new THREE.TorusGeometry(R, tube * 1.2, 8, 44)), ex, ey, LIFT))
    lens.push(disc(ex, ey, false))
    const a = pt(ex + R * 0.2, ey - R), b = pt(ex + R * 0.5, ey - R * 2.4, 0.03), c = pt(ex + R * 0.4, ey - R * 3.6, 0.02)
    frame.push(strip(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([a, b, c]), 30, tube * 0.45, 6, false)))
  } else {
    const half = kind === 'half-moon', y = half ? ey - F.eh * 0.15 : ey
    for (const s of [-1, 1]) {
      const x = s * ex
      const ring = strip(new THREE.TorusGeometry(R, tube, 8, 44, half ? Math.PI : Math.PI * 2))
      if (half) ring.rotateZ(Math.PI)
      frame.push(onFace(shape, ring, x, y, LIFT))
      lens.push(disc(x, y, half))
      if (half) frame.push(rod(pt(x - R, y), pt(x + R, y), tube))
      // temple arm, back into the side of the head
      const hw = shape.halfWidth(y + 0.03)
      frame.push(rod(pt(x + s * R, y), new V3(s * hw * 0.97, y + 0.03, 0), tube * 0.85))
    }
    const br = strip(new THREE.TorusGeometry(ex - R, tube * 0.9, 6, 18, Math.PI))
    br.scale(1, 0.6, 1)
    frame.push(onFace(shape, br, 0, y + (half ? 0 : F.eh * 0.15), LIFT + 0.004))
  }
  return { frame: mergeGeometries(frame), lens: mergeGeometries(lens) }
}

/** Bow tie: two soft wings and a knot, facing +z. */
export function bowGeometry() {
  const wing = (s) => {
    const pts = [[0.0, 0], [0.03, 0.002], [0.062, 0.03], [0.074, 0.075], [0.06, 0.112], [0.03, 0.128], [0.0, 0.13]].map(([r, y]) => new THREE.Vector2(r, y))
    const g = new THREE.LatheGeometry(pts, 20)
    g.translate(0, 0.012, 0)
    g.rotateZ(-s * Math.PI / 2)
    g.scale(1, 1, 0.55)
    return strip(g)
  }
  const knot = new THREE.SphereGeometry(0.042, 16, 12)
  knot.scale(1, 1.05, 0.75)
  knot.translate(0, 0, 0.012)
  return mergeGeometries([wing(1), wing(-1), strip(knot)])
}

/* ---------------- props ---------------- */
function zGeometry() {
  const s = new THREE.Shape(), w = 0.1, h = 0.11, t = 0.028
  s.moveTo(-w / 2, h / 2); s.lineTo(w / 2, h / 2); s.lineTo(w / 2, h / 2 - t); s.lineTo(-w / 2 + t * 1.3, -h / 2 + t); s.lineTo(w / 2, -h / 2 + t); s.lineTo(w / 2, -h / 2); s.lineTo(-w / 2, -h / 2); s.lineTo(-w / 2, -h / 2 + t); s.lineTo(w / 2 - t * 1.3, h / 2 - t); s.lineTo(-w / 2, h / 2 - t); s.closePath()
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.025, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2 })
  g.translate(0, 0, -0.0125)
  return g
}
function sparkGeometry() {
  const s = new THREE.Shape()
  for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4 + Math.PI / 2, r = i % 2 ? 0.035 : 0.1; s[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r) }
  s.closePath()
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.006, bevelSegments: 2 })
  g.translate(0, 0, -0.01)
  return g
}
function dropGeometry() {
  const pts = []
  for (let i = 0; i <= 16; i++) { const t = i / 16, a = t * Math.PI; pts.push(new THREE.Vector2(Math.sin(a) * 0.05 * (1 - 0.55 * (1 - t) ** 2.2), -Math.cos(a) * 0.06 + 0.03 * (1 - t) ** 3)) }
  return new THREE.LatheGeometry(pts, 20)
}

/* ---------------- body poses per mood (shared by the family; scaled by each character's personality) ---------------- */
const KEYS = ['lean', 'tilt', 'sink', 'tall']
function bodyTarget(o, f, P, think) {
  o.lean = 0; o.tilt = 0; o.sink = 0; o.tall = 1
  const age = f.moodAge, A = f.rm ? 0 : 1
  switch (f.mood) {
    case 'resting': o.sink = 0.06; o.tall = 0.95; o.tilt = -0.08; o.lean = 0.02; break
    case 'idle': break
    case 'listening': o.lean = 0.06; o.tilt = -0.12; o.tall = 1.02; break
    case 'thinking': o.tilt = think === 'chin' ? -0.05 : 0.04; o.lean = think === 'chin' ? 0.04 : -0.03; o.tall = 1.01; break
    case 'talking': o.lean = 0.03; break
    case 'done': o.tall = 1 + A * 0.05 * Math.sin(Math.PI * Math.min(1, age / 0.5)); o.lean = -0.03; break
    case 'needs-you': o.tall = 1.05; o.lean = 0.05; o.tilt = 0.05; break
    case 'worried': o.tall = 0.95; o.lean = -0.04; break
    case 'celebrating': o.tall = 1.02; break
    case 'sleepy': o.sink = 0.08; o.tall = 0.94; o.tilt = 0.08 + A * 0.04 * Math.sin(f.t * 0.55); o.lean = 0.06 + A * 0.04 * Math.sin(f.t * 0.8); break
  }
  return o
}

/* ---------------- build a toy ---------------- */
/**
 * design: {
 *   shape: makeShape options · face: { region {x0,x1,y0,y1}, ex, ey, ew, eh, mw, my, cheekX, cheekY, cheekW, cheekH }
 *   arms: { y, z, len, rad, hand, rest, sink, k, zeta, chin, toss } · hat: { y, scale } · frame: the character's frame
 *   motion: { sway, bob, rate } (personality: rate is how fast poses settle) · extras(parts) -> { update, setLook }
 * }
 */
export function buildToy(ctx, design) {
  const { kit, look, size } = ctx
  const small = size !== 'big'
  const shape = makeShape(design.shape)
  const F = design.face
  const geos = [], mats = [], texs = []
  const G = (g) => (geos.push(g), g)
  const M = (m) => (mats.push(m), m)

  const object = new THREE.Group()
  const fit = new THREE.Group() // keeps a hat inside the frame
  const base = new THREE.Group() // hop, sink, shiver
  const lean = new THREE.Group() // pitch and roll around the base
  lean.position.y = shape.bottom
  const squash = new THREE.Group() // breathe, squash and stretch, around the base
  const content = new THREE.Group()
  content.position.y = -shape.bottom
  object.add(fit); fit.add(base); base.add(lean); lean.add(squash); squash.add(content)

  /* body */
  const bodyGeo = G(bodyGeometry(shape, small ? 64 : 112, small ? 40 : 72))
  const bodyMat = M(kit.solid(look.tint.body, look, { sheen: 0.35 }))
  const body = new THREE.Mesh(bodyGeo, bodyMat)
  const rimMat = M(kit.rim('#ffffff', { power: 2.6, intensity: 0.35 }))
  const rim = new THREE.Mesh(bodyGeo, rimMat)
  rim.scale.setScalar(1.006)
  content.add(body, rim)

  /* face */
  const face = faceRenderer(F.region, F, small)
  texs.push(face.texture)
  const faceMat = M(new THREE.MeshPhysicalMaterial({ map: face.texture, transparent: true, depthWrite: false, roughness: 0.32, clearcoat: 0.9, clearcoatRoughness: 0.12, emissiveMap: face.texture, emissive: new THREE.Color(0), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }))
  const faceMesh = new THREE.Mesh(G(decalGeometry(shape, F.region, 0.004)), faceMat)
  faceMesh.renderOrder = 2
  content.add(faceMesh)

  /* arms */
  // Juggled balls pass in front of the body, never through it (coordinates are the arm group's).
  const clearP = new V3()
  const clearZ = (x, y) => {
    const yb = y + shape.bottom
    if (yb >= shape.top || yb <= shape.bottom || Math.abs(x) >= shape.halfWidth(yb)) return -9
    return shape.onFront(x, yb, 0.14, clearP).z
  }
  const arms = makeArms({ kit, look, size, bodyMat, spec: design.arms, clearZ })
  lean.add(arms.group)
  // Shoulders sit toward the front of the sides (angle from straight ahead), sunk a little into the body.
  const shoulderRest = [-1, 1].map((s) => {
    const { th } = shape.front(0, design.arms.y), a = s * (design.arms.angle ?? 1.2), n = new V3()
    shape.normal(th, a, n)
    return shape.point(th, a).addScaledVector(n, -(design.arms.sink ?? 0.05))
  })
  const shoulders = [new V3(), new V3()]

  /* props */
  const zMat = M(kit.solid('#ffffff', look, { roughness: 0.4 }))
  const zs = new THREE.InstancedMesh(G(zGeometry()), zMat, 3)
  zs.frustumCulled = false
  const sparkMat = M(new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.1 }))
  const NS = 8
  const sparks = new THREE.InstancedMesh(G(sparkGeometry()), sparkMat, NS)
  sparks.frustumCulled = false
  const dropMat = M(new THREE.MeshPhysicalMaterial({ color: '#cfeaff', roughness: 0.08, clearcoat: 1, transmission: 0.2 }))
  const drop = new THREE.Mesh(G(dropGeometry()), dropMat)
  fit.add(zs, sparks)
  content.add(drop)
  // Worried: a warm glow behind the toy, so any body color reads as alarmed without turning muddy.
  const halo = kit.glowSprite(WARM, (shape.top - shape.bottom) * 2.1, 0)
  halo.position.set(0, (shape.top + shape.bottom) / 2, -0.6)
  mats.push(halo.material)
  fit.add(halo)

  /* hat + glasses */
  const hatGrp = new THREE.Group()
  const hatMat = M(kit.solid('#202430', look, { roughness: 0.4 }))
  hatMat.side = THREE.DoubleSide
  const bandMat = M(kit.solid('#ffffff', look, { roughness: 0.55 }))
  const hat = new THREE.Mesh(undefined, [hatMat, bandMat])
  hatGrp.add(hat)
  content.add(hatGrp)
  const specs = new THREE.Group()
  const specMat = M(new THREE.MeshPhysicalMaterial({ color: '#d6a54c', metalness: 1, roughness: 0.3, clearcoat: 0.6 }))
  const lensMat = M(kit.glass(look, { thickness: 0.12, roughness: 0.04, attenuationDistance: 4 }))
  const specFrame = new THREE.Mesh(undefined, specMat)
  const specLens = new THREE.Mesh(undefined, lensMat)
  specs.add(specFrame, specLens)
  content.add(specs)
  let hatKind = null, specKind = null, hatTop = 0

  /* character extras (ears, antenna, swirl, bow tie) */
  const parts = { THREE, kit, look, size, shape, content, lean, squash, base, G, M, hatGrp, bodyMat }
  const extra = design.extras ? design.extras(parts) : null

  const bodyColor = new THREE.Color(), accentColor = new THREE.Color(), blush = { inner: '', outer: '' }
  let cur = look
  function setLook(l) {
    cur = l
    paint(l.tint.body, bodyColor)
    paint(l.accent, accentColor)
    bodyMat.color.copy(bodyColor)
    kit.updateSolid(bodyMat, l)
    // Rich vinyl color: the room environment washes saturated solids toward pastel, so use less of it.
    bodyMat.envMapIntensity *= 0.35
    bodyMat.sheenColor.copy(l.dark ? l.tint.glow : new THREE.Color('#ffffff'))
    bodyMat.sheen = l.dark ? 0.5 : 0.15
    rimMat.uniforms.color.value.copy(l.dark ? l.tint.glow : new THREE.Color('#ffffff'))
    rimMat.uniforms.intensity.value = l.dark ? 0.6 : 0.3
    arms.setLook(l, bodyColor, accentColor)
    // Eyes and the rest of the print.
    faceMat.emissive.setScalar(l.eye.lit ? 0.9 : 0)
    kit.updateSolid(zMat, l)
    zMat.color.copy(l.dark ? l.tint.soft : l.tint.ink.clone().lerp(l.tint.glow, 0.35))
    const sc = [new THREE.Color('#ffd25e'), new THREE.Color('#ffffff'), l.accent]
    for (let i = 0; i < NS; i++) sparks.setColorAt(i, sc[i % 3])
    sparks.instanceColor.needsUpdate = true
    // Blush: the body pulled toward pink, softer on dark bodies.
    const b = l.tint.body.clone().lerp(new THREE.Color('#ff5d86'), 0.55)
    const c = '#' + b.getHexString()
    const a = l.tint.l < 0.4 ? 0.35 : 0.5
    blush.inner = c + Math.round(a * 255).toString(16).padStart(2, '0')
    blush.outer = c + '00'
    // Hat: deep ink of the body hue, banded in the accent.
    hatMat.color.copy(l.tint.ink).multiplyScalar(0.6)
    bandMat.color.copy(accentColor)
    kit.updateSolid(hatMat, l, { roughness: 0.4 }); kit.updateSolid(bandMat, l, { roughness: 0.55 })
    kit.updateGlass(lensMat, l, { roughness: 0.04 + 0.1 * l.frost, attenuationDistance: 4 })
    lensMat.color.setRGB(1, 1, 1).lerp(l.tint.glass, 0.2)
    if (hatKind !== l.hat) {
      hatKind = l.hat
      hat.geometry?.dispose?.()
      const h = hatGeometry(l.hat)
      hat.visible = !!h
      hat.geometry = h ? h.geo : new THREE.BufferGeometry()
      hatTop = h ? h.top * design.hat.scale : 0
      hatGrp.scale.setScalar(design.hat.scale)
      hatGrp.position.set(0.02, design.hat.y, 0)
    }
    if (specKind !== l.glasses) {
      specKind = l.glasses
      specFrame.geometry?.dispose?.(); specLens.geometry?.dispose?.()
      const g = glassesGeometry(l.glasses, shape, F)
      specs.visible = !!g
      specFrame.geometry = g ? g.frame : new THREE.BufferGeometry()
      specLens.geometry = g ? g.lens : new THREE.BufferGeometry()
    }
    extra?.setLook?.(l, { body: bodyColor, accent: accentColor, hat: hatKind !== 'none' })
    // Fit: keep a hat inside the frame.
    const fr = { height: design.frame.height, y: design.frame.y, ...(design.frame[size] || {}) }
    const frameTop = fr.y + fr.height / 2
    const need = design.hat.y + hatTop + (size === 'big' ? 0.16 : 0.02)
    if (size === 'big') {
      const lo = shape.bottom - 0.06, s = Math.min(1, (frameTop - lo) / (Math.max(need, frameTop) - lo))
      fit.scale.setScalar(s); fit.position.y = lo * (1 - s)
    } else { fit.scale.setScalar(1); fit.position.y = Math.min(0, frameTop - need) * 0.5 }
  }
  setLook(look)

  /* state */
  const pose = {}, tgt = {}
  for (const k of KEYS) pose[k] = k === 'tall' ? 1 : 0
  let lastT = null
  const mo = design.motion
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e3 = new THREE.Euler(), v3 = new V3(), s3 = new V3()
  const motion = { tilt: 0, lean: 0, y: 0, vTilt: 0, vLean: 0, vY: 0 }

  function update(f, l) {
    if (l && l !== cur) cur = l
    const snap = lastT === null || f.rm || Math.abs(f.t - f.dt - lastT) > 0.25
    lastT = f.t
    const dt = Math.min(0.1, f.dt || 1 / 60)
    const think = cur.think || 'juggle'
    bodyTarget(tgt, f, f.P, think)
    for (const k of KEYS) pose[k] = snap ? tgt[k] : ease(pose[k], tgt[k], mo.rate, dt)
    const A = f.rm ? 0 : 1, P = f.P, c = f.clock, amp = 0.75 + 0.35 * P

    // Personality: Bao sways like jelly, Reed stands still and alert, Tofu bobs in place.
    const bob = A * mo.bob * (f.mood === 'idle' || f.mood === 'talking' || f.mood === 'listening' ? 1 : f.mood === 'done' ? 0.6 : 0.25) * Math.abs(Math.sin(c * 3.1)) * (f.mood === 'talking' ? 0.6 + f.level : 1)
    const breathe = A * Math.sin(c * 1.4) * (f.mood === 'sleepy' || f.mood === 'resting' ? 0.016 : 0.01) + A * (mo.jelly || 0) * 0.014 * Math.sin(c * 2.3) * f.wob
    const sway = A * Math.sin(c * 0.9) * mo.sway * f.wob
    const hop = f.mood === 'celebrating' ? -f.bounce * 1.1 : 0
    const land = f.mood === 'celebrating' ? Math.max(0, 1 - hop / 0.05) * A : 0 // squash where the hop meets the ground

    base.position.y = hop - pose.sink * 0.6
    base.position.x = f.mood === 'worried' ? A * Math.sin(f.t * 38) * 0.007 * P : 0
    lean.rotation.x = pose.lean * amp + (f.mood === 'talking' ? A * f.level * 0.03 : 0)
    lean.rotation.z = pose.tilt * amp + sway
    const tall = pose.tall + breathe + bob * 0.05 - land * 0.07 + (hop > 0.02 ? 0.04 : 0)
    squash.scale.set(1 / Math.sqrt(tall), tall, 1 / Math.sqrt(tall))

    // How the body is moving, for springy extras (Tofu's antenna).
    const nt = lean.rotation.z, nl = lean.rotation.x, ny = base.position.y + (tall - 1) * 0.8
    if (snap) { motion.vTilt = motion.vLean = motion.vY = 0 } else { motion.vTilt = (nt - motion.tilt) / dt; motion.vLean = (nl - motion.lean) / dt; motion.vY = (ny - motion.y) / dt }
    motion.tilt = nt; motion.lean = nl; motion.y = ny

    // Worried warms whatever color the body is.
    // (a warm glow plus a light blend: blending alone turns cool colors grey)
    bodyMat.color.copy(bodyColor).lerp(WARM, 0.1 * f.warm)
    bodyMat.emissive.copy(WARM).multiplyScalar(0.14 * f.warm)
    halo.visible = f.warm > 0.02
    // Additive light reads on dark panels; on light ones it washes to white, so lay the warmth on normally there.
    halo.material.blending = cur.dark ? THREE.AdditiveBlending : THREE.NormalBlending
    halo.material.opacity = f.warm * (cur.dark ? 0.55 : 0.4) * (f.rm ? 1 : 0.85 + 0.15 * Math.sin(f.t * 3))
    rimMat.uniforms.color.value.copy(cur.dark ? cur.tint.glow : new THREE.Color('#ffffff')).lerp(WARM, f.warm * 0.85)

    face.draw(f, cur, blush)

    // Arms hang from the body's shoulders, following its squash without being stretched by it.
    const sx = squash.scale.x, sy = squash.scale.y
    for (let i = 0; i < 2; i++) { const r = shoulderRest[i]; shoulders[i].set(r.x * sx, (r.y - shape.bottom) * sy, r.z * sx) }
    arms.update(f, cur, shoulders)

    // Hat: rides the crown; tips up with the celebrating hop.
    const toss = f.mood === 'celebrating' ? Math.min(1, hop / 0.08) : 0
    hatGrp.rotation.set(0, 0, -0.06 - toss * 0.25)
    hatGrp.position.y = design.hat.y + toss * 0.18

    /* z's (sleepy) */
    const zz = f.mood === 'sleepy' ? 1 : 0
    zs.visible = zz > 0
    if (zs.visible) {
      for (let i = 0; i < 3; i++) {
        const ph = A ? (f.t * 0.22 + i / 3) % 1 : 0.15 + i * 0.3
        const s = (1.5 + ph * 1.1) * Math.min(1, Math.sin(ph * Math.PI) * 2.2) * (small ? 1.25 : 1)
        v3.set(shape.R * 0.55 + ph * 0.25, shape.top + 0.05 + ph * 0.35, 0.2)
        e3.set(0, 0, 0.25 - ph * 0.4); q.setFromEuler(e3); s3.set(s, s, s)
        zs.setMatrixAt(i, m4.compose(v3, q, s3))
      }
      zs.instanceMatrix.needsUpdate = true
    }

    /* sparkles: celebrating all along, done for a moment */
    const sparkOn = f.mood === 'celebrating' ? 1 : f.mood === 'done' ? (A ? 1 - smooth(0.6, 1.4, f.moodAge) : 0.6) : 0
    sparks.visible = sparkOn > 0.01
    if (sparks.visible) {
      for (let i = 0; i < NS; i++) {
        const a = (i / NS) * Math.PI * 2 + (A ? f.t * 0.5 : 0)
        const ph = A ? (f.t * 1.3 + i * 0.37) % 1 : 0.5
        const r = shape.R * 1.25 + 0.15 * Math.sin(i * 2.3)
        v3.set(Math.cos(a) * r, (shape.top + shape.bottom) / 2 + 0.15 + Math.sin(a) * (shape.top - shape.bottom) * 0.62, 0.25 + 0.2 * Math.sin(a))
        e3.set(0, 0, A ? f.t * 2 + i : i); q.setFromEuler(e3)
        const s = sparkOn * Math.sin(ph * Math.PI) * (small ? 1.5 : 1.1)
        s3.set(s, s, s)
        sparks.setMatrixAt(i, m4.compose(v3, q, s3))
      }
      sparks.instanceMatrix.needsUpdate = true
    }

    /* sweat drop (worried) */
    drop.visible = f.mood === 'worried'
    if (drop.visible) {
      const k = A ? (f.t * 0.6) % 1 : 0.3, x = shape.halfWidth(F.ey) * 0.78, y = F.ey + 0.12 - k * 0.12
      shape.onFront(x, y, 0.03, drop.position)
      drop.scale.setScalar((small ? 1.5 : 1.15) * Math.min(1, Math.sin(k * Math.PI) * 2.5 + 0.2))
    }

    extra?.update?.(f, { pose, dt, snap, motion, hop, cur, body: bodyMat.color })
  }

  return {
    object,
    update,
    setLook,
    dispose() {
      hat.geometry?.dispose?.(); specFrame.geometry?.dispose?.(); specLens.geometry?.dispose?.()
      for (const g of geos) g.dispose()
      for (const m of mats) m.dispose()
      for (const t of texs) t.dispose()
      zs.dispose(); sparks.dispose()
      arms.dispose()
      extra?.dispose?.()
    },
  }
}

export { mergeGeometries }
