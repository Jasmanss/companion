// Colors for the toy family. Each preset is a hand-tuned palette; any other hex derives a full palette the same way
// a designer would: a warmer, lighter highlight, a cooler, deeper shade, a pink-leaning blush, and a hue-tinted ink.
// Lessons kept from the 3D studio: light colors need a deeper shade than dark ones, and derived tones get a small
// saturation lift so they don't go grey.
//
// A palette: { key, name, body, light, shade, deep, blush, eye, h, s, l }
//   body: the toy's color · light: highlight · shade: the side turning away · deep: shadow under the toy and fine lines
//   blush: cheeks · eye: the default ink for eyes and mouth

/* ---------------- color math (sRGB hex in and out) ---------------- */
const clamp01 = (v) => Math.min(1, Math.max(0, v))
export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
export const rgbToHex = ([r, g, b]) => '#' + [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')
export function hexToHsl(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h / 6, s, l]
}
export function hsl(h, s, l) {
  h = ((h % 1) + 1) % 1; s = clamp01(s); l = clamp01(l)
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q
  const f = (t) => { t = ((t % 1) + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p }
  return rgbToHex([f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255])
}
export function mix(a, b, t) { const x = hexToRgb(a), y = hexToRgb(b); return rgbToHex(x.map((v, i) => v + (y[i] - v) * t)) }
export function rgba(hex, a) { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})` }
/** WCAG relative luminance and contrast ratio (3:1 is the floor for big shapes like eyes). */
export function luminance(hex) { const c = hexToRgb(hex).map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] }
export function contrast(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
/** Move hue h toward target by amt (0..1 of the way), along the short way round. */
function toward(h, target, amt) { let d = target - h; d -= Math.round(d); return h + d * amt }
export const isHex = (s) => typeof s === 'string' && /^#[0-9a-f]{6}$/i.test(s)

/* ---------------- presets ---------------- */
// Flat style: one solid body color per toy, so each preset is a single mid-tone tuned to look good on its own on light
// and dark panels, with a shade (nubs in front of the body), a deep (props, hats, fine marks) and an eye ink to match.
// light and blush are kept for completeness; the flat drawing doesn't use them.
export const PRESETS = {
  ice: { name: 'Ice', body: '#8ec3f2', light: '#dcefff', shade: '#6fa5dc', deep: '#2c5a8f', blush: '#ffa3c4', eye: '#10223a' },
  lilac: { name: 'Lilac', body: '#a99cf0', light: '#ece8ff', shade: '#8c7fe0', deep: '#4b3f9e', blush: '#ff9fd0', eye: '#1b1440' },
  mint: { name: 'Mint', body: '#7dd3b0', light: '#dcf8ec', shade: '#5fba96', deep: '#1f7356', blush: '#ff9fb2', eye: '#0d2a21' },
  peach: { name: 'Peach', body: '#f2a37f', light: '#ffe6da', shade: '#de8864', deep: '#a04b2a', blush: '#ff7e8c', eye: '#3a170c' },
  graphite: { name: 'Graphite', body: '#40444e', light: '#7c8290', shade: '#33363f', deep: '#1c1e24', blush: '#f08aa8', eye: '#11141a' },
  butter: { name: 'Butter', body: '#f4cf55', light: '#fff3c6', shade: '#e1b83a', deep: '#9a7210', blush: '#ff9a82', eye: '#2e2008' },
  rose: { name: 'Rose', body: '#f2b8d8', light: '#ffe8f3', shade: '#e39cc3', deep: '#a04f7f', blush: '#ff6b98', eye: '#3a0e22' },
  sky: { name: 'Sky', body: '#6c86e3', light: '#d6defb', shade: '#5a72cf', deep: '#2b3d92', blush: '#ffa0c4', eye: '#0b1640' },
  coral: { name: 'Coral', body: '#df6b62', light: '#ffd0cb', shade: '#c9574f', deep: '#8e2a24', blush: '#ffc4b4', eye: '#2e0c06' },
  sage: { name: 'Sage', body: '#9dbd90', light: '#e6f2df', shade: '#86a879', deep: '#4b6a40', blush: '#f5a3a3', eye: '#172614' },
  cream: { name: 'Cream', body: '#ede3cd', light: '#fffbf2', shade: '#dccfb3', deep: '#998865', blush: '#f6a9a1', eye: '#2a2114' },
}
export const PRESET_KEYS = Object.keys(PRESETS)

/** A palette from a preset key or any '#rrggbb'. */
export function tint(key) {
  if (!isHex(key)) {
    const p = PRESETS[key] ?? PRESETS.ice, k = PRESETS[key] ? key : 'ice'
    const [h, s, l] = hexToHsl(p.body)
    return { key: k, ...p, h, s, l }
  }
  const body = key.toLowerCase()
  const [h, s, l] = hexToHsl(body)
  const grey = s < 0.1
  // Light colors need a deeper shade than dark ones, or the toy loses its roundness and reads as a flat sticker.
  const shadeL = l - (0.09 + 0.17 * l)
  return {
    key: body, name: 'Custom', body, h, s, l,
    light: hsl(grey ? h : toward(h, 0.13, 0.12), s * 0.85, l + (1 - l) * 0.62),
    shade: hsl(grey ? h : toward(h, 0.68, 0.08), Math.min(1, s * 1.08), shadeL),
    deep: hsl(grey ? h : toward(h, 0.7, 0.14), Math.min(1, s * 1.1), Math.max(0.08, l * 0.48)),
    blush: hsl(grey ? 0.96 : toward(h, 0.96, 0.8), 0.85, Math.min(0.8, Math.max(0.62, l * 0.55 + 0.36))),
    eye: hsl(h, Math.min(0.45, s * 0.6), 0.1),
  }
}

/* ---------------- eyes and accents ---------------- */
export const EYE_PRESETS = [['auto', 'Auto'], ['ink', 'Ink'], ['white', 'White'], ['glow', 'Glow'], ['warm', 'Warm']]
const WHITE = '#fbfcff'
/**
 * Eye color for a palette. auto picks ink or white, whichever reads better on the body; glow and warm adapt their
 * lightness to the body so they stay readable; ink, white and custom are kept as chosen, and the contrast is reported.
 */
export function eyeFor(p, choice = 'auto') {
  const darkBody = luminance(p.body) < 0.25
  let hex, lit = false, key = choice
  if (isHex(choice)) hex = choice.toLowerCase()
  else if (choice === 'ink') hex = p.eye
  else if (choice === 'white') hex = WHITE
  else if (choice === 'glow') { hex = darkBody ? hsl(p.h, Math.max(0.75, p.s), 0.76) : hsl(p.h + 0.5, 0.85, 0.34); lit = true }
  else if (choice === 'warm') hex = darkBody ? '#ffc261' : '#4a2716'
  else { key = 'auto'; hex = contrast(p.eye, p.body) >= contrast(WHITE, p.body) ? p.eye : WHITE }
  return { key, hex, lit, light: luminance(hex) > 0.4, contrast: contrast(hex, p.body) }
}
/** A second color for hands, the bow tie, the bobble and hat bands: the body hue turned around, set apart in lightness. */
export function accentFor(p, choice = 'auto') {
  if (isHex(choice)) return choice.toLowerCase()
  if (p.s < 0.1) return hsl(0.02, 0.75, p.l > 0.5 ? 0.6 : 0.68) // grey bodies get coral
  const l = p.l > 0.62 ? p.l - 0.16 : p.l + 0.16
  return hsl(p.h + 0.42, Math.min(0.85, Math.max(0.5, p.s)), Math.min(0.8, Math.max(0.4, l)))
}
/** A pleasing random body, eye and accent: soft-toy saturation and lightness, nothing muddy, nothing low contrast. */
export function randomCombo(rand = Math.random) {
  for (let tries = 0; tries < 60; tries++) {
    const h = rand(), band = rand()
    let s, l
    if (band < 0.45) { s = 0.55 + rand() * 0.35; l = 0.74 + rand() * 0.1 } // pastel
    else if (band < 0.85) { s = 0.55 + rand() * 0.3; l = 0.58 + rand() * 0.1 } // mid
    else { s = 0.4 + rand() * 0.25; l = 0.3 + rand() * 0.12 } // deep
    if (h > 0.1 && h < 0.2 && l < 0.6) continue // olive and brown read as dirty on a toy
    const body = hsl(h, s, l), p = tint(body)
    const eye = ['auto', 'auto', 'auto', 'glow', 'warm', 'ink', 'white'][Math.floor(rand() * 7)]
    if (eyeFor(p, eye).contrast < 3.5) continue
    // Accent: auto, a neighbor hue, or a split complement, near the body's lightness so it never shouts.
    const accent = rand() < 0.5 ? 'auto' : hsl(h + [0.08, -0.08, 0.42, 0.58][Math.floor(rand() * 4)], 0.5 + rand() * 0.2, l > 0.6 ? l - 0.16 : l + 0.16)
    const ac = contrast(accentFor(p, accent), body)
    if (ac < 1.25 || ac > 4) continue
    return { body, eye, accent }
  }
  return { body: 'peach', eye: 'auto', accent: 'auto' }
}
