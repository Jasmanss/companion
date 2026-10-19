// Step aside (quiet mode): Steward hides while an app fills its screen, or while an app you listed is in front. Electron
// hears macOS say another app came to the front (naming it) or the Space changed; only then is macOS asked, through
// osascript (JavaScript for Automation, as in notch.ts: no native code to build), which app is in front and which
// screens show a full-screen app's Space. That second part is an undocumented call (CGSCopyManagedDisplaySpaces, where
// type 4 is a full-screen app's Space): read-only, and it needs no permission. If a macOS update breaks it, the answer
// is "not full screen", and Steward just doesn't step aside for it. Measured in docs/reports/step-aside.md.
import { execFile } from 'node:child_process'
import path from 'node:path'
import { isBundleId } from '../shared/steward'
import type { StepAsideApp } from '../shared/types'

/** The app in front: its bundle id (null if it has none), and its process, which tells Steward itself apart. */
export interface FrontApp {
  app: string | null
  pid: number
}

/** One answer from macOS: the app in front, and the screens (by display id, as Electron numbers them) showing a full-screen app. */
export interface StepAsideLook {
  front: FrontApp
  fullScreenOn: number[]
}

const QUERY = `ObjC.import('AppKit')
ObjC.import('CoreGraphics')
ObjC.bindFunction('CGSMainConnectionID', ['int', []])
ObjC.bindFunction('CGSCopyManagedDisplaySpaces', ['id', ['int']])
ObjC.bindFunction('CGDisplayCreateUUIDFromDisplayID', ['void *', ['unsigned int']])
ObjC.bindFunction('CFUUIDCreateString', ['id', ['void *', 'void *']])
const front = $.NSWorkspace.sharedWorkspace.frontmostApplication
let full = []
try {
  const spaces = ObjC.deepUnwrap($.CGSCopyManagedDisplaySpaces($.CGSMainConnectionID())) || []
  full = spaces.filter((d) => d['Current Space'] && d['Current Space'].type === 4).map((d) => d['Display Identifier'])
} catch (e) {}
const on = []
const all = $.NSScreen.screens
for (let i = 0; i < all.count; i++) {
  const id = all.objectAtIndex(i).deviceDescription.objectForKey('NSScreenNumber').unsignedIntValue
  const uuid = ObjC.unwrap($.CFUUIDCreateString(null, $.CGDisplayCreateUUIDFromDisplayID(id)))
  if (full.includes(uuid) || full.includes('Main')) on.push(id)
}
JSON.stringify({ app: front.bundleIdentifier.js || null, pid: front.processIdentifier, fullScreenOn: on })`

export type Runner = (file: string, args: string[]) => Promise<string>
const run: Runner = (file, args) =>
  new Promise((resolve, reject) => execFile(file, args, { timeout: 4000 }, (err, stdout) => (err ? reject(err) : resolve(String(stdout)))))

/** Ask macOS now. Null on any failure, or off a Mac. */
export async function lookNow(runner: Runner = run): Promise<StepAsideLook | null> {
  if (process.platform !== 'darwin' && runner === run) return null
  try {
    return parseLook(await runner('/usr/bin/osascript', ['-l', 'JavaScript', '-e', QUERY]))
  } catch {
    return null
  }
}

/** The query's answer, checked: anything malformed is dropped rather than trusted. */
export function parseLook(text: string): StepAsideLook | null {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.pid !== 'number' || !Number.isInteger(r.pid) || !Array.isArray(r.fullScreenOn)) return null
  return {
    front: { app: typeof r.app === 'string' && isBundleId(r.app) ? r.app : null, pid: r.pid },
    fullScreenOn: r.fullScreenOn.filter((n): n is number => typeof n === 'number' && Number.isFinite(n)),
  }
}

/**
 * The app a workspace notification names. Electron hands over the NSRunningApplication as its description,
 * "<NSRunningApplication: 0x… (com.apple.finder - 631) …>". That text isn't a promise, so when it doesn't read, this is
 * null and Steward asks macOS instead.
 */
export function appFromUserInfo(userInfo: unknown): FrontApp | null {
  const text = userInfo && typeof userInfo === 'object' ? (userInfo as Record<string, unknown>).NSWorkspaceApplicationKey : undefined
  // An app without a bundle id shows as "(null)".
  const m = typeof text === 'string' ? /\((\(null\)|[^\s()]+) - (\d+)\)/.exec(text) : null
  if (!m) return null
  return { app: isBundleId(m[1]) ? m[1] : null, pid: Number(m[2]) }
}

/** The app in front for stepping aside: Steward itself coming forward (its panel, Settings) changes nothing. */
export const frontAfter = (before: string | null, front: FrontApp, ownPid: number): string | null => (front.pid === ownPid ? before : front.app)

/** Whether Steward steps aside: an app fills its screen (if that's on), or an app on the list is in front. */
export function shouldStepAside(o: { hideInFullScreen: boolean; apps: StepAsideApp[]; front: string | null; fullScreenHere: boolean }): boolean {
  return (o.hideInFullScreen && o.fullScreenHere) || (o.front !== null && o.apps.some((a) => a.id === o.front))
}

/** The most apps on the list. */
export const MAX_APPS = 40

/** An app added to the list, unless it's there already; the list stays at MAX_APPS. */
export const withApp = (list: StepAsideApp[], add: StepAsideApp): StepAsideApp[] => (list.some((a) => a.id === add.id) ? list : [...list, add].slice(-MAX_APPS))

/** An app picked in Finder: its bundle id and name, from its Info.plist (plutil is on every Mac). Null if it has no bundle id. */
export async function readApp(appPath: string, runner: Runner = run): Promise<StepAsideApp | null> {
  const plist = path.join(appPath, 'Contents', 'Info.plist')
  const key = (name: string) => runner('/usr/bin/plutil', ['-extract', name, 'raw', '-o', '-', plist]).then((s) => s.trim(), () => '')
  const id = await key('CFBundleIdentifier')
  if (!isBundleId(id)) return null
  const name = (await key('CFBundleDisplayName')) || (await key('CFBundleName')) || path.basename(appPath, '.app')
  return { id, name: name.slice(0, 80) }
}
