import { describe, expect, it } from 'vitest'
import { DEFAULT_ALLOWLIST, DEFAULT_NOTIFICATIONS, defaultSettings, migrateSettings, parseSettingsPatch } from '../src/main/settings-schema'

describe('migrateSettings', () => {
  it('brings a file from before the Settings window across, adding the new switches with their defaults', () => {
    const old = {
      projects: [{ name: 'haven', path: '/Users/me/haven' }],
      currentProject: '/Users/me/haven',
      allowlist: ['npm test'],
      secrets: { anthropic: 'djEwYWJj' },
    }
    expect(migrateSettings(old)).toEqual({ ...old, keepPanelOpen: false, notifications: DEFAULT_NOTIFICATIONS, shortcuts: {} })
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
      notifications: { ...DEFAULT_NOTIFICATIONS, buildFailed: false },
      shortcuts: {},
    })
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
    expect(migrateSettings({}).notifications.leftOff).toBe(true)
    expect(DEFAULT_ALLOWLIST).not.toContain('rm -rf /')
  })
})

describe('parseSettingsPatch', () => {
  it('lets through the switches Settings can change', () => {
    expect(parseSettingsPatch({ keepPanelOpen: true })).toEqual({ keepPanelOpen: true })
    expect(parseSettingsPatch({ openAtLogin: false })).toEqual({ openAtLogin: false })
    expect(parseSettingsPatch({ notifications: { morningBrief: false, leftOff: true } })).toEqual({ notifications: { morningBrief: false, leftOff: true } })
  })

  it('refuses anything else, so the window can only change what it shows', () => {
    for (const bad of [{ keepPanelOpen: 'true' }, { allowlist: ['rm -rf /'] }, { secrets: { anthropic: 'x' } }, { notifications: { somethingNew: true } }, { notifications: { leftOff: 1 } }, null, 'x']) {
      expect(() => parseSettingsPatch(bad), JSON.stringify(bad)).toThrow("That setting isn't one Steward knows")
    }
  })
})
