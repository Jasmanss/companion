import { useEffect, useRef } from 'react'
import type { Mood } from '../../shared/types'
import { drawFace, initialFace, stepFace } from './face-drawing'

const ACCENT = '#c9bcff'
/** Worried glows warm so a failed build reads at a glance. */
const COLORS: Partial<Record<Mood, string>> = { worried: '#ffc46b' }

/** The glowing face, redrawn every frame. Eyes follow the pointer while it's over the window. */
export function Face({ mood, width, height }: { mood: Mood; width: number; height: number }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const moodRef = useRef(mood)

  useEffect(() => {
    moodRef.current = mood
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
    }
    window.addEventListener('pointermove', onMove)

    let frame = 0
    let last = performance.now()
    let blinkAt = -1
    let nextBlink = 1.5
    const tick = (now: number) => {
      const t = now / 1000
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      if (t > nextBlink) {
        blinkAt = t
        nextBlink = t + 2.6 + Math.random() * 3
      }
      stepFace(face, moodRef.current, t, dt, pointer, blinkAt)
      drawFace(g, width, height, face, moodRef.current, t, COLORS[moodRef.current] ?? ACCENT)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', onMove)
    }
  }, [width, height])

  return <canvas ref={canvas} style={{ width, height }} aria-hidden="true" />
}
