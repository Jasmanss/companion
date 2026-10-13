// Drawing for the toy family: flat, minimal shapes on a 2D canvas. One solid color per toy, no outlines, gradients or
// highlights; the eyes (two small pills, set toward the side the toy faces) carry the expression. A character is drawn
// in its own "body space": x centered, y down, the ground at y = 0. The canvas transform maps body space to pixels for
// each size (big, header 64x54, peek 50x44), so every shape is drawn once.
import { mix, rgba } from './color.js'
import { ease } from './face.js'

const TAU = Math.PI * 2
const sgnPow = (v, p) => Math.sign(v) * Math.pow(Math.abs(v), p)
const smooth = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k) }

/* ---------------- body outline: a superellipse with its own top and bottom roundness ---------------- */
/**
 * b: { a (half width), hT, hB (height above and below the widest line), mT, mB (2 round, higher flatter), taper,
 *      lumps: [[k, amp, phase], ...] (a hand-drawn irregularity: sine bumps around the rim, so it isn't a perfect shape) }
 */
export function bodyShape(b) {
  const yc = -b.hB, top = -(b.hB + b.hT)
  const taper = (yUp) => 1 - (b.taper || 0) * (yUp >= 0 ? yUp / b.hT : yUp / b.hB)
  const lump = (th) => (b.lumps || []).reduce((s, [k, amp, ph]) => s + amp * Math.sin(k * th + ph), 0)
  /** Half width at body-space height y (ignores lumps, which are small). */
  function halfWidth(y) {
    const yUp = yc - y, up = yUp >= 0, m = up ? b.mT : b.mB, h = up ? b.hT : b.hB
    const s = Math.min(1, Math.pow(Math.min(1, Math.abs(yUp) / h), m / 2)), c = Math.sqrt(1 - s * s)
    return b.a * Math.pow(c, 2 / m) * taper(yUp)
  }
  /** The outline, with an optional soft wobble (jelly) on top of the lumps. */
  function path(wob = 0, clock = 0, N = 120) {
    const p = new Path2D()
    for (let i = 0; i <= N; i++) {
      const th = (i / N) * TAU, c = Math.cos(th), s = Math.sin(th), up = s >= 0, m = up ? b.mT : b.mB, h = up ? b.hT : b.hB
      const yUp = h * sgnPow(s, 2 / m)
      const d = 1 + lump(th) + wob * (0.016 * Math.sin(2 * th + clock * 1.2) + 0.01 * Math.sin(3 * th - clock * 1.7))
      const x = b.a * sgnPow(c, 2 / m) * taper(yUp) * d, y = yc - yUp * d
      i ? p.lineTo(x, y) : p.moveTo(x, y)
    }
    p.closePath()
    return p
  }
  return { halfWidth, path, top, yc, box: [-b.a, top, b.a, 0] }
}

/* ---------------- arms: flat nubs ---------------- */
/** A short round nub from the shoulder to the hand. Behind the body it merges into the silhouette; in front it's a
 *  half shade darker so it stays visible against the body. */
export function drawArm(g, arm, rad, hand, col, lod) {
  const [x0, y0] = arm.root, [x1, y1] = arm.hand
  const r = rad * (lod ? 1.3 : 1), hr = hand * (lod ? 1.2 : 1)
  g.save()
  g.strokeStyle = g.fillStyle = col
  g.lineCap = 'round'
  g.lineWidth = r * 2
  g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke()
  const sq = 1 - 0.12 * arm.ch.grip.x
  g.translate(x1, y1)
  g.rotate(Math.atan2(y1 - y0, x1 - x0) - Math.PI / 2 + arm.s * arm.ch.wave.x)
  g.beginPath(); g.ellipse(0, hr * 0.1, hr * sq, hr * 0.94 * sq, 0, 0, TAU); g.fill()
  g.restore()
}

/* ---------------- the face: two small pills ---------------- */
/**
 * F: { gx (where the face looks from: the eyes sit toward that side), ey, ex (half the gap between eyes), ew, eh
 *      (half width and height of one eye), tilt (the eyes' lean), my, mw (mouth, only for moods that need one) }
 * Eyes come only from the face state: open, blink, droop, happy, pulse, lookX/lookY, spark (and the mood for worry).
 */
export function drawFace(g, F, f, look, lod) {
  const eye = look.eye, col = eye.hex
  const big = lod ? 1.35 : 1
  const ew = F.ew * big, eh = F.eh * big
  // Small eyes carry the whole expression, so they travel further than a big face's would.
  const dx = f.lookX * F.ex * 1.15, dy = f.lookY * F.eh * 0.95
  const worried = f.mood === 'worried' ? 1 : 0
  const wide = f.mood === 'needs-you' || f.mood === 'listening' ? 1 : 0
  const sc = (1 + 0.1 * worried) * (1 + 0.1 * f.pulse)
  const open = Math.max(0.08, f.open * f.blink)
  const happy = f.happy
  const cx0 = F.gx + dx, cy = F.ey + dy
  g.save()
  g.fillStyle = g.strokeStyle = col
  g.lineCap = 'round'
  if (eye.lit) { g.shadowColor = col; g.shadowBlur = ew * 2.2 * Math.abs(g.getTransform().a || 1) }
  for (const s of [-1, 1]) {
    const cx = cx0 + s * F.ex * (lod ? 1.08 : 1)
    g.save()
    g.translate(cx, cy)
    // Pills lean the way the face turns; worry tips the inner ends up.
    g.rotate(F.tilt + s * 0.28 * worried)
    g.scale(sc, sc)
    const hh = eh * open * (1 - happy) * (1 + 0.12 * wide)
    // Resting: relaxed closed eyes, a soft downward curve. (Half-lidded pills read as grumpy at this size.)
    const rest = f.mood === 'resting' ? Math.min(1, f.droop * 2.4) : 0
    if (rest > 0.02) {
      g.save()
      g.globalAlpha *= rest
      g.lineWidth = ew * 1.15
      g.beginPath(); g.arc(0, -eh * 0.25, eh * 0.55, Math.PI * 0.2, Math.PI * 0.8); g.stroke()
      g.restore()
    }
    if (hh > eh * 0.04 && rest < 0.98) {
      g.save()
      if (f.droop > 0.01) {
        // Heavy lids: cut the top off the pill along a flat lid line.
        const top = -eh * Math.min(1.15, open)
        g.beginPath(); g.rect(-ew * 3, top + 2 * eh * Math.min(1.15, open) * f.droop, ew * 6, eh * 4); g.clip()
      }
      g.beginPath()
      if (look.eyes === 'dots') { const r = ew * 1.25; g.ellipse(0, 0, r, Math.max(r * 0.2, Math.min(r * 1.05, hh * 0.8)), 0, 0, TAU) }
      else if (look.eyes === 'arcs') { const r = ew * 1.3, ah = Math.max(r * 0.2, hh * 0.95); g.ellipse(0, ah * 0.5, r, ah, 0, Math.PI, TAU); g.closePath() }
      else { const h2 = Math.max(ew * 0.5, hh); g.roundRect(-ew, -h2, ew * 2, h2 * 2, ew) }
      g.fill()
      g.restore()
    }
    // Happy: the pill folds into a small upward arc.
    if (happy > 0.02) {
      g.save()
      g.globalAlpha *= Math.min(1, happy * 1.4)
      g.lineWidth = ew * 1.25
      g.beginPath(); g.arc(0, eh * 0.55, eh * 0.62, Math.PI * 1.15, Math.PI * 1.85); g.stroke()
      g.restore()
    }
    g.restore()
  }
  // A mouth only where it carries the mood: talking, a small "o" for needs-you, an open smile when celebrating.
  const mx = cx0 + F.ex * 0.1, my = F.my + dy * 0.6, mw = F.mw * big
  g.shadowColor = 'transparent'
  if (f.mood === 'talking') { const ry = Math.max(mw * 0.18, f.level * mw * 0.75); g.beginPath(); g.ellipse(mx, my, mw * 0.5, ry, F.tilt * 0.5, 0, TAU); g.fill() }
  else if (f.mood === 'needs-you') { g.beginPath(); g.ellipse(mx, my, mw * 0.3, mw * 0.38, 0, 0, TAU); g.fill() }
  else if (f.mood === 'celebrating') { g.beginPath(); g.moveTo(mx - mw * 0.7, my - mw * 0.2); g.quadraticCurveTo(mx, my + mw * 1.1, mx + mw * 0.7, my - mw * 0.2); g.closePath(); g.fill() }
  else if (f.mood === 'sleepy' && !f.rm) { const yawn = Math.max(0, Math.sin(f.t * 0.55)) ** 6; if (yawn > 0.05) { g.beginPath(); g.ellipse(mx, my, mw * 0.3 * yawn + mw * 0.1, mw * 0.6 * yawn, 0, 0, TAU); g.fill() } }
  g.restore()
}

/* ---------------- props (flat) ---------------- */
export function starPath(g, x, y, r) {
  g.moveTo(x, y - r); g.quadraticCurveTo(x + r * 0.18, y - r * 0.18, x + r, y); g.quadraticCurveTo(x + r * 0.18, y + r * 0.18, x, y + r)
  g.quadraticCurveTo(x - r * 0.18, y + r * 0.18, x - r, y); g.quadraticCurveTo(x - r * 0.18, y - r * 0.18, x, y - r)
}
/** Worried: a warm disc behind the toy that breathes, so any body color reads as alarmed. */
export function halo(g, cx, cy, r, warm, dark, t, rm) {
  if (warm < 0.02) return
  const k = rm ? 1 : 1 + 0.04 * Math.sin(t * 3)
  g.fillStyle = `rgba(255,160,70,${warm * (dark ? 0.24 : 0.17)})`
  g.beginPath(); g.arc(cx, cy, r * k, 0, TAU); g.fill()
}
export function zees(g, x, y, f, col, lod) {
  g.save()
  g.strokeStyle = col
  g.lineCap = g.lineJoin = 'round'
  for (let i = 0; i < (lod ? 2 : 3); i++) {
    const ph = f.rm ? 0.2 + i * 0.3 : (f.t * 0.22 + i / 3) % 1
    const s = (lod ? 0.16 : 0.1) * (0.8 + ph * 0.7)
    const zx = x + ph * 0.28, zy = y - ph * 0.4
    g.globalAlpha = Math.min(1, Math.sin(ph * Math.PI) * 2.2)
    g.lineWidth = s * (lod ? 0.34 : 0.26)
    g.beginPath(); g.moveTo(zx - s / 2, zy - s / 2); g.lineTo(zx + s / 2, zy - s / 2); g.lineTo(zx - s / 2, zy + s / 2); g.lineTo(zx + s / 2, zy + s / 2); g.stroke()
  }
  g.restore()
}
export function sparkles(g, cx, cy, rx, ry, amt, f, cols, lod) {
  if (amt < 0.01) return
  const n = lod ? 4 : 7
  g.save()
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + (f.rm ? 0 : f.t * 0.5)
    const ph = f.rm ? 0.5 : (f.t * 1.3 + i * 0.37) % 1
    const s = amt * Math.sin(ph * Math.PI) * (lod ? 0.13 : 0.08)
    g.fillStyle = cols[i % cols.length]
    g.beginPath(); starPath(g, cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, s); g.fill()
  }
  g.restore()
}
export function sweat(g, x, y, f, lod) {
  const k = f.rm ? 0.3 : (f.t * 0.6) % 1, s = (lod ? 0.12 : 0.075) * Math.min(1, Math.sin(k * Math.PI) * 2.5 + 0.25)
  const yy = y + k * 0.1
  g.fillStyle = '#8fd0ff'
  g.beginPath(); g.moveTo(x, yy - s * 1.3); g.quadraticCurveTo(x + s * 0.95, yy, x, yy + s * 0.7); g.quadraticCurveTo(x - s * 0.95, yy, x, yy - s * 1.3); g.fill()
}
export function dot(g, x, y, r, col) { g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill() }

/* ---------------- accessories (optional, flat) ---------------- */
export function drawHat(g, kind, x, y, w, ink, accent, tip) {
  if (kind !== 'bowler' && kind !== 'top') return
  g.save()
  g.translate(x, y)
  g.rotate(-0.08 - tip)
  g.fillStyle = ink
  g.beginPath(); g.ellipse(0, 0, w * 0.6, w * 0.08, 0, 0, TAU); g.fill()
  if (kind === 'bowler') { g.beginPath(); g.ellipse(0, -w * 0.02, w * 0.38, w * 0.38, 0, Math.PI, TAU); g.fill() }
  else { g.beginPath(); g.roundRect(-w * 0.32, -w * 0.7, w * 0.64, w * 0.7, [w * 0.06, w * 0.06, 0, 0]); g.fill() }
  g.fillStyle = accent
  g.fillRect(kind === 'bowler' ? -w * 0.38 : -w * 0.32, -w * (kind === 'bowler' ? 0.11 : 0.17), w * (kind === 'bowler' ? 0.76 : 0.64), w * 0.08)
  g.restore()
}
export function drawGlasses(g, kind, F, ink, lod) {
  if (kind !== 'round' && kind !== 'half-moon') return
  const R = F.eh * (lod ? 1.5 : 1.3), y = F.ey + (kind === 'half-moon' ? F.eh * 0.25 : 0)
  g.save()
  g.lineWidth = R * (lod ? 0.22 : 0.16)
  g.strokeStyle = ink
  for (const s of [-1, 1]) {
    g.beginPath()
    if (kind === 'half-moon') { g.arc(F.gx + s * F.ex, y, R, 0, Math.PI); g.closePath() } else g.arc(F.gx + s * F.ex, y, R, 0, TAU)
    g.stroke()
  }
  g.beginPath(); g.moveTo(F.gx - F.ex + R, y); g.lineTo(F.gx + F.ex - R, y); g.stroke()
  g.restore()
}

export { ease, smooth, TAU, mix, rgba }
