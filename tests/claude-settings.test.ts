import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  backupFile,
  hookCommand,
  hookState,
  readClaudeSettings,
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

describe('Steward hooks in ~/.claude/settings.json', () => {
  it('adds all three hooks next to the existing ones and keeps every other key', () => {
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
