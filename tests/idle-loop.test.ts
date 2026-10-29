import { describe, expect, it } from 'vitest'
import { atRest, BIG_AFTER_MS, BIG_EVERY_MS, DOZE_AFTER_MS, FIRST_QUIET_MS, GAP_MS, IDLE_MOVES, IDLE_START, idleStep, isIdleMove, movePlays, type IdleInput, type IdleMove, type IdleState } from '../src/shared/idle-loop'
import { createEyes, setMood, setStyle, stepEyes, type EyesState } from '../src/renderer/src/pill/eyes'
import type { Mood } from '../src/shared/types'

/** A repeatable random: the same numbers every run. */
function seeded(seed: number): () => number {
  let s = seed
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}
const calm: IdleInput = { liveliness: 'calm', mood: 'idle', spot: 'panel', reduced: false, dimmed: false, alertOut: false, quietSince: 0 }

/** Run the loop as the panel's timer does (looking only when it says to), from a quiet starting at 0, until `endMs`. */
function play(o: Partial<IdleInput> = {}, endMs = DOZE_AFTER_MS + 60_000, seed = 7): { at: number; until: number; move: IdleMove }[] {
  const rand = seeded(seed)
  let state: IdleState = IDLE_START
  let now = 0
  const moves: { at: number; until: number; move: IdleMove }[] = []
  while (now <= endMs) {
    const step = idleStep(state, now, rand, { ...calm, ...o })
    state = step.state
    if (step.move) moves.push({ at: now, until: step.until!, move: step.move })
    if (step.at === null) break
    now = step.at
  }
  return moves
}

describe('the idle loop', () => {
  it('does nothing in the first 20 quiet seconds, then a move between 20 and 35 seconds', () => {
    const early = idleStep(IDLE_START, FIRST_QUIET_MS - 1, () => 0, calm)
    expect(early.move).toBeNull()
    expect(early.at).toBe(FIRST_QUIET_MS)
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const first = play({}, DOZE_AFTER_MS, seed)[0]
      expect(first.at).toBeGreaterThanOrEqual(FIRST_QUIET_MS)
      expect(first.at).toBeLessThanOrEqual(FIRST_QUIET_MS + GAP_MS[1] - GAP_MS[0])
    }
  })

  it('leaves 10 to 25 seconds between moves, never repeats one back to back, and dozes after 5 quiet minutes', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const moves = play({}, DOZE_AFTER_MS + 120_000, seed)
      expect(moves.length).toBeGreaterThan(6)
      for (let i = 1; i < moves.length; i++) {
        expect(moves[i].move).not.toBe(moves[i - 1].move)
        const gap = moves[i].at - moves[i - 1].until
        expect(gap).toBeGreaterThanOrEqual(GAP_MS[0])
        expect(gap).toBeLessThanOrEqual(GAP_MS[1])
      }
      expect(moves.every((m) => m.at < DOZE_AFTER_MS)).toBe(true)
    }
  })

  it('keeps the yawn and the stretch for after 2 quiet minutes, at most one every 4 minutes', () => {
    let bigs = 0
    for (let seed = 1; seed <= 40; seed++) {
      const big = play({}, DOZE_AFTER_MS, seed).filter((m) => m.move === 'yawn' || m.move === 'stretch')
      bigs += big.length
      for (const m of big) expect(m.at).toBeGreaterThanOrEqual(BIG_AFTER_MS)
      for (let i = 1; i < big.length; i++) expect(big[i].at - big[i - 1].at).toBeGreaterThanOrEqual(BIG_EVERY_MS)
    }
    expect(bigs).toBeGreaterThan(0)
  })

  it('remembers the last big move into the next quiet', () => {
    const rand = () => 0.99 // the last move in the list that's allowed: the stretch once big moves are
    const s1 = idleStep({ ...IDLE_START, quietSince: 0, nextAt: 0 }, BIG_AFTER_MS, rand, calm)
    expect(s1.move).toBe('stretch')
    // Something happens and the quiet starts over: two minutes later a big move still waits for its 4 minutes.
    const q = BIG_AFTER_MS + 5_000
    const s2 = idleStep({ ...s1.state, nextAt: 0 }, q + BIG_AFTER_MS, rand, { ...calm, quietSince: q })
    expect(s2.state.quietSince).toBe(q)
    const later = idleStep({ ...s2.state, nextAt: 0 }, q + BIG_AFTER_MS + 1, rand, { ...calm, quietSince: q })
    expect(later.move === 'yawn' || later.move === 'stretch').toBe(false)
  })

  it('does nothing unless Liveliness is Calm, with Reduce Motion, dimmed, with an alert out, or on any face but the calm ones', () => {
    const off: Partial<IdleInput>[] = [
      { liveliness: 'quiet' },
      { liveliness: 'off' },
      { reduced: true },
      { dimmed: true },
      { alertOut: true },
      ...(['focused', 'juggling', 'listening', 'thinking', 'talking', 'sleepy', 'watching', 'needs-you', 'done', 'worried'] as Mood[]).map((mood) => ({ mood })),
    ]
    for (const o of off) {
      expect(play(o)).toEqual([])
      // Nothing to look at until the input changes: no timer, so no poll.
      expect(idleStep(IDLE_START, 60_000, Math.random, { ...calm, ...o }).at).toBeNull()
    }
    expect(play({ mood: 'resting', spot: 'peek' }).length).toBeGreaterThan(0)
  })

  it('a new quiet starts the first wait over', () => {
    const s = idleStep(IDLE_START, 30_000, () => 0, calm)
    expect(s.move).not.toBeNull()
    const again = idleStep(s.state, 40_000, () => 0, { ...calm, quietSince: 35_000 })
    expect(again.move).toBeNull()
    expect(again.at).toBe(35_000 + FIRST_QUIET_MS)
  })

  it('at rest a yawn is a slow blink, in the panel a yawn', () => {
    const yawnRand = (n: number) => () => n
    // The pool after 2 quiet minutes: look around, smile, ponder, yawn, stretch (weights 4, 3, 4, 2, 2): 0.8 lands on the yawn.
    const at = (spot: 'panel' | 'peek') => idleStep({ ...IDLE_START, quietSince: 0, nextAt: 0 }, BIG_AFTER_MS, yawnRand(0.8), { ...calm, spot }).move
    expect(at('panel')).toBe('yawn')
    expect(at('peek')).toBe('slowblink')
    expect(atRest('yawn')).toBe('slowblink')
    expect(atRest('ponder')).toBe('ponder')
    expect(IDLE_MOVES.every((m) => isIdleMove(m.id))).toBe(true)
    expect(isIdleMove('slowblink') && !isIdleMove('idle') && !isIdleMove('resting')).toBe(true)
  })

  it('where the moves are sent (the notch), one plays only if it arrives on free eyes, and never starts halfway', () => {
    expect(movePlays({ mood: 'resting', plays: false }, 'ponder', true)).toBe(true)
    expect(movePlays({ mood: 'resting', plays: false }, 'ponder', false)).toBe(false) // dimmed, or the cursor near
    expect(movePlays({ mood: 'ponder', plays: true }, 'ponder', false)).toBe(false) // the cursor came near: it stops
    expect(movePlays({ mood: 'ponder', plays: false }, 'ponder', true)).toBe(false) // and doesn't come back
    expect(movePlays({ mood: 'ponder', plays: true }, 'resting', true)).toBe(false)
  })
})

/** Run the eyes in a move from idle for `seconds`, at 60 frames a second. */
function run(mood: Mood, seconds: number, o: { mouth?: boolean; still?: boolean } = {}): EyesState {
  const st = createEyes(3)
  setStyle(st, { mouth: o.mouth ?? true, still: o.still ?? false })
  const dt = 1 / 60
  let t = 0
  for (let i = 0; i < 30; i++) stepEyes(st, (t += dt), dt, null)
  setMood(st, mood)
  const end = t + seconds
  while (t < end) stepEyes(st, (t += dt), dt, null)
  return st
}

describe("the idle loop's moves on the face", () => {
  const MOVES: Mood[] = ['ponder', 'lookaround', 'smile', 'yawn', 'stretch', 'slowblink']

  it('stay steady and end back where they started', () => {
    for (const mood of MOVES) {
      const st = run(mood, 4)
      for (const side of ['L', 'R'] as const) for (const v of Object.values(st.p[side])) expect(Number.isFinite(v)).toBe(true)
      expect(Math.abs(st.body.rot)).toBeLessThan(0.5)
      expect(Math.abs(st.body.ty)).toBeLessThan(0.02)
    }
  })

  it('ponder looks up and aside with the head tilted, and look around goes both ways', () => {
    const p = run('ponder', 1.2)
    expect(p.look.x).toBeLessThan(-0.3)
    expect(p.look.y).toBeLessThan(-0.4)
    expect(p.body.rot).toBeGreaterThan(3)
    const xs = [0.9, 1.9].map((s) => run('lookaround', s).look.x)
    expect(xs[0]).toBeLessThan(-0.5)
    expect(xs[1]).toBeGreaterThan(0.5)
  })

  it('the yawn opens a mouth and closes the eyes, but no mouth when the mouth is off; the slow blink closes the lids', () => {
    const y = run('yawn', 1.2)
    expect(y.p.L.closed).toBeGreaterThan(0.8)
    expect(y.p.L.talk).toBeGreaterThan(0.8)
    expect(y.say.open).toBeGreaterThan(0.7)
    const quiet = run('yawn', 1.2, { mouth: false })
    expect(quiet.p.L.talk).toBeLessThan(0.05)
    expect(quiet.say.open).toBeLessThan(0.05)
    expect(run('slowblink', 0.75).p.L.lid).toBeGreaterThan(0.8)
    expect(run('stretch', 0.9).p.L.sy).toBeGreaterThan(1.2)
    expect(run('smile', 0.8).p.L.happy).toBeGreaterThan(0.4)
  })

  it('Liveliness Off: the calm faces never blink or glance, and still follow the cursor', () => {
    for (const mood of ['idle', 'resting'] as Mood[]) {
      const st = createEyes(4)
      setStyle(st, { still: true })
      setMood(st, mood)
      let t = 0
      for (let i = 0; i < 60 * 30; i++) {
        stepEyes(st, (t += 1 / 60), 1 / 60, null)
        expect(st.blink).toBe(0)
        expect(Math.abs(st.look.x)).toBeLessThan(0.15)
      }
    }
    const follows = createEyes(4)
    setStyle(follows, { still: true })
    let t = 0
    for (let i = 0; i < 60; i++) stepEyes(follows, (t += 1 / 60), 1 / 60, { x: 1, y: 0 })
    expect(follows.look.x).toBeGreaterThan(0.4)
    // A reaction still plays in full.
    const st = createEyes(4)
    setStyle(st, { still: true })
    setMood(st, 'idle')
    t = 0
    let blinked = false
    setMood(st, 'focused')
    for (let i = 0; i < 60 * 20; i++) blinked ||= stepEyes(st, (t += 1 / 60), 1 / 60, null).blink > 0
    expect(blinked).toBe(true)
  })
})
