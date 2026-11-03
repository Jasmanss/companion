import { useEffect, useRef, useState } from 'react'
import { colorHex } from '../../shared/steward'
import type { Mood, StewardPrefs } from '../../shared/types'
import { createEyes, eyesWait, pressKey, setMood, setStyle, stepEyes, type EyesState, type Glint, type SizeClass } from './pill/eyes'
import { makeView, type PillView } from './pill/render'

/** Typing to Steward: every Pill on the page nods once per key (it only shows while listening). */
const typed = new Set<() => void>()
export const pillKey = (): void => typed.forEach((nod) => nod())

/** Whether a media query matches, kept up to date. */
export function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(() => matchMedia(query).matches)
  useEffect(() => {
    const m = matchMedia(query)
    const change = () => setMatches(m.matches)
    change()
    m.addEventListener('change', change)
    return () => m.removeEventListener('change', change)
  }, [query])
  return matches
}

let nextSeed = 1
export const seed = (): number => nextSeed++
const now = () => performance.now() / 1000

/** A point (in the page) relative to an element, in units of its size (at least the header's), as the eyes expect. */
export function toward(p: { x: number; y: number }, el: Element): { x: number; y: number } {
  const r = el.getBoundingClientRect()
  return { x: (p.x - (r.left + r.width / 2)) / Math.max(90, r.width), y: (p.y - (r.top + r.height / 2)) / Math.max(70, r.height) }
}

/**
 * Steps one eyes state and draws its views from it, paced (eyesWait): every frame while open; tucked away, resting 10
 * times a second, sleepy 20 and the rest 30, but every frame while near() says the cursor is close; with reduced motion
 * 10 (nothing moves on its own). Nothing at all while the page is hidden. cursor() is where the cursor is, relative to
 * the eyes, or null. Returns a function that stops it.
 */
export function runEyes(st: EyesState, views: PillView[], o: { cursor: () => { x: number; y: number } | null; reduced: boolean; tucked: boolean; idle?: () => boolean; near?: () => boolean }): () => void {
  // idle: nothing to see (the notch asleep): don't draw, and only look now and then to see if that's changed.
  const every = () => eyesWait({ mood: st.mood, reduced: o.reduced, tucked: o.tucked, near: o.near?.(), idle: o.idle?.() })
  let frame = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let last = now()
  const draw = (t: number) => {
    stepEyes(st, t, t - last, o.cursor(), o.reduced)
    last = t
    for (const v of views) {
      v.standby(st.mood === 'resting' && !o.reduced)
      v.update(st)
    }
  }
  const tick = (ms: number) => {
    frame = 0
    if (document.hidden) return
    if (o.idle?.()) last = ms / 1000
    else draw(ms / 1000)
    schedule()
  }
  const schedule = () => {
    if (frame || timer) return
    const wait = every()
    if (wait > 0)
      timer = setTimeout(() => {
        timer = undefined
        frame = requestAnimationFrame(tick)
      }, wait * 1000)
    else frame = requestAnimationFrame(tick)
  }
  const onVisible = () => {
    if (document.hidden) return
    last = now()
    schedule()
  }
  // The first frame right away, so it never shows empty.
  draw(now())
  schedule()
  document.addEventListener('visibilitychange', onVisible)
  return () => {
    cancelAnimationFrame(frame)
    clearTimeout(timer)
    document.removeEventListener('visibilitychange', onVisible)
  }
}

export interface PillProps {
  mood: Mood
  /** What thinking is busy with: a wave, reading a file, or searching. */
  glint?: Glint
  width: number
  height: number
  /** peek: the tab at the screen edge · header: the panel · big: Settings' preview. */
  cls: SizeClass
  look: Pick<StewardPrefs, 'version' | 'color' | 'glass' | 'mouth' | 'personality'> & Partial<Pick<StewardPrefs, 'liveliness'>>
  /** Tucked away at the screen edge: it draws less often. */
  tucked?: boolean
  /** Dim when idle: faded, still, and not drawn until it wakes. */
  dimmed?: boolean
  /** Which way the panel is from it (-1 left, 1 right; 0, the default: it's the panel's own). Needs you looks there when impatient. */
  panelSide?: number
}

/**
 * The character, alive. Its eyes step every frame and look at the cursor while it's over the window. Tucked away
 * it draws less often (resting ten times a second), and while the page is hidden it doesn't draw at all.
 */
export function Pill({ mood, glint = 'sweep', width, height, cls, look, tucked = false, dimmed = false, panelSide = 0 }: PillProps) {
  const host = useRef<HTMLDivElement>(null)
  const [st] = useState(() => createEyes(seed(), now()))
  const dark = useMedia('(prefers-color-scheme: dark)')
  const reduced = useMedia('(prefers-reduced-motion: reduce)')
  const { version, color, glass, mouth, personality, liveliness } = look

  useEffect(() => setMood(st, mood, glint), [st, mood, glint])
  useEffect(() => setStyle(st, { mouth, lively: personality === 'lively', toward: panelSide, still: liveliness === 'off' }), [st, mouth, personality, panelSide, liveliness])
  // Read by the drawing loop, so dimming and waking don't rebuild the character.
  const dimNow = useRef(dimmed)
  useEffect(() => {
    dimNow.current = dimmed
  }, [dimmed])

  useEffect(() => {
    const el = host.current
    if (!el) return
    const view = makeView(version, width, height, { color: colorHex(color), tinted: glass === 'tinted', light: !dark, mouth, cls })
    el.replaceChildren(view.el)

    let pointer: { x: number; y: number } | null = null
    const onMove = (e: PointerEvent) => (pointer = { x: e.clientX, y: e.clientY })
    const onLeave = () => (pointer = null)
    const nod = () => pressKey(st)
    const stop = runEyes(st, [view], { cursor: () => (pointer ? toward(pointer, el) : null), reduced, tucked, idle: () => dimNow.current })
    typed.add(nod)
    window.addEventListener('pointermove', onMove)
    document.documentElement.addEventListener('pointerleave', onLeave)
    return () => {
      stop()
      typed.delete(nod)
      window.removeEventListener('pointermove', onMove)
      document.documentElement.removeEventListener('pointerleave', onLeave)
    }
  }, [st, version, color, glass, mouth, cls, width, height, dark, reduced, tucked])

  return <div ref={host} className={dimmed ? 'pill-host dimmed' : 'pill-host'} style={{ width, height }} aria-hidden="true" />
}
