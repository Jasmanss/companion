// Finding the MacBook notch. Electron's screen API doesn't report it, so Steward asks macOS directly: NSScreen's
// top safe area is the notch's height, and the usable strips on either side of it (its auxiliary top areas) leave
// the notch's width between them. The question goes through osascript (JavaScript for Automation), which every Mac
// has: no native code to build or sign. Asked at launch and whenever a display changes. If it ever fails, there's
// simply no notch and Steward stays on its edge.
import { execFile } from 'node:child_process'
import type { NotchGeometry } from '../shared/types'

/** What macOS says about one screen: its id, frame, top safe area, and the strips beside the notch (if any). */
export interface ScreenProbe {
  id: number
  frame: [number, number, number, number]
  safeTop: number
  left: [number, number, number, number] | null
  right: [number, number, number, number] | null
}

const SCRIPT = `ObjC.import('AppKit')
const r = (v) => v ? [v.origin.x, v.origin.y, v.size.width, v.size.height] : null
const out = []
const all = $.NSScreen.screens
for (let i = 0; i < all.count; i++) {
  const s = all.objectAtIndex(i)
  out.push({ id: s.deviceDescription.objectForKey('NSScreenNumber').unsignedIntValue, frame: r(s.frame), safeTop: s.safeAreaInsets.top, left: r(s.auxiliaryTopLeftArea), right: r(s.auxiliaryTopRightArea) })
}
JSON.stringify(out)`

export type Runner = (file: string, args: string[]) => Promise<string>
const run: Runner = (file, args) =>
  new Promise((resolve, reject) => execFile(file, args, { timeout: 4000 }, (err, stdout) => (err ? reject(err) : resolve(String(stdout)))))

/** Every screen as macOS sees it. Empty on any failure, or off a Mac. */
export async function probeScreens(runner: Runner = run): Promise<ScreenProbe[]> {
  if (process.platform !== 'darwin' && runner === run) return []
  try {
    return parseProbe(await runner('/usr/bin/osascript', ['-l', 'JavaScript', '-e', SCRIPT]))
  } catch {
    return []
  }
}

const rect = (v: unknown): [number, number, number, number] | null =>
  Array.isArray(v) && v.length === 4 && v.every((n) => typeof n === 'number' && Number.isFinite(n)) ? (v as [number, number, number, number]) : null

/** The script's answer, checked: anything malformed is dropped rather than trusted. */
export function parseProbe(text: string): ScreenProbe[] {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return []
  }
  if (!Array.isArray(raw)) return []
  return raw.flatMap((s): ScreenProbe[] => {
    const frame = rect(s?.frame)
    if (!frame || typeof s.id !== 'number' || typeof s.safeTop !== 'number') return []
    return [{ id: s.id, frame, safeTop: s.safeTop, left: rect(s.left), right: rect(s.right) }]
  })
}

/**
 * The notch, placed on Electron's display with the same id (both are the CoreGraphics display id), or null. A screen
 * has one when it has a top safe area and a strip on each side of a gap. The scaled mode that hides the notch, an
 * external display and a closed lid all report none.
 */
export function findNotch(probes: ScreenProbe[], displays: { id: number; bounds: { x: number; y: number } }[]): NotchGeometry | null {
  for (const p of probes) {
    if (!p.left || !p.right || p.safeTop <= 0) continue
    const x = p.left[0] + p.left[2] - p.frame[0]
    const width = p.right[0] - (p.left[0] + p.left[2])
    // A sanity check against nonsense, far wider than any real notch's range.
    if (width < 40 || width > 600 || p.safeTop > 100) continue
    const d = displays.find((dd) => dd.id === p.id)
    if (!d) continue
    return { displayId: d.id, x: d.bounds.x + x, y: d.bounds.y, width, height: p.safeTop }
  }
  return null
}
