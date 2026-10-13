import { describe, expect, it } from 'vitest'
// @ts-expect-error eyes.js is a plain JS design file with no type declarations
import { MOODS, createEyes, setMood, setStyle, stepEyes } from '../design/pill/eyes.js'

type Eyes = { body: { rot: number }; p: Record<'L' | 'R', Record<string, number>> }
const ids: string[] = MOODS.map((m: { id: string }) => m.id)

// Slow frames (dt up to 0.25 s) used to make the body lean spring blow up. Every spring now takes small steps.
describe('Pill eyes at a slow frame rate', () => {
  for (const think of ['dots', 'bar']) {
    for (const mood of ids) {
      it(`${mood} (${think} thinking) keeps the body within 15 degrees at dt = 0.25`, () => {
        for (const from of ['idle', 'confused']) {
          const st: Eyes = createEyes(5)
          setStyle(st, { think, mouth: true })
          setMood(st, from)
          let t = 0
          for (let i = 0; i < 8; i++) stepEyes(st, (t += 0.25), 0.25, null)
          setMood(st, mood)
          for (let i = 0; i < 20; i++) { // 5 seconds
            stepEyes(st, (t += 0.25), 0.25, { x: Math.sin(i), y: Math.cos(i) })
            expect(Math.abs(st.body.rot)).toBeLessThanOrEqual(15)
            for (const side of ['L', 'R'] as const) for (const v of Object.values(st.p[side])) expect(Number.isFinite(v)).toBe(true)
          }
        }
      })
    }
  }
})
