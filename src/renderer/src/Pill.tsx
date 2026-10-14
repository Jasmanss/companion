import { useEffect, useRef, useState } from 'react'
import { colorHex } from '../../shared/steward'
import type { Mood, StewardPrefs } from '../../shared/types'
import { createEyes, pressKey, setMood, setStyle, stepEyes, type Glint, type SizeClass } from './pill/eyes'
import { makeView } from './pill/render'

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
const now = () => performance.now() / 1000

export interface PillProps {
  mood: Mood
  /** What thinking is busy with: a wave, reading a file, or searching. */
  glint?: Glint
  width: number
  height: number
  /** peek: the tab at the screen edge · header: the panel · big: Settings' preview. */
  cls: SizeClass
  look: Pick<StewardPrefs, 'version' | 'color' | 'glass' | 'mouth' | 'personality'>
  /** Tucked away at the screen edge: it draws less often. */
  tucked?: boolean
}

/**
 * The character, alive. Its eyes step every frame and look at the cursor while it's over the window. Tucked away
 * it draws less often (resting ten times a second), and while the page is hidden it doesn't draw at all.
 */
export function Pill({ mood, glint = 'sweep', width, height, cls, look, tucked = false }: PillProps) {
  const host = useRef<HTMLDivElement>(null)
  const [st] = useState(() => createEyes(nextSeed++, now()))
  const dark = useMedia('(prefers-color-scheme: dark)')
  const reduced = useMedia('(prefers-reduced-motion: reduce)')
  const { version, color, glass, mouth, personality } = look

  useEffect(() => setMood(st, mood, glint), [st, mood, glint])
  useEffect(() => setStyle(st, { mouth, lively: personality === 'lively' }), [st, mouth, personality])

  useEffect(() => {
    const el = host.current
    if (!el) return
    const view = makeView(version, width, height, { color: colorHex(color), tinted: glass === 'tinted', light: !dark, mouth, cls })
    el.replaceChildren(view.el)

    let pointer: { x: number; y: number } | null = null
    const onMove = (e: PointerEvent) => (pointer = { x: e.clientX, y: e.clientY })
    const onLeave = () => (pointer = null)
    /** The cursor relative to this Pill, in units of its size (at least the header's), or null when it's away. */
    const cursor = () => {
      if (!pointer) return null
      const r = el.getBoundingClientRect()
      return { x: (pointer.x - (r.left + r.width / 2)) / Math.max(90, r.width), y: (pointer.y - (r.top + r.height / 2)) / Math.max(70, r.height) }
    }
    const nod = () => pressKey(st)

    // Seconds between frames. Open: every frame. Tucked away: resting 10 a second, sleepy 20, the rest 30.
    // With reduced motion nothing moves on its own, so 10 a second is plenty.
    const every = () => (reduced || st.mood === 'resting' ? 0.1 : tucked ? (st.mood === 'sleepy' ? 0.05 : 1 / 30) : 0)
    let frame = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    let last = now()
    const draw = (t: number) => {
      stepEyes(st, t, t - last, cursor(), reduced)
      last = t
      view.standby(st.mood === 'resting' && !reduced)
      view.update(st)
    }
    const tick = (ms: number) => {
      frame = 0
      if (document.hidden) return
      draw(ms / 1000)
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
    typed.add(nod)
    window.addEventListener('pointermove', onMove)
    document.documentElement.addEventListener('pointerleave', onLeave)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(timer)
      typed.delete(nod)
      window.removeEventListener('pointermove', onMove)
      document.documentElement.removeEventListener('pointerleave', onLeave)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [st, version, color, glass, mouth, cls, width, height, dark, reduced, tucked])

  return <div ref={host} className="pill-host" style={{ width, height }} aria-hidden="true" />
}
