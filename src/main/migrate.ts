import { execFile } from 'node:child_process'
import { createDecipheriv, pbkdf2Sync } from 'node:crypto'
import { cpSync, existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Steward used to be called Companion. Electron names the data folder and the keychain entry after the app,
 * so both changed with the rename; these are the old names, kept only to bring the old data across.
 */
export const LEGACY_APP_NAME = 'Companion'
export const LEGACY_KEYCHAIN = { service: 'Companion Safe Storage', account: 'Companion Key' }

/** Written into the new folder after a copy; says whether the saved keys still need re-encrypting. */
const MARKER = 'migration.json'
/** Lock files belong to a running instance, not to the data; copied, they could make Steward think it's already open. */
const SKIP = new Set(['SingletonLock', 'SingletonSocket', 'SingletonCookie'])

interface Marker {
  from: string
  at: number
  secrets: 'pending' | 'done'
}

/**
 * Copy the old data folder to the new one, once: only when the new folder doesn't exist yet and the old one does.
 * The old folder is left as it was, as a backup. Returns whether anything was copied.
 */
export function migrateUserData(oldDir: string, newDir: string): boolean {
  if (existsSync(newDir) || !existsSync(oldDir)) return false
  // Copy beside it first, then rename, so a copy that fails half-way never looks like a finished one.
  const partial = `${newDir}.partial`
  rmSync(partial, { recursive: true, force: true })
  cpSync(oldDir, partial, { recursive: true, verbatimSymlinks: true, filter: (src) => !SKIP.has(path.basename(src)) })
  const marker: Marker = { from: oldDir, at: Date.now(), secrets: 'pending' }
  writeFileSync(path.join(partial, MARKER), JSON.stringify(marker, null, 2))
  renameSync(partial, newDir)
  return true
}

/** Whether a copy happened and its saved keys still need re-encrypting for the new keychain entry. */
export function secretsPending(dir: string): boolean {
  try {
    return (JSON.parse(readFileSync(path.join(dir, MARKER), 'utf8')) as Marker).secrets === 'pending'
  } catch {
    return false
  }
}

export function markSecretsDone(dir: string): void {
  const file = path.join(dir, MARKER)
  try {
    writeFileSync(file, JSON.stringify({ ...(JSON.parse(readFileSync(file, 'utf8')) as Marker), secrets: 'done' }, null, 2))
  } catch {
    // no marker: nothing to record
  }
}

/**
 * Decrypt a value the old app saved with safeStorage. On macOS that's Chromium's "v10" format: AES-128-CBC with a
 * key derived from the keychain entry's password (PBKDF2-SHA1, salt "saltysalt", 1003 rounds) and an IV of spaces.
 */
export function decryptLegacySecret(blob: Buffer, keychainPassword: string): string {
  if (blob.subarray(0, 3).toString('latin1') !== 'v10') throw new Error('Not a value this migration knows how to read')
  const key = pbkdf2Sync(keychainPassword, 'saltysalt', 1003, 16, 'sha1')
  const decipher = createDecipheriv('aes-128-cbc', key, Buffer.alloc(16, ' '))
  return Buffer.concat([decipher.update(blob.subarray(3)), decipher.final()]).toString('utf8')
}

/**
 * The old keychain entry's password, through macOS's own `security` tool. macOS asks you to allow this once;
 * denying it (or waiting it out) just means re-entering the keys in Settings.
 */
export function readLegacyKeychainPassword(): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('/usr/bin/security', ['find-generic-password', '-w', '-s', LEGACY_KEYCHAIN.service, '-a', LEGACY_KEYCHAIN.account], { timeout: 120_000 }, (err, stdout) =>
      err ? reject(new Error('The old keychain entry could not be read')) : resolve(stdout.trim()),
    )
  })
}
