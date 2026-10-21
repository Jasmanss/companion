// One smoke run at a time on a Mac. Two at once share the throwaway data folder and fight over the CPU, which makes the
// motion checks fail on timing alone. The lock is a file in the temp folder holding the runner's pid. A second run waits
// for the first and then gives up with a message; a lock left by a dead run (or by a pid something else reused) is taken over.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const LOCK_FILE = path.join(os.tmpdir(), 'steward-smoke.lock')
/** How long a second run waits before giving up: a full smoke run takes about four minutes. */
export const WAIT_MS = 6 * 60_000

/** What `ps` says a pid is running, or null if it can't be asked. */
function commandOf(pid) {
  try {
    return execFileSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8', timeout: 3000 })
  } catch (err) {
    // ps exits 1 when there is no such process.
    return err?.status === 1 ? '' : null
  }
}

/** Is this pid a live smoke runner? A dead one is not, and neither is a pid that something else has since reused. */
export function isSmokeRunner(pid, ask = commandOf) {
  try {
    process.kill(pid, 0)
  } catch (err) {
    if (err?.code !== 'EPERM') return false
  }
  const command = ask(pid)
  return command === null ? true : /smoke\.mjs/.test(command)
}

function readRaw(file) {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    return null
  }
}

function parse(raw) {
  try {
    const held = JSON.parse(raw ?? '')
    return Number.isInteger(held?.pid) ? held : null
  } catch {
    return null
  }
}

/** Makes the lock file in one step, with its contents already in it: false if it exists. */
function create(file, content) {
  const mine = `${file}.${process.pid}`
  fs.writeFileSync(mine, content)
  try {
    fs.linkSync(mine, file)
    return true
  } catch (err) {
    if (err?.code === 'EEXIST') return false
    throw err
  } finally {
    fs.rmSync(mine, { force: true })
  }
}

export class LockBusy extends Error {
  constructor(held, waitedMs) {
    super('smoke lock is held')
    this.held = held
    this.waitedMs = waitedMs
  }
}

/**
 * Takes the lock, waiting for whoever holds it for up to waitMs (then throws LockBusy). Returns the function that gives
 * it back. `alive`, `sleep` and `now` are there for the tests.
 */
export async function acquire({
  file = LOCK_FILE,
  waitMs = WAIT_MS,
  pollMs = 1000,
  alive = isSmokeRunner,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = Date.now,
  log = (line) => console.error(line),
  where = process.cwd(),
} = {}) {
  const content = JSON.stringify({ pid: process.pid, started: now(), where })
  const began = now()
  let toldAt = null
  for (;;) {
    if (create(file, content)) return () => release(file)
    const raw = readRaw(file)
    const held = parse(raw)
    if (raw === null) continue
    if (!held || !alive(held.pid)) {
      // Left behind by a run that died: take it over, unless somebody else got there first.
      if (readRaw(file) === raw) fs.rmSync(file, { force: true })
      continue
    }
    if (now() - began >= waitMs) throw new LockBusy(held, now() - began)
    if (toldAt === null || now() - toldAt >= 30_000) {
      toldAt = now()
      log(`smoke: another smoke run is going (pid ${held.pid}, started ${new Date(held.started).toLocaleTimeString()}, in ${held.where}); waiting for it, up to ${waitMs >= 120_000 ? `${Math.round(waitMs / 60_000)} minutes` : `${Math.round(waitMs / 1000)} seconds`}`)
    }
    await sleep(pollMs)
  }
}

/** Gives the lock back, but only if it is still ours. */
export function release(file = LOCK_FILE) {
  if (parse(readRaw(file))?.pid === process.pid) fs.rmSync(file, { force: true })
}
