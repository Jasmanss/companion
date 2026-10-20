// Steward in the notch: the page in the window along the top of the notched screen. The notch is pure black, so the
// character's body becomes a black shape with the real notch and its color becomes the light of its eyes (Glass:
// soft glowing eyes, Flat: solid ones, Blocky: pixels). Chin grows a lip below the notch, as wide as it, with the eyes
// in it. Wings puts one eye on each side of the notch, in the menu bar, and grows the chin for the thinking dots and
// the talking mouth, which need the middle. Designed in design/notch.html (shared/notch has the sizes). Asleep (Only
// when needed, at rest), the shape shrinks to the notch's own black and the eyes are off.
//
// The cursor comes from the main process (the window ignores the mouse except over the shape), and a click on the
// shape opens the panel. The eyes draw at the tab's tucked-away pace, and not at all while the window is hidden. With
// the cursor on it (Always visible), the black grows a little: the chin taller, or the wings wider. With an alert out
// under it (the main window's nudge), the chin shows in Wings too, so the two blacks join.
import { useEffect, useRef, useState } from 'react'
import { canDim } from '../../shared/dim'
import { NOTCH_EYE, NOTCH_HOVER_LIP, NOTCH_LIP, NOTCH_RADIUS, NOTCH_WING, needsMiddle, notchShape } from '../../shared/notch'
import { colorHex, DEFAULT_STEWARD } from '../../shared/steward'
import type { Mood, NotchLayout, NotchState, NotchStyle, StewardPrefs } from '../../shared/types'
import { runEyes, seed, toward, useMedia } from './Pill'
import { createEyes, setMood, setStyle, type EyesState } from './pill/eyes'
import { makeView, type PillKind, type PillView } from './pill/render'
import { useDimmed } from './dim'

const api = window.steward

export function NotchWindow() {
  const [state, setState] = useState<NotchState | null>(null)
  const [prefs, setPrefs] = useState<StewardPrefs>(DEFAULT_STEWARD)
  useEffect(() => {
    void api.notch.state().then(setState)
    return api.notch.onState(setState)
  }, [])
  useEffect(() => {
    void api.settings.get().then((v) => setPrefs(v.steward))
    return api.settings.onChanged((v) => setPrefs(v.steward))
  }, [])
  // The window only takes clicks over the shape, so any click is a click on Steward.
  useEffect(() => {
    const click = () => api.notch.click()
    window.addEventListener('click', click)
    return () => window.removeEventListener('click', click)
  }, [])
  if (!state?.layout) return null
  return <NotchFace layout={state.layout} mood={state.mood} glint={state.glint} awake={state.awake} hover={!!state.hover} nudge={!!state.nudge} prefs={prefs} />
}

function NotchFace({ layout, mood, glint, awake, hover, nudge, prefs }: { layout: NotchLayout; mood: Mood; glint: NotchState['glint']; awake: boolean; hover: boolean; nudge: boolean; prefs: StewardPrefs }) {
  const host = useRef<HTMLDivElement>(null)
  const [st] = useState(() => createEyes(seed(), performance.now() / 1000))
  const reduced = useMedia('(prefers-reduced-motion: reduce)')
  const reshape = useRef<((mood: Mood, awake: boolean, hover: boolean, nudge: boolean) => void) | null>(null)
  // The eyes only draw while awake; the shape and the eyes follow it without the face being built again.
  const awakeNow = useRef(awake)
  useEffect(() => {
    awakeNow.current = awake
  }, [awake])
  // Dim when idle: awake and at rest for a while, the eyes fade and stop; the cursor coming near or a new mood wakes them.
  const [near, setNear] = useState(false)
  useEffect(() => api.notch.onCursor((p) => setNear(p !== null)), [])
  const dimmed = useDimmed(canDim({ enabled: prefs.dimWhenIdle, atRest: awake, near }), mood)
  const dimNow = useRef(dimmed)
  useEffect(() => {
    dimNow.current = dimmed
  }, [dimmed])
  const { notchStyle, version, color, mouth, personality } = prefs
  const { cx, width, height } = layout

  useEffect(() => setStyle(st, { mouth, lively: personality === 'lively' }), [st, mouth, personality])
  useEffect(() => {
    setMood(st, mood, glint)
    reshape.current?.(mood, awake, hover, nudge)
  }, [st, mood, glint, awake, hover, nudge])
  const hoverNow = useRef(hover)
  const nudgeNow = useRef(nudge)
  useEffect(() => {
    hoverNow.current = hover
    nudgeNow.current = nudge
  }, [hover, nudge])

  useEffect(() => {
    const el = host.current
    if (!el) return
    const face = build(el, st, { layout: { cx, width, height }, style: notchStyle, kind: version, color: colorHex(color), mouth, reduced, awake: awakeNow.current, hover: hoverNow.current, nudge: nudgeNow.current })
    reshape.current = face.reshape
    let pointer: { x: number; y: number } | null = null
    const off = api.notch.onCursor((p) => (pointer = p))
    const stop = runEyes(st, face.views, { cursor: () => (pointer ? toward(pointer, face.center) : null), reduced, tucked: true, idle: () => !awakeNow.current || dimNow.current })
    return () => {
      stop()
      off()
      reshape.current = null
      el.replaceChildren()
    }
  }, [st, cx, width, height, notchStyle, version, color, mouth, reduced])

  return <div ref={host} className={dimmed ? 'notch-root dim' : 'notch-root'} aria-hidden="true" />
}

const div = (cls: string, css = ''): HTMLDivElement => {
  const d = document.createElement('div')
  d.className = cls
  if (css) d.style.cssText = css
  return d
}
const px = (v: number) => `${+v.toFixed(2)}px`

/**
 * A black rounded box made of pieces, anchored at its top center: a band, a bottom strip and two corner circles.
 * size(w, h) slides and scales them together, so it grows without its corners squashing.
 */
function blob(parent: HTMLElement, w0: number, h0: number, rb: number): { size(w: number, h: number): void } {
  const el = div('blob')
  const parts: [HTMLElement, (w: number, h: number) => string][] = []
  const add = (css: string, origin: string, fn: (w: number, h: number) => string) => {
    const p = div('bp', `${css};transform-origin:${origin}`)
    el.append(p)
    parts.push([p, fn])
  }
  const hm0 = h0 - rb + 0.5
  add(`left:${px(-w0 / 2)};top:0;width:${px(w0)};height:${px(hm0)}`, '50% 0', (w, h) => `scale(${w / w0},${Math.max(0.001, (h - rb + 0.5) / hm0)})`)
  add(`left:${px(-(w0 / 2 - rb))};top:${px(h0 - rb - 0.5)};width:${px(w0 - 2 * rb)};height:${px(rb + 0.5)}`, '50% 0', (w, h) => `translateY(${px(h - h0)}) scaleX(${Math.max(0.001, (w - 2 * rb) / (w0 - 2 * rb))})`)
  for (const s of [-1, 1])
    add(`left:${px(s * (w0 / 2 - rb) - rb)};top:${px(h0 - 2 * rb)};width:${px(2 * rb)};height:${px(2 * rb)};border-radius:50%`, '50% 50%', (w, h) => `translate(${px((s * (w - w0)) / 2)},${px(h - h0)})`)
  parent.append(el)
  return { size: (w, h) => parts.forEach(([p, fn]) => (p.style.transform = fn(w, h))) }
}

interface FaceOptions {
  layout: NotchLayout
  style: NotchStyle
  kind: PillKind
  color: string
  mouth: boolean
  reduced: boolean
  /** Awake at first: the shape and the eyes, or asleep, only the notch's own black. */
  awake: boolean
  /** The cursor on it at first: grown a little. */
  hover: boolean
  /** An alert out under it at first. */
  nudge: boolean
}

/**
 * Draws the black shape and the lit eyes. reshape(mood, awake, hover, nudge) changes the shape for a mood (Wings' chin
 * comes and goes), wakes or sleeps it, grows it a little while the cursor is on it, and joins it to an alert under it.
 */
function build(host: HTMLElement, st: EyesState, o: FaceOptions): { views: PillView[]; center: HTMLElement; reshape(mood: Mood, awake: boolean, hover: boolean, nudge: boolean): void } {
  const { cx, width: nw, height: nh } = o.layout
  const E = NOTCH_EYE, k = E / 18, W = Math.round(92 * k), H = Math.round(60 * k)
  const eyeY = nh + NOTCH_LIP / 2
  const root = div('nt', `left:${px(cx)}`)
  host.append(root)
  const lip = blob(root, nw, nh + NOTCH_LIP, NOTCH_RADIUS)
  const wings = o.style === 'wings' ? blob(root, nw + 2 * NOTCH_WING, nh, NOTCH_RADIUS) : null

  const views: PillView[] = []
  const spots: Record<'main' | 'wl' | 'wr' | 'chin', HTMLElement | null> = { main: null, wl: null, wr: null, chin: null }
  /** One lit view of the eyes, centered on (x, y). sym: where its corner symbol goes, from that center. */
  const eyes = (name: keyof typeof spots, x: number, y: number, sym: [number, number] | null, clip?: [number, number]) => {
    const w = div('nt-eyes', `transform:translate(${px(x)},${px(y)})`)
    // The wings show one eye of a pair each: the clip keeps the other, under the notch, from peeking out.
    if (clip) w.style.clipPath = `polygon(${px(clip[0] - x)} -60px,${px(clip[1] - x)} -60px,${px(clip[1] - x)} 60px,${px(clip[0] - x)} 60px)`
    const symAt = !sym ? { x: -999, y: -999 } : o.kind === 'blocky' ? { x: W / 2 + sym[0] - 5, y: H / 2 + sym[1] + 5 } : { x: W / 2 + sym[0], y: H / 2 + sym[1] }
    const v = makeView(o.kind, W, H, { color: o.color, tinted: true, light: false, mouth: o.mouth, cls: 'peek', lit: true, symAt, markSize: Math.round(E * 0.85), markPx: 2 })
    Object.assign(v.el.style, { position: 'absolute', left: px(-W / 2), top: px(-H / 2) })
    w.append(v.el)
    root.append(w)
    views.push(v)
    spots[name] = w
  }
  const HW = nw / 2
  if (wings) {
    // Each wing's view sits so its outer eye is in the middle of the wing; half the gap between a pair's eyes is sp.
    const wx = HW + NOTCH_WING / 2, sp = 0.145 * 88 * (W / 92)
    eyes('wl', -wx + sp, nh / 2, null, [-HW - NOTCH_WING - 40, -HW - 5.5])
    eyes('wr', wx - sp, nh / 2, [sp + E * 1.7, -3], [HW + 5.5, HW + NOTCH_WING + 60])
    eyes('chin', 0, eyeY, null)
  } else eyes('main', 0, eyeY, [Math.min(68, HW - 24), 0])

  let sig = ''
  // With Reduce Motion on, hovering doesn't grow the black (it would only fade out and back in).
  const grows = (hover: boolean) => hover && !o.reduced
  const signature = (mood: Mood, awake: boolean, hover: boolean, nudge: boolean) => JSON.stringify([notchShape(o.style, mood, { width: nw, height: nh }, awake, grows(hover), nudge), needsMiddle(mood), awake])
  const apply = (mood: Mood, awake: boolean, hover: boolean, nudge: boolean) => {
    const shape = notchShape(o.style, mood, { width: nw, height: nh }, awake, grows(hover), nudge)
    lip.size(nw, shape.lip)
    wings?.size(shape.wings, nh)
    const middle = needsMiddle(mood)
    spots.main?.classList.toggle('on', awake)
    spots.chin?.classList.toggle('on', awake && middle)
    spots.wl?.classList.toggle('on', awake && !middle)
    spots.wr?.classList.toggle('on', awake && !middle)
    // The eyes stay in the middle of the chin as it grows.
    if (spots.main) spots.main.style.transform = `translate(0px,${px(eyeY + (o.style === 'chin' && awake && grows(hover) ? NOTCH_HOVER_LIP / 2 : 0))})`
    return signature(mood, awake, hover, nudge)
  }
  const snap = (mood: Mood, awake: boolean, hover: boolean, nudge: boolean) => {
    root.classList.add('snap')
    sig = apply(mood, awake, hover, nudge)
    void root.offsetWidth
    root.classList.remove('snap')
  }
  snap(st.mood, o.awake, o.hover, o.nudge)
  let fade: ReturnType<typeof setTimeout> | undefined
  let last = { mood: st.mood, awake: o.awake, nudge: o.nudge }
  return {
    views,
    center: (spots.main ?? spots.chin)!,
    reshape(mood, awake, hover, nudge) {
      const next = signature(mood, awake, hover, nudge)
      if (next === sig) return
      // Only the hover changed: a quicker, softer move than a change of mood or waking (design/notch.html: 220 ms, out).
      root.classList.toggle('quick', mood === last.mood && awake === last.awake && nudge === last.nudge)
      last = { mood, awake, nudge }
      if (!o.reduced) {
        sig = apply(mood, awake, hover, nudge)
        return
      }
      // Reduced motion: fade out, change, fade back in, instead of flowing.
      root.classList.add('rm-out')
      clearTimeout(fade)
      fade = setTimeout(() => {
        snap(mood, awake, hover, nudge)
        root.classList.remove('rm-out')
      }, 150)
    },
  }
}
