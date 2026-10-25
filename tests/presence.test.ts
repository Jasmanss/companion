import { describe, expect, it } from 'vitest'
import {
  asleep,
  EDGE_BAND,
  EDGE_DWELL_MS,
  EDGE_FAR_DWELL_MS,
  EDGE_REARM,
  EDGE_STILL,
  FIRST_PEEK_HOLD_MS,
  firstPeekOver,
  freshPush,
  inEdgeZone,
  menuBarTitle,
  NOTCH_DWELL_MS,
  nextLookMs,
  peeksOut,
  presenceNote,
  firstPeekNote,
  presenceNoteParts,
  pushAlongEdge,
  screenBeside,
  showFirstPeek,
  splitAlerts,
  stepPresence,
  TUCK_MS,
  WATCH_MS,
  WATCH_ZONE_MS,
  type EdgeAt,
  type Point,
  type PresenceInput,
  type PresenceState,
} from '../src/main/presence'
import type { AlertPeek, AlertView } from '../src/shared/types'

const SCREEN = { x: 0, y: 0, width: 1512, height: 982 }
/** The 14-inch MacBook Pro's work area: under the 33-point menu bar, with the Dock hidden. */
const AREA = { x: 0, y: 33, width: 1512, height: 949 }
/** The middle of the tab's saved spot. */
const CENTER = 500
const AT: EdgeAt = { screen: SCREEN, area: AREA, edge: 'right', savedCenterY: CENTER, dockOnEdge: false }

describe('the push zone at the screen edge', () => {
  it('is within 2 points of the edge Steward is on, anywhere along the work area', () => {
    expect(inEdgeZone({ x: 1511, y: CENTER }, AT)).toBe(true)
    expect(inEdgeZone({ x: 1510, y: 33 }, AT)).toBe(true)
    expect(inEdgeZone({ x: 1511, y: 120 }, AT)).toBe(true)
    expect(inEdgeZone({ x: 1511, y: 981 }, AT)).toBe(true)
    expect(inEdgeZone({ x: 1, y: 700 }, { ...AT, edge: 'left' })).toBe(true)
  })

  it('never in the menu bar band, or beside a Dock at the bottom, or further than 2 points from the edge', () => {
    expect(inEdgeZone({ x: 1511, y: 20 }, AT)).toBe(false)
    expect(inEdgeZone({ x: 1511, y: 950 }, { ...AT, area: { ...AREA, height: 949 - 70 } })).toBe(false)
    expect(inEdgeZone({ x: 1508, y: CENTER }, AT)).toBe(false)
  })

  it('is on the edge Steward is on, and on its screen', () => {
    expect(inEdgeZone({ x: 1, y: CENTER }, AT)).toBe(false)
    expect(inEdgeZone({ x: 1511, y: CENTER }, { ...AT, edge: 'left' })).toBe(false)
    expect(inEdgeZone({ x: 1600, y: CENTER }, AT)).toBe(false)
  })

  it('with the Dock on the same edge, is only the band around the saved spot, as before the tab came to you', () => {
    const dock = { ...AT, area: { ...AREA, width: 1440 }, dockOnEdge: true }
    expect(inEdgeZone({ x: 1511, y: CENTER + EDGE_BAND }, dock)).toBe(true)
    expect(inEdgeZone({ x: 1511, y: CENTER + EDGE_BAND + 1 }, dock)).toBe(false)
    expect(inEdgeZone({ x: 1511, y: 120 }, dock)).toBe(false)
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

/** Runs looks at the cursor along the edge through pushAlongEdge and then the rules, as the edge's watcher does. */
function pushes(looks: [number, Point][], start: PresenceState = asleep(), at: EdgeAt = AT) {
  let state = start
  let push = freshPush()
  return looks.map(([now, cursor]) => {
    const look = pushAlongEdge(push, cursor, at, state.revealed)
    push = look.push
    const step = stepPresence(state, { now, quiet: true, hidden: false, rest: true, inZone: look.inZone, onIt: false, dwellMs: look.dwellMs, restart: look.restart })
    state = step.state
    return step.change
  })
}
const edge = (y: number): Point => ({ x: 1511, y })

describe('the tab comes to you', () => {
  it('after a push held for 300 ms near its saved spot, as before', () => {
    expect(pushes([[0, edge(520)], [150, edge(520)], [299, edge(520)], [300, edge(520)]])).toEqual([null, null, null, 'reveal'])
  })

  it(`after ${EDGE_FAR_DWELL_MS} ms anywhere else along the edge, high or low`, () => {
    expect(EDGE_FAR_DWELL_MS).toBe(500)
    for (const y of [40, 300, 960]) expect(pushes([[0, edge(y)], [300, edge(y)], [499, edge(y)], [500, edge(y)]])).toEqual([null, null, null, 'reveal'])
  })

  it(`only while the cursor is held still: a wobble of up to ${EDGE_STILL} points is fine, more starts the push over`, () => {
    expect(pushes([[0, edge(100)], [250, { x: 1510, y: 104 }], [500, { x: 1511, y: 103 }]])).toEqual([null, null, 'reveal'])
    expect(pushes([[0, edge(100)], [250, edge(107)], [500, edge(107)], [750, edge(107)]])).toEqual([null, null, null, 'reveal'])
  })

  it('never for a cursor sliding along the edge, like a scrollbar being dragged', () => {
    const slide = Array.from({ length: 60 }, (_, n): [number, Point] => [n * 50, edge(60 + n * 10)])
    expect(pushes(slide).every((change) => change === null)).toBe(true)
  })

  it(`once it has been out, only after the cursor has left the edge by more than ${EDGE_REARM} points`, () => {
    const out: PresenceState = { revealed: true, since: null }
    // Out, the cursor resting further down the edge: it tucks away and stays away; leaving by 4 points isn't leaving.
    expect(pushes([[0, edge(100)], [TUCK_MS, edge(100)], [2500, edge(100)], [3000, { x: 1508, y: 100 }], [3100, edge(100)], [4000, edge(100)]], out)).toEqual([null, 'tuck', null, null, null, null])
    // Leaving by 12 points and coming back counts.
    expect(pushes([[0, edge(100)], [TUCK_MS, edge(100)], [2000, { x: 1500, y: 100 }], [2100, edge(100)], [2600, edge(100)]], out)).toEqual([null, 'tuck', null, null, 'reveal'])
  })

  it('with the Dock on the same edge, only near the saved spot', () => {
    const dock = { ...AT, area: { ...AREA, width: 1440 }, dockOnEdge: true }
    expect(pushes([[0, edge(100)], [1000, edge(100)]], asleep(), dock)).toEqual([null, null])
    expect(pushes([[0, edge(CENTER)], [300, edge(CENTER)]], asleep(), dock)).toEqual([null, 'reveal'])
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

  it("in the notch island, a session finishing is the island's note, so it doesn't come out under the notch too", () => {
    const island = (choice: AlertPeek) => Object.fromEntries(KINDS.map(([name, key]) => [name, peeksOut(key, choice, true)]))
    expect(island('all')).toEqual({ ...table('all'), 'a session finished': false })
    expect(island('needs-me')).toEqual(table('needs-me'))
    expect(splitAlerts([alert('finished:a'), alert('deploy-ready:c')], 'all', true)).toEqual({ peek: [alert('deploy-ready:c')], held: [alert('finished:a')] })
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
  it('is one short line: where to push, or the shortcut', () => {
    expect(presenceNote({ where: 'right', hotkey: 'Alt+Space', besideScreen: false })).toBe('Hides until you need it. Push anywhere on the right edge or press ⌥\u00a0Space.')
    expect(presenceNote({ where: 'left', hotkey: 'Alt+Space', besideScreen: false })).toBe('Hides until you need it. Push anywhere on the left edge or press ⌥\u00a0Space.')
    expect(presenceNote({ where: 'notch', hotkey: 'Alt+Space', besideScreen: false })).toBe('Hides until you need it. Rest the cursor on the notch or press ⌥\u00a0Space.')
  })

  it("doesn't say anywhere when the Dock is on that edge, since only the tab's spot counts there", () => {
    expect(presenceNote({ where: 'right', hotkey: 'Alt+Space', besideScreen: false, dockOnEdge: true })).toBe('Hides until you need it. Push the right edge or press ⌥\u00a0Space.')
  })

  it('leaves out the edge when another screen touches it, since the cursor passes through', () => {
    expect(presenceNote({ where: 'right', hotkey: 'Alt+Space', besideScreen: true })).toBe('Hides until you need it. Press ⌥\u00a0Space.')
    // The notch has no neighbor to worry about.
    expect(presenceNote({ where: 'notch', hotkey: 'Alt+Space', besideScreen: true })).toBe('Hides until you need it. Rest the cursor on the notch or press ⌥\u00a0Space.')
  })

  it('points at the menu bar icon when the shortcut is off', () => {
    expect(presenceNote({ where: 'right', hotkey: '', besideScreen: false })).toBe('Hides until you need it. Push anywhere on the right edge or use the menu bar icon.')
    expect(presenceNote({ where: 'right', hotkey: '', besideScreen: true })).toBe('Hides until you need it. Use the menu bar icon.')
  })
})

describe('the first-launch peek', () => {
  it('shows on the first launch of a fresh install that hides until needed, and never again', () => {
    expect(showFirstPeek({ freshInstall: true, quiet: true, shown: false })).toBe(true)
    expect(showFirstPeek({ freshInstall: true, quiet: true, shown: true })).toBe(false)
    // An install that already had settings or state, or one switched to Always visible, never sees it.
    expect(showFirstPeek({ freshInstall: false, quiet: true, shown: false })).toBe(false)
    expect(showFirstPeek({ freshInstall: true, quiet: false, shown: false })).toBe(false)
  })

  it('stays out until the cursor has been on it and left, or 10 s have passed with the cursor off it', () => {
    const at = (now: number, touched: boolean, onIt: boolean) => firstPeekOver({ startedAt: 0, touched, onIt, now })
    expect(FIRST_PEEK_HOLD_MS).toBe(10_000)
    // Untouched: held for 10 s.
    expect(at(9_999, false, false)).toBe(false)
    expect(at(10_000, false, false)).toBe(true)
    // Read and left: over at once, however early.
    expect(at(2_000, true, true)).toBe(false)
    expect(at(2_500, true, false)).toBe(true)
    // While the cursor is on it, it never ends, however long.
    expect(at(60_000, true, true)).toBe(false)
  })

  it('says the note in two parts: what is happening, and how to bring Steward out', () => {
    expect(presenceNoteParts({ where: 'right', hotkey: 'Alt+Space', besideScreen: false })).toEqual({ title: 'Hides until you need it.', how: 'Push anywhere on the right edge or press ⌥\u00a0Space.' })
    expect(presenceNoteParts({ where: 'notch', hotkey: '', besideScreen: false }).how).toBe('Rest the cursor on the notch or use the menu bar icon.')
  })

  it('under the notch, the first-launch peek leads with how to bring Steward out, short enough for its one line', () => {
    expect(firstPeekNote({ where: 'notch', hotkey: 'Alt+Space', besideScreen: false })).toEqual({ title: 'Rest the cursor on the notch', detail: 'or press ⌥\u00a0Space.' })
    expect(firstPeekNote({ where: 'notch', hotkey: '', besideScreen: false }).detail).toBe('or use the menu bar icon.')
    // At the edge it's the whole note, as it was.
    expect(firstPeekNote({ where: 'right', hotkey: 'Alt+Space', besideScreen: false })).toEqual({ title: 'Hides until you need it.', detail: 'Push anywhere on the right edge or press ⌥\u00a0Space.' })
  })
})
