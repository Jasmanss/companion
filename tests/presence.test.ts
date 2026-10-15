import { describe, expect, it } from 'vitest'
import {
  asleep,
  EDGE_BAND,
  EDGE_DWELL_MS,
  inEdgeZone,
  menuBarTitle,
  NOTCH_DWELL_MS,
  nextLookMs,
  peeksOut,
  presenceNote,
  screenBeside,
  splitAlerts,
  stepPresence,
  TUCK_MS,
  WATCH_MS,
  WATCH_ZONE_MS,
  type PresenceInput,
  type PresenceState,
} from '../src/main/presence'
import type { AlertPeek, AlertView } from '../src/shared/types'

const SCREEN = { x: 0, y: 0, width: 1512, height: 982 }
const CENTER = 500

describe('the push zone at the screen edge', () => {
  it('is within 2 points of the edge Steward is on, inside the band around the tab', () => {
    expect(inEdgeZone({ x: 1511, y: CENTER }, SCREEN, 'right', CENTER)).toBe(true)
    expect(inEdgeZone({ x: 1510, y: CENTER + EDGE_BAND }, SCREEN, 'right', CENTER)).toBe(true)
    expect(inEdgeZone({ x: 1511, y: CENTER - EDGE_BAND }, SCREEN, 'right', CENTER)).toBe(true)
    expect(inEdgeZone({ x: 1, y: CENTER }, SCREEN, 'left', CENTER)).toBe(true)
  })

  it('does nothing anywhere else on the edge, so scrollbars and side panels are left alone', () => {
    expect(inEdgeZone({ x: 1511, y: CENTER + EDGE_BAND + 1 }, SCREEN, 'right', CENTER)).toBe(false)
    expect(inEdgeZone({ x: 1511, y: 40 }, SCREEN, 'right', CENTER)).toBe(false)
    expect(inEdgeZone({ x: 1508, y: CENTER }, SCREEN, 'right', CENTER)).toBe(false)
  })

  it('is on the edge Steward is on, and on its screen', () => {
    expect(inEdgeZone({ x: 1, y: CENTER }, SCREEN, 'right', CENTER)).toBe(false)
    expect(inEdgeZone({ x: 1511, y: CENTER }, SCREEN, 'left', CENTER)).toBe(false)
    expect(inEdgeZone({ x: 1600, y: CENTER }, SCREEN, 'right', CENTER)).toBe(false)
  })

  it("knows when another screen touches that edge, so the cursor passes through instead of pushing", () => {
    const next = { x: 1512, y: 100, width: 2560, height: 1440 }
    expect(screenBeside(SCREEN, [next], 'right')).toBe(true)
    expect(screenBeside(SCREEN, [next], 'left')).toBe(false)
    expect(screenBeside(SCREEN, [{ x: -2560, y: 0, width: 2560, height: 1440 }], 'left')).toBe(true)
    // Diagonal, or across a gap, doesn't touch.
    expect(screenBeside(SCREEN, [{ x: 1512, y: 982, width: 800, height: 600 }], 'right')).toBe(false)
    expect(screenBeside(SCREEN, [{ x: 1700, y: 0, width: 800, height: 600 }], 'right')).toBe(false)
    expect(screenBeside(SCREEN, [], 'right')).toBe(false)
  })
})

/** Runs the rules over a list of (time, input) looks, from the start, and says what happened at each. */
function run(looks: [number, Partial<PresenceInput>][], start: PresenceState = asleep(), base: Partial<PresenceInput> = {}) {
  let state = start
  return looks.map(([now, partial]) => {
    const step = stepPresence(state, { now, quiet: true, hidden: false, rest: true, inZone: false, onIt: false, dwellMs: EDGE_DWELL_MS, ...base, ...partial })
    state = step.state
    return { now, change: step.change, revealed: step.state.revealed }
  })
}

describe('coming out', () => {
  it('after the cursor pushes against its spot for 300 ms, not before', () => {
    const steps = run([
      [0, { inZone: true }],
      [150, { inZone: true }],
      [299, { inZone: true }],
      [300, { inZone: true }],
    ])
    expect(steps.map((s) => s.change)).toEqual([null, null, null, 'reveal'])
    expect(steps.map((s) => s.revealed)).toEqual([false, false, false, true])
  })

  it('starts counting only inside the zone, and leaving cancels the push', () => {
    const steps = run([
      [0, { inZone: false }],
      [200, { inZone: true }],
      [350, { inZone: false }],
      [400, { inZone: true }],
      [650, { inZone: true }],
      [700, { inZone: true }],
    ])
    // The first push lasted 150 ms and was cancelled; the second began at 400 and comes out at 700.
    expect(steps.map((s) => s.change)).toEqual([null, null, null, null, null, 'reveal'])
  })

  it('takes 250 ms for the cursor resting on the notch', () => {
    const steps = run(
      [
        [0, { inZone: true }],
        [249, { inZone: true }],
        [250, { inZone: true }],
      ],
      asleep(),
      { dwellMs: NOTCH_DWELL_MS },
    )
    expect(steps.map((s) => s.change)).toEqual([null, null, 'reveal'])
  })

  it('also when something other than a push needs it: the agent starts working with the panel closed', () => {
    expect(run([[0, { rest: false }]]).map((s) => s.change)).toEqual(['reveal'])
  })

  it('never when manually hidden: pushes and work do nothing, and any state is forgotten', () => {
    const steps = run([[0, { inZone: true }], [1000, { inZone: true }], [2000, { rest: false }]], { revealed: true, since: 5 }, { hidden: true })
    expect(steps.map((s) => [s.change, s.revealed])).toEqual([[null, false], [null, false], [null, false]])
  })

  it('never when Presence is Always visible: there is nothing to come out of', () => {
    expect(run([[0, { inZone: true }], [1000, { inZone: true }]], asleep(), { quiet: false }).every((s) => s.change === null && !s.revealed)).toBe(true)
  })
})

describe('going back', () => {
  const out: PresenceState = { revealed: true, since: null }

  it('after 1.5 seconds with the cursor away and everything at rest', () => {
    const steps = run([[0, {}], [TUCK_MS - 1, {}], [TUCK_MS, {}]], out)
    expect(steps.map((s) => s.change)).toEqual([null, null, 'tuck'])
    expect(steps.map((s) => s.revealed)).toEqual([true, true, false])
  })

  it('counts from when the cursor left, and the cursor coming back starts it over', () => {
    const steps = run([[0, { onIt: true }], [1000, { onIt: true }], [1200, {}], [2500, { onIt: true }], [2600, {}], [4099, {}], [4100, {}]], out)
    expect(steps.map((s) => s.change)).toEqual([null, null, null, null, null, null, 'tuck'])
  })

  it('not while the panel is open or an alert is showing, which are not rest', () => {
    const steps = run([[0, { rest: false }], [5000, { rest: false }], [10_000, { rest: false }]], out)
    expect(steps.every((s) => s.change === null && s.revealed)).toBe(true)
  })

  it('and the timer starts only once they are over', () => {
    const steps = run([[0, { rest: false }], [5000, { rest: false }], [5001, {}], [6000, {}], [6501, {}]], out)
    expect(steps.map((s) => s.change)).toEqual([null, null, null, null, 'tuck'])
  })

  it('manual Hide ends it, and nothing brings it back', () => {
    expect(run([[0, { hidden: true }]], out)[0]).toEqual({ now: 0, change: null, revealed: false })
  })
})

describe('how often the cursor is looked at', () => {
  it('5 times a second while it is out of sight, 20 when it is in the push zone, and not faster once out', () => {
    expect(nextLookMs(asleep(), { inZone: false })).toBe(WATCH_MS)
    expect(WATCH_MS).toBe(200)
    expect(nextLookMs(asleep(), { inZone: true })).toBe(WATCH_ZONE_MS)
    expect(WATCH_ZONE_MS).toBe(50)
    expect(nextLookMs({ revealed: true, since: null }, { inZone: true })).toBe(WATCH_MS)
  })
})

function alert(key: string, level: AlertView['level'] = 'normal'): AlertView {
  return { id: 1, key, level, title: key, at: 0 }
}

const KINDS: [string, string][] = [
  ['a session needs me (approval)', 'approval:s1:t1'],
  ['a session needs me (input)', 'input:s1:t1'],
  ['Steward needs your OK', 'agent-approval:abc'],
  ['a session finished', 'finished:s1:t1'],
  ['a build failed', 'deploy-failed:dpl_1'],
  ['a deploy went out', 'deploy-ready:dpl_1'],
  ['a PR was merged', 'pr-merged:/p:12'],
]

describe('which alerts peek out', () => {
  const table = (choice: AlertPeek) => Object.fromEntries(KINDS.map(([name, key]) => [name, peeksOut(key, choice)]))

  it('"Only when a session needs me": the sessions waiting on me, and Steward asking for its own OK', () => {
    expect(table('needs-me')).toEqual({
      'a session needs me (approval)': true,
      'a session needs me (input)': true,
      'Steward needs your OK': true,
      'a session finished': false,
      'a build failed': false,
      'a deploy went out': false,
      'a PR was merged': false,
    })
  })

  it('"Everything I turned on in Notifications": every alert that got through, as today', () => {
    expect(Object.values(table('all')).every(Boolean)).toBe(true)
  })

  it('"Nothing, menu bar only": none', () => {
    expect(Object.values(table('none')).some(Boolean)).toBe(false)
  })

  it('splits what reached it into what peeks out and what waits, in order', () => {
    const list = [alert('finished:a'), alert('approval:b', 'urgent'), alert('deploy-ready:c'), alert('input:d')]
    const { peek, held } = splitAlerts(list, 'needs-me')
    expect(peek.map((a) => a.key)).toEqual(['approval:b', 'input:d'])
    expect(held.map((a) => a.key)).toEqual(['finished:a', 'deploy-ready:c'])
    expect(splitAlerts(list, 'all')).toEqual({ peek: list, held: [] })
    expect(splitAlerts(list, 'none')).toEqual({ peek: [], held: list })
    expect(splitAlerts([], 'needs-me')).toEqual({ peek: [], held: [] })
  })
})

describe('the menu bar', () => {
  it('shows how many sessions wait on you, and a plain dot when a quieter alert waits too', () => {
    expect(menuBarTitle(0, 0)).toBe('')
    expect(menuBarTitle(2, 0)).toBe('2')
    expect(menuBarTitle(0, 3)).toBe('•')
    expect(menuBarTitle(1, 1)).toBe('1 •')
  })
})

describe('the first-time note', () => {
  it('names the edge and the shortcut', () => {
    expect(presenceNote({ where: 'right', hotkey: 'Alt+Space', besideScreen: false })).toBe('Steward hides until you need it. Push your cursor against the right edge, or press ⌥\u00a0Space.')
    expect(presenceNote({ where: 'left', hotkey: 'Alt+Space', besideScreen: false })).toContain('against the left edge')
  })

  it('adds the way around it when another screen touches that edge', () => {
    expect(presenceNote({ where: 'right', hotkey: 'Alt+Space', besideScreen: true })).toBe(
      'Steward hides until you need it. Push your cursor against the right edge, or press ⌥\u00a0Space. On a screen next to another one, use ⌥\u00a0Space or the menu bar icon.',
    )
  })

  it('points at the notch in the notch, and at the menu bar icon when the shortcut is off', () => {
    expect(presenceNote({ where: 'notch', hotkey: 'Alt+Space', besideScreen: true })).toBe('Steward hides until you need it. Rest your cursor on the notch, or press ⌥\u00a0Space.')
    expect(presenceNote({ where: 'right', hotkey: '', besideScreen: false })).toBe('Steward hides until you need it. Push your cursor against the right edge, or use the menu bar icon.')
    expect(presenceNote({ where: 'right', hotkey: '', besideScreen: true })).toContain('On a screen next to another one, use the menu bar icon.')
  })
})
