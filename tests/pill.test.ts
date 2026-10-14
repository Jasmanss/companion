import { describe, expect, it } from 'vitest'
import type { ActivityKind, Mood } from '../src/shared/types'
import { createEyes, dotsAt, marks, pixelEyes, setMood, setStyle, stepEyes, vectorEyes, type EyesState } from '../src/renderer/src/pill/eyes'
import { glintFor, workingMood } from '../src/renderer/src/pill/glint'

const MOODS: Mood[] = ['idle', 'listening', 'thinking', 'talking', 'done', 'celebrating', 'needs-you', 'worried', 'mad', 'resting', 'sleepy']
const GEO = { cx: 50, cy: 50, W: 88, H: 48 }

/** Step the eyes for a while at one frame rate, calling look after every step. */
function run(st: EyesState, seconds: number, dt: number, look: (st: EyesState) => void = () => {}, rm = false) {
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    stepEyes(st, st.t + dt, dt, { x: Math.sin(i), y: Math.cos(i) }, rm)
    look(st)
  }
}

describe("the app's Pill eyes", () => {
  for (const lively of [true, false]) {
    it(`stay finite and small in every mood at a slow frame rate (${lively ? 'lively' : 'calm'})`, () => {
      for (const mood of MOODS) {
        const st = createEyes(3, 100)
        setStyle(st, { lively })
        setMood(st, mood)
        run(st, 5, 0.25, (s) => {
          for (const side of ['L', 'R'] as const) for (const v of Object.values(s.p[side])) expect(Number.isFinite(v), mood).toBe(true)
          expect(Math.abs(s.body.tx), mood).toBeLessThan(0.1)
          expect(Math.abs(s.body.ty), mood).toBeLessThan(0.15)
          expect(s.body.sc, mood).toBeGreaterThan(0.8)
        })
      }
    })
  }

  it('starts its clock when it is made, so a mood set right away plays its entrance', () => {
    const st = createEyes(1, 500)
    setMood(st, 'needs-you')
    expect(st.since).toBe(500)
    stepEyes(st, 500.1, 0.1, null)
    expect(marks(st, { cls: 'header', mouth: true, glass: true }).symbol!.s).toBeLessThan(1) // the "!" is still popping in
  })

  it('hops half as high when calm', () => {
    const hop = (lively: boolean) => {
      const st = createEyes(2, 0)
      setStyle(st, { lively })
      setMood(st, 'celebrating')
      let most = 0
      run(st, 3, 1 / 60, (s) => (most = Math.max(most, -s.body.ty)))
      return most
    }
    expect(hop(true)).toBeCloseTo(0.09, 2)
    expect(hop(false)).toBeCloseTo(0.045, 2)
  })

  it('glances around less often when calm', () => {
    const glances = (lively: boolean) => {
      const st = createEyes(4, 0)
      setStyle(st, { lively })
      let n = 0, next = st.glance.next
      run(st, 120, 1 / 30, (s) => {
        if (s.glance.next !== next) n++
        next = s.glance.next
      })
      return n
    }
    expect(glances(false)).toBeLessThan(glances(true) * 0.65)
  })

  it('confetti bursts three times when lively and once when calm', () => {
    const pieces = (lively: boolean) => {
      const st = createEyes(5, 0)
      setStyle(st, { lively })
      setMood(st, 'celebrating')
      const counts: number[] = []
      for (const t of [0.5, 1.8, 3.1]) {
        stepEyes(st, t, 0.05, null)
        counts.push(marks(st, { cls: 'big', mouth: true, glass: false }).confetti.length)
      }
      return counts
    }
    // Five pieces always rest by the corner; each burst adds nine.
    expect(pieces(true)).toEqual([14, 14, 14])
    expect(pieces(false)).toEqual([14, 5, 5])
  })

  it('holds a still pose with reduced motion: no blinks, no body moves, still dots', () => {
    const st = createEyes(6, 0)
    setMood(st, 'thinking')
    run(st, 3, 0.1, (s) => {
      expect(s.blink).toBe(0)
      expect(s.body).toEqual({ tx: 0, ty: 0, sc: 1, rot: 0 })
      expect(dotsAt(s).map((d) => d.y)).toEqual([-0.25, -0.25, -0.25])
    }, true)
  })

  it('lights the thinking dots in turn while reading, and circles them while searching', () => {
    const st = createEyes(7, 0)
    setMood(st, 'thinking', 'step')
    const lit = [0.1, 0.4, 0.7].map((t) => {
      stepEyes(st, t, 0.05, null)
      return dotsAt(st).filter((d) => d.a === 1).length
    })
    expect(lit).toEqual([1, 2, 3])
    setMood(st, 'thinking', 'search')
    stepEyes(st, 1.5, 0.05, null)
    expect(dotsAt(st).every((d) => d.orbit === 1)).toBe(true)
  })

  it('never lets the talking mouth touch the eyes', () => {
    const st = createEyes(8, 0)
    setMood(st, 'talking')
    run(st, 6, 1 / 60, (s) => {
      const { eyes, mouth } = vectorEyes(s, GEO)
      if (mouth) for (const e of eyes) expect(mouth.top).toBeGreaterThan(e.bottom + 2)
    })
  })

  it('keeps the blocky eyes and mouth apart and on the 16 x 8 grid', () => {
    for (const mood of MOODS) {
      const st = createEyes(9, 0)
      setMood(st, mood)
      run(st, 3, 1 / 20, (s) => {
        const cells = pixelEyes(s, { mouth: true })
        const eyes = new Set(cells.filter((c) => !c.mouth).map((c) => `${c.x},${c.y}`))
        for (const c of cells) {
          expect(c.x, mood).toBeGreaterThanOrEqual(0)
          expect(c.x, mood).toBeLessThan(16)
          if (c.mouth) {
            expect(eyes.has(`${c.x},${c.y}`)).toBe(false)
            expect(eyes.has(`${c.x},${c.y - 1}`), 'a clear row above the mouth').toBe(false)
          }
        }
      })
    }
  })
})

describe('what the character mirrors', () => {
  it('reads a file with the dots lit in turn, and searches with them circling', () => {
    const cases: [ActivityKind | null, string][] = [
      ['read-file', 'step'],
      ['list-files', 'step'],
      ['read-logs', 'step'],
      ['search-web', 'search'],
      ['fetch-page', 'search'],
      ['search-photos', 'search'],
      ['run-command', 'sweep'],
      ['thinking', 'sweep'],
      [null, 'sweep'],
    ]
    for (const [kind, glint] of cases) expect(glintFor(kind), String(kind)).toBe(glint)
  })

  it('thinks while a step runs, even mid-reply, but never hides that it needs you', () => {
    expect(workingMood('talking', 'search-web')).toBe('thinking')
    expect(workingMood('talking', null)).toBe('talking')
    expect(workingMood('talking', 'thinking')).toBe('talking')
    expect(workingMood('needs-you', 'read-file')).toBe('needs-you')
    expect(workingMood('thinking', 'read-file')).toBe('thinking')
  })
})
