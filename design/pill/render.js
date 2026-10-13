// The plain Pill in three versions, each with live eyes: glass (a real lens over whatever is behind it),
// flat (one solid color) and blocky (pixels). makeView() builds one at a fixed size; view.update(state) redraws
// its eyes and body pose from an eyes.js state every frame.
import { vectorEyes, pixelEyes } from './eyes.js'

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
const NS = 'http://www.w3.org/2000/svg'

/* ---------------- color and shape helpers ---------------- */
const rgb = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255] }
const rgba = (h, a) => `rgba(${rgb(h).join(',')},${a})`
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

/* ---------------- views ---------------- */
let uid = 0
const bodyCss = (st, W, H) => `translate(${(st.body.tx * W).toFixed(2)}px,${(st.body.ty * H).toFixed(2)}px) rotate(${st.body.rot.toFixed(2)}deg) scale(${st.body.sc.toFixed(4)})`

/**
 * One Pill view. kind: 'glass' | 'flat' | 'blocky'. o: { color, tinted, light } where light says the desktop
 * behind a glass Pill is light (its eyes turn dark there to stay readable).
 */
export function makeView(kind, W, H, o) {
  const el = document.createElement('div')
  el.className = 'pv'
  el.style.cssText = `position:relative;width:${W}px;height:${H}px;flex:none`
  return kind === 'blocky' ? blockyView(el, W, H, o) : vectorView(kind, el, W, H, o)
}

function vectorView(kind, el, W, H, o) {
  const id = `pv${uid++}`
  const [vx, vy, vw, vh] = fitBox(BOX, W / H), s = W / vw
  const vb = `${vx.toFixed(2)} ${vy.toFixed(2)} ${vw.toFixed(2)} ${vh.toFixed(2)}`
  const glass = kind === 'glass'
  const lightEyes = glass && !o.light
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
      <svg viewBox="${vb}" style="position:absolute;inset:0;overflow:visible">
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
    base = `<svg viewBox="${vb}" style="position:absolute;inset:0;overflow:visible"><path d="${PATH}" fill="${o.color}"/></svg>`
  }
  const eyeCol = lightEyes ? '#ffffff' : INK
  const glow = lightEyes ? `<filter id="${id}e" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="${(GEO.H * 0.06).toFixed(2)}" result="b"/><feFlood flood-color="${o.tinted ? o.color : '#ffffff'}" flood-opacity=".9"/><feComposite in2="b" operator="in" result="g"/><feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge></filter>` : ''
  el.innerHTML = `<div class="pv-body" style="position:absolute;inset:0;transform-origin:50% 62%">${base}
    <svg viewBox="${vb}" style="position:absolute;inset:0;overflow:visible">
      <defs>${glow}<clipPath id="${id}l"><path/></clipPath><clipPath id="${id}rr"><path/></clipPath></defs>
      <g${glow ? ` filter="url(#${id}e)"` : ''} fill="${eyeCol}">
        <g clip-path="url(#${id}l)"><rect/></g>
        <g clip-path="url(#${id}rr)"><rect/></g>
      </g>
    </svg></div>`
  const body = el.firstElementChild
  const clips = [el.querySelector(`#${id}l path`), el.querySelector(`#${id}rr path`)]
  const groups = [...el.querySelectorAll(`g[clip-path]`)].slice(-2)
  const rects = groups.map((g) => g.firstElementChild)
  return {
    el,
    update(st) {
      vectorEyes(st, GEO).forEach((e, i) => {
        clips[i].setAttribute('d', e.clip)
        const r = rects[i]
        r.setAttribute('x', (e.x - e.w / 2).toFixed(2)); r.setAttribute('y', (e.y - e.h / 2).toFixed(2))
        r.setAttribute('width', e.w.toFixed(2)); r.setAttribute('height', e.h.toFixed(2)); r.setAttribute('rx', e.r.toFixed(2))
        groups[i].setAttribute('transform', Math.abs(e.rot) > 0.01 ? `rotate(${e.rot.toFixed(2)} ${e.x.toFixed(2)} ${e.y.toFixed(2)})` : '')
      })
      body.style.transform = bodyCss(st, W, H)
    },
  }
}

function blockyView(el, W, H, o) {
  const cols = GRID[0].length, rows = GRID.length
  const k = Math.max(1, Math.floor(Math.min((W * 0.92) / cols, (H * 0.92) / rows)))
  const ox = Math.floor((W - cols * k) / 2), oy = Math.floor((H - rows * k) / 2)
  const dpr = Math.min(3, window.devicePixelRatio || 1)
  const cv = Object.assign(document.createElement('canvas'), { width: Math.round(W * dpr), height: Math.round(H * dpr) })
  cv.style.cssText = `position:absolute;inset:0;width:${W}px;height:${H}px;transform-origin:50% 62%`
  el.append(cv)
  const g = cv.getContext('2d')
  const inBody = (x, y) => y >= 0 && y < rows && GRID[y][x] === '#'
  let last = ''
  return {
    el,
    update(st) {
      // Pixels move in whole steps and never rotate or scale, or they stop looking like pixels.
      cv.style.transform = `translate(${Math.round(st.body.tx * W / k) * k}px,${Math.round(st.body.ty * H / k) * k}px)`
      const eyes = pixelEyes(st).filter(([x, y]) => inBody(x, y))
      const sig = eyes.join(';')
      if (sig === last) return
      last = sig
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      g.clearRect(0, 0, W, H)
      g.fillStyle = o.color
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (GRID[y][x] === '#') g.fillRect(ox + x * k, oy + y * k, k, k)
      g.fillStyle = INK
      for (const [x, y] of eyes) g.fillRect(ox + x * k, oy + y * k, k, k)
    },
  }
}
