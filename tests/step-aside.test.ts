import { describe, expect, it } from 'vitest'
import { isBundleId } from '../src/shared/steward'
import { appFromUserInfo, frontAfter, lookNow, MAX_APPS, parseLook, readApp, shouldStepAside, withApp, type Runner } from '../src/main/step-aside'

const KEYNOTE = { id: 'com.apple.iWork.Keynote', name: 'Keynote' }
const ZOOM = { id: 'us.zoom.xos', name: 'Zoom' }

describe('the app a workspace notification names', () => {
  it("reads the bundle id and process out of Electron's description of the app", () => {
    const info = { NSWorkspaceApplicationKey: '<NSRunningApplication: 0x12c01052d90 (com.apple.finder - 631) LSASN:{0x0-0x12012}>' }
    expect(appFromUserInfo(info)).toEqual({ app: 'com.apple.finder', pid: 631 })
  })

  it('knows an app with no bundle id by its process alone, and says nothing when the description reads differently', () => {
    expect(appFromUserInfo({ NSWorkspaceApplicationKey: '<NSRunningApplication: 0x1 ((null) - 88) LSASN:{0x0-0x1}>' })).toEqual({ app: null, pid: 88 })
    for (const odd of [{}, { NSWorkspaceApplicationKey: 'com.apple.finder' }, { NSWorkspaceApplicationKey: 7 }, null, 'x']) expect(appFromUserInfo(odd)).toBeNull()
  })
})

describe("macOS's answer", () => {
  it('is the app in front and the screens showing a full-screen app', () => {
    expect(parseLook('{"app":"com.google.Chrome","pid":40791,"fullScreenOn":[1]}')).toEqual({ front: { app: 'com.google.Chrome', pid: 40791 }, fullScreenOn: [1] })
    expect(parseLook('{"app":null,"pid":12,"fullScreenOn":[]}')).toEqual({ front: { app: null, pid: 12 }, fullScreenOn: [] })
  })

  it("drops anything that isn't the right shape, rather than trusting it", () => {
    expect(parseLook('{"app":"x y","pid":1,"fullScreenOn":[2,"3",null]}')).toEqual({ front: { app: null, pid: 1 }, fullScreenOn: [2] })
    for (const bad of ['', 'not json', '[]', 'null', '{"app":"a.b","fullScreenOn":[]}', '{"app":"a.b","pid":1.5,"fullScreenOn":[]}', '{"app":"a.b","pid":1}']) expect(parseLook(bad), bad).toBeNull()
  })

  it('comes from one osascript question, and is null if that fails', async () => {
    const asked: string[][] = []
    const runner: Runner = async (file, args) => {
      asked.push([file, ...args.slice(0, 2)])
      return '{"app":"us.zoom.xos","pid":5,"fullScreenOn":[]}'
    }
    expect(await lookNow(runner)).toEqual({ front: { app: 'us.zoom.xos', pid: 5 }, fullScreenOn: [] })
    expect(asked).toEqual([['/usr/bin/osascript', '-l', 'JavaScript']])
    expect(await lookNow(() => Promise.reject(new Error('osascript failed')))).toBeNull()
  })
})

describe('stepping aside', () => {
  const rule = (o: Partial<Parameters<typeof shouldStepAside>[0]>) => shouldStepAside({ hideInFullScreen: true, apps: [KEYNOTE], front: null, fullScreenHere: false, ...o })

  it('happens while an app fills Steward’s screen, if that’s on', () => {
    expect(rule({ fullScreenHere: true })).toBe(true)
    expect(rule({ fullScreenHere: true, hideInFullScreen: false })).toBe(false)
    expect(rule({ fullScreenHere: false })).toBe(false)
  })

  it('happens while an app on the list is in front, full screen or not', () => {
    expect(rule({ front: KEYNOTE.id })).toBe(true)
    expect(rule({ front: KEYNOTE.id, hideInFullScreen: false })).toBe(true)
    expect(rule({ front: ZOOM.id })).toBe(false)
    expect(rule({ front: KEYNOTE.id, apps: [] })).toBe(false)
  })

  it("doesn't change when Steward itself comes to the front, so opening its panel or Settings doesn't bring it back", () => {
    expect(frontAfter(KEYNOTE.id, { app: 'com.jasmansidhu.steward', pid: 4242 }, 4242)).toBe(KEYNOTE.id)
    expect(frontAfter(KEYNOTE.id, { app: 'com.apple.finder', pid: 631 }, 4242)).toBe('com.apple.finder')
    expect(frontAfter(KEYNOTE.id, { app: null, pid: 77 }, 4242)).toBeNull()
  })
})

describe('the list of apps', () => {
  it('adds an app once, and keeps the most recent ones', () => {
    expect(withApp([KEYNOTE], ZOOM)).toEqual([KEYNOTE, ZOOM])
    expect(withApp([KEYNOTE, ZOOM], { ...KEYNOTE, name: 'Keynote 14' })).toEqual([KEYNOTE, ZOOM])
    const full = Array.from({ length: MAX_APPS }, (_, i) => ({ id: `com.example.app${i}`, name: `App ${i}` }))
    const added = withApp(full, ZOOM)
    expect(added).toHaveLength(MAX_APPS)
    expect(added.at(-1)).toEqual(ZOOM)
  })

  it('takes bundle ids as macOS writes them', () => {
    for (const ok of ['com.apple.iWork.Keynote', 'us.zoom.xos', 'com.google.Chrome', 'org.mozilla.firefox', 'com.microsoft.VSCode']) expect(isBundleId(ok), ok).toBe(true)
    for (const bad of ['', ' com.apple.x', 'com.apple/x', '.com.apple', 'a b', 'x'.repeat(256), 7, null]) expect(isBundleId(bad), String(bad)).toBe(false)
  })

  it("reads an app's bundle id and name from its Info.plist, with the file's name when it has none", async () => {
    const plist = (keys: Record<string, string>): Runner => async (_file, args) => {
      const value = keys[args[1]]
      if (value === undefined) throw new Error('No value at that key path')
      return `${value}\n`
    }
    expect(await readApp('/Applications/Keynote.app', plist({ CFBundleIdentifier: 'com.apple.iWork.Keynote', CFBundleDisplayName: 'Keynote' }))).toEqual(KEYNOTE)
    expect(await readApp('/Applications/zoom.us.app', plist({ CFBundleIdentifier: 'us.zoom.xos', CFBundleName: 'zoom.us' }))).toEqual({ id: 'us.zoom.xos', name: 'zoom.us' })
    expect(await readApp('/Applications/Tool.app', plist({ CFBundleIdentifier: 'com.example.tool' }))).toEqual({ id: 'com.example.tool', name: 'Tool' })
    expect(await readApp('/Applications/Odd.app', plist({ CFBundleName: 'Odd' }))).toBeNull()
  })
})
