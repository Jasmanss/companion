// Steward in the notch as an island (Settings → Steward → In the notch → Island), drawn on the notch window's page.
// Designed in design/showcase, section 7, "Peeking, as one joined island"; peeking.js and island-kit.js there are the
// working model. One black shape joined to the notch, flush with the top of the screen. At rest it's only the notch, and
// Steward peeks out from behind its left edge, half hidden; with the cursor on it, it leans out further. While Claude
// works the compact island grows out of the notch, Steward steps into its left side, and the status shows on its
// right (the Smart choice: a spinner and the time, a check, an amber mark, a thumbnail, a count). Asleep, Steward is
// tucked behind the notch.
//
// Springs move it, setting only transforms and opacity, and only while something is still moving. With Reduce Motion
// it fades out, changes and fades back in instead. The real notch has no pixels: the island's own copy of it is drawn
// over Steward, so what's behind the notch is hidden on a screen without one too (a test run's pretend notch).
import { islandParts, ISLAND_RADIUS, NOTCH_RADIUS, PEEK_SIZE, type IslandLevel } from '../../shared/notch'
import type { IslandStatus, NotchLayout } from '../../shared/types'
import { blob, div, px } from './notch-blob'
import { makeView, type PillKind, type PillView } from './pill/render'

/** A damped spring, stepped in small fixed steps so it's steady whatever the frame time (island-kit.js). */
class Spring {
  x = 0
  t: number
  constructor(
    public v: number,
    private readonly k = 170,
    private readonly c = 16,
  ) {
    this.t = v
  }
  get done(): boolean {
    return Math.abs(this.v - this.t) < 0.02 && Math.abs(this.x) < 0.02
  }
  snap(t: number): void {
    this.v = this.t = t
    this.x = 0
  }
  step(dt: number): void {
    const n = Math.ceil(dt / (1 / 240))
    for (let i = 0; i < n; i++) {
      this.x += (-this.k * (this.v - this.t) - this.c * this.x) * (dt / n)
      this.v += this.x * (dt / n)
    }
  }
}
/** Steward and the status: less bounce than the black. */
const soft = (v: number) => new Spring(v, 150, 20)
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** The right side, for what's going on (the Smart choice). */
function rightHtml(s: IslandStatus): string {
  switch (s.right) {
    case 'working':
      return '<i class="isl-spin"></i><span class="isl-time"></span>'
    case 'two':
      return `<i class="isl-spin"></i><span class="isl-count">${s.count ?? 2}</span>`
    case 'finished':
      return '<i class="isl-check"></i>'
    case 'needs':
      return '<i class="isl-ask">!</i>'
    case 'review':
      return '<span class="isl-thumb"></span>'
    default:
      return ''
  }
}

/** How long Claude has been working: 2:41, or 1:02:41 past an hour. */
export function elapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const mm = String(Math.floor(s / 60) % 60)
  const ss = String(s % 60).padStart(2, '0')
  return s >= 3600 ? `${Math.floor(s / 3600)}:${mm.padStart(2, '0')}:${ss}` : `${mm}:${ss}`
}

export interface IslandOptions {
  layout: NotchLayout
  kind: PillKind
  /** The Pill's color, and the color its eyes glow in on black (the spinner and the count use it). */
  color: string
  lit: string
  mouth: boolean
  /** Light mode: what's behind the peeking Pill (the menu bar) is light. */
  light: boolean
  reduced: boolean
}

export interface IslandFace {
  views: PillView[]
  /** Where the eyes look from. */
  center: HTMLElement
  /** Where things should be: springs carry them there (or, first, they're just there). */
  show(level: IslandLevel, hover: boolean, status: IslandStatus): void
  /** Where the eyes look when the cursor isn't near: toward the status, while there is one. */
  gaze(): { x: number; y: number } | null
  stop(): void
}

export function buildIsland(host: HTMLElement, o: IslandOptions): IslandFace {
  const { cx, width: nw, height: nh } = o.layout
  const lit = o.lit.replace('#', '')
  const rgb = [0, 2, 4].map((i) => parseInt(lit.slice(i, i + 2), 16)).join(',')
  const root = div('isl', `left:${px(cx)};--lit:${rgb}`)
  host.append(root)

  // The one black shape, flush with the top of the screen; as wide and tall as the notch, it's hidden (no island).
  const compact = islandParts('compact', { width: nw, height: nh })
  const shape = div('isl-shape')
  root.append(shape)
  const black = blob(shape, compact.width, compact.height, ISLAND_RADIUS)
  // Steward, the panel header's Pill. Outside the black it's the solid body: glass needs something to refract.
  const pill = div('isl-pill')
  const view = makeView(o.kind === 'glass' ? 'flat' : o.kind, PEEK_SIZE.width, PEEK_SIZE.height, { color: o.color, tinted: true, light: o.light, mouth: o.mouth, cls: 'header' })
  Object.assign(view.el.style, { position: 'absolute', left: px(-PEEK_SIZE.width / 2), top: px(-PEEK_SIZE.height / 2) })
  pill.append(view.el)
  root.append(pill)
  // The notch, over Steward: what's behind it can't be seen.
  root.append(div('isl-notch', `left:${px(-nw / 2)};width:${px(nw)};height:${px(nh)};border-radius:0 0 ${NOTCH_RADIUS}px ${NOTCH_RADIUS}px`))
  // The status, on the island's right.
  const right = div('isl-right')
  const rightIn = div('isl-right-in')
  right.append(rightIn)
  root.append(right)

  const W = new Spring(nw)
  const H = new Spring(nh)
  const P = { x: soft(0), y: soft(nh / 2), s: soft(1), r: new Spring(0, 130, 11) }
  const RX = soft(compact.right!.x)
  const RO = soft(0)
  const springs = [W, H, P.x, P.y, P.s, P.r, RX, RO]

  const apply = () => {
    black.size(Math.max(nw, W.v), Math.max(nh, H.v))
    shape.style.visibility = W.v <= nw + 0.6 && H.v <= nh + 0.6 ? 'hidden' : ''
    pill.style.transform = `translate(${px(P.x.v)},${px(P.y.v)}) rotate(${P.r.v.toFixed(2)}deg) scale(${Math.max(0.01, P.s.v).toFixed(4)})`
    right.style.transform = `translate(${px(RX.v)},${px(nh / 2)})`
    right.style.opacity = String(clamp01(RO.v))
  }
  let frame = 0
  let last = 0
  const step = (now: number) => {
    frame = 0
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    let moving = false
    for (const s of springs)
      if (!s.done) {
        s.step(dt)
        moving = true
      }
    apply()
    if (moving && root.isConnected) kick()
  }
  const kick = () => {
    if (frame) return
    last = performance.now()
    frame = requestAnimationFrame(step)
  }

  // The time while Claude works, counting up once a second, only while it shows.
  let clock: ReturnType<typeof setInterval> | undefined
  let since: number | undefined
  const tickTime = () => {
    const el = rightIn.querySelector('.isl-time')
    if (el && since !== undefined) el.textContent = elapsed(Date.now() - since)
  }
  let shownHtml = ''
  let swap: ReturnType<typeof setTimeout> | undefined
  const setRight = (status: IslandStatus, now: boolean) => {
    since = status.since
    const html = rightHtml(status)
    if (html === shownHtml) return tickTime()
    shownHtml = html
    clearTimeout(swap)
    const put = () => {
      rightIn.innerHTML = html
      tickTime()
      rightIn.classList.remove('out')
    }
    clearInterval(clock)
    if (status.right === 'working') clock = setInterval(tickTime, 1000)
    if (now) return put()
    // The old one fades out before the new one fades in.
    rightIn.classList.add('out')
    swap = setTimeout(put, 110)
  }

  let level: IslandLevel = 'rest'
  let shown = false
  let fade: ReturnType<typeof setTimeout> | undefined
  const target = (lv: IslandLevel, hover: boolean, snap: boolean) => {
    const p = islandParts(lv, { width: nw, height: nh }, hover)
    const set = (s: Spring, v: number) => (snap ? s.snap(v) : (s.t = v))
    set(W, p.width)
    set(H, p.height)
    set(P.x, p.pill.x)
    set(P.y, p.pill.y)
    set(P.s, p.pill.scale)
    set(P.r, p.pill.rotate)
    // The status appears where it goes, rather than sliding in from where it last was.
    if (p.right && RO.t < 0.5) RX.snap(p.right.x)
    if (p.right) set(RX, p.right.x)
    set(RO, p.right ? 1 : 0)
  }
  return {
    views: [view],
    center: view.el,
    show(lv, hover, status) {
      const first = !shown
      shown = true
      level = lv
      root.dataset.level = lv
      root.dataset.hover = String(hover)
      setRight(status, first || o.reduced)
      if (first) {
        target(lv, hover, true)
        return apply()
      }
      if (!o.reduced) {
        target(lv, hover, false)
        return kick()
      }
      // Reduce Motion: fade out, change, fade back in.
      root.classList.add('rm-out')
      clearTimeout(fade)
      fade = setTimeout(() => {
        target(lv, hover, true)
        apply()
        root.classList.remove('rm-out')
      }, 130)
    },
    gaze: () => (level === 'compact' ? { x: 0.6, y: 0.08 } : null),
    stop() {
      cancelAnimationFrame(frame)
      clearInterval(clock)
      clearTimeout(swap)
      clearTimeout(fade)
    },
  }
}
