// Steward in the notch as an island (Settings → Steward → In the notch → Island), drawn on the notch window's page.
// Designed in design/showcase, section 7, "Peeking, as one joined island"; peeking.js and island-kit.js there are the
// working model. One black shape joined to the notch, flush with the top of the screen. At rest it's only the notch, and
// Steward peeks out from behind its left edge, half hidden; with the cursor on it, it leans out further. While Claude
// works the compact island grows out of the notch, Steward steps into its left side, and the status shows on its
// right (the Smart choice: a spinner and the time, a check, an amber mark, a thumbnail, a count). For news (Claude
// finished, a second project started, good news, any other alert) it grows into the note size, a little wider and
// taller, with one line under the notch, and settles back a few seconds later (main says when). Words too long for one
// line grow it into the long note instead: the title on its own line and the rest wrapped under it, never cut off.
// Something that needs you (an approval, a question, a failed build) and a review grow it big, and Steward joins it:
// its body melts into the black while its lit eyes carry on from the same spot, now an avatar on the card's left, with
// the words and buttons beside it. Asleep, Steward is tucked behind the notch.
//
// Springs move it, setting only transforms and opacity, and only while something is still moving. With Reduce Motion
// it fades out, changes and fades back in instead. The real notch has no pixels: the island's own copy of it is drawn
// over Steward, so what's behind the notch is hidden on a screen without one too (a test run's pretend notch).
import { fitNote, ISLAND_CARD_GAP, ISLAND_LONG_LINES, islandParts, ISLAND_RADIUS, joins, NOTCH_RADIUS, NOTE_LINES, NOTE_PAD, PEEK_SIZE, type IslandLevel, type NoteFit } from '../../shared/notch'
import type { IslandAct, IslandNote, IslandStatus, NotchLayout, ReviewView } from '../../shared/types'
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
      // Proud: a small spark pops once by the check.
      return s.spark ? '<i class="isl-check"></i><i class="isl-spark"></i>' : '<i class="isl-check"></i>'
    case 'needs':
      return '<i class="isl-ask">!</i>'
    case 'failed':
      return '<i class="isl-ask red">!</i>'
    case 'good':
      return '<i class="isl-spark solo"></i>'
    case 'asks':
      return '<i class="isl-q">?</i>'
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
  /** A button on the message was pressed (at: which message). */
  onAct(what: IslandAct, at: number): void
  /** The message's words were measured: how they fit (main keeps it out longer for a long one). */
  onFit(at: number, fit: NoteFit): void
  /** A review's pictures and what Claude says, for the review size. */
  review(id: string): Promise<ReviewView | null>
}

export interface IslandFace {
  views: PillView[]
  /** Where the eyes look from. */
  center: HTMLElement
  /** Where things should be: springs carry them there (or, first, they're just there). */
  show(level: IslandLevel, hover: boolean, status: IslandStatus): void
  /** Where the eyes look when the cursor isn't near: toward the status, while there is one. */
  gaze(): { x: number; y: number } | null
  /** How a message's words fit, measured in the note's own fonts (the same message is measured once). */
  fit(note: IslandNote): NoteFit
  stop(): void
}

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const button = (act: IslandAct, label: string, primary = false) => `<button class="isl-btn${primary ? ' pri' : ''}" data-act="${act}">${esc(label)}</button>`
const round = (act: 'allow' | 'deny', label: string, path: string) => `<button class="isl-round ${act}" data-act="${act}" aria-label="${label}"><svg viewBox="0 0 14 14"><path d="${path}"/></svg></button>`
const at = (x: number, y: number, w: number, h: number, cls: string, inner: string) => `<div class="${cls}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px">${inner}</div>`

/**
 * The big message's card, in the island below the notch (width w, height h): Steward's spot on the left (drawn by the
 * pill), the words beside it, the buttons under them. A session waiting or asking has Open and Later (Steward can't
 * answer a session); Steward's own request has Deny and Allow, which work; a failed build has its offer and Later; a
 * review has its pictures, Open big and Looks good.
 */
function cardHtml(note: IslandNote, w: number, h: number, review: ReviewView | null): string {
  const words = (detail: string) => `<div class="isl-ct-t"><b>${esc(note.name)}</b><p>${detail}</p></div>`
  if (note.kind === 'agent')
    return at(96, 12, w - 96 - 130, h - 20, 'isl-ct-w', words(`Run <code>${esc(note.text)}</code>?`)) + round('deny', 'Deny', 'M3.5 3.5l7 7M10.5 3.5l-7 7') + round('allow', 'Allow', 'M3 7.5l2.8 2.8L11 4.5')
  if (note.kind === 'review') {
    const said = review?.said ? `<b>Claude says:</b> ${esc(review.said)}` : esc(note.text)
    const pics = review ? `<span class="isl-thumbs${review.before ? '' : ' one'}">${review.before ? `<img class="tb" src="${review.before}" alt="">` : ''}<img class="ta" src="${review.after}" alt=""></span>` : '<span class="isl-thumbs none"></span>'
    return at(96, 6, w - 96 - 140, 76, 'isl-ct-w', words(said)) + at(w - 128, 10, 104, 64, 'isl-ct-th', pics) + at(96, h - 40, w - 120, 30, 'isl-acts', button('big', 'Open big', true) + button('good', 'Looks good'))
  }
  const offer = note.kind === 'failed' ? button('look', note.action ?? 'Want me to look?', true) : button('open', 'Open', true)
  return at(96, 6, w - 96 - 24, 50, 'isl-ct-w', words(esc(note.text))) + at(96, h - 34, w - 120, 28, 'isl-acts', offer + button('later', 'Later'))
}

export function buildIsland(host: HTMLElement, o: IslandOptions): IslandFace {
  const { cx, width: nw, height: nh } = o.layout
  const lit = o.lit.replace('#', '')
  const rgb = [0, 2, 4].map((i) => parseInt(lit.slice(i, i + 2), 16)).join(',')
  const root = div('isl', `left:${px(cx)};--lit:${rgb}`)
  host.append(root)

  // The one black shape, flush with the top of the screen; as wide and tall as the notch, it's hidden (no island).
  const notch = { width: nw, height: nh }
  const compact = islandParts('compact', notch)
  const note = islandParts('note', notch)
  const biggest = islandParts('review', notch)
  const shape = div('isl-shape')
  root.append(shape)
  const black = blob(shape, biggest.width, biggest.height, ISLAND_RADIUS)
  // Steward, the panel header's Pill. Outside the black it's the solid body: glass needs something to refract. Joined
  // to the island, the body fades into the black and a lit view of the same eyes (lined up with the body's) takes its
  // place, in front of a dark avatar disc, like a caller's photo.
  const pill = div('isl-pill')
  const kind = o.kind === 'glass' ? 'flat' : o.kind
  const avatar = div('isl-avatar')
  const view = makeView(kind, PEEK_SIZE.width, PEEK_SIZE.height, { color: o.color, tinted: true, light: o.light, mouth: o.mouth, cls: 'header' })
  const eyes = makeView(kind, PEEK_SIZE.width, PEEK_SIZE.height, { color: o.color, tinted: true, light: false, mouth: o.mouth, cls: 'header', lit: true, symAt: { x: -999, y: -999 } })
  for (const v of [view, eyes]) Object.assign(v.el.style, { position: 'absolute', left: px(-PEEK_SIZE.width / 2), top: px(-PEEK_SIZE.height / 2) })
  // Each view fades in a wrapper of its own: resting's standby glow animates the view's own opacity.
  const body = div('isl-body')
  const litEyes = div('isl-lit')
  body.append(view.el)
  litEyes.append(eyes.el)
  pill.append(avatar, body, litEyes)
  root.append(pill)
  // The notch, over Steward: what's behind it can't be seen.
  root.append(div('isl-notch', `left:${px(-nw / 2)};width:${px(nw)};height:${px(nh)};border-radius:0 0 ${NOTCH_RADIUS}px ${NOTCH_RADIUS}px`))
  // The status, on the island's right.
  const right = div('isl-right')
  const rightIn = div('isl-right-in')
  right.append(rightIn)
  root.append(right)
  // The note's words, under the notch: one line, or the long note's three. They fade in once the black has grown under
  // them, and are clipped to the black.
  const line = div('isl-note', `left:${px(-note.width / 2)};top:${px(nh)};width:${px(note.width)};height:${px(ISLAND_LONG_LINES)}`)
  const lineIn = div('isl-note-in')
  line.append(lineIn)
  root.append(line)
  // The big message's card, below the notch, built for the size it's shown at.
  const card = div('isl-card')
  root.append(card)
  card.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-act]')
    if (!b || cardAt === undefined) return
    // A button, not the island: the click doesn't also open the panel.
    e.stopPropagation()
    o.onAct(b.dataset.act as IslandAct, cardAt)
  })

  const W = new Spring(nw)
  const H = new Spring(nh)
  const P = { x: soft(0), y: soft(nh / 2), s: soft(1), r: new Spring(0, 130, 11) }
  const RX = soft(compact.right!.x)
  const RO = soft(0)
  // How far Steward has joined the island: 0, the body; 1, the lit eyes in the avatar spot.
  const J = soft(0)
  const springs = [W, H, P.x, P.y, P.s, P.r, RX, RO, J]

  let cardBox = { w: 0, h: 0 }
  const apply = () => {
    black.size(Math.max(nw, W.v), Math.max(nh, H.v))
    shape.style.visibility = W.v <= nw + 0.6 && H.v <= nh + 0.6 ? 'hidden' : ''
    pill.style.transform = `translate(${px(P.x.v)},${px(P.y.v)}) rotate(${P.r.v.toFixed(2)}deg) scale(${Math.max(0.01, P.s.v).toFixed(4)})`
    const j = clamp01(J.v)
    body.style.opacity = String(1 - j)
    litEyes.style.opacity = avatar.style.opacity = String(j)
    right.style.transform = `translate(${px(RX.v)},${px(nh / 2)})`
    right.style.opacity = String(clamp01(RO.v))
    const side = Math.max(0, (note.width - W.v) / 2)
    line.style.clipPath = `inset(0 ${px(side)} ${px(Math.max(0, nh + ISLAND_LONG_LINES - H.v))} ${px(side)})`
    const top = nh + ISLAND_CARD_GAP
    const cside = Math.max(0, (cardBox.w - W.v) / 2)
    card.style.clipPath = `inset(0 ${px(cside)} ${px(Math.max(0, top + cardBox.h - H.v))} ${px(cside)})`
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
  let shownRight: IslandStatus['right'] = null
  let swap: ReturnType<typeof setTimeout> | undefined
  const setRight = (status: IslandStatus, now: boolean) => {
    since = status.since
    const html = rightHtml(status)
    // The spark going doesn't swap the check: it has already popped and faded.
    if (html === shownHtml || (status.right === 'finished' && shownRight === 'finished')) return tickTime()
    shownRight = status.right
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

  // Measuring a message's words in the note's own fonts (a canvas, so nothing on screen moves).
  const ctx = document.createElement('canvas').getContext('2d')
  const fonts = { bold: '', plain: '' }
  const measure = (text: string, bold: boolean) => {
    if (!ctx) return text.length * 7
    if (!fonts.bold) {
      const probe = div('isl-note-in long', 'position:absolute;visibility:hidden')
      probe.innerHTML = '<b>x</b><span>x</span>'
      root.append(probe)
      const font = (el: Element) => getComputedStyle(el).font
      fonts.bold = font(probe.querySelector('b')!)
      fonts.plain = font(probe.querySelector('span')!)
      probe.remove()
    }
    ctx.font = bold ? fonts.bold : fonts.plain
    return ctx.measureText(text).width
  }
  /** The words a note shows after its title: good news joined into it says how many more. */
  const detailOf = (n: IslandNote) => (n.more ? `${n.text ? `${n.text} · ` : ''}and ${n.more} more` : n.text)
  const fits = new Map<string, NoteFit>()
  const fit = (n: IslandNote): NoteFit => {
    const key = `${n.at}:${n.more ?? 0}`
    let f = fits.get(key)
    if (!f) {
      f = fitNote(n.name, detailOf(n), note.width - 2 * NOTE_PAD, measure)
      fits.set(key, f)
      if (fits.size > 20) fits.delete(fits.keys().next().value!)
      o.onFit(n.at, f)
    }
    return f
  }

  // The note: the project's name in bold, then the rest; long, the name on its own line and the rest wrapped under it.
  // A new one swaps in like the right side does.
  let noteAt: number | undefined
  let noteKey = ''
  let noteSwap: ReturnType<typeof setTimeout> | undefined
  const setNote = (n: IslandNote | undefined, on: boolean, now: boolean): boolean => {
    const wasOn = line.classList.contains('on')
    line.classList.toggle('on', on && !!n)
    if (!n || !on) return false
    const f = fit(n)
    const key = `${n.at}:${n.more ?? 0}:${f}`
    if (key === noteKey) return false
    const news = n.at !== noteAt
    noteAt = n.at
    noteKey = key
    const put = () => {
      const name = document.createElement('b')
      name.textContent = n.name
      const text = document.createElement('span')
      text.textContent = detailOf(n)
      lineIn.className = f === 'note' ? 'isl-note-in' : `isl-note-in long${f === 'toolong' ? ' toolong' : ''}`
      lineIn.replaceChildren(name, text)
      // The long note holds three lines in all: a title that wraps leaves fewer for the rest.
      if (f !== 'note') text.style.webkitLineClamp = String(Math.max(1, NOTE_LINES - Math.round(name.offsetHeight / 16)))
      lineIn.classList.remove('out')
    }
    clearTimeout(noteSwap)
    if (now || !wasOn || !news) put()
    else {
      lineIn.classList.add('out')
      noteSwap = setTimeout(put, 110)
    }
    return news
  }

  // The card: built for the message and size, its words and buttons fading in once the black has grown.
  let cardAt: number | undefined
  let cardFor = ''
  const setCard = (n: IslandNote | undefined, lv: IslandLevel) => {
    const big = joins(lv) && !!n
    card.classList.toggle('on', big)
    if (!big || !n) return void (cardAt = undefined)
    const p = islandParts(lv, notch)
    const key = `${n.at}:${lv}`
    cardAt = n.at
    if (key === cardFor) return
    cardFor = key
    cardBox = { w: p.width, h: p.height - nh - ISLAND_CARD_GAP }
    Object.assign(card.style, { left: px(-p.width / 2), top: px(nh + ISLAND_CARD_GAP), width: px(cardBox.w), height: px(cardBox.h) })
    card.dataset.kind = n.kind
    const draw = (review: ReviewView | null) => {
      if (cardFor !== key) return
      card.innerHTML = cardHtml(n, cardBox.w, cardBox.h, review)
      // Two lines of words in all, or three: a title that wraps (a long chat name) leaves fewer for the rest.
      const t = card.querySelector<HTMLElement>('.isl-ct-t b'), d = card.querySelector<HTMLElement>('.isl-ct-t p')
      const room = n.kind === 'review' ? 4 : n.kind === 'agent' ? 3 : 3
      if (t && d) d.style.webkitLineClamp = String(Math.max(1, room - Math.round(t.offsetHeight / 16)))
    }
    draw(null)
    if (n.kind === 'review' && n.key) void o.review(n.key.slice('review:'.length)).then(draw, () => {})
  }

  let level: IslandLevel = 'rest'
  let shown = false
  let fade: ReturnType<typeof setTimeout> | undefined
  const target = (lv: IslandLevel, hover: boolean, snap: boolean) => {
    const p = islandParts(lv, notch, hover)
    const set = (s: Spring, v: number) => (snap ? s.snap(v) : (s.t = v))
    set(W, p.width)
    set(H, p.height)
    set(P.x, p.pill.x)
    set(P.y, p.pill.y)
    set(P.s, p.pill.scale)
    set(P.r, p.pill.rotate)
    set(J, p.joined ? 1 : 0)
    // The status appears where it goes, rather than sliding in from where it last was.
    if (p.right && RO.t < 0.5) RX.snap(p.right.x)
    if (p.right) set(RX, p.right.x)
    set(RO, p.right ? 1 : 0)
  }
  return {
    views: [view, eyes],
    center: view.el,
    show(lv, hover, status) {
      const first = !shown
      shown = true
      level = lv
      root.dataset.level = lv
      root.dataset.hover = String(hover)
      setRight(status, first || o.reduced)
      const news = setNote(status.note, lv === 'note' || lv === 'long', first || o.reduced)
      setCard(status.note, lv)
      if (first) {
        target(lv, hover, true)
        return apply()
      }
      if (!o.reduced) {
        target(lv, hover, false)
        // Claude finished: a little hop for joy.
        if (news && lv === 'note' && status.note?.kind === 'finished') P.y.x = -110
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
    // Toward the status while there is one; joined, toward the card's words (or a review's pictures).
    gaze: () => (joins(level) ? { x: 0.7, y: 0.15 } : level === 'compact' || level === 'note' || level === 'long' ? { x: 0.6, y: 0.08 } : null),
    fit,
    stop() {
      cancelAnimationFrame(frame)
      clearInterval(clock)
      clearTimeout(swap)
      clearTimeout(noteSwap)
      clearTimeout(fade)
    },
  }
}
