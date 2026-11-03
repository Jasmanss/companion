import { describe, expect, it } from 'vitest'
import { createEyes, IMPATIENT_S, marks, setMood, setStyle, stepEyes, type EyesState } from '../src/renderer/src/pill/eyes'
import type { Mood } from '../src/shared/types'

const REACTIONS: Mood[] = ['confused', 'focused', 'juggling', 'nod', 'proud', 'hello']

/** Run the eyes in mood for this many seconds, at 60 frames a second (or slow frames), from idle. */
function run(mood: Mood, seconds: number, o: { rm?: boolean; dt?: number; toward?: number } = {}): EyesState {
  const st = createEyes(3)
  if (o.toward !== undefined) setStyle(st, { toward: o.toward })
  const dt = o.dt ?? 1 / 60
  let t = 0
  for (let i = 0; i < 30; i++) stepEyes(st, (t += dt), dt, null, o.rm)
  setMood(st, mood)
  const end = t + seconds
  while (t < end) stepEyes(st, (t += dt), dt, null, o.rm)
  return st
}

describe("the reactions' faces", () => {
  it('stay steady at a slow frame rate, the body never leaning past 15 degrees', () => {
    for (const mood of REACTIONS) {
      const st = createEyes(5)
      let t = 0
      setMood(st, mood)
      for (let i = 0; i < 40; i++) {
        stepEyes(st, (t += 0.25), 0.25, { x: Math.sin(i), y: Math.cos(i) })
        expect(Math.abs(st.body.rot)).toBeLessThanOrEqual(15)
        for (const side of ['L', 'R'] as const) for (const v of Object.values(st.p[side])) expect(Number.isFinite(v)).toBe(true)
      }
    }
  })

  it('hold a still pose with Reduce Motion: no body moves, and confused leans without rocking', () => {
    for (const mood of REACTIONS) {
      const a = run(mood, 1, { rm: true })
      const b = run(mood, 2.3, { rm: true })
      expect(a.look).toEqual(b.look)
      expect(a.body).toEqual(b.body)
      expect(a.body.rot).toBe(mood === 'confused' ? -6 : 0)
    }
  })

  it('confused looks two ways, rocks its head, and shows a "?"', () => {
    const st = run('confused', 1)
    expect(st.p.L.ox).toBeLessThan(-0.3)
    expect(st.p.R.ox).toBeGreaterThan(0.3)
    expect(marks(st, { cls: 'header', mouth: true, glass: false }).symbol?.kind).toBe('q')
    const rocks = new Set([0.8, 1.7, 2.6].map((s) => Math.sign(Math.round(run('confused', s).body.rot))))
    expect(rocks.has(1) && rocks.has(-1)).toBe(true)
  })

  it('focused reads along a line, and juggling follows the ball from side to side', () => {
    const xs = (mood: Mood) => [0.3, 0.7, 1.1, 1.5].map((s) => run(mood, s).look.x)
    const f = xs('focused')
    expect(f[3]).toBeGreaterThan(f[0])
    const j = [0.2, 0.55, 0.95, 1.3].map((s) => run('juggling', s).look.x)
    expect(Math.max(...j)).toBeGreaterThan(0.3)
    expect(Math.min(...j)).toBeLessThan(-0.3)
  })

  it('needs you grows impatient after two minutes: it looks toward the panel', () => {
    expect(Math.abs(run('needs-you', IMPATIENT_S - 5, { toward: 1, dt: 1 / 20 }).look.x)).toBeLessThan(0.05)
    expect(run('needs-you', IMPATIENT_S + 5, { toward: 1, dt: 1 / 20 }).look.x).toBeGreaterThan(0.3)
    expect(run('needs-you', IMPATIENT_S + 5, { toward: -1, dt: 1 / 20 }).look.x).toBeLessThan(-0.3)
    // The panel's own Pill has nowhere to look: it stays on you.
    expect(Math.abs(run('needs-you', IMPATIENT_S + 5, { toward: 0, dt: 1 / 20 }).look.x)).toBeLessThan(0.05)
  })

  it('proud throws one small burst of confetti, gone after a few seconds', () => {
    const conf = (s: number) => marks(run('proud', s), { cls: 'header', mouth: true, glass: false }).confetti
    expect(conf(0.5).length).toBeGreaterThan(5)
    expect(conf(3).every((c) => c.a > 0)).toBe(true)
    expect(conf(6.5).every((c) => c.a === 0)).toBe(true)
  })

  it('stay whole when a frame comes a few milliseconds before the moment the mood was set', () => {
    for (const mood of REACTIONS) {
      const st = createEyes(4)
      stepEyes(st, 100.05, 1 / 60, null)
      setMood(st, mood)
      stepEyes(st, 100.04, 1 / 60, null)
      stepEyes(st, 100.06, 1 / 60, null)
      expect(Number.isFinite(st.look.x) && Number.isFinite(st.look.y)).toBe(true)
      for (const side of ['L', 'R'] as const) for (const v of Object.values(st.p[side])) expect(Number.isFinite(v)).toBe(true)
    }
  })

  it('the nod dips once and comes back', () => {
    expect(run('nod', 0.45).look.y).toBeGreaterThan(0.25)
    expect(Math.abs(run('nod', 1.6).look.y + 0.05)).toBeLessThan(0.05)
  })
})
