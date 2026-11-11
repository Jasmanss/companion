// The Pill's colors, worked out without drawing anything (render.ts draws with them), so they're tested without a page:
// mixing and contrast, what's behind the Pill, and the fine edge a Pill gets when it's too close to that.
const WHITE = '#ffffff'

/** What a color rule reads from a view: its color, glass tint, light or dark mode, and whether it sits on the menu bar. */
export interface Shade {
  color: string
  tinted: boolean
  light: boolean
  onBar?: boolean
}

export type RGB = [number, number, number]
export const rgb = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16)
  return [n >> 16, (n >> 8) & 255, n & 255]
}
export const hex = (a: number[]) => '#' + a.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')
export const rgba = (h: string, a: number) => `rgba(${rgb(h).join(',')},${a})`
export const mix = (a: string, b: string, t: number) => {
  const x = rgb(a), y = rgb(b)
  return hex(x.map((v, i) => v + (y[i] - v) * t))
}
export const lighten = (h: string, t: number) => mix(h, WHITE, t)
export const darken = (h: string, t: number) => mix(h, '#000000', t)
export const luminance = (h: string) => {
  const c = rgb(h).map((v) => {
    v /= 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
export const contrast = (a: string, b: string) => {
  const x = luminance(a), y = luminance(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}
export function toHsl(h: string): [number, number, number] {
  const [r, g, b] = rgb(h).map((v) => v / 255), max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const hh = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [hh / 6, s, l]
}
export function fromHsl(h: number, s: number, l: number): string {
  h = ((h % 1) + 1) % 1
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q
  const f = (t: number) => {
    t = ((t % 1) + 1) % 1
    return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p
  }
  return hex([f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255])
}
/** What's right behind the Pill and its marks: about the tab at the screen edge, or the panel's glass. */
export const BACKDROP = (light: boolean) => (light ? '#ebf1f9' : '#2b3039')
/** Push a color lighter (dark mode) or darker (light mode) until it reaches the contrast asked for. */
export function onBackdrop(base: string, light: boolean, min: number): string {
  for (let t = 0.35; t <= 1.001; t += 0.05) {
    const c = light ? darken(base, t) : lighten(base, t)
    if (contrast(c, BACKDROP(light)) >= min) return c
  }
  return light ? '#111111' : '#ffffff'
}

/**
 * A Pill whose color is too close to what's behind it (silver and the pastels in light mode, graphite in dark) gets
 * a fine edge, a shade darker or lighter than itself, so it doesn't fade into the tab.
 */
export const edgeFor = (o: Shade): string | null => (contrast(o.color, BACKDROP(o.light)) < 2 ? (o.light ? darken(o.color, 0.22) : lighten(o.color, 0.22)) : null)

/** What a glass Pill roughly looks like: what's behind it, then the tint over that. */
export const glassFace = (o: Shade) => mix(BACKDROP(o.light), o.tinted ? o.color : WHITE, o.tinted ? (o.light ? 0.7 : 0.42) : o.light ? 0.16 : 0.06)

/**
 * The same rule for glass on the menu bar (the notch): within 2 to 1 of the bar, a fine edge, darker on a light bar and
 * lighter on a dark one (design/pill/render.js). The panel's glass sits on its own frost and needs none.
 */
export const glassEdgeFor = (o: Shade): string | null => {
  if (!o.onBar) return null
  const face = glassFace(o)
  return contrast(face, BACKDROP(o.light)) < 2 ? (o.light ? darken(face, 0.4) : lighten(face, 0.5)) : null
}
