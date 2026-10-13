// The plain Pill in three versions, each with live eyes: glass (a real lens over whatever is behind it),
// flat (one solid color) and blocky (pixels). makeView() builds one at a fixed size; view.update(state) redraws
// its eyes and body pose from an eyes.js state every frame, and view.standby(on) runs resting's slow glow.
import { vectorEyes, pixelEyes, zees, pixelZees, ZSPRITES } from './eyes.js'

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
  const backLight = kind === 'glass' && o.light // flat and blocky sit on the dark tab
  return {
    face, light,
    eye: light ? WHITE : INK,
    glint: WHITE,
    z: backLight ? darken(o.color, 0.6) : lighten(o.color, 0.55),
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
  s.textContent = '@keyframes pv-standby{0%,100%{opacity:1}50%{opacity:.45}}.pv.standby .pv-dim{animation:pv-standby 4.8s ease-in-out infinite}'
  document.head.append(s)
}

/* ---------------- views ---------------- */
let uid = 0
const bodyCss = (st, W, H) => `translate(${(st.body.tx * W).toFixed(2)}px,${(st.body.ty * H).toFixed(2)}px) rotate(${st.body.rot.toFixed(2)}deg) scale(${st.body.sc.toFixed(4)})`

/**
 * One Pill view. kind: 'glass' | 'flat' | 'blocky'. o: { color, tinted, light } where light says the desktop
 * behind a glass Pill is light. Views of 80 px wide or less show a single Z when sleepy.
 */
export function makeView(kind, W, H, o) {
  addStyles()
  const el = document.createElement('div')
  el.className = 'pv'
  el.style.cssText = `position:relative;width:${W}px;height:${H}px;flex:none`
  const view = kind === 'blocky' ? blockyView(el, W, H, o) : vectorView(kind, el, W, H, o)
  let on = false
  view.standby = (v) => { if (v !== on) { on = v; el.classList.toggle('standby', v) } }
  return view
}

function vectorView(kind, el, W, H, o) {
  const id = `pv${uid++}`
  const [vx, vy, vw, vh] = fitBox(BOX, W / H), s = W / vw
  const vb = `${vx.toFixed(2)} ${vy.toFixed(2)} ${vw.toFixed(2)} ${vh.toFixed(2)}`
  const glass = kind === 'glass', small = W <= 80
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
  const glowChain = (src) => `<feGaussianBlur in="${src}" stdDeviation="${(GEO.H * 0.06).toFixed(2)}" result="gb"/><feFlood flood-color="${glowCol}" flood-opacity=".9"/><feComposite in2="gb" operator="in" result="gl"/><feMerge><feMergeNode in="gl"/><feMergeNode in="${src}"/></feMerge>`
  const defs = `
    ${glowOn ? `<filter id="${id}e" x="-80%" y="-80%" width="260%" height="260%">${glowChain('SourceGraphic')}</filter>` : ''}
    ${glass ? `<filter id="${id}g" x="-60%" y="-250%" width="220%" height="600%" color-interpolation-filters="sRGB"><feGaussianBlur in="SourceGraphic" stdDeviation="2.6" result="bl"/><feColorMatrix in="bl" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9" result="goo"/>${glowOn ? glowChain('goo') : ''}</filter>` : ''}
    <filter id="${id}z" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="0.6"/></filter>
    <clipPath id="${id}l"><path/></clipPath><clipPath id="${id}rr"><path/></clipPath>
    <clipPath id="${id}bar"><rect/><rect/></clipPath>`
  const eyeFilter = glowOn ? `url(#${id}e)` : ''
  el.innerHTML = `<div class="pv-body" style="position:absolute;inset:0;transform-origin:50% 62%">${base}
    <svg class="pv-dim" viewBox="${vb}" style="position:absolute;inset:0;overflow:visible">
      <defs>${defs}</defs>
      <g class="open" fill="${pal.eye}"${eyeFilter ? ` filter="${eyeFilter}"` : ''}>
        <g clip-path="url(#${id}l)"><rect/></g>
        <g clip-path="url(#${id}rr)"><rect/></g>
      </g>
      <g class="shut" fill="none" stroke="${pal.eye}" stroke-linecap="round" opacity="0"${eyeFilter ? ` filter="${eyeFilter}"` : ''}><path/><path/></g>
      <g class="glint" clip-path="url(#${id}bar)" opacity="0"><ellipse fill="${pal.glint}"/></g>
      <circle class="ring" fill="none" stroke="${pal.glint}" opacity="0"/>
    </svg></div>
    <svg viewBox="${vb}" style="position:absolute;inset:0;overflow:visible;pointer-events:none">
      <g class="zz" fill="none" stroke="${pal.z}" stroke-linecap="round" stroke-linejoin="round"><path/><path/><path/></g>
    </svg>`
  const body = el.firstElementChild
  const eyeSvg = body.lastElementChild
  const open = eyeSvg.querySelector('.open'), shut = eyeSvg.querySelector('.shut')
  const groups = [...open.children], rects = groups.map((g) => g.firstElementChild)
  const clips = [eyeSvg.querySelector(`#${id}l path`), eyeSvg.querySelector(`#${id}rr path`)]
  const barRects = [...eyeSvg.querySelectorAll(`#${id}bar rect`)]
  const arcs = [...shut.children]
  const glint = eyeSvg.querySelector('.glint'), glintE = glint.firstElementChild, ring = eyeSvg.querySelector('.ring')
  const zs = [...el.querySelectorAll('.zz path')]
  let gooOn = false
  const f = (v) => v.toFixed(2)
  return {
    el,
    update(st) {
      const { eyes, merge, glint: gl } = vectorEyes(st, GEO)
      const closed = (eyes[0].closed + eyes[1].closed) / 2
      eyes.forEach((e, i) => {
        clips[i].setAttribute('d', e.clip)
        for (const r of [rects[i], barRects[i]]) {
          r.setAttribute('x', f(e.x - e.w / 2)); r.setAttribute('y', f(e.y - e.h / 2))
          r.setAttribute('width', f(e.w)); r.setAttribute('height', f(e.h)); r.setAttribute('rx', f(e.r))
        }
        groups[i].setAttribute('transform', Math.abs(e.rot) > 0.01 ? `rotate(${f(e.rot)} ${f(e.cx)} ${f(e.y)})` : '')
        if (closed > 0.01) { arcs[i].setAttribute('d', e.arc); arcs[i].setAttribute('stroke-width', f(e.arcWidth)) }
      })
      // Light eyes dim to half while merged, so the white glint still stands out on the bar.
      open.setAttribute('opacity', f((1 - closed) * (pal.light ? 1 - 0.5 * Math.min(1, merge) : 1)))
      shut.setAttribute('opacity', f(closed))
      const wantGoo = glass && merge > 0.02
      if (wantGoo !== gooOn) { gooOn = wantGoo; if (wantGoo) open.setAttribute('filter', `url(#${id}g)`); else if (eyeFilter) open.setAttribute('filter', eyeFilter); else open.removeAttribute('filter') }
      if (gl && gl.kind !== 'search') {
        glint.setAttribute('opacity', f(gl.alpha * 0.95)); ring.setAttribute('opacity', '0')
        glintE.setAttribute('cx', f(gl.x)); glintE.setAttribute('cy', f(gl.y)); glintE.setAttribute('rx', f(gl.size * 0.95)); glintE.setAttribute('ry', f(gl.size * 0.5))
      } else if (gl) {
        ring.setAttribute('opacity', f(gl.alpha)); glint.setAttribute('opacity', '0')
        ring.setAttribute('cx', f(gl.x)); ring.setAttribute('cy', f(gl.y)); ring.setAttribute('r', f(gl.size * 0.85)); ring.setAttribute('stroke-width', f(Math.max(1.4 / s, gl.size * 0.34)))
      } else { glint.setAttribute('opacity', '0'); ring.setAttribute('opacity', '0') }
      const Z = zees(st, GEO, small)
      zs.forEach((p, i) => {
        const z = Z[i]
        if (!z) { p.setAttribute('d', ''); return }
        p.setAttribute('d', zPath(z)); p.setAttribute('opacity', f(z.a)); p.setAttribute('stroke-width', f(Math.max(1.3 / s, z.s * 0.17)))
      })
      body.style.transform = bodyCss(st, W, H)
    },
  }
}

function blockyView(el, W, H, o) {
  const cols = GRID[0].length, rows = GRID.length
  // Whole pixels per cell: 3 in the 50 x 44 peek, 4 in the 64 x 54 header.
  const k = Math.max(1, Math.floor(Math.min(W / cols, (H * 0.92) / rows)))
  const ox = Math.floor((W - cols * k) / 2), oy = Math.floor((H - rows * k) / 2)
  const dpr = Math.min(3, window.devicePixelRatio || 1)
  const pal = palette('blocky', o)
  // On the bar, light eyes get a softer bar so the white highlight still shows.
  const ink = pal.eye, bar = pal.light ? lighten(o.color, 0.5) : INK, hi = pal.light ? WHITE : lighten(o.color, 0.75)
  const cv = Object.assign(document.createElement('canvas'), { width: Math.round(W * dpr), height: Math.round(H * dpr), className: 'pv-dim' })
  cv.style.cssText = `position:absolute;inset:0;width:${W}px;height:${H}px`
  const zsvg = document.createElementNS(NS, 'svg')
  zsvg.setAttribute('viewBox', `0 0 ${W} ${H}`)
  zsvg.setAttribute('shape-rendering', 'crispEdges')
  zsvg.style.cssText = `position:absolute;inset:0;width:${W}px;height:${H}px;overflow:visible;pointer-events:none`
  el.append(cv, zsvg)
  const g = cv.getContext('2d')
  const small = W <= 80
  const inBody = (x, y) => y >= 0 && y < rows && x >= 0 && x < cols && GRID[y][x] === '#'
  let last = '', lastZ = ''
  return {
    el,
    update(st) {
      // Pixels move in whole steps and never rotate or scale, or they stop looking like pixels.
      const tx = Math.round((st.body.tx * W) / k) * k, ty = Math.round((st.body.ty * H) / k) * k
      const t = `translate(${tx}px,${ty}px)`
      if (cv.style.transform !== t) cv.style.transform = t
      const cells = pixelEyes(st).filter((c) => inBody(c.x, c.y))
      const barCells = cells.length >= 8 && cells.filter((c) => c.y === 3).length >= 8
      const sig = cells.map((c) => `${c.x},${c.y},${c.hi ? 1 : 0}`).join(';')
      if (sig !== last) {
        last = sig
        g.setTransform(dpr, 0, 0, dpr, 0, 0)
        g.clearRect(0, 0, W, H)
        g.fillStyle = o.color
        for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (GRID[y][x] === '#') g.fillRect(ox + x * k, oy + y * k, k, k)
        for (const c of cells) { g.fillStyle = c.hi ? hi : barCells && c.y === 3 ? bar : ink; g.fillRect(ox + c.x * k, oy + c.y * k, k, k) }
      }
      // The Z's sit outside the Pill, on the background, in whole cells.
      const Z = pixelZees(st, small)
      const zsig = Z.map((z) => `${z.sprite}${z.x},${z.y},${z.a.toFixed(1)}`).join(';') + ty
      if (zsig !== lastZ) {
        lastZ = zsig
        zsvg.innerHTML = Z.map((z) => `<g fill="${pal.z}" opacity="${z.a.toFixed(2)}">${ZSPRITES[z.sprite].map((row, ry) => [...row].map((ch, rx) => ch === '#' ? `<rect x="${ox + (z.x + rx) * k}" y="${oy + (z.y + ry) * k + ty}" width="${k}" height="${k}"/>` : '').join('')).join('')}</g>`).join('')
      }
    },
  }
}
