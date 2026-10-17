// The window that holds Steward in the MacBook notch: transparent, frameless, along the top of the notched screen,
// above the menu bar (the "status" level), on every Space and over full-screen apps. It takes clicks only on the
// black shape: it ignores the mouse everywhere, and a few times a second Steward checks where the cursor is and lets
// clicks in while it's over the shape (the black's boxes, from shared/notch). The same check sends the cursor's
// position to the page, so the eyes can follow it, but only while it's near: far away, it's checked rarely.
//
// With Presence "Only when needed" it rests asleep: just the notch's own black, no eyes. The same check tells the
// presence rules (main/presence) whether the cursor is on the notch, and they say when to wake and when to sleep.
import { BrowserWindow, screen } from 'electron'
import { inBoxes, notchBoxes, notchShape, NOTCH_WINDOW } from '../shared/notch'
import type { Mood, NotchGeometry, NotchLayout, NotchState, NotchStyle, PillGlint } from '../shared/types'
import { inRect } from './presence'

interface Options {
  preload: string
  load(w: BrowserWindow): void
  style(): NotchStyle
  /** Every time the cursor is checked: whether it's on the notch (asleep) or on the shape (awake). */
  onCursor?(over: boolean): void
  /** Where the cursor is; null to leave the real one out (the smoke check, which feeds what it needs itself). */
  cursor?(): Electron.Point | null
}

/** The cursor counts as on the shape this far outside it, so the edge of the black isn't a flicker. */
const SLACK = 3

/** Within this many points of the notch, the cursor is checked 20 times a second and sent to the eyes. */
const NEAR = 420
const FAST = 50
const SLOW = 250

export class NotchDock {
  private win: BrowserWindow | null = null
  private notch: NotchGeometry | null = null
  private mood: Mood = 'idle'
  private glint: PillGlint = 'sweep'
  private wanted = false
  private awake = true
  private ignoring = true
  private timer: ReturnType<typeof setTimeout> | undefined
  private sentCursor = ''

  constructor(private o: Options) {}

  /** Where the notch is now (null: no screen has one). Moves the window there, or closes it. */
  setNotch(notch: NotchGeometry | null): void {
    this.notch = notch
    if (!notch) return this.close()
    if (this.win && !this.win.isDestroyed()) {
      this.win.setBounds(this.bounds(notch))
      this.send()
    }
    this.show(this.wanted)
  }

  /** Show Steward in the notch, or not. It only shows while a screen has a notch. */
  show(on: boolean): void {
    this.wanted = on
    if (!on || !this.notch) {
      this.stopWatching()
      if (this.win && !this.win.isDestroyed() && this.win.isVisible()) {
        this.win.hide()
        this.win.setIgnoreMouseEvents(true)
        this.ignoring = true
      }
      return
    }
    const w = this.window(this.notch)
    if (!w.isVisible()) w.showInactive()
    this.watch()
  }

  get visible(): boolean {
    return !!this.win && !this.win.isDestroyed() && this.win.isVisible()
  }

  setMood(mood: Mood, glint: PillGlint): void {
    if (mood === this.mood && glint === this.glint) return
    this.mood = mood
    this.glint = glint
    this.send()
  }

  /** Send the page something (settings, as they change). */
  post(channel: string, payload: unknown): void {
    if (this.win && !this.win.isDestroyed()) this.win.webContents.send(channel, payload)
  }

  /** The style changed in Settings: the shape it takes clicks on changes too. */
  restyle(): void {
    this.send()
  }

  /** Asleep: only the notch's own black, no eyes. Awake: the chin or the wings, with the eyes. */
  setAwake(awake: boolean): void {
    if (awake === this.awake) return
    this.awake = awake
    this.send()
  }

  state(): NotchState {
    return { layout: this.layout(), mood: this.mood, glint: this.glint, awake: this.awake }
  }

  /** The notch window's own contents, for the smoke check. */
  async capture(): Promise<Electron.NativeImage | null> {
    return this.win && !this.win.isDestroyed() ? this.win.webContents.capturePage() : null
  }

  /** The page, for the smoke check to watch it move. */
  contents(): Electron.WebContents | null {
    return this.win && !this.win.isDestroyed() ? this.win.webContents : null
  }

  /** The page's process, for measuring how much it costs. */
  pid(): number | null {
    return this.win && !this.win.isDestroyed() ? this.win.webContents.getOSProcessId() : null
  }

  /** The window's place on screen, for checks. */
  windowBounds(): Electron.Rectangle | null {
    return this.win && !this.win.isDestroyed() ? this.win.getBounds() : null
  }

  private bounds(n: NotchGeometry): Electron.Rectangle {
    return { x: Math.round(n.x + n.width / 2 - NOTCH_WINDOW.width / 2), y: n.y, ...NOTCH_WINDOW }
  }

  private layout(): NotchLayout | null {
    if (!this.notch) return null
    const b = this.bounds(this.notch)
    return { cx: this.notch.x + this.notch.width / 2 - b.x, width: this.notch.width, height: this.notch.height }
  }

  private send(): void {
    if (this.win && !this.win.isDestroyed()) this.win.webContents.send('notch:state', this.state())
  }

  private window(n: NotchGeometry): BrowserWindow {
    if (this.win && !this.win.isDestroyed()) return this.win
    const w = new BrowserWindow({
      ...this.bounds(n),
      // A panel floats over full-screen apps and shows on every Space, like the tab at the edge.
      type: 'panel',
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      // It never takes the keyboard: clicking it opens the panel, which does.
      focusable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      acceptFirstMouse: true,
      enableLargerThanScreen: true,
      show: false,
      webPreferences: { preload: this.o.preload, sandbox: true, contextIsolation: true, nodeIntegration: false },
    })
    // Above the menu bar (which sits at the "main menu" level), so the black covers the notch's corners.
    w.setAlwaysOnTop(true, 'status')
    w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
    w.setIgnoreMouseEvents(true)
    this.ignoring = true
    w.on('closed', () => {
      if (this.win === w) this.win = null
      this.stopWatching()
    })
    this.o.load(w)
    this.win = w
    return w
  }

  private close(): void {
    this.stopWatching()
    if (this.win && !this.win.isDestroyed()) this.win.destroy()
    this.win = null
  }

  /** Check the cursor: let clicks in over the shape, and tell the eyes where it is while it's near. */
  private watch(): void {
    if (this.timer) return
    const tick = () => {
      this.timer = undefined
      const w = this.win, layout = this.layout()
      if (!w || w.isDestroyed() || !w.isVisible() || !layout) return
      // Left out, the cursor counts as far away: not near, and not on the shape.
      const b = w.getBounds(), c = (this.o.cursor ? this.o.cursor() : screen.getCursorScreenPoint()) ?? { x: -1e6, y: -1e6 }
      const p = { x: c.x - b.x, y: c.y - b.y }
      const boxes = notchBoxes(notchShape(this.o.style(), this.mood, layout, this.awake), layout)
      const inside = inBoxes(p, boxes)
      if (this.o.onCursor) {
        const over = boxes.some((b) => inRect(p, b, SLACK))
        this.o.onCursor(over)
      }
      if (inside === this.ignoring) {
        this.ignoring = !inside
        w.setIgnoreMouseEvents(!inside)
      }
      const near = Math.hypot(p.x - layout.cx, p.y) < NEAR
      const cursor = near ? `${p.x},${p.y}` : ''
      if (cursor !== this.sentCursor) {
        this.sentCursor = cursor
        w.webContents.send('notch:cursor', near ? p : null)
      }
      this.timer = setTimeout(tick, near ? FAST : SLOW)
    }
    tick()
  }

  private stopWatching(): void {
    clearTimeout(this.timer)
    this.timer = undefined
    this.sentCursor = ''
  }
}
