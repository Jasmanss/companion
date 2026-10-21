// How the smoke check stays off the user's screen, and the notch it pretends to have on a Mac without one. Only the
// smoke check (STEWARD_SMOKE_OUT set) uses any of this; the app itself never does. The decisions are pure and tested;
// keepOffTheUsersScreen takes Electron's app and BrowserWindow as arguments so it can be tested with stand-ins.
import type { App, BrowserWindow, Display } from 'electron'
import type { NotchGeometry } from '../shared/types'

type Env = Record<string, string | undefined>
const on = (v: string | undefined): boolean => v !== undefined && v !== '' && v !== '0' && v.toLowerCase() !== 'false'

/** The smoke check is running (STEWARD_SMOKE_OUT is the file it screenshots to). */
export const smokeRuns = (env: Env): boolean => Boolean(env.STEWARD_SMOKE_OUT)

/** Hidden is the default; STEWARD_SMOKE_VISIBLE=1 (npm run smoke -- --visible) shows the windows, the way it used to run. */
export const smokeHidden = (env: Env): boolean => smokeRuns(env) && !on(env.STEWARD_SMOKE_VISIBLE)

/** The notch measured on a MacBook Pro 14" (Phase 0): 185 x 32 pt, and a menu bar 33 pt tall, which a notched Mac always has. */
export const PRETEND_NOTCH = { width: 185, height: 32 }
export const PRETEND_MENU_BAR = 33

/** STEWARD_SMOKE_NOTCH=1: the main display has a notch, centered at its top, wherever the run really is. Null: ask macOS as usual. */
export function pretendNotch(env: Env, display: Pick<Display, 'id' | 'bounds'>): NotchGeometry | null {
  if (!smokeRuns(env) || !on(env.STEWARD_SMOKE_NOTCH)) return null
  const { x, y, width } = display.bounds
  return { displayId: display.id, x: x + (width - PRETEND_NOTCH.width) / 2, y, ...PRETEND_NOTCH }
}

/**
 * The display as a notched Mac shows it: the menu bar is PRETEND_MENU_BAR tall, so the work area starts that far down
 * (the bottom stays where it is). A display whose menu bar is taller already is left alone, and so is everything outside
 * a pretend-notch smoke run.
 */
export function withNotchedMenuBar(env: Env, display: Display): Display {
  if (!smokeRuns(env) || !on(env.STEWARD_SMOKE_NOTCH)) return display
  const top = display.bounds.y + PRETEND_MENU_BAR
  const { x, y, width, height } = display.workArea
  if (y >= top) return display
  return { ...display, workArea: { x, y: top, width, height: y + height - top } }
}

export interface Unseen {
  /** True if any window became the key window since: a hidden run is not allowed to take the keyboard. */
  focusTaken: () => boolean
}

/**
 * How opaque a hidden run's windows are. Not 0: with a window at exactly 0 macOS stops treating it as shown, and its page
 * stalls for 150 to 270 ms every so often (every full run, 4 of 4, failed a motion check on it). At 1% it is drawn
 * as normal and the page runs at the display's rate; 1% is 3 of 255 levels, which the eye can't tell from nothing.
 */
export const HIDDEN_OPACITY = 0.01

/**
 * Hidden smoke: every window is real (real bounds, shown and hidden for real, its page drawn by the compositor at the
 * display's own rate) but see-through, deaf to the mouse, and never given the keyboard.
 *  - opacity HIDDEN_OPACITY (NSWindow alpha): nothing the eye can see on screen, though the window is shown;
 *  - clicks pass through, whatever the app asks for later (the notch window flips this as the cursor moves);
 *  - show() is showInactive(), focus() does nothing, and the app is an accessory that is never activated;
 *  - a watcher records any window that becomes the key window anyway, so a future code path that steals focus fails the run.
 * What it cannot show: vibrancy (the frost is part of the window, so a capture never had it anyway), real focus and blur.
 */
export function keepOffTheUsersScreen(app: App, windows: typeof BrowserWindow): Unseen {
  if (process.platform === 'darwin') app.setActivationPolicy('accessory')
  const nothing = (): void => {}
  app.focus = nothing
  windows.prototype.focus = nothing
  windows.prototype.show = windows.prototype.showInactive
  app.on('browser-window-created', (_event, w) => {
    w.setOpacity(HIDDEN_OPACITY)
    const setIgnoring = w.setIgnoreMouseEvents.bind(w)
    setIgnoring(true)
    w.setIgnoreMouseEvents = () => setIgnoring(true)
    w.webContents.focus = nothing
  })
  let taken = false
  const watcher = setInterval(() => {
    if (windows.getFocusedWindow()) taken = true
  }, 100)
  watcher.unref()
  return { focusTaken: () => taken }
}
