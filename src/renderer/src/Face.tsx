import { useEffect, useRef } from 'react'
import type { Mood } from '../../shared/types'
import { drawFace, initialFace, stepFace } from './face-drawing'

/** The face's colors come from the theme: the tint's glow on dark glass, its ink on light. Worried is warm. */
function faceColors(): { face: string; warm: string } {
  const css = getComputedStyle(document.documentElement)
  return { face: css.getPropertyValue('--face').trim() || '#60beff', warm: css.getPropertyValue('--warm').trim() || '#ffc46b' }
}

/** How long a tucked-away face keeps drawing after a change before it holds still. */
const SETTLE_MS = 1500

/**
 * The glowing face, redrawn every frame. Eyes follow the pointer while it's over the window.
 * idle (tucked away): it draws until the face has settled, then stops, and wakes again for a new mood.
 * It never draws while the window is hidden.
 */
export function Face({ mood, width, height, idle = false }: { mood: Mood; width: number; height: number; idle?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const moodRef = useRef(mood)
  const wake = useRef<() => void>(() => {})

  useEffect(() => {
    moodRef.current = mood
    wake.current()
  }, [mood])

  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const dpr = window.devicePixelRatio || 1
    el.width = width * dpr
    el.height = height * dpr
    const g = el.getContext('2d')!
    g.scale(dpr, dpr)

    const face = initialFace()
    const pointer = { x: 0, y: 0 }
    const onMove = (e: PointerEvent) => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1
      pointer.y = (e.clientY / window.innerHeight) * 2 - 1
      wake.current()
    }
    window.addEventListener('pointermove', onMove)
    let colors = faceColors()
    const scheme = window.matchMedia('(prefers-color-scheme: dark)')
    const onScheme = () => {
      colors = faceColors()
      wake.current()
    }
    scheme.addEventListener('change', onScheme)

    let frame = 0
    let last = performance.now()
    let awakeSince = last
    let blinkAt = -1
    let nextBlink = 1.5
    const tick = (now: number) => {
      frame = 0
      if (document.hidden) return
      const t = now / 1000
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      if (!idle && t > nextBlink) {
        blinkAt = t
        nextBlink = t + 2.6 + Math.random() * 3
      }
      stepFace(face, moodRef.current, t, dt, pointer, blinkAt)
      drawFace(g, width, height, face, moodRef.current, t, moodRef.current === 'worried' ? colors.warm : colors.face)
      if (!idle || now - awakeSince < SETTLE_MS) frame = requestAnimationFrame(tick)
    }
    wake.current = () => {
      awakeSince = performance.now()
      if (frame) return
      last = performance.now()
      frame = requestAnimationFrame(tick)
    }
    const onVisible = () => !document.hidden && wake.current()
    document.addEventListener('visibilitychange', onVisible)
    wake.current()
    return () => {
      cancelAnimationFrame(frame)
      wake.current = () => {}
      window.removeEventListener('pointermove', onMove)
      scheme.removeEventListener('change', onScheme)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [width, height, idle])

  return <canvas ref={canvas} style={{ width, height }} aria-hidden="true" />
}
