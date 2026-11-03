import { describe, expect, it } from 'vitest'
import { DEFAULT_ALLOWLIST, DEFAULT_NOTIFICATIONS, defaultSettings, migrateSettings, parseSettingsPatch } from '../src/main/settings-schema'
import { DEFAULT_STEWARD } from '../src/shared/steward'

/** The character's options for a settings file from before quiet mode: today's behavior, not a fresh install's. */
const AS_BEFORE = { presence: 'always', alertPeek: 'all', dimWhenIdle: false, hideFromScreenShare: false, hideInFullScreen: false, hideInApps: [] } as const
const OLD_FILE_STEWARD = { ...DEFAULT_STEWARD, ...AS_BEFORE }

describe('project addresses (Visual Review)', () => {
  const project = (url: unknown) => migrateSettings({ projects: [{ name: 'haven', path: '/Users/me/haven', url }] }).projects[0]

  it('keeps an address on this Mac, tidied', () => {
    expect(project('localhost:3000')).toEqual({ name: 'haven', path: '/Users/me/haven', url: 'http://localhost:3000' })
    expect(project('http://127.0.0.1:5173/pricing')).toMatchObject({ url: 'http://127.0.0.1:5173/pricing' })
  })

  it('drops one that was edited into another host, or is not an address', () => {
    for (const url of ['https://example.com', 'http://localhost.evil.com', 'file:///etc/passwd', 'javascript:alert(1)', 7, null, '']) {
      expect(project(url)).toEqual({ name: 'haven', path: '/Users/me/haven' })
    }
  })
})

describe('migrateSettings', () => {
  it('brings a file from before the Settings window across, adding the new switches with their defaults', () => {
    const old = {
      projects: [{ name: 'haven', path: '/Users/me/haven' }],
      currentProject: '/Users/me/haven',
      allowlist: ['npm test'],
      secrets: { anthropic: 'djEwYWJj' },
    }
    expect(migrateSettings(old)).toEqual({ ...old, keepPanelOpen: false, commandMode: 'ask', notifications: DEFAULT_NOTIFICATIONS, shortcuts: {}, steward: OLD_FILE_STEWARD })
  })

  it('asks before each command, for a new install and for any file that has not chosen Auto', () => {
    expect(defaultSettings().commandMode).toBe('ask')
    expect(migrateSettings({}).commandMode).toBe('ask')
    expect(migrateSettings(null).commandMode).toBe('ask')
    expect(migrateSettings({ projects: [], allowlist: ['npm test'], keepPanelOpen: true }).commandMode).toBe('ask')
    // A value Steward doesn't know never turns Auto on.
    for (const junk of ['Auto', 'yes', true, 1, null, [], {}, 'always']) expect(migrateSettings({ commandMode: junk }).commandMode).toBe('ask')
  })

  it('keeps Auto once it has been chosen, and Ask each time when that was chosen', () => {
    expect(migrateSettings({ commandMode: 'auto' }).commandMode).toBe('auto')
    expect(migrateSettings({ commandMode: 'ask' }).commandMode).toBe('ask')
    // It survives a round trip through the file.
    expect(migrateSettings(JSON.parse(JSON.stringify({ ...defaultSettings(), commandMode: 'auto' }))).commandMode).toBe('auto')
  })

  it('keeps the switches a file has, and fills in the ones it lacks one at a time', () => {
    const migrated = migrateSettings({ keepPanelOpen: true, notifications: { morningBrief: false } })
    expect(migrated.keepPanelOpen).toBe(true)
    expect(migrated.notifications).toEqual({ ...DEFAULT_NOTIFICATIONS, morningBrief: false })
  })

  it("falls back on anything that isn't the right shape, instead of trusting it", () => {
    const migrated = migrateSettings({
      projects: [{ name: 'haven', path: '/Users/me/haven', extra: 1 }, { name: 2 }, 'tally', null],
      currentProject: 42,
      allowlist: ['git status', 7, null],
      secrets: { anthropic: 123, vercel: 'dG9r', github: 'nope' },
      keepPanelOpen: 'yes',
      notifications: { leftOff: 'no', buildFailed: false, somethingNew: false },
    })
    expect(migrated).toEqual({
      projects: [{ name: 'haven', path: '/Users/me/haven' }],
      currentProject: null,
      allowlist: ['git status'],
      secrets: { vercel: 'dG9r' },
      keepPanelOpen: false,
      commandMode: 'ask',
      notifications: { ...DEFAULT_NOTIFICATIONS, buildFailed: false },
      shortcuts: {},
      steward: OLD_FILE_STEWARD,
    })
  })

  it('gives a file from before the character arrived the default one: glass, silver, on the right', () => {
    const migrated = migrateSettings({ projects: [], keepPanelOpen: true })
    expect(migrated.steward).toEqual({ version: 'glass', color: 'silver', glass: 'tinted', mouth: true, personality: 'lively', liveliness: 'calm', name: 'Steward', edge: 'right', notch: false, notchStyle: 'chin', size: 'small', tint: 'ice', frost: 50, ...AS_BEFORE })
  })

  it("keeps each of the character's options it knows, one at a time, and tidies the name", () => {
    const migrated = migrateSettings({
      steward: { version: 'blocky', color: 'mint', glass: 'frosted', mouth: 'no', personality: 'calm', name: '  Pip\n  the  Pill ', edge: 'left', size: 'huge', hat: 'top' },
    })
    expect(migrated.steward).toEqual({ ...OLD_FILE_STEWARD, version: 'blocky', color: 'mint', personality: 'calm', name: 'Pip the Pill', edge: 'left' })
    // A color from the old palette of fourteen isn't one of the six any more.
    expect(migrateSettings({ steward: { color: 'coral' } }).steward.color).toBe('silver')
    expect(migrateSettings({ steward: { name: '   ' } }).steward.name).toBe('Steward')
    for (const junk of [null, 'glass', 7, ['flat']]) expect(migrateSettings({ steward: junk }).steward).toEqual(OLD_FILE_STEWARD)
  })

  it('keeps the notch choice and its style, and starts files from before the notch on their edge, as a chin', () => {
    expect(migrateSettings({ steward: { edge: 'left' } }).steward).toMatchObject({ edge: 'left', notch: false, notchStyle: 'chin' })
    expect(migrateSettings({ steward: { notch: true, notchStyle: 'wings' } }).steward).toMatchObject({ notch: true, notchStyle: 'wings' })
    expect(migrateSettings({ steward: { notch: true, notchStyle: 'island' } }).steward).toMatchObject({ notch: true, notchStyle: 'island' })
    expect(migrateSettings({ steward: { notch: 'yes', notchStyle: 'ears' } }).steward).toMatchObject({ notch: false, notchStyle: 'chin' })
  })

  it("keeps the panel's tint and frost, a frost made a whole number from 0 to 100", () => {
    const older = migrateSettings({ steward: { version: 'flat', color: 'mint' } })
    expect([older.steward.tint, older.steward.frost]).toEqual(['ice', 50])
    expect(migrateSettings({ steward: { tint: 'peach', frost: 80 } }).steward).toMatchObject({ tint: 'peach', frost: 80 })
    expect(migrateSettings({ steward: { tint: 'sky' } }).steward.tint).toBe('ice')
    const frost = (value: unknown) => migrateSettings({ steward: { frost: value } }).steward.frost
    expect([frost(-20), frost(140), frost(33.4), frost(0)]).toEqual([0, 100, 33, 0])
    for (const junk of ['80', null, NaN, Infinity, true]) expect(frost(junk), String(junk)).toBe(50)
  })

  it('starts a fresh install quiet: only when needed, peeking out for a session that needs me, dim and hidden from screen sharing on', () => {
    // No file (or one that can't be read) is a fresh install: the defaults as they are.
    for (const fresh of [undefined, null, 'not settings']) expect(migrateSettings(fresh).steward).toMatchObject({ presence: 'quiet', alertPeek: 'needs-me', dimWhenIdle: true, hideFromScreenShare: true })
    expect(defaultSettings().steward).toEqual(DEFAULT_STEWARD)
    expect(DEFAULT_STEWARD).toMatchObject({ presence: 'quiet', alertPeek: 'needs-me', dimWhenIdle: true, hideFromScreenShare: true })
  })

  it('keeps a settings file that already exists exactly as it was: always visible, everything peeking out, dim and screen sharing off', () => {
    // However little the file has, it's the user's file: nothing about how Steward behaves changes under them.
    for (const old of [{}, { keepPanelOpen: true }, { steward: {} }, { steward: { edge: 'left', color: 'mint' } }]) {
      expect(migrateSettings(old).steward, JSON.stringify(old)).toMatchObject(AS_BEFORE)
    }
  })

  it('keeps the quiet-mode options a file has, and falls back to the old behavior for ones that are not Steward’s', () => {
    expect(migrateSettings({ steward: { presence: 'quiet', alertPeek: 'none', dimWhenIdle: true, hideFromScreenShare: true } }).steward).toMatchObject({ presence: 'quiet', alertPeek: 'none', dimWhenIdle: true, hideFromScreenShare: true })
    expect(migrateSettings({ steward: { presence: 'always', alertPeek: 'needs-me' } }).steward).toMatchObject({ presence: 'always', alertPeek: 'needs-me' })
    expect(migrateSettings({ steward: { presence: 'hidden', alertPeek: 'some', dimWhenIdle: 'yes', hideFromScreenShare: 1 } }).steward).toMatchObject(AS_BEFORE)
  })

  it('steps aside in full-screen apps on a fresh install, not for a file that already exists, and starts both with no apps', () => {
    expect(DEFAULT_STEWARD).toMatchObject({ hideInFullScreen: true, hideInApps: [] })
    expect(migrateSettings({ steward: {} }).steward).toMatchObject({ hideInFullScreen: false, hideInApps: [] })
    expect(migrateSettings({ steward: { hideInFullScreen: true } }).steward.hideInFullScreen).toBe(true)
  })

  it("keeps the apps to step aside for that have a real bundle id and a name, each once, and drops the rest", () => {
    const keynote = { id: 'com.apple.iWork.Keynote', name: 'Keynote' }
    const zoom = { id: 'us.zoom.xos', name: 'Zoom' }
    const raw = [keynote, zoom, { ...keynote, name: 'Keynote again' }, { id: 'not a bundle id', name: 'X' }, { id: 'com.example.noname' }, 'com.apple.FaceTime', null]
    expect(migrateSettings({ steward: { hideInApps: raw } }).steward.hideInApps).toEqual([keynote, zoom])
    expect(migrateSettings({ steward: { hideInApps: 'Keynote' } }).steward.hideInApps).toEqual([])
  })

  it('keeps the shortcuts you changed, tidied up, and drops ones it can’t use', () => {
    const migrated = migrateSettings({
      shortcuts: { togglePanel: 'option+space', hideFromEdge: '', switchProject: 'Hyper+K', openSettings: 7, somethingElse: 'Command+J' },
    })
    expect(migrated.shortcuts).toEqual({ togglePanel: 'Alt+Space', hideFromEdge: '' })
    expect(migrateSettings({ shortcuts: ['Command+K'] }).shortcuts).toEqual({})
  })

  it('keeps an emptied allowlist empty, and starts over from a file that is not settings at all', () => {
    expect(migrateSettings({ allowlist: [] }).allowlist).toEqual([])
    expect(migrateSettings({}).allowlist).toEqual(DEFAULT_ALLOWLIST)
    for (const junk of [null, undefined, 'settings', 7, [], [{ projects: [] }]]) expect(migrateSettings(junk)).toEqual(defaultSettings())
  })

  it("doesn't share the defaults between files", () => {
    const a = migrateSettings({})
    a.notifications.leftOff = false
    a.allowlist.push('rm -rf /')
    a.steward.color = 'peach'
    expect(migrateSettings({}).notifications.leftOff).toBe(true)
    expect(DEFAULT_ALLOWLIST).not.toContain('rm -rf /')
    expect(migrateSettings({}).steward.color).toBe('silver')
    expect(DEFAULT_STEWARD.color).toBe('silver')
  })
})

describe('parseSettingsPatch', () => {
  it('lets through the switches Settings can change', () => {
    expect(parseSettingsPatch({ keepPanelOpen: true })).toEqual({ keepPanelOpen: true })
    expect(parseSettingsPatch({ openAtLogin: false })).toEqual({ openAtLogin: false })
    expect(parseSettingsPatch({ commandMode: 'auto' })).toEqual({ commandMode: 'auto' })
    expect(parseSettingsPatch({ commandMode: 'ask' })).toEqual({ commandMode: 'ask' })
    expect(parseSettingsPatch({ notifications: { morningBrief: false, leftOff: true } })).toEqual({ notifications: { morningBrief: false, leftOff: true } })
    expect(parseSettingsPatch({ steward: { color: 'graphite', version: 'flat' } })).toEqual({ steward: { color: 'graphite', version: 'flat' } })
    expect(parseSettingsPatch({ steward: { name: 'Pip', edge: 'left', size: 'medium', mouth: false } })).toEqual({ steward: { name: 'Pip', edge: 'left', size: 'medium', mouth: false } })
    expect(parseSettingsPatch({ steward: { tint: 'graphite', frost: 0 } })).toEqual({ steward: { tint: 'graphite', frost: 0 } })
    expect(parseSettingsPatch({ steward: { frost: 100 } })).toEqual({ steward: { frost: 100 } })
    expect(parseSettingsPatch({ steward: { notch: true, notchStyle: 'wings' } })).toEqual({ steward: { notch: true, notchStyle: 'wings' } })
    expect(parseSettingsPatch({ steward: { notchStyle: 'island' } })).toEqual({ steward: { notchStyle: 'island' } })
    expect(parseSettingsPatch({ steward: { presence: 'quiet', alertPeek: 'none' } })).toEqual({ steward: { presence: 'quiet', alertPeek: 'none' } })
    expect(parseSettingsPatch({ steward: { dimWhenIdle: false, hideFromScreenShare: true } })).toEqual({ steward: { dimWhenIdle: false, hideFromScreenShare: true } })
    const apps = [{ id: 'com.apple.iWork.Keynote', name: 'Keynote' }]
    expect(parseSettingsPatch({ steward: { hideInFullScreen: false, hideInApps: apps } })).toEqual({ steward: { hideInFullScreen: false, hideInApps: apps } })
    expect(parseSettingsPatch({ steward: { hideInApps: [] } })).toEqual({ steward: { hideInApps: [] } })
  })

  it('refuses anything else, so the window can only change what it shows', () => {
    for (const bad of [
      { keepPanelOpen: 'true' },
      { commandMode: 'always' },
      { commandMode: true },
      { commandMode: 'AUTO' },
      { allowlist: ['rm -rf /'] },
      { secrets: { anthropic: 'x' } },
      { notifications: { somethingNew: true } },
      { notifications: { leftOff: 1 } },
      { steward: { color: 'coral' } },
      { steward: { version: 'droplet' } },
      { steward: { hat: 'top' } },
      { steward: { tint: 'sky' } },
      { steward: { notch: 'yes' } },
      { steward: { notchStyle: 'ears' } },
      { steward: { edge: 'notch' } },
      { steward: { presence: 'hidden' } },
      { steward: { alertPeek: 'some' } },
      { steward: { dimWhenIdle: 'yes' } },
      { steward: { hideInFullScreen: 'yes' } },
      { steward: { hideInApps: 'com.apple.iWork.Keynote' } },
      { steward: { hideInApps: [{ id: 'not a bundle id', name: 'X' }] } },
      { steward: { hideInApps: [{ id: 'com.apple.iWork.Keynote', name: '' }] } },
      { steward: { hideInApps: [{ id: 'us.zoom.xos', name: 'Zoom' }, { id: 'us.zoom.xos', name: 'Zoom' }] } },
      { steward: { hideInApps: Array.from({ length: 41 }, (_, i) => ({ id: `com.example.app${i}`, name: `App ${i}` })) } },
      { steward: { frost: 101 } },
      { steward: { frost: -1 } },
      { steward: { frost: 42.5 } },
      { steward: { frost: '50' } },
      { steward: { name: 7 } },
      { steward: { name: 'x'.repeat(200) } },
      null,
      'x',
    ]) {
      expect(() => parseSettingsPatch(bad), JSON.stringify(bad)).toThrow("That setting isn't one Steward knows")
    }
  })
})
