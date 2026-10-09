import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  hasCompanionHooks,
  hookCommand,
  readClaudeSettings,
  withCompanionHooks,
  withoutCompanionHooks,
  writeClaudeSettings,
} from '../src/main/claude-settings'

const CMD = hookCommand('/Users/me/Library/Application Support/Companion', '/Users/me')

// Like the real file: other keys, plus a hook of the user's own.
const existing = {
  env: { FOO: '1' },
  hooks: { Stop: [{ hooks: [{ type: 'command', command: 'say done' }] }] },
  theme: 'dark',
}

describe('hookCommand', () => {
  it('matches the command that was approved', () => {
    expect(CMD).toBe(
      'd="$HOME/Library/Application Support/Companion"; [ -r "$d/hook-token" ] && /usr/bin/curl -s -m 1 -o /dev/null -X POST "http://127.0.0.1:$(cat "$d/hook-port")/claude-hook" -H "Authorization: Bearer $(cat "$d/hook-token")" -H "Content-Type: application/json" --data-binary @-; exit 0',
    )
  })

  it('refuses folders that would break the quoting', () => {
    expect(() => hookCommand('/Users/me/we"ird', '/Users/me')).toThrow()
  })
})

describe('Companion hooks in ~/.claude/settings.json', () => {
  it('adds all three hooks next to the existing ones and keeps every other key', () => {
    const next = withCompanionHooks(existing, CMD)
    expect(Object.keys(next)).toEqual(['env', 'hooks', 'theme'])
    expect(next.env).toEqual(existing.env)
    const hooks = next.hooks as Record<string, { hooks: { command: string }[] }[]>
    expect(hooks.Stop.map((g) => g.hooks[0].command)).toEqual(['say done', CMD])
    expect(hooks.PermissionRequest[0].hooks[0]).toEqual({ type: 'command', command: CMD, timeout: 5 })
    expect(hooks.Notification).toHaveLength(1)
    expect(hasCompanionHooks(next)).toBe(true)
    expect(hasCompanionHooks(existing)).toBe(false)
  })

  it('adding twice changes nothing', () => {
    const once = withCompanionHooks(existing, CMD)
    expect(withCompanionHooks(once, CMD)).toEqual(once)
  })

  it('removing takes out only Companion’s hooks', () => {
    expect(withoutCompanionHooks(withCompanionHooks(existing, CMD))).toEqual(existing)
    const fresh = withoutCompanionHooks(withCompanionHooks({ theme: 'dark' }, CMD))
    expect(fresh).toEqual({ theme: 'dark' })
  })

  it('leaves a hooks section in an unexpected shape alone', () => {
    expect(() => withCompanionHooks({ hooks: { Stop: 'nope' } }, CMD)).toThrow(/left alone/)
  })

  it('backs up the original once and refuses to touch invalid JSON', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'companion-claude-'))
    const file = path.join(dir, 'settings.json')
    try {
      expect(await readClaudeSettings(file)).toEqual({})
      await fs.writeFile(file, JSON.stringify(existing), { mode: 0o600 })
      await writeClaudeSettings(withCompanionHooks(await readClaudeSettings(file), CMD), file)
      expect(JSON.parse(await fs.readFile(`${file}.before-companion`, 'utf8'))).toEqual(existing)
      expect(hasCompanionHooks(await readClaudeSettings(file))).toBe(true)
      expect((await fs.stat(file)).mode & 0o777).toBe(0o600)
      // A second write keeps the first backup.
      await writeClaudeSettings(withoutCompanionHooks(await readClaudeSettings(file)), file)
      expect(JSON.parse(await fs.readFile(`${file}.before-companion`, 'utf8'))).toEqual(existing)
      expect(await readClaudeSettings(file)).toEqual(existing)

      await fs.writeFile(file, '{ not json')
      await expect(readClaudeSettings(file)).rejects.toThrow(/isn't valid JSON/)
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })
})
