import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  backupFile,
  hookCommand,
  holdHookCommand,
  withHoldHook,
  withoutHoldHook,
  hookState,
  readClaudeSettings,
  reviewHookInstalled,
  withStewardHooks,
  withoutStewardHooks,
  writeClaudeSettings,
} from '../src/main/claude-settings'

const CMD = hookCommand('/Users/me/Library/Application Support/Steward', '/Users/me')

/** Exactly what hooks installed before the rename run: the same command, reading the old data folder. */
const OLD_CMD =
  'd="$HOME/Library/Application Support/Companion"; [ -r "$d/hook-token" ] && /usr/bin/curl -s -m 1 -o /dev/null -X POST "http://127.0.0.1:$(cat "$d/hook-port")/claude-hook" -H "Authorization: Bearer $(cat "$d/hook-token")" -H "Content-Type: application/json" --data-binary @-; exit 0'

// Like the real file: other keys, plus a hook of the user's own.
const existing = {
  env: { FOO: '1' },
  hooks: { Stop: [{ hooks: [{ type: 'command', command: 'say done' }] }] },
  theme: 'dark',
}

describe('hookCommand', () => {
  it('matches the command that was approved', () => {
    expect(CMD).toBe(
      'd="$HOME/Library/Application Support/Steward"; [ -r "$d/hook-token" ] && /usr/bin/curl -s -m 1 -o /dev/null -X POST "http://127.0.0.1:$(cat "$d/hook-port")/claude-hook" -H "Authorization: Bearer $(cat "$d/hook-token")" -H "Content-Type: application/json" --data-binary @-; exit 0',
    )
  })

  it('refuses folders that would break the quoting', () => {
    expect(() => hookCommand('/Users/me/we"ird', '/Users/me')).toThrow()
  })
})

describe('the hold hook', () => {
  const HOLD = holdHookCommand('/Users/me/Library/Application Support/Steward', '/Users/me')
  const connected = withStewardHooks({}, CMD)

  it('prints what Steward answers, and exits 0 whatever happens', () => {
    expect(HOLD).toContain('$HOME/Library/Application Support/Steward')
    expect(HOLD).toContain('/claude-hold')
    expect(HOLD).not.toContain('-o /dev/null')
    expect(HOLD).toMatch(/; exit 0$/)
    expect(() => holdHookCommand('/Users/me/we"ird', '/Users/me')).toThrow()
  })

  it('goes on Stop beside the plain hook, with a timeout longer than curl gives it', () => {
    const stop = (withHoldHook(connected, HOLD).hooks as Record<string, { hooks: { command: string; timeout: number }[] }[]>).Stop
    expect(stop.map((g) => g.hooks[0].command)).toEqual([CMD, HOLD])
    expect(stop[1].hooks[0].timeout).toBeGreaterThan(Number(/-m (\d+)/.exec(HOLD)![1]))
  })

  it('is there once, however many times it is added', () => {
    const twice = withHoldHook(withHoldHook(connected, HOLD), HOLD)
    expect(twice).toEqual(withHoldHook(connected, HOLD))
  })

  it('does not change what counts as connected', () => {
    expect(hookState(withHoldHook(connected, HOLD), CMD)).toBe('current')
    expect(hookState(withHoldHook({}, HOLD), CMD)).toBe('missing')
  })

  it('stays when the plain hooks are refreshed', () => {
    const refreshed = withStewardHooks(withHoldHook(connected, HOLD), CMD)
    expect(JSON.stringify(refreshed)).toContain('/claude-hold')
    expect(hookState(refreshed, CMD)).toBe('current')
  })

  it('comes out on its own, leaving the plain hooks and everyone else', () => {
    const theirs = { type: 'command', command: 'echo mine' }
    const settings = withHoldHook({ theme: 'dark', hooks: { Stop: [{ hooks: [theirs] }] } }, HOLD)
    expect(withoutHoldHook(settings)).toEqual({ theme: 'dark', hooks: { Stop: [{ hooks: [theirs] }] } })
    expect(withoutHoldHook(withHoldHook(connected, HOLD))).toEqual(connected)
    expect(withoutHoldHook({ theme: 'dark' })).toEqual({ theme: 'dark' })
  })

  it('comes out with the rest on disconnect', () => {
    expect(withoutStewardHooks(withHoldHook({ theme: 'dark', ...connected }, HOLD))).toEqual({ theme: 'dark' })
  })
})

describe('Steward hooks in ~/.claude/settings.json', () => {
  it('adds the hooks next to the existing ones and keeps every other key', () => {
    const next = withStewardHooks(existing, CMD)
    expect(Object.keys(next)).toEqual(['env', 'hooks', 'theme'])
    expect(next.env).toEqual(existing.env)
    const hooks = next.hooks as Record<string, { hooks: { command: string }[] }[]>
    expect(hooks.Stop.map((g) => g.hooks[0].command)).toEqual(['say done', CMD])
    expect(hooks.PermissionRequest[0].hooks[0]).toEqual({ type: 'command', command: CMD, timeout: 5 })
    expect(hooks.Notification).toHaveLength(1)
    expect(hookState(next, CMD)).toBe('current')
    expect(hookState(existing, CMD)).toBe('missing')
  })

  it('adds the prompt hook Visual Review needs, and tells a connection without it apart', () => {
    const next = withStewardHooks(existing, CMD)
    const hooks = next.hooks as Record<string, { hooks: { command: string }[] }[]>
    expect(hooks.UserPromptSubmit).toEqual([{ hooks: [{ type: 'command', command: CMD, timeout: 5 }] }])
    expect(reviewHookInstalled(next, CMD)).toBe(true)
    expect(reviewHookInstalled(existing, CMD)).toBe(false)

    // A connection from before Visual Review has the other three: still connected, but without the prompt hook.
    const before = Object.fromEntries(Object.entries(hooks).filter(([event]) => event !== 'UserPromptSubmit'))
    const older = { ...next, hooks: before }
    expect(hookState(older, CMD)).toBe('current')
    expect(reviewHookInstalled(older, CMD)).toBe(false)
    // Updating adds it, and removing still takes out only Steward's hooks.
    expect(reviewHookInstalled(withStewardHooks(older, CMD), CMD)).toBe(true)
    expect(withoutStewardHooks(withStewardHooks(older, CMD))).toEqual(existing)
    // A prompt hook that points somewhere else is an old connection.
    expect(hookState({ ...next, hooks: { ...hooks, UserPromptSubmit: [{ hooks: [{ type: 'command', command: OLD_CMD }] }] } }, CMD)).toBe('outdated')
  })

  it('adding twice changes nothing', () => {
    const once = withStewardHooks(existing, CMD)
    expect(withStewardHooks(once, CMD)).toEqual(once)
  })

  it('removing takes out only Steward’s hooks', () => {
    expect(withoutStewardHooks(withStewardHooks(existing, CMD))).toEqual(existing)
    const fresh = withoutStewardHooks(withStewardHooks({ theme: 'dark' }, CMD))
    expect(fresh).toEqual({ theme: 'dark' })
  })

  it('updates hooks installed before the rename in place, without duplicates', () => {
    const installed = {
      ...existing,
      hooks: {
        Stop: [{ hooks: [{ type: 'command', command: 'say done' }] }, { hooks: [{ type: 'command', command: OLD_CMD, timeout: 5 }] }],
        PermissionRequest: [{ hooks: [{ type: 'command', command: OLD_CMD, timeout: 5 }] }],
        Notification: [{ hooks: [{ type: 'command', command: OLD_CMD, timeout: 5 }] }],
      },
    }
    // The old entries count as ours, but not as up to date.
    expect(hookState(installed, CMD)).toBe('outdated')

    const updated = withStewardHooks(installed, CMD)
    expect(hookState(updated, CMD)).toBe('current')
    const hooks = updated.hooks as Record<string, { hooks: { command: string }[] }[]>
    expect(hooks.Stop.map((g) => g.hooks.map((h) => h.command))).toEqual([['say done'], [CMD]])
    expect(hooks.PermissionRequest.flatMap((g) => g.hooks.map((h) => h.command))).toEqual([CMD])
    expect(hooks.Notification.flatMap((g) => g.hooks.map((h) => h.command))).toEqual([CMD])
    expect(JSON.stringify(updated)).not.toContain('Support/Companion')

    // Disconnecting removes old and new entries alike.
    expect(withoutStewardHooks(installed)).toEqual(existing)
  })

  it('collapses an old and a new entry for the same event into one', () => {
    const doubled = { hooks: { Stop: [{ hooks: [{ type: 'command', command: OLD_CMD }, { type: 'command', command: CMD, timeout: 5 }] }] } }
    expect(hookState(withStewardHooks({}, CMD), CMD)).toBe('current')
    expect(hookState(doubled, CMD)).toBe('outdated')
    const fixed = withStewardHooks(doubled, CMD).hooks as Record<string, { hooks: { command: string }[] }[]>
    expect(fixed.Stop.flatMap((g) => g.hooks.map((h) => h.command))).toEqual([CMD])
  })

  it('leaves a hooks section in an unexpected shape alone', () => {
    expect(() => withStewardHooks({ hooks: { Stop: 'nope' } }, CMD)).toThrow(/left alone/)
  })

  it('backs up the original once and refuses to touch invalid JSON', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'steward-claude-'))
    const file = path.join(dir, 'settings.json')
    try {
      expect(await readClaudeSettings(file)).toEqual({})
      await fs.writeFile(file, JSON.stringify(existing), { mode: 0o600 })
      await writeClaudeSettings(withStewardHooks(await readClaudeSettings(file), CMD), file)
      expect(JSON.parse(await fs.readFile(`${file}.before-steward`, 'utf8'))).toEqual(existing)
      expect(hookState(await readClaudeSettings(file), CMD)).toBe('current')
      expect((await fs.stat(file)).mode & 0o777).toBe(0o600)
      // A second write keeps the first backup.
      await writeClaudeSettings(withoutStewardHooks(await readClaudeSettings(file)), file)
      expect(JSON.parse(await fs.readFile(`${file}.before-steward`, 'utf8'))).toEqual(existing)
      expect(await readClaudeSettings(file)).toEqual(existing)

      await fs.writeFile(file, '{ not json')
      await expect(readClaudeSettings(file)).rejects.toThrow(/isn't valid JSON/)
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })

  it('treats a backup made under the old name as the backup, and makes no second one', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'steward-claude-'))
    const file = path.join(dir, 'settings.json')
    try {
      await fs.writeFile(`${file}.before-companion`, JSON.stringify({ theme: 'original' }))
      await fs.writeFile(file, JSON.stringify(withStewardHooks(existing, OLD_CMD)))
      expect(await backupFile(file)).toBe(`${file}.before-companion`)
      await writeClaudeSettings(withStewardHooks(await readClaudeSettings(file), CMD), file)
      expect(await fs.readdir(dir)).toEqual(['settings.json', 'settings.json.before-companion'])
      expect(JSON.parse(await fs.readFile(`${file}.before-companion`, 'utf8'))).toEqual({ theme: 'original' })
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })
})
