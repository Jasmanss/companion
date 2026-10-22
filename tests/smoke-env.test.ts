import { describe, expect, it } from 'vitest'
import type { App, BrowserWindow, Display, Screen } from 'electron'
import { HIDDEN_OPACITY, keepMacAwake, keepOffTheUsersScreen, pretendNotch, pretendNotchScreen, PRETEND_MENU_BAR, smokeHidden, withNotchedMenuBar } from '../src/main/smoke-env'

const SMOKE = { STEWARD_SMOKE_OUT: 'out/smoke.png' }
/** A CI runner's screen: 1920 x 1080, menu bar 25 pt, Dock at the bottom. */
const RUNNER = { id: 7, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 25, width: 1920, height: 1000 } } as Display

describe('hidden or visible', () => {
  it('hides the windows in a smoke run unless asked to show them', () => {
    expect(smokeHidden(SMOKE)).toBe(true)
    expect(smokeHidden({ ...SMOKE, STEWARD_SMOKE_VISIBLE: '1' })).toBe(false)
    expect(smokeHidden({ ...SMOKE, STEWARD_SMOKE_VISIBLE: 'true' })).toBe(false)
    expect(smokeHidden({ ...SMOKE, STEWARD_SMOKE_VISIBLE: '0' })).toBe(true)
    expect(smokeHidden({ ...SMOKE, STEWARD_SMOKE_VISIBLE: '' })).toBe(true)
  })

  it('never hides the app itself: no smoke run, no hiding', () => {
    expect(smokeHidden({})).toBe(false)
    expect(smokeHidden({ STEWARD_SMOKE_VISIBLE: '0' })).toBe(false)
  })
})

describe('the pretend notch', () => {
  it('puts a 185 x 32 notch in the middle of the main display, at its top', () => {
    expect(pretendNotch({ ...SMOKE, STEWARD_SMOKE_NOTCH: '1' }, RUNNER)).toEqual({ displayId: 7, x: 867.5, y: 0, width: 185, height: 32 })
    const offset = { id: 2, bounds: { x: -1512, y: 180, width: 1512, height: 982 } }
    expect(pretendNotch({ ...SMOKE, STEWARD_SMOKE_NOTCH: '1' }, offset)).toEqual({ displayId: 2, x: -1512 + 663.5, y: 180, width: 185, height: 32 })
  })

  it('is off unless asked for, and never outside a smoke run', () => {
    expect(pretendNotch(SMOKE, RUNNER)).toBeNull()
    expect(pretendNotch({ ...SMOKE, STEWARD_SMOKE_NOTCH: '0' }, RUNNER)).toBeNull()
    expect(pretendNotch({ STEWARD_SMOKE_NOTCH: '1' }, RUNNER)).toBeNull()
  })

  it("gives the display a notched Mac's menu bar, keeping the bottom of the work area where it was", () => {
    const shown = withNotchedMenuBar({ ...SMOKE, STEWARD_SMOKE_NOTCH: '1' }, RUNNER)
    expect(shown.workArea).toEqual({ x: 0, y: PRETEND_MENU_BAR, width: 1920, height: 1025 - PRETEND_MENU_BAR })
    expect(shown.bounds).toEqual(RUNNER.bounds)
    expect(shown.id).toBe(7)
  })

  it('leaves a display alone that already has a menu bar this tall, and every display outside a pretend run', () => {
    const tall = { ...RUNNER, workArea: { x: 0, y: 38, width: 1920, height: 987 } } as Display
    expect(withNotchedMenuBar({ ...SMOKE, STEWARD_SMOKE_NOTCH: '1' }, tall)).toBe(tall)
    expect(withNotchedMenuBar(SMOKE, RUNNER)).toBe(RUNNER)
    expect(withNotchedMenuBar({ STEWARD_SMOKE_NOTCH: '1' }, RUNNER)).toBe(RUNNER)
  })
})

/** Just enough of Electron's app and BrowserWindow to see what the hiding does to them. */
function fakes() {
  const calls: string[] = []
  const created: ((event: unknown, w: unknown) => void)[] = []
  const app = {
    focus: () => calls.push('app.focus'),
    setActivationPolicy: (p: string) => calls.push(`policy ${p}`),
    on: (name: string, fn: (event: unknown, w: unknown) => void) => name === 'browser-window-created' && created.push(fn),
  }
  class FakeWindow {
    focus() { calls.push('focus') }
    show() { calls.push('show') }
    showInactive() { calls.push('showInactive') }
    static getFocusedWindow() { return null }
  }
  const win = () => {
    const w = { opacity: -1, ignoring: [] as boolean[], webContents: { focus: () => calls.push('webContents.focus') }, setOpacity(o: number) { w.opacity = o }, setIgnoreMouseEvents(i: boolean) { w.ignoring.push(i) } }
    return w
  }
  return { app, FakeWindow, calls, created, win }
}

describe('keeping the windows off the screen', () => {
  it('makes show() a quiet show and focus() a no-op, for every window and for the app', () => {
    const f = fakes()
    keepOffTheUsersScreen(f.app as unknown as App, f.FakeWindow as unknown as typeof BrowserWindow)
    f.calls.length = 0
    const w = new f.FakeWindow()
    w.show()
    w.focus()
    f.app.focus()
    expect(f.calls).toEqual(['showInactive'])
  })

  it('makes each new window see-through and deaf to the mouse, and keeps it that way when the app asks otherwise', () => {
    const f = fakes()
    keepOffTheUsersScreen(f.app as unknown as App, f.FakeWindow as unknown as typeof BrowserWindow)
    const w = f.win()
    f.created[0]({}, w)
    expect(w.opacity).toBe(HIDDEN_OPACITY)
    // Not exactly 0: macOS stops drawing such a window properly and the animations in it stall.
    expect(HIDDEN_OPACITY).toBeGreaterThan(0)
    expect(HIDDEN_OPACITY).toBeLessThanOrEqual(0.02)
    w.setIgnoreMouseEvents(false)
    expect(w.ignoring.every((i) => i)).toBe(true)
    f.calls.length = 0
    w.webContents.focus()
    expect(f.calls).toEqual([])
  })

  it('makes the app an accessory, which launching and showing windows never activates', () => {
    const f = fakes()
    keepOffTheUsersScreen(f.app as unknown as App, f.FakeWindow as unknown as typeof BrowserWindow)
    if (process.platform === 'darwin') expect(f.calls).toContain('policy accessory')
  })
})

describe('keeping the Mac awake for the run', () => {
  it('holds off sleep and display sleep until the run ends', () => {
    const asked: string[] = []
    keepMacAwake({ start: (type) => (asked.push(type), 1) })
    expect(asked).toEqual(['prevent-display-sleep'])
  })
})

describe('one pretend screen for the app and the checks', () => {
  /** A runner with its menu bar at 31 pt (the CI run's work area began at y 31) and a second screen beside it. */
  const runner = { id: 7, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 31, width: 1920, height: 1000 } } as Display
  const beside = { id: 8, bounds: { x: 1920, y: 0, width: 1280, height: 800 }, workArea: { x: 1920, y: 25, width: 1280, height: 775 } } as Display
  const fakeScreen = () =>
    ({
      getAllDisplays: () => [runner, beside],
      getPrimaryDisplay: () => runner,
      getDisplayNearestPoint: (p: { x: number }) => (p.x >= 1920 ? beside : runner),
      getDisplayMatching: (r: { x: number }) => (r.x >= 1920 ? beside : runner),
    }) as unknown as Screen
  const NOTCHED = { ...SMOKE, STEWARD_SMOKE_NOTCH: '1' }

  it('shows the main display with the notched Mac menu bar however it is asked for, bottom edge unchanged', () => {
    const screen = fakeScreen()
    pretendNotchScreen(NOTCHED, screen)
    const want = { x: 0, y: PRETEND_MENU_BAR, width: 1920, height: 1031 - PRETEND_MENU_BAR }
    expect(screen.getPrimaryDisplay().workArea).toEqual(want)
    expect(screen.getAllDisplays()[0].workArea).toEqual(want)
    expect(screen.getDisplayNearestPoint({ x: 100, y: 100 }).workArea).toEqual(want)
    expect(screen.getDisplayMatching({ x: 100, y: 100, width: 400, height: 600 }).workArea).toEqual(want)
  })

  it('leaves the other screens alone', () => {
    const screen = fakeScreen()
    pretendNotchScreen(NOTCHED, screen)
    expect(screen.getAllDisplays()[1]).toBe(beside)
    expect(screen.getDisplayNearestPoint({ x: 2000, y: 100 })).toBe(beside)
    expect(screen.getDisplayMatching({ x: 2000, y: 100, width: 400, height: 600 })).toBe(beside)
  })

  it('does nothing without a pretend notch, or outside a smoke run', () => {
    for (const env of [SMOKE, { STEWARD_SMOKE_NOTCH: '1' }]) {
      const screen = fakeScreen()
      pretendNotchScreen(env, screen)
      expect(screen.getPrimaryDisplay()).toBe(runner)
      expect(screen.getAllDisplays()[0]).toBe(runner)
    }
  })
})
