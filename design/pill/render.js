// The plain Pill in three versions, each with live eyes: glass (a real lens over whatever is behind it),
// flat (one solid color) and blocky (pixels). makeView() builds one at a fixed size; view.update(state) redraws
// its eyes and body pose from an eyes.js state every frame, and view.standby(on) runs resting's slow glow.
// Marks outside the Pill (the "!", "?", sweat drop, confetti, Z's and rings) are drawn in screen pixels, so the
// 50 x 44 peek can get bigger, bolder ones than the 64 x 54 header, and they are colored against the desktop.
// Thinking draws as three dots or one thick bar (the eyes state picks).
import { vectorEyes, pixelEyes, marks, ZSPRITES, MARK_SPRITES } from './eyes.js'

/** The classic Pill in a 100 x 100 design box. */
export const GEO = { x0: 6, y0: 26, x1: 94, y1: 74, W: 88, H: 48, cx: 50, cy: 50 }
const BOX = [GEO.x0 - 2, GEO.y0 - 5, GEO.x1 + 2, GEO.y1 + 7]
const GRID = [
  '...##########...',
  '.##############.',
  '################',
  '################',
  '################',
  '################',
  '.##############.',
  '...##########...',
]
export const INK = '#1d1a2b'
const WHITE = '#ffffff'
const NS = 'http://www.w3.org/2000/svg'

/** The palette: the original six, then the rest. */
export const COLORS = [
  { name: 'Lilac', hex: '#c9bcff' }, { name: 'Sky', hex: '#94c5f5' }, { name: 'Mint', hex: '#8fe0c0' },
  { name: 'Peach', hex: '#f6ab8c' }, { name: 'Yellow', hex: '#f3d06a' }, { name: 'Pink', hex: '#ff9fc6' },
  { name: 'Ice', hex: '#d6ecff' }, { name: 'Graphite', hex: '#4a4f5c' }, { name: 'Coral', hex: '#ff7f6b' },
  { name: 'Teal', hex: '#3bbfb2' }, { name: 'Lime', hex: '#bfe85a' }, { name: 'Orange', hex: '#ff9a3d' },
  { name: 'Rose', hex: '#e8748f' }, { name: 'Silver', hex: '#c7ccd5' },
]

/* ---------------- color helpers ---------------- */
const rgb = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255] }
const hex = (a) => '#' + a.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')
const rgba = (h, a) => `rgba(${rgb(h).join(',')},${a})`
export const mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v + (y[i] - v) * t)) }
export const lighten = (h, t) => mix(h, WHITE, t)
export const darken = (h, t) => mix(h, '#000000', t)
const luminance = (h) => { const c = rgb(h).map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] }
export const contrast = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
function toHsl(h) {
  const [r, g, b] = rgb(h).map((v) => v / 255), max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const hh = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [hh / 6, s, l]
}
function fromHsl(h, s, l) {
  h = ((h % 1) + 1) % 1
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q
  const f = (t) => { t = ((t % 1) + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p }
  return hex([f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255])
}
/** The desktop right behind a mark: roughly the light or dark glass tab and wallpaper. */
const BACKDROP = (light) => (light ? '#ece9f1' : '#17181f')
/** Push a color lighter (dark desktop) or darker (light desktop) until it reaches the contrast asked for. */
function onDesktop(base, light, min) {
  for (let t = 0.35; t <= 1.001; t += 0.05) { const c = light ? darken(base, t) : lighten(base, t); if (contrast(c, BACKDROP(light)) >= min) return c }
  return light ? '#111111' : '#ffffff'
}

/** What a glass Pill roughly looks like over the desktop: the blurred backdrop, then the tint over it. */
// The tint reads stronger through the lens than its alpha suggests, so light desktops count it at 0.7.
const glassFace = (o) => mix(o.light ? '#e8e6ef' : '#1d1f2b', o.tinted ? o.color : WHITE, o.tinted ? (o.light ? 0.7 : 0.42) : (o.light ? 0.16 : 0.06))
/**
 * The eye color for a Pill, picked from how bright it is: dark ink, or white, whichever stands out more.
 * Returns { eye, light, glint, z }: z is for the Z's, which sit on the background next to the Pill, not on it.
 */
export function palette(kind, o) {
  const face = kind === 'glass' ? glassFace(o) : o.color
  const light = contrast(WHITE, face) > contrast(INK, face)
  const [h] = toHsl(o.color)
  // Marks sit on the desktop next to the Pill, so they are colored against the desktop, not the Pill.
  return {
    face, light,
    eye: light ? WHITE : INK,
    glint: WHITE,
    sym: onDesktop(o.color, o.light, 4.5),
    drop: onDesktop('#5aa9f0', o.light, 3.5),
    confetti: [0, 0.34, 0.6].map((dh) => onDesktop(fromHsl(h + dh, 0.85, o.light ? 0.45 : 0.62), o.light, 3)),
  }
}

/* ---------------- shape helpers ---------------- */
const K = 0.5523
const capsule = (x0, y0, x1, y1) => { const r = (y1 - y0) / 2, k = r * K
  return `M${x0 + r} ${y0} L${x1 - r} ${y0} C${x1 - r + k} ${y0} ${x1} ${y0 + r - k} ${x1} ${y0 + r} C${x1} ${y0 + r + k} ${x1 - r + k} ${y1} ${x1 - r} ${y1} L${x0 + r} ${y1} C${x0 + r - k} ${y1} ${x0} ${y0 + r + k} ${x0} ${y0 + r} C${x0} ${y0 + r - k} ${x0 + r - k} ${y0} ${x0 + r} ${y0} Z` }
const PATH = capsule(GEO.x0, GEO.y0, GEO.x1, GEO.y1)
function fitBox([x0, y0, x1, y1], aspect) {
  let w = x1 - x0, h = y1 - y0
  if (w / h > aspect) h = w / aspect; else w = h * aspect
  return [(x0 + x1) / 2 - w / 2, (y0 + y1) / 2 - h / 2, w, h]
}
const toPx = (path, [vx, vy], s) => { let n = 0; return path.replace(/-?\d*\.?\d+/g, (v) => ((n++ % 2 === 0 ? +v - vx : +v - vy) * s).toFixed(2)) }
/** Talking's mouth, hanging from its top line. flat 1 is wide open (flat on top, round below), 0 an "o"; h 0 a line. */
function mouthPath(x, top, w, h, flat) {
  const f = (v) => v.toFixed(2), hw = w / 2, ht = h * 0.5 * (1 - flat), y = top + ht, hb = h - ht
  return `M${f(x - hw)} ${f(y)} C${f(x - hw)} ${f(y - ht * K)} ${f(x - hw * K)} ${f(y - ht)} ${f(x)} ${f(y - ht)} C${f(x + hw * K)} ${f(y - ht)} ${f(x + hw)} ${f(y - ht * K)} ${f(x + hw)} ${f(y)} C${f(x + hw)} ${f(y + hb * K)} ${f(x + hw * K)} ${f(y + hb)} ${f(x)} ${f(y + hb)} C${f(x - hw * K)} ${f(y + hb)} ${f(x - hw)} ${f(y + hb * K)} ${f(x - hw)} ${f(y)} Z`
}
const zPath = (z) => `M${(z.x).toFixed(2)} ${(z.y).toFixed(2)} L${(z.x + z.s * 0.8).toFixed(2)} ${(z.y).toFixed(2)} L${(z.x).toFixed(2)} ${(z.y + z.s).toFixed(2)} L${(z.x + z.s * 0.8).toFixed(2)} ${(z.y + z.s).toFixed(2)}`

/* ---------------- the lens ---------------- */
// A displacement map: blur the shape's mask, take the slope, push samples outward where it is steep.
const maps = new Map()
function lensMap(path, w, h) {
  const key = `${w}x${h}`
  if (maps.has(key)) return maps.get(key)
  const P = new Path2D(path)
  const bc = Object.assign(document.createElement('canvas'), { width: w, height: h })
  const b = bc.getContext('2d', { willReadFrequently: true })
  b.fillStyle = '#000'; b.fillRect(0, 0, w, h)
  b.filter = `blur(${Math.max(1.5, Math.min(w, h) * 0.11)}px)`
  b.fillStyle = '#fff'; b.fill(P)
  const B = b.getImageData(0, 0, w, h).data
  const mc = Object.assign(document.createElement('canvas'), { width: w, height: h })
  const m = mc.getContext('2d', { willReadFrequently: true })
  m.fillStyle = '#fff'; m.fill(P)
  const M = m.getImageData(0, 0, w, h).data
  const at = (x, y) => B[(Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))) * 4]
  const gx = new Float32Array(w * h), gy = new Float32Array(w * h)
  let max = 1e-6
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x
    if (M[i * 4 + 3] < 128) continue
    gx[i] = at(x + 1, y) - at(x - 1, y); gy[i] = at(x, y + 1) - at(x, y - 1)
    max = Math.max(max, Math.hypot(gx[i], gy[i]))
  }
  const out = b.createImageData(w, h)
  for (let i = 0; i < w * h; i++) {
    const inside = M[i * 4 + 3] >= 128
    out.data[i * 4] = inside ? 128 - (gx[i] / max) * 127 : 128
    out.data[i * 4 + 1] = inside ? 128 - (gy[i] / max) * 127 : 128
    out.data[i * 4 + 2] = 128; out.data[i * 4 + 3] = 255
  }
  b.filter = 'none'; b.putImageData(out, 0, 0)
  const url = bc.toDataURL()
  maps.set(key, url)
  return url
}
function filterHost() {
  let s = document.getElementById('pill-filters')
  if (!s) {
    s = document.createElementNS(NS, 'svg')
    s.id = 'pill-filters'; s.setAttribute('width', '0'); s.setAttribute('height', '0'); s.setAttribute('aria-hidden', 'true')
    s.style.position = 'absolute'
    document.body.prepend(s)
  }
  return s
}
// Resting's standby glow is a CSS opacity animation, so it costs nothing per frame. It dims the paint layers,
// never the lens itself: an ancestor with opacity would cut the lens off from the desktop behind it.
function addStyles() {
  if (document.getElementById('pill-styles')) return
  const s = document.createElement('style')
  s.id = 'pill-styles'
  // Resting sits dimmer than idle and breathes slowly: 62% down to 36% over 6.4 seconds.
  s.textContent = '@keyframes pv-standby{0%,100%{opacity:.62}50%{opacity:.36}}.pv.standby .pv-dim{animation:pv-standby 6.4s ease-in-out infinite}'
  document.head.append(s)
}

/* ---------------- views ---------------- */
let uid = 0
const bodyCss = (st, W, H) => `translate(${(st.body.tx * W).toFixed(2)}px,${(st.body.ty * H).toFixed(2)}px) rotate(${st.body.rot.toFixed(2)}deg) scale(${st.body.sc.toFixed(4)})`

/**
 * One Pill view. kind: 'glass' | 'flat' | 'blocky'. o: { color, tinted, light, mouth } where light says the desktop
 * behind the Pill is light and mouth turns talking's mouth on. The size class follows the width: 56 px or less is
 * the peek, 80 px or less the header, anything bigger the big stage.
 */
export function makeView(kind, W, H, o) {
  addStyles()
  o = { ...o, cls: W <= 56 ? 'peek' : W <= 80 ? 'header' : 'big' }
  const el = document.createElement('div')
  el.className = 'pv'
  el.style.cssText = `position:relative;width:${W}px;height:${H}px;flex:none`
  const view = kind === 'blocky' ? blockyView(el, W, H, o) : vectorView(kind, el, W, H, o)
  let on = false
  view.standby = (v) => { if (v !== on) { on = v; el.classList.toggle('standby', v) } }
  return view
}

/** Symbol size in screen pixels for each size class, and how much heavier the strokes get. */
const markSize = (cls, pillH) => (cls === 'peek' ? 16 : cls === 'header' ? 12 : Math.round(pillH * 0.5))
const markBold = (cls) => (cls === 'peek' ? 1.3 : 1)

function vectorView(kind, el, W, H, o) {
  const id = `pv${uid++}`
  const [vx, vy, vw, vh] = fitBox(BOX, W / H), s = W / vw
  const vb = `${vx.toFixed(2)} ${vy.toFixed(2)} ${vw.toFixed(2)} ${vh.toFixed(2)}`
  const glass = kind === 'glass'
  const pal = palette(kind, o)
  let base = ''
  if (glass) {
    // The filter goes in first: Chrome does not pick up a backdrop filter that is added after its element.
    const px = toPx(PATH, [vx, vy], s)
    filterHost().insertAdjacentHTML('beforeend', `<filter id="${id}" x="0" y="0" width="${W}" height="${H}" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feImage href="${lensMap(px, W, H)}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="none" result="m"/><feDisplacementMap in="SourceGraphic" in2="m" scale="${(GEO.H * s * 0.5).toFixed(1)}" xChannelSelector="R" yChannelSelector="G"/></filter>`)
    const bf = `url(#${id}) blur(${Math.max(0.5, GEO.H * s * 0.01).toFixed(2)}px) saturate(1.7) brightness(${o.light ? 1.04 : 1.12})`
    const fill = o.tinted ? rgba(o.color, o.light ? 0.55 : 0.42) : (o.light ? 'rgba(255,255,255,.16)' : 'rgba(255,255,255,.06)')
    const G = GEO
    base = `
      <svg viewBox="${vb}" style="position:absolute;inset:0;overflow:visible"><defs><filter id="${id}b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${(G.H * 0.05).toFixed(2)}"/></filter></defs>
        <ellipse cx="${G.cx}" cy="${G.y1 + G.H * 0.04}" rx="${G.W * 0.36}" ry="${G.H * 0.07}" fill="#000" opacity="${o.light ? 0.16 : 0.35}" filter="url(#${id}b)"/></svg>
      <div style="position:absolute;inset:0;clip-path:path('${px}');backdrop-filter:${bf};-webkit-backdrop-filter:${bf}"></div>
      <svg class="pv-dim" viewBox="${vb}" style="position:absolute;inset:0;overflow:visible">
        <defs>
          <clipPath id="${id}c"><path d="${PATH}"/></clipPath>
          <linearGradient id="${id}r" gradientUnits="userSpaceOnUse" x1="0" y1="${G.y0}" x2="0" y2="${G.y1}"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".3" stop-color="#fff" stop-opacity=".18"/><stop offset=".72" stop-color="#fff" stop-opacity=".04"/><stop offset="1" stop-color="#fff" stop-opacity=".5"/></linearGradient>
          <radialGradient id="${id}s" gradientUnits="userSpaceOnUse" cx="${G.cx}" cy="${G.cy - G.H * 0.1}" r="${G.W * 0.55}"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="${o.light ? 0.12 : 0.22}"/></radialGradient>
        </defs>
        <path d="${PATH}" fill="${fill}"/>
        <path d="${PATH}" fill="url(#${id}s)"/>
        <g clip-path="url(#${id}c)">
          <path d="${PATH}" fill="none" stroke="url(#${id}r)" stroke-width="${Math.max(2.4 / s, G.H * 0.07).toFixed(2)}"/>
          <ellipse cx="${G.x0 + G.W * 0.36}" cy="${G.y0 + G.H * 0.16}" rx="${G.W * 0.2}" ry="${G.H * 0.08}" fill="#fff" opacity="${o.light ? 0.55 : 0.4}" filter="url(#${id}b)"/>
        </g>
        <path d="${PATH}" fill="none" stroke="rgba(255,255,255,${o.light ? 0.7 : 0.35})" stroke-width="${(0.9 / s).toFixed(2)}"/>
      </svg>`
  } else {
    base = `<svg class="pv-dim" viewBox="${vb}" style="position:absolute;inset:0;overflow:visible"><path d="${PATH}" fill="${o.color}"/></svg>`
  }
  // Glass eyes glow when they are light. While merging, glass eyes also go through a "goo" filter (blur, then a
  // hard alpha threshold) so the two shapes join like drops of liquid instead of just overlapping.
  const glowOn = glass && pal.light
  const glowCol = o.tinted ? lighten(o.color, 0.35) : WHITE
  // The bar's shimmer: white over a light bar; over a dark bar, the Pill's own color, softer, like light through it.
  const shCol = pal.light ? WHITE : lighten(o.color, 0.3), shMax = pal.light ? 0.9 : 0.7
  const glowChain = (src) => `<feGaussianBlur in="${src}" stdDeviation="${(GEO.H * 0.06).toFixed(2)}" result="gb"/><feFlood flood-color="${glowCol}" flood-opacity=".9"/><feComposite in2="gb" operator="in" result="gl"/><feMerge><feMergeNode in="gl"/><feMergeNode in="${src}"/></feMerge>`
  const defs = `
    ${glowOn ? `<filter id="${id}e" x="-80%" y="-80%" width="260%" height="260%">${glowChain('SourceGraphic')}</filter>` : ''}
    ${glass ? `<filter id="${id}g" x="-60%" y="-250%" width="220%" height="600%" color-interpolation-filters="sRGB"><feGaussianBlur in="SourceGraphic" stdDeviation="2.6" result="bl"/><feColorMatrix in="bl" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9" result="goo"/>${glowOn ? glowChain('goo') : ''}</filter>` : ''}
    <linearGradient id="${id}sh" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="${shCol}" stop-opacity="0"/><stop offset=".5" stop-color="${shCol}" stop-opacity="${shMax}"/><stop offset="1" stop-color="${shCol}" stop-opacity="0"/></linearGradient>
    <radialGradient id="${id}sp"><stop offset="0" stop-color="${shCol}" stop-opacity="${shMax}"/><stop offset=".45" stop-color="${shCol}" stop-opacity="${(shMax * 0.7).toFixed(2)}"/><stop offset="1" stop-color="${shCol}" stop-opacity="0"/></radialGradient>
    <clipPath id="${id}l"><path/></clipPath><clipPath id="${id}rr"><path/></clipPath>
    <clipPath id="${id}bar"><rect/><rect/></clipPath>`
  const eyeFilter = glowOn ? `url(#${id}e)` : ''
  // The marks layer works in screen pixels: P is the Pill's box in pixels, S the symbol size for this view.
  const P = { x0: (GEO.x0 - vx) * s, y0: (GEO.y0 - vy) * s, x1: (GEO.x1 - vx) * s, y1: (GEO.y1 - vy) * s }
  const ph = P.y1 - P.y0, S = markSize(o.cls, ph), bold = markBold(o.cls)
  const shoulder = { x: P.x1 - 0.293 * (ph / 2), y: P.y0 + 0.293 * (ph / 2) }
  const symAt = o.cls === 'peek' ? { x: Math.min(shoulder.x + S * 0.15, W + 1 - S * 0.3), y: shoulder.y - S * 0.62 } : { x: shoulder.x + S * 0.3, y: shoulder.y - S * 0.55 }
  const POOL = 16
  el.innerHTML = `<div class="pv-body" style="position:absolute;inset:0;transform-origin:50% 62%">${base}
    <svg class="pv-dim" viewBox="${vb}" style="position:absolute;inset:0;overflow:visible">
      <defs>${defs}</defs>
      <g class="open" fill="${pal.eye}"${eyeFilter ? ` filter="${eyeFilter}"` : ''}>
        <g clip-path="url(#${id}l)"><rect/></g>
        <g clip-path="url(#${id}rr)"><rect/></g>
        <circle class="mid" r="0"/>
      </g>
      <g class="shut" fill="none" stroke="${pal.eye}" stroke-linecap="round" opacity="0"${eyeFilter ? ` filter="${eyeFilter}"` : ''}><path/><path/></g>
      <path class="mouth" fill="${pal.eye}" stroke="${pal.eye}" stroke-linejoin="round" opacity="0"${eyeFilter ? ` filter="${eyeFilter}"` : ''}/>
      <g class="glint" clip-path="url(#${id}bar)" opacity="0"><rect fill="url(#${id}sh)"/><ellipse fill="url(#${id}sp)"/></g>
    </svg>
    <svg class="marks" viewBox="0 0 ${W} ${H}" style="position:absolute;inset:0;overflow:visible;pointer-events:none">
      <g class="rings" fill="none" stroke="${pal.sym}" stroke-linejoin="round"><path/><path/><path/></g>
      <g class="zz" fill="none" stroke="${pal.sym}" stroke-linecap="round" stroke-linejoin="round"><path/><path/><path/></g>
      <g class="conf">${Array.from({ length: POOL }, () => '<rect/>').join('')}</g>
      <g class="sym"></g>
    </svg></div>`
  const body = el.firstElementChild
  const eyeSvg = body.children[body.children.length - 2]
  const open = eyeSvg.querySelector('.open'), shut = eyeSvg.querySelector('.shut'), mouthEl = eyeSvg.querySelector('.mouth')
  const groups = [...open.children].slice(0, 2), rects = groups.map((g) => g.firstElementChild), midEl = open.querySelector('.mid')
  const clips = [eyeSvg.querySelector(`#${id}l path`), eyeSvg.querySelector(`#${id}rr path`)]
  const barRects = [...eyeSvg.querySelectorAll(`#${id}bar rect`)]
  const arcs = [...shut.children]
  const glint = eyeSvg.querySelector('.glint'), [band, spot] = [...glint.children]
  const mk = body.lastElementChild
  const ringEls = [...mk.querySelector('.rings').children], zs = [...mk.querySelector('.zz').children]
  const confEls = [...mk.querySelector('.conf').children], symG = mk.querySelector('.sym')
  let gooOn = false, symKind = ''
  const f = (v) => v.toFixed(2)
  // One corner symbol, drawn around (0, 0) at size S.
  const glyph = (kind) => {
    const w = S * 0.17 * bold
    // "!" sits in a solid badge, with the "!" in the desktop's own color: the loudest mark, for needs-you.
    if (kind === 'bang') { const cut = BACKDROP(o.light); return `<circle cx="0" cy="0" r="${f(S * 0.52)}" fill="${pal.sym}"/><rect x="${f(-S * 0.08 * bold)}" y="${f(-S * 0.33)}" width="${f(S * 0.16 * bold)}" height="${f(S * 0.4)}" rx="${f(S * 0.08 * bold)}" fill="${cut}"/><circle cx="0" cy="${f(S * 0.24)}" r="${f(S * 0.085 * bold)}" fill="${cut}"/>` }
    if (kind === 'q') return `<path d="M${f(-S * 0.27)} ${f(-S * 0.2)} C${f(-S * 0.27)} ${f(-S * 0.58)} ${f(S * 0.28)} ${f(-S * 0.6)} ${f(S * 0.28)} ${f(-S * 0.24)} C${f(S * 0.28)} ${f(-S * 0.02)} 0 ${f(-S * 0.02)} 0 ${f(S * 0.16)}" fill="none" stroke="${pal.sym}" stroke-width="${f(w * 1.2)}" stroke-linecap="round"/><circle cx="0" cy="${f(S * 0.4)}" r="${f(S * 0.12 * bold)}" fill="${pal.sym}"/>`
    return `<path d="M0 ${f(-S * 0.5)} C${f(S * 0.3)} ${f(-S * 0.1)} ${f(S * 0.34)} ${f(S * 0.08)} ${f(S * 0.34)} ${f(S * 0.2)} C${f(S * 0.34)} ${f(S * 0.42)} ${f(S * 0.16)} ${f(S * 0.54)} 0 ${f(S * 0.54)} C${f(-S * 0.16)} ${f(S * 0.54)} ${f(-S * 0.34)} ${f(S * 0.42)} ${f(-S * 0.34)} ${f(S * 0.2)} C${f(-S * 0.34)} ${f(S * 0.08)} ${f(-S * 0.3)} ${f(-S * 0.1)} 0 ${f(-S * 0.5)} Z" fill="${pal.drop}"/>`
  }
  const slide = o.cls === 'peek' ? 6 : o.cls === 'header' ? 10 : ph * 0.5
  return {
    el,
    update(st) {
      const { eyes, merge, dots, shimmer: sh, mouth } = vectorEyes(st, GEO)
      const closed = (eyes[0].closed + eyes[1].closed) / 2
      eyes.forEach((e, i) => {
        clips[i].setAttribute('d', e.clip)
        for (const r of [rects[i], barRects[i]]) {
          r.setAttribute('x', f(e.x - e.w / 2)); r.setAttribute('y', f(e.y - e.h / 2))
          r.setAttribute('width', f(e.w)); r.setAttribute('height', f(e.h)); r.setAttribute('rx', f(e.r))
        }
        groups[i].setAttribute('transform', Math.abs(e.rot) > 0.01 ? `rotate(${f(e.rot)} ${f(e.cx)} ${f(e.y)})` : '')
        groups[i].setAttribute('opacity', f(e.a))
        if (closed > 0.01) { arcs[i].setAttribute('d', e.arc); arcs[i].setAttribute('stroke-width', f(e.arcWidth)) }
      })
      // Light eyes dim to half while merged, so the white glint still stands out on the bar.
      open.setAttribute('opacity', f((1 - closed) * (pal.light ? 1 - 0.5 * Math.min(1, merge) : 1)))
      shut.setAttribute('opacity', f(closed))
      const wantGoo = glass && merge > 0.02
      if (wantGoo !== gooOn) { gooOn = wantGoo; if (wantGoo) open.setAttribute('filter', `url(#${id}g)`); else if (eyeFilter) open.setAttribute('filter', eyeFilter); else open.removeAttribute('filter') }
      // Thinking in dots: the middle dot grows in between the other two.
      if (dots) { midEl.setAttribute('cx', f(dots.mid.x)); midEl.setAttribute('cy', f(dots.mid.y)); midEl.setAttribute('r', f(Math.max(0, dots.mid.r))); midEl.setAttribute('opacity', f(dots.mid.a)) }
      else midEl.setAttribute('r', '0')
      // Thinking as a bar: a soft band (or, searching, a round spot) slides inside it, clipped to the bar's shape.
      if (sh) {
        glint.setAttribute('opacity', f(sh.alpha))
        const spotOn = sh.kind === 'search'
        band.setAttribute('x', f(sh.x - sh.w / 2)); band.setAttribute('y', f(sh.y0 - 2)); band.setAttribute('width', f(spotOn ? 0 : sh.w)); band.setAttribute('height', f(sh.h + 4))
        spot.setAttribute('cx', f(sh.x)); spot.setAttribute('cy', f(sh.y)); spot.setAttribute('rx', f(spotOn ? sh.h * 0.8 : 0)); spot.setAttribute('ry', f(spotOn ? sh.h * 0.8 : 0))
      } else glint.setAttribute('opacity', '0')
      if (mouth && o.mouth) {
        // The mouth gets wider at the small sizes so it still reads at 50 x 44. Its stroke turns a closed mouth into a
        // rounded line, and it never grows past the Pill's bottom edge.
        const kz = o.cls === 'peek' ? 1.3 : o.cls === 'header' ? 1.12 : 1
        const lw = Math.max(GEO.H * 0.05, (o.cls === 'peek' ? 1.7 : 1.6) / s) * Math.min(1, mouth.talk * 1.5)
        const top = mouth.top + lw / 2, room = GEO.y1 - GEO.H * 0.06 - lw / 2 - top
        mouthEl.setAttribute('opacity', '1')
        mouthEl.setAttribute('d', mouthPath(mouth.x, top, mouth.w * kz, Math.min(mouth.h * kz, Math.max(0, room)), mouth.flat))
        mouthEl.setAttribute('stroke-width', f(lw))
      } else mouthEl.setAttribute('opacity', '0')

      // Marks outside the Pill.
      const M = marks(st, { cls: o.cls, mouth: o.mouth, glass })
      ringEls.forEach((p, i) => {
        const r = M.rings[i]
        if (!r) { p.setAttribute('d', ''); return }
        const reach = r.kind === 'call' ? ph * (o.cls === 'peek' ? 0.55 : 0.45) : ph * 0.35
        const d = 1.5 + r.u * reach
        p.setAttribute('d', capsule(P.x0 - d, P.y0 - d, P.x1 + d, P.y1 + d))
        p.setAttribute('opacity', f(r.a))
        p.setAttribute('stroke-width', f(r.kind === 'call' ? S * 0.13 * bold : 1.6 * (1 - r.u * 0.5)))
      })
      zs.forEach((p, i) => {
        const z = M.zs[i]
        if (!z) { p.setAttribute('d', ''); return }
        const zs2 = S * 0.62 * z.size, x = symAt.x + z.x * S - zs2 / 2, y = symAt.y + z.y * S - zs2 / 2
        p.setAttribute('d', `M${f(x)} ${f(y)} L${f(x + zs2 * 0.8)} ${f(y)} L${f(x)} ${f(y + zs2)} L${f(x + zs2 * 0.8)} ${f(y + zs2)}`)
        p.setAttribute('opacity', f(z.a)); p.setAttribute('stroke-width', f(Math.max(1.3, zs2 * 0.17 * bold)))
      })
      confEls.forEach((r, i) => {
        const c = M.confetti[i]
        if (!c) { r.setAttribute('width', '0'); return }
        const cz = o.cls === 'peek' ? 1.45 : o.cls === 'header' ? 1.1 : 1
        const w = c.shape === 'dot' ? S * 0.17 * cz : S * 0.24 * cz, hh = c.shape === 'dot' ? w : S * 0.13 * cz
        // Small views keep the confetti close to the corner, where it has room and stays visible.
        const reach = o.cls === 'peek' ? 0.5 : o.cls === 'header' ? 0.65 : 1
        const x = symAt.x + c.x * S * reach, y = symAt.y + 0.25 * S + c.y * S * reach
        r.setAttribute('x', f(x - w / 2)); r.setAttribute('y', f(y - hh / 2)); r.setAttribute('width', f(w)); r.setAttribute('height', f(hh))
        r.setAttribute('rx', f(c.shape === 'dot' ? w / 2 : hh * 0.3)); r.setAttribute('fill', pal.confetti[c.c]); r.setAttribute('opacity', f(c.a))
        r.setAttribute('transform', `rotate(${f(c.rot)} ${f(x)} ${f(y)})`)
      })
      const sym = M.symbol
      if (!sym) { if (symKind) { symG.innerHTML = ''; symKind = '' } }
      else {
        if (sym.kind !== symKind) { symG.innerHTML = glyph(sym.kind); symKind = sym.kind }
        const y = symAt.y + (sym.kind === 'drop' ? sym.dy * slide : 0)
        symG.setAttribute('transform', `translate(${f(symAt.x)} ${f(y)}) rotate(${f(sym.rot)}) scale(${f(Math.max(0, sym.s))})`)
        symG.setAttribute('opacity', f(sym.a))
      }
      body.style.transform = bodyCss(st, W, H)
    },
  }
}

/* ---------------- blocky ---------------- */
// The body grid, tilted: at an angle, the capsule is drawn again on the pixel grid rather than rotated, so it stays
// crisp. Blocky tilts half again as far as the others, or a few degrees would not move a single pixel.
const tilted = new Map()
function bodyCells(angle) {
  if (tilted.has(angle)) return tilted.get(angle)
  if (!angle) {
    const cells = []
    GRID.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] === '#') cells.push([x, y]) })
    tilted.set(0, cells)
    return cells
  }
  const a = (angle * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a)
  const rot = ([x, y]) => [8 + (x - 8) * c - (y - 4) * sn, 4 + (x - 8) * sn + (y - 4) * c]
  const [ax, ay] = rot([4, 4]), [bx, by] = rot([12, 4])
  const cells = []
  for (let y = -3; y < 11; y++) for (let x = -2; x < 18; x++) {
    const px = x + 0.5, py = y + 0.5, dx = bx - ax, dy = by - ay
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    if (Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) <= 3.85) cells.push([x, y])
  }
  tilted.set(angle, cells)
  return cells
}
/** The ring of cells exactly d steps outside a set of cells (cached per body and distance). */
const rings = new WeakMap()
function outline(cells, d) {
  const memo = rings.get(cells) ?? new Map()
  rings.set(cells, memo)
  if (memo.has(d)) return memo.get(d)
  const key = (x, y) => x + ',' + y, inside = new Set(cells.map(([x, y]) => key(x, y))), out = []
  const xs = cells.map((c) => c[0]), ys = cells.map((c) => c[1])
  for (let y = Math.min(...ys) - d; y <= Math.max(...ys) + d; y++) for (let x = Math.min(...xs) - d; x <= Math.max(...xs) + d; x++) {
    if (inside.has(key(x, y))) continue
    let best = Infinity
    for (const [cx, cy] of cells) best = Math.min(best, Math.max(Math.abs(cx - x), Math.abs(cy - y)))
    if (best === d) out.push([x, y])
  }
  memo.set(d, out)
  return out
}

function blockyView(el, W, H, o) {
  const cols = GRID[0].length, rows = GRID.length
  // Whole pixels per cell: 3 in the 50 x 44 peek, 4 in the 64 x 54 header.
  const k = Math.max(1, Math.floor(Math.min(W / cols, (H * 0.92) / rows)))
  const ox = Math.floor((W - cols * k) / 2), oy = Math.floor((H - rows * k) / 2)
  const dpr = Math.min(3, window.devicePixelRatio || 1)
  const pal = palette('blocky', o)
  // On the bar, light eyes get a softer bar so the white shimmer still shows. Unlit thinking dots sit half way to the Pill.
  const ink = pal.eye, bar = pal.light ? lighten(o.color, 0.5) : INK, hi = pal.light ? WHITE : mix(INK, o.color, 0.78)
  const soft = mix(bar, hi, 0.5), dim = mix(ink, o.color, 0.62)
  const colorOf = (c) => (c.bar ? (c.hi >= 1 ? hi : c.hi > 0 ? soft : bar) : c.dim ? dim : ink)
  const cv = Object.assign(document.createElement('canvas'), { width: Math.round(W * dpr), height: Math.round(H * dpr), className: 'pv-dim' })
  cv.style.cssText = `position:absolute;inset:0;width:${W}px;height:${H}px;overflow:visible`
  const msvg = document.createElementNS(NS, 'svg')
  msvg.setAttribute('viewBox', `0 0 ${W} ${H}`)
  msvg.setAttribute('shape-rendering', 'crispEdges')
  msvg.style.cssText = `position:absolute;inset:0;width:${W}px;height:${H}px;overflow:visible;pointer-events:none`
  el.append(cv, msvg)
  const g = cv.getContext('2d')
  // Marks use their own pixel size: 3 in the peek, 2 in the header (so the peek's are bigger), a body cell when big.
  const sp = o.cls === 'peek' ? 3 : o.cls === 'header' ? 2 : Math.max(2, Math.round(k * 0.6))
  const SET = o.cls === 'peek' ? { ...MARK_SPRITES, ...MARK_SPRITES.bold } : MARK_SPRITES
  const Spx = sp * 5
  const corner = { x: ox + 13 * k, y: oy + Math.round(0.4 * k) }
  // Blocky fills the view's width, so a sliding drop has only the space above the Pill: it slides a little less.
  const slide = o.cls === 'peek' ? 3 : o.cls === 'header' ? 4 : rows * k * 0.35
  let last = '', lastM = ''
  return {
    el,
    update(st) {
      const angle = Math.max(-12, Math.min(12, Math.round((st.body.rot * 1.5) / 4) * 4))
      const body = bodyCells(angle)
      const inBody = new Set(body.map(([x, y]) => x + ',' + y))
      // Pixels move in whole steps and never rotate or scale, or they stop looking like pixels.
      const tx = Math.round((st.body.tx * W) / k) * k, ty = Math.round((st.body.ty * H) / k) * k
      const t = `translate(${tx}px,${ty}px)`
      if (cv.style.transform !== t) { cv.style.transform = t; msvg.style.transform = t }
      const cells = pixelEyes(st, { mouth: o.mouth }).filter((c) => inBody.has(c.x + ',' + c.y))
      const sig = angle + '|' + cells.map((c) => `${c.x},${c.y},${colorOf(c)}`).join(';')
      if (sig !== last) {
        last = sig
        g.setTransform(dpr, 0, 0, dpr, 0, 0)
        g.clearRect(0, 0, W, H)
        g.fillStyle = o.color
        for (const [x, y] of body) g.fillRect(ox + x * k, oy + y * k, k, k)
        for (const c of cells) { g.fillStyle = colorOf(c); g.fillRect(ox + c.x * k, oy + c.y * k, k, k) }
      }
      // Marks: pixel sprites outside the Pill, in whole mark pixels.
      const M = marks(st, { cls: o.cls, mouth: o.mouth, glass: false })
      const snap = (v) => Math.round(v / sp) * sp
      let html = ''
      const sprite = (rowsS, x, y, col, a) => {
        let r = ''
        rowsS.forEach((row, ry) => [...row].forEach((ch, rx) => { if (ch === '#') r += `<rect x="${x + rx * sp}" y="${y + ry * sp}" width="${sp}" height="${sp}"/>` }))
        return `<g fill="${col}" opacity="${a.toFixed(2)}">${r}</g>`
      }
      const place = (rowsS) => ({ x: o.cls === 'peek' ? Math.min(corner.x, W + 1 - rowsS[0].length * sp) : corner.x, y: corner.y - rowsS.length * sp })
      for (const r of M.rings) {
        const d = r.kind === 'call' ? 1 + Math.round(r.u * 2) : 1
        html += `<g fill="${pal.sym}" opacity="${r.a.toFixed(2)}">${outline(body, d).map(([x, y]) => `<rect x="${ox + x * k}" y="${oy + y * k}" width="${k}" height="${k}"/>`).join('')}</g>`
      }
      for (const z of M.zs) {
        const name = o.cls === 'big' ? (z.size < 0.75 ? 'z3' : z.size < 0.95 ? 'z4' : 'z5') : o.cls === 'peek' ? 'z4' : 'z3'
        const at = place(ZSPRITES[name])
        html += sprite(ZSPRITES[name], snap(at.x + z.x * Spx), snap(at.y + z.y * Spx), pal.sym, z.a)
      }
      for (const c of M.confetti) {
        // Pieces are two mark pixels wide (one for dots), so they show even in the peek.
        const w = c.shape === 'dot' ? sp : sp * 2
        const reach = o.cls === 'peek' ? 0.55 : o.cls === 'header' ? 0.7 : 1
        html += `<rect x="${snap(Math.min(corner.x + c.x * Spx * reach, W + 1 - w))}" y="${snap(corner.y - Spx * 0.2 + c.y * Spx * reach)}" width="${w}" height="${sp}" fill="${pal.confetti[c.c]}" opacity="${c.a.toFixed(2)}"/>`
      }
      if (M.symbol) {
        const rowsS = SET[M.symbol.kind], at = place(rowsS)
        const lift = M.symbol.kind === 'drop' ? snap(M.symbol.dy * slide) : M.symbol.s < 0.6 ? sp : 0
        html += sprite(rowsS, snap(at.x), snap(at.y) + lift, M.symbol.kind === 'drop' ? pal.drop : pal.sym, M.symbol.a)
        // The badge's "!" is cut out: its holes are filled with the desktop's color.
        if (M.symbol.kind === 'bang') html += sprite(rowsS.map((r, i) => (i === 0 || i === rowsS.length - 1 ? r.replace(/./g, '.') : r.replace(/#/g, ' ').replace(/\./g, '#').replace(/ /g, '.'))), snap(at.x), snap(at.y) + lift, BACKDROP(o.light), M.symbol.a)
      }
      if (html !== lastM) { lastM = html; msvg.innerHTML = html }
    },
  }
}
