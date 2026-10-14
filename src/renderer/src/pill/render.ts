// The Pill in three versions, each with live eyes: glass (a tinted lens), flat (one solid color) and blocky
// (pixels). makeView() builds one at a fixed size; view.update(state) redraws its eyes and body from an eyes.ts
// state every frame, and view.standby(on) runs resting's slow glow. Ported from design/pill/render.js.
//
// The design's glass bent whatever was behind it (an SVG displacement lens). In the app there's nothing behind it
// to bend: the tab at the screen edge is solid, and the panel's frost is drawn by macOS outside the page. So the
// lens is left out, and glass is the tint, the shading, the rim and the shine, over the frost or the tab.
//
// Marks outside the Pill (the "!", sweat drop, confetti, Z's and rings) are drawn in screen pixels, so the tab at
// the screen edge can get bigger, bolder ones than the panel's header, and they're colored against what's behind.
//
// In the notch (lit), the black notch is the body: only the eyes are drawn, lit in the Pill's color, and the marks
// are colored for black. From design/notch/notch.js.
import { MARK_SPRITES, marks, pixelEyes, ZSPRITES, vectorEyes, type Cell, type EyesState, type SizeClass } from './eyes'

/** The classic Pill in a 100 x 100 design box. */
const GEO = { x0: 6, y0: 26, x1: 94, y1: 74, W: 88, H: 48, cx: 50, cy: 50 }
const BOX: [number, number, number, number] = [GEO.x0 - 2, GEO.y0 - 5, GEO.x1 + 2, GEO.y1 + 7]
const GRID = ['...##########...', '.##############.', '################', '################', '################', '################', '.##############.', '...##########...']
const INK = '#1d1a2b'
const WHITE = '#ffffff'
const NS = 'http://www.w3.org/2000/svg'

export type PillKind = 'glass' | 'flat' | 'blocky'
export interface ViewOptions {
  /** The Pill's color, as #rrggbb. */
  color: string
  /** Glass only: tinted with the color, or clear. */
  tinted: boolean
  /** Light mode: what's behind the Pill is light. */
  light: boolean
  /** Talking shows a mouth. */
  mouth: boolean
  /** peek: the tab at the screen edge (bigger, bolder marks) · header: the panel · big: Settings' preview. */
  cls: SizeClass
  /** In the notch: just the eyes, lit in the color, on black. */
  lit?: boolean
  /** Where the corner symbol goes, in view pixels: its center, or for blocky its sprite's bottom left. */
  symAt?: { x: number; y: number }
  /** The symbol's size (vector) and blocky's mark pixel, instead of the size class's. */
  markSize?: number
  markPx?: number
}
export interface PillView {
  el: HTMLElement
  update(st: EyesState): void
  standby(on: boolean): void
}

/* ---------------- color helpers ---------------- */
type RGB = [number, number, number]
const rgb = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16)
  return [n >> 16, (n >> 8) & 255, n & 255]
}
const hex = (a: number[]) => '#' + a.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')
const rgba = (h: string, a: number) => `rgba(${rgb(h).join(',')},${a})`
export const mix = (a: string, b: string, t: number) => {
  const x = rgb(a), y = rgb(b)
  return hex(x.map((v, i) => v + (y[i] - v) * t))
}
const lighten = (h: string, t: number) => mix(h, WHITE, t)
const darken = (h: string, t: number) => mix(h, '#000000', t)
const luminance = (h: string) => {
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
function toHsl(h: string): [number, number, number] {
  const [r, g, b] = rgb(h).map((v) => v / 255), max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const hh = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [hh / 6, s, l]
}
function fromHsl(h: number, s: number, l: number): string {
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
function onBackdrop(base: string, light: boolean, min: number): string {
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
const edgeFor = (o: ViewOptions): string | null => (contrast(o.color, BACKDROP(o.light)) < 2 ? (o.light ? darken(o.color, 0.22) : lighten(o.color, 0.22)) : null)

/** What a glass Pill roughly looks like: what's behind it, then the tint over that. */
const glassFace = (o: ViewOptions) => mix(BACKDROP(o.light), o.tinted ? o.color : WHITE, o.tinted ? (o.light ? 0.7 : 0.42) : o.light ? 0.16 : 0.06)

export interface Palette {
  face: string
  /** Lit in the notch: the color the eyes glow in. */
  lit?: string
  /** The face is light enough for white eyes. */
  light: boolean
  eye: string
  /** Marks sit next to the Pill, so they're colored against what's behind it, not the Pill. */
  sym: string
  drop: string
  confetti: string[]
}
/** The eye color for a Pill, picked from how bright it is: dark ink, or white, whichever stands out more. */
/** On black (the notch), push a color lighter until it reaches the contrast asked for. */
function onBlack(base: string, min: number): string {
  for (let t = 0; t <= 1.001; t += 0.05) {
    const c = lighten(base, t)
    if (contrast(c, '#000000') >= min) return c
  }
  return WHITE
}

export function palette(kind: PillKind, o: ViewOptions): Palette {
  // Lit in the notch: the body is the black notch, and the Pill's color becomes the light of its eyes.
  if (o.lit) {
    const lit = onBlack(o.color, 4.5), [hl] = toHsl(o.color)
    return {
      face: '#000000',
      light: true,
      lit,
      eye: kind === 'glass' ? lighten(lit, 0.5) : lit,
      sym: onBlack(o.color, 7),
      drop: onBlack('#5aa9f0', 4.5),
      confetti: [0, 0.34, 0.6].map((dh) => onBlack(fromHsl(hl + dh, 0.85, 0.62), 4.5)),
    }
  }
  const face = kind === 'glass' ? glassFace(o) : o.color
  const light = contrast(WHITE, face) > contrast(INK, face)
  const [h] = toHsl(o.color)
  return {
    face,
    light,
    eye: light ? WHITE : INK,
    sym: onBackdrop(o.color, o.light, 4.5),
    drop: onBackdrop('#5aa9f0', o.light, 3.5),
    confetti: [0, 0.34, 0.6].map((dh) => onBackdrop(fromHsl(h + dh, 0.85, o.light ? 0.45 : 0.62), o.light, 3)),
  }
}

/* ---------------- shape helpers ---------------- */
const K = 0.5523
const capsule = (x0: number, y0: number, x1: number, y1: number) => {
  const r = (y1 - y0) / 2, k = r * K
  return `M${x0 + r} ${y0} L${x1 - r} ${y0} C${x1 - r + k} ${y0} ${x1} ${y0 + r - k} ${x1} ${y0 + r} C${x1} ${y0 + r + k} ${x1 - r + k} ${y1} ${x1 - r} ${y1} L${x0 + r} ${y1} C${x0 + r - k} ${y1} ${x0} ${y0 + r + k} ${x0} ${y0 + r} C${x0} ${y0 + r - k} ${x0 + r - k} ${y0} ${x0 + r} ${y0} Z`
}
const PATH = capsule(GEO.x0, GEO.y0, GEO.x1, GEO.y1)
function fitBox([x0, y0, x1, y1]: [number, number, number, number], aspect: number): [number, number, number, number] {
  let w = x1 - x0, h = y1 - y0
  if (w / h > aspect) h = w / aspect
  else w = h * aspect
  return [(x0 + x1) / 2 - w / 2, (y0 + y1) / 2 - h / 2, w, h]
}
/** Talking's mouth, hanging from its top line. flat 1 is wide open (flat on top, round below), 0 an "o"; h 0 a line. */
function mouthPath(x: number, top: number, w: number, h: number, flat: number): string {
  const f = (v: number) => v.toFixed(2), hw = w / 2, ht = h * 0.5 * (1 - flat), y = top + ht, hb = h - ht
  return `M${f(x - hw)} ${f(y)} C${f(x - hw)} ${f(y - ht * K)} ${f(x - hw * K)} ${f(y - ht)} ${f(x)} ${f(y - ht)} C${f(x + hw * K)} ${f(y - ht)} ${f(x + hw)} ${f(y - ht * K)} ${f(x + hw)} ${f(y)} C${f(x + hw)} ${f(y + hb * K)} ${f(x + hw * K)} ${f(y + hb)} ${f(x)} ${f(y + hb)} C${f(x - hw * K)} ${f(y + hb)} ${f(x - hw)} ${f(y + hb * K)} ${f(x - hw)} ${f(y)} Z`
}

/* ---------------- views ---------------- */
let uid = 0
const bodyCss = (st: EyesState, W: number, H: number) => `translate(${(st.body.tx * W).toFixed(2)}px,${(st.body.ty * H).toFixed(2)}px) scale(${st.body.sc.toFixed(4)})`

/** One Pill view, W x H pixels. */
export function makeView(kind: PillKind, W: number, H: number, o: ViewOptions): PillView {
  const el = document.createElement('div')
  el.className = 'pv'
  el.style.cssText = `position:relative;width:${W}px;height:${H}px;flex:none`
  const view = kind === 'blocky' ? blockyView(el, W, H, o) : vectorView(kind, el, W, H, o)
  let on = false
  return {
    el,
    update: view.update,
    // Resting's standby glow is a CSS animation (styles.css), so it costs nothing per frame.
    standby(v: boolean) {
      if (v === on) return
      on = v
      el.classList.toggle('standby', v)
    },
  }
}

/** Symbol size in screen pixels for each size class (16 in the small tab), and how much heavier the strokes get. */
const markSize = (cls: SizeClass, pillH: number) => (cls === 'peek' ? Math.round(pillH * 0.613) : cls === 'header' ? 12 : Math.round(pillH * 0.5))
const markBold = (cls: SizeClass) => (cls === 'peek' ? 1.3 : 1)

function vectorView(kind: PillKind, el: HTMLElement, W: number, H: number, o: ViewOptions): { update(st: EyesState): void } {
  const id = `pv${uid++}`
  const [vx, vy, vw, vh] = fitBox(BOX, W / H), s = W / vw
  const vb = `${vx.toFixed(2)} ${vy.toFixed(2)} ${vw.toFixed(2)} ${vh.toFixed(2)}`
  const glass = kind === 'glass'
  const pal = palette(kind, o)
  const G = GEO
  let base: string
  if (o.lit) base = ''
  else if (glass) {
    const fill = o.tinted ? rgba(o.color, o.light ? 0.55 : 0.42) : o.light ? 'rgba(255,255,255,.16)' : 'rgba(255,255,255,.06)'
    base = `
      <svg viewBox="${vb}" style="position:absolute;inset:0;overflow:visible"><defs><filter id="${id}b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${(G.H * 0.05).toFixed(2)}"/></filter></defs>
        <ellipse cx="${G.cx}" cy="${G.y1 + G.H * 0.04}" rx="${G.W * 0.36}" ry="${G.H * 0.07}" fill="#000" opacity="${o.light ? 0.16 : 0.35}" filter="url(#${id}b)"/></svg>
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
    const edge = edgeFor(o)
    const stroke = edge ? ` stroke="${edge}" stroke-width="${(1.3 / s).toFixed(2)}"` : ''
    base = `<svg class="pv-dim" viewBox="${vb}" style="position:absolute;inset:0;overflow:visible"><path d="${PATH}" fill="${o.color}"${stroke}/></svg>`
  }
  // Glass eyes glow when they're light.
  const glowOn = glass && pal.light
  const glowCol = pal.lit ?? (o.tinted ? lighten(o.color, 0.35) : WHITE)
  const eyeFilter = glowOn ? ` filter="url(#${id}e)"` : ''
  const defs = `
    ${glowOn ? `<filter id="${id}e" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur in="SourceGraphic" stdDeviation="${(G.H * (o.lit ? 0.085 : 0.06)).toFixed(2)}" result="gb"/><feFlood flood-color="${glowCol}" flood-opacity=".9"/><feComposite in2="gb" operator="in" result="gl"/><feMerge><feMergeNode in="gl"/><feMergeNode in="SourceGraphic"/></feMerge></filter>` : ''}
    <clipPath id="${id}l"><path/></clipPath><clipPath id="${id}rr"><path/></clipPath>`
  // The marks layer works in screen pixels: P is the Pill's box in pixels, S the symbol size for this view.
  const P = { x0: (G.x0 - vx) * s, y0: (G.y0 - vy) * s, x1: (G.x1 - vx) * s, y1: (G.y1 - vy) * s }
  const ph = P.y1 - P.y0, S = o.markSize ?? markSize(o.cls, ph), bold = markBold(o.cls)
  const shoulder = { x: P.x1 - 0.293 * (ph / 2), y: P.y0 + 0.293 * (ph / 2) }
  const symAt = o.symAt ?? (o.cls === 'peek' ? { x: Math.min(shoulder.x + S * 0.15, W + 1 - S * 0.3), y: shoulder.y - S * 0.62 } : { x: shoulder.x + S * 0.3, y: shoulder.y - S * 0.55 })
  const POOL = 16
  el.innerHTML = `<div class="pv-body" style="position:absolute;inset:0;transform-origin:50% 62%">${base}
    <svg class="pv-dim" viewBox="${vb}" style="position:absolute;inset:0;overflow:visible">
      <defs>${defs}</defs>
      <g class="open" fill="${pal.eye}"${eyeFilter}>
        <g clip-path="url(#${id}l)"><rect/></g>
        <g clip-path="url(#${id}rr)"><rect/></g>
        <circle class="mid" r="0"/>
      </g>
      <g class="shut" fill="none" stroke="${pal.eye}" stroke-linecap="round" opacity="0"${eyeFilter}><path/><path/></g>
      <path class="mouth" fill="${pal.eye}" stroke="${pal.eye}" stroke-linejoin="round" opacity="0"${eyeFilter}/>
    </svg>
    <svg class="marks" viewBox="0 0 ${W} ${H}" style="position:absolute;inset:0;overflow:visible;pointer-events:none">
      <g class="rings" fill="none" stroke="${pal.sym}" stroke-linejoin="round"><path/><path/><path/></g>
      <g class="zz" fill="none" stroke="${pal.sym}" stroke-linecap="round" stroke-linejoin="round"><path/><path/><path/></g>
      <g class="conf">${Array.from({ length: POOL }, () => '<rect/>').join('')}</g>
      <g class="sym"></g>
    </svg></div>`
  const body = el.firstElementChild as HTMLElement
  const eyeSvg = body.children[body.children.length - 2] as SVGSVGElement
  const open = eyeSvg.querySelector('.open')!, shut = eyeSvg.querySelector('.shut')!, mouthEl = eyeSvg.querySelector('.mouth')!
  const groups = [...open.children].slice(0, 2), rects = groups.map((g) => g.firstElementChild!), midEl = open.querySelector('.mid')!
  const clips = [eyeSvg.querySelector(`#${id}l path`)!, eyeSvg.querySelector(`#${id}rr path`)!]
  const arcs = [...shut.children]
  const mk = body.lastElementChild!
  const ringEls = [...mk.querySelector('.rings')!.children], zs = [...mk.querySelector('.zz')!.children]
  const confEls = [...mk.querySelector('.conf')!.children], symG = mk.querySelector('.sym')!
  let symKind = ''
  const f = (v: number) => v.toFixed(2)
  // One corner symbol, drawn around (0, 0) at size S.
  const glyph = (kind: 'bang' | 'drop') => {
    // "!" sits in a solid badge, with the "!" in the backdrop's own color: the loudest mark, for needs-you.
    if (kind === 'bang') {
      const cut = o.lit ? '#000000' : BACKDROP(o.light)
      return `<circle cx="0" cy="0" r="${f(S * 0.52)}" fill="${pal.sym}"/><rect x="${f(-S * 0.08 * bold)}" y="${f(-S * 0.33)}" width="${f(S * 0.16 * bold)}" height="${f(S * 0.4)}" rx="${f(S * 0.08 * bold)}" fill="${cut}"/><circle cx="0" cy="${f(S * 0.24)}" r="${f(S * 0.085 * bold)}" fill="${cut}"/>`
    }
    return `<path d="M0 ${f(-S * 0.5)} C${f(S * 0.3)} ${f(-S * 0.1)} ${f(S * 0.34)} ${f(S * 0.08)} ${f(S * 0.34)} ${f(S * 0.2)} C${f(S * 0.34)} ${f(S * 0.42)} ${f(S * 0.16)} ${f(S * 0.54)} 0 ${f(S * 0.54)} C${f(-S * 0.16)} ${f(S * 0.54)} ${f(-S * 0.34)} ${f(S * 0.42)} ${f(-S * 0.34)} ${f(S * 0.2)} C${f(-S * 0.34)} ${f(S * 0.08)} ${f(-S * 0.3)} ${f(-S * 0.1)} 0 ${f(-S * 0.5)} Z" fill="${pal.drop}"/>`
  }
  const slide = o.cls === 'peek' ? 6 : o.cls === 'header' ? 10 : ph * 0.5
  return {
    update(st: EyesState) {
      const { eyes, dots, mouth } = vectorEyes(st, GEO)
      const closed = (eyes[0].closed + eyes[1].closed) / 2
      eyes.forEach((e, i) => {
        clips[i].setAttribute('d', e.clip)
        const r = rects[i]
        r.setAttribute('x', f(e.x - e.w / 2))
        r.setAttribute('y', f(e.y - e.h / 2))
        r.setAttribute('width', f(e.w))
        r.setAttribute('height', f(e.h))
        r.setAttribute('rx', f(e.r))
        groups[i].setAttribute('opacity', f(e.a))
        if (closed > 0.01) {
          arcs[i].setAttribute('d', e.arc)
          arcs[i].setAttribute('stroke-width', f(e.arcWidth))
        }
      })
      open.setAttribute('opacity', f(1 - closed))
      shut.setAttribute('opacity', f(closed))
      // Thinking: the middle dot grows in between the other two.
      if (dots) {
        midEl.setAttribute('cx', f(dots.mid.x))
        midEl.setAttribute('cy', f(dots.mid.y))
        midEl.setAttribute('r', f(Math.max(0, dots.mid.r)))
        midEl.setAttribute('opacity', f(dots.mid.a))
      } else midEl.setAttribute('r', '0')
      if (mouth && o.mouth) {
        // The mouth gets wider at the small sizes so it still reads in the tab. Its stroke turns a closed mouth into a
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
        const r = o.lit ? undefined : M.rings[i]
        if (!r) return p.setAttribute('d', '')
        const reach = r.kind === 'call' ? ph * (o.cls === 'peek' ? 0.55 : 0.45) : ph * 0.35
        const d = 1.5 + r.u * reach
        p.setAttribute('d', capsule(P.x0 - d, P.y0 - d, P.x1 + d, P.y1 + d))
        p.setAttribute('opacity', f(r.a))
        p.setAttribute('stroke-width', f(r.kind === 'call' ? S * 0.13 * bold : 1.6 * (1 - r.u * 0.5)))
      })
      zs.forEach((p, i) => {
        const z = M.zs[i]
        if (!z) return p.setAttribute('d', '')
        const size = S * 0.62 * z.size, x = symAt.x + z.x * S - size / 2, y = symAt.y + z.y * S - size / 2
        p.setAttribute('d', `M${f(x)} ${f(y)} L${f(x + size * 0.8)} ${f(y)} L${f(x)} ${f(y + size)} L${f(x + size * 0.8)} ${f(y + size)}`)
        p.setAttribute('opacity', f(z.a))
        p.setAttribute('stroke-width', f(Math.max(1.3, size * 0.17 * bold)))
      })
      confEls.forEach((r, i) => {
        const c = M.confetti[i]
        if (!c) return r.setAttribute('width', '0')
        const cz = o.cls === 'peek' ? 1.45 : o.cls === 'header' ? 1.1 : 1
        const w = c.shape === 'dot' ? S * 0.17 * cz : S * 0.24 * cz, hh = c.shape === 'dot' ? w : S * 0.13 * cz
        // Small views keep the confetti close to the corner, where it has room and stays visible.
        const reach = o.cls === 'peek' ? 0.5 : o.cls === 'header' ? 0.65 : 1
        const x = symAt.x + c.x * S * reach, y = symAt.y + 0.25 * S + c.y * S * reach
        r.setAttribute('x', f(x - w / 2))
        r.setAttribute('y', f(y - hh / 2))
        r.setAttribute('width', f(w))
        r.setAttribute('height', f(hh))
        r.setAttribute('rx', f(c.shape === 'dot' ? w / 2 : hh * 0.3))
        r.setAttribute('fill', pal.confetti[c.c])
        r.setAttribute('opacity', f(c.a))
        r.setAttribute('transform', `rotate(${f(c.rot)} ${f(x)} ${f(y)})`)
      })
      const sym = M.symbol
      if (!sym) {
        if (symKind) {
          symG.innerHTML = ''
          symKind = ''
        }
      } else {
        if (sym.kind !== symKind) {
          symG.innerHTML = glyph(sym.kind)
          symKind = sym.kind
        }
        const y = symAt.y + (sym.kind === 'drop' ? sym.dy * slide : 0)
        symG.setAttribute('transform', `translate(${f(symAt.x)} ${f(y)}) scale(${f(Math.max(0, sym.s))})`)
        symG.setAttribute('opacity', f(sym.a))
      }
      body.style.transform = bodyCss(st, W, H)
    },
  }
}

/* ---------------- blocky ---------------- */
const BODY: [number, number][] = GRID.flatMap((row, y) => [...row].flatMap((ch, x): [number, number][] => (ch === '#' ? [[x, y]] : [])))
const INSIDE = new Set(BODY.map(([x, y]) => x + ',' + y))
/** The body's outermost cells, which take the edge color when the Pill needs one. */
const RIM = BODY.filter(([x, y]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !INSIDE.has(x + dx + ',' + (y + dy))))
/** The ring of cells exactly d steps outside the body (cached per distance). */
const rings = new Map<number, [number, number][]>()
function outline(d: number): [number, number][] {
  const memo = rings.get(d)
  if (memo) return memo
  const out: [number, number][] = []
  for (let y = -d; y < GRID.length + d; y++) {
    for (let x = -d; x < GRID[0].length + d; x++) {
      if (INSIDE.has(x + ',' + y)) continue
      let best = Infinity
      for (const [cx, cy] of BODY) best = Math.min(best, Math.max(Math.abs(cx - x), Math.abs(cy - y)))
      if (best === d) out.push([x, y])
    }
  }
  rings.set(d, out)
  return out
}

function blockyView(el: HTMLElement, W: number, H: number, o: ViewOptions): { update(st: EyesState): void } {
  const cols = GRID[0].length, rows = GRID.length
  // Whole pixels per cell: 3 in the small tab, 4 in the header.
  const k = Math.max(1, Math.floor(Math.min(W / cols, (H * 0.92) / rows)))
  const ox = Math.floor((W - cols * k) / 2), oy = Math.floor((H - rows * k) / 2)
  const dpr = Math.min(3, window.devicePixelRatio || 1)
  const pal = palette('blocky', o)
  // Unlit thinking dots sit half way to the Pill.
  const ink = pal.eye, dim = pal.lit ? mix(pal.lit, '#000000', 0.6) : mix(ink, o.color, 0.62), edge = o.lit ? null : edgeFor(o)
  const colorOf = (c: Cell) => (c.dim ? dim : ink)
  const cv = Object.assign(document.createElement('canvas'), { width: Math.round(W * dpr), height: Math.round(H * dpr), className: 'pv-dim' })
  cv.style.cssText = `position:absolute;inset:0;width:${W}px;height:${H}px`
  const msvg = document.createElementNS(NS, 'svg')
  msvg.setAttribute('viewBox', `0 0 ${W} ${H}`)
  msvg.setAttribute('shape-rendering', 'crispEdges')
  msvg.style.cssText = `position:absolute;inset:0;width:${W}px;height:${H}px;overflow:visible;pointer-events:none`
  el.append(cv, msvg)
  const g = cv.getContext('2d')!
  // Marks use their own pixel size: 3 in the tab (so its marks are bigger), 2 in the header, a body cell when big.
  const sp = o.markPx ?? (o.cls === 'peek' ? 3 : o.cls === 'header' ? 2 : Math.max(2, Math.round(k * 0.6)))
  const SET = o.cls === 'peek' && !o.markPx ? { ...MARK_SPRITES, ...MARK_SPRITES.bold } : MARK_SPRITES
  const Spx = sp * 5
  const corner = o.symAt ?? { x: ox + 13 * k, y: oy + Math.round(0.4 * k) }
  // Blocky fills the view's width, so a sliding drop has only the space above the Pill: it slides a little less.
  const slide = o.cls === 'peek' ? 3 : o.cls === 'header' ? 4 : rows * k * 0.35
  let last = '', lastM = ''
  return {
    update(st: EyesState) {
      // Pixels move in whole steps and never rotate or scale, or they stop looking like pixels.
      const tx = Math.round((st.body.tx * W) / k) * k, ty = Math.round((st.body.ty * H) / k) * k
      const t = `translate(${tx}px,${ty}px)`
      if (cv.style.transform !== t) {
        cv.style.transform = t
        msvg.style.transform = t
      }
      const cells = pixelEyes(st, { mouth: o.mouth }).filter((c) => INSIDE.has(c.x + ',' + c.y))
      const sig = cells.map((c) => `${c.x},${c.y},${colorOf(c)}`).join(';')
      if (sig !== last) {
        last = sig
        g.setTransform(dpr, 0, 0, dpr, 0, 0)
        g.clearRect(0, 0, W, H)
        g.fillStyle = o.color
        if (!o.lit) for (const [x, y] of BODY) g.fillRect(ox + x * k, oy + y * k, k, k)
        if (edge) {
          g.fillStyle = edge
          for (const [x, y] of RIM) g.fillRect(ox + x * k, oy + y * k, k, k)
        }
        for (const c of cells) {
          g.fillStyle = colorOf(c)
          g.fillRect(ox + c.x * k, oy + c.y * k, k, k)
        }
      }
      // Marks: pixel sprites outside the Pill, in whole mark pixels.
      const M = marks(st, { cls: o.cls, mouth: o.mouth, glass: false })
      const snap = (v: number) => Math.round(v / sp) * sp
      let html = ''
      const sprite = (rowsS: string[], x: number, y: number, col: string, a: number) => {
        let r = ''
        rowsS.forEach((row, ry) => [...row].forEach((ch, rx) => ch === '#' && (r += `<rect x="${x + rx * sp}" y="${y + ry * sp}" width="${sp}" height="${sp}"/>`)))
        return `<g fill="${col}" opacity="${a.toFixed(2)}">${r}</g>`
      }
      const place = (rowsS: string[]) => ({ x: o.cls === 'peek' ? Math.min(corner.x, W + 1 - rowsS[0].length * sp) : corner.x, y: corner.y - rowsS.length * sp })
      for (const r of o.lit ? [] : M.rings) {
        const d = r.kind === 'call' ? 1 + Math.round(r.u * 2) : 1
        html += `<g fill="${pal.sym}" opacity="${r.a.toFixed(2)}">${outline(d).map(([x, y]) => `<rect x="${ox + x * k}" y="${oy + y * k}" width="${k}" height="${k}"/>`).join('')}</g>`
      }
      for (const z of M.zs) {
        const name = o.cls === 'big' ? (z.size < 0.75 ? 'z3' : z.size < 0.95 ? 'z4' : 'z5') : o.cls === 'peek' ? 'z4' : 'z3'
        const at = place(ZSPRITES[name])
        html += sprite(ZSPRITES[name], snap(at.x + z.x * Spx), snap(at.y + z.y * Spx), pal.sym, z.a)
      }
      for (const c of M.confetti) {
        // Pieces are two mark pixels wide (one for dots), so they show even in the tab.
        const w = c.shape === 'dot' ? sp : sp * 2
        const reach = o.cls === 'peek' ? 0.55 : o.cls === 'header' ? 0.7 : 1
        html += `<rect x="${snap(Math.min(corner.x + c.x * Spx * reach, W + 1 - w))}" y="${snap(corner.y - Spx * 0.2 + c.y * Spx * reach)}" width="${w}" height="${sp}" fill="${pal.confetti[c.c]}" opacity="${c.a.toFixed(2)}"/>`
      }
      if (M.symbol) {
        const rowsS = SET[M.symbol.kind], at = place(rowsS)
        const lift = M.symbol.kind === 'drop' ? snap(M.symbol.dy * slide) : M.symbol.s < 0.6 ? sp : 0
        html += sprite(rowsS, snap(at.x), snap(at.y) + lift, M.symbol.kind === 'drop' ? pal.drop : pal.sym, M.symbol.a)
        // The badge's "!" is cut out: its holes are filled with the backdrop's color.
        if (M.symbol.kind === 'bang')
          html += sprite(
            rowsS.map((r, i) => (i === 0 || i === rowsS.length - 1 ? r.replace(/./g, '.') : r.replace(/#/g, ' ').replace(/\./g, '#').replace(/ /g, '.'))),
            snap(at.x),
            snap(at.y) + lift,
            o.lit ? '#000000' : BACKDROP(o.light),
            M.symbol.a,
          )
      }
      if (html !== lastM) {
        lastM = html
        msvg.innerHTML = html
      }
    },
  }
}
