import { createCipheriv, pbkdf2Sync } from 'node:crypto'
import { existsSync, mkdtempSync, promises as fs, readFileSync, rmSync, symlinkSync, writeFileSync, mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { decryptLegacySecret, markSecretsDone, migrateUserData, secretsPending } from '../src/main/migrate'

describe('migrateUserData', () => {
  let root: string
  let oldDir: string
  let newDir: string

  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'steward-migrate-'))
    oldDir = path.join(root, 'OldApp')
    newDir = path.join(root, 'Steward')
    mkdirSync(path.join(oldDir, 'tray'), { recursive: true })
    writeFileSync(path.join(oldDir, 'settings.json'), '{"secrets":{"anthropic":"djEw"}}')
    writeFileSync(path.join(oldDir, 'state.json'), '{"lastSeenAt":1}')
    writeFileSync(path.join(oldDir, 'hook-token'), 'a'.repeat(64), { mode: 0o600 })
    writeFileSync(path.join(oldDir, 'hook-port'), '47831')
    writeFileSync(path.join(oldDir, 'tray', 'index.json'), '[]')
    // Chromium's instance lock: a symlink to "host-pid" that a copy must not carry over.
    symlinkSync('somehost-12345', path.join(oldDir, 'SingletonLock'))
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('copies the old folder across once, leaving the old one as it was', async () => {
    expect(migrateUserData(oldDir, newDir)).toBe(true)
    for (const f of ['settings.json', 'state.json', 'hook-token', 'hook-port', 'tray/index.json']) {
      expect(readFileSync(path.join(newDir, f), 'utf8')).toBe(readFileSync(path.join(oldDir, f), 'utf8'))
    }
    // What the hook command needs: a private token and the port.
    expect((await fs.stat(path.join(newDir, 'hook-token'))).mode & 0o777).toBe(0o600)
    expect(existsSync(path.join(newDir, 'SingletonLock'))).toBe(false)
    expect(existsSync(path.join(oldDir, 'settings.json'))).toBe(true)
    expect(existsSync(`${newDir}.partial`)).toBe(false)
    expect(secretsPending(newDir)).toBe(true)

    // Second launch: the new folder exists, so nothing is copied again.
    writeFileSync(path.join(newDir, 'state.json'), '{"lastSeenAt":2}')
    expect(migrateUserData(oldDir, newDir)).toBe(false)
    expect(readFileSync(path.join(newDir, 'state.json'), 'utf8')).toBe('{"lastSeenAt":2}')
  })

  it('does nothing without an old folder, and records when the keys are done', () => {
    expect(migrateUserData(path.join(root, 'Missing'), newDir)).toBe(false)
    expect(existsSync(newDir)).toBe(false)
    migrateUserData(oldDir, newDir)
    markSecretsDone(newDir)
    expect(secretsPending(newDir)).toBe(false)
  })
})

describe('decryptLegacySecret', () => {
  // Encrypt the way safeStorage does on macOS, with a made-up keychain password.
  const encrypt = (plain: string, password: string) => {
    const key = pbkdf2Sync(password, 'saltysalt', 1003, 16, 'sha1')
    const cipher = createCipheriv('aes-128-cbc', key, Buffer.alloc(16, ' '))
    return Buffer.concat([Buffer.from('v10'), cipher.update(plain, 'utf8'), cipher.final()])
  }

  it('reads values saved by the old app with its keychain password', () => {
    expect(decryptLegacySecret(encrypt('sk-ant-example-123', 'pw'), 'pw')).toBe('sk-ant-example-123')
  })

  it('fails rather than guessing with the wrong password or an unknown format', () => {
    expect(() => decryptLegacySecret(encrypt('sk-ant-example-123', 'pw'), 'other')).toThrow()
    expect(() => decryptLegacySecret(Buffer.from('v11xxxxxxxxxxxxxxxxx'), 'pw')).toThrow(/knows how to read/)
  })
})
