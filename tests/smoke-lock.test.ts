import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { acquire, isSmokeRunner, LockBusy } from '../scripts/smoke-lock.mjs'

let dir: string
let file: string
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-lock-test-'))
  file = path.join(dir, 'lock')
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

/** A clock the test moves by sleeping: no real waiting. */
function clock() {
  let t = 1_000_000
  return { now: () => t, sleep: async (ms: number) => void (t += ms) }
}
const lockOf = (pid: number) => JSON.stringify({ pid, started: 1, where: '/somewhere' })

describe('one smoke run at a time', () => {
  it('takes a free lock, holds it with its own pid, and gives it back', async () => {
    const release = await acquire({ file, log: () => {} })
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).pid).toBe(process.pid)
    release()
    expect(fs.existsSync(file)).toBe(false)
  })

  it('waits for a run that is still going, then gives up saying who has it', async () => {
    fs.writeFileSync(file, lockOf(4242))
    const told: string[] = []
    const c = clock()
    const err = await acquire({ file, waitMs: 90_000, alive: () => true, log: (l) => told.push(l), ...c }).catch((e) => e)
    expect(err).toBeInstanceOf(LockBusy)
    expect(err.held.pid).toBe(4242)
    expect(err.waitedMs).toBeGreaterThanOrEqual(90_000)
    // Said once up front, then every 30 s, not every second.
    expect(told.length).toBeGreaterThanOrEqual(3)
    expect(told.length).toBeLessThanOrEqual(5)
    expect(told[0]).toContain('pid 4242')
    // The other run's lock is left alone.
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).pid).toBe(4242)
  })

  it('goes ahead as soon as the other run lets go', async () => {
    fs.writeFileSync(file, lockOf(4242))
    const c = clock()
    let polls = 0
    const release = await acquire({
      file,
      alive: () => true,
      log: () => {},
      now: c.now,
      sleep: async (ms) => {
        await c.sleep(ms)
        if (++polls === 3) fs.rmSync(file)
      },
    })
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).pid).toBe(process.pid)
    release()
  })

  it('takes over a lock left by a run that died, or one that is not a lock at all', async () => {
    fs.writeFileSync(file, lockOf(4242))
    const release = await acquire({ file, alive: () => false, log: () => {} })
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).pid).toBe(process.pid)
    release()
    fs.writeFileSync(file, 'garbage')
    const again = await acquire({ file, alive: () => true, log: () => {} })
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).pid).toBe(process.pid)
    again()
  })

  it("won't give back a lock that has since become another run's", async () => {
    const release = await acquire({ file, log: () => {} })
    fs.writeFileSync(file, lockOf(4242))
    release()
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).pid).toBe(4242)
  })
})

describe('telling a live smoke run from a stale pid', () => {
  it('is not a runner when the pid is dead', () => {
    expect(isSmokeRunner(2 ** 22 + 12345, () => 'node scripts/smoke.mjs')).toBe(false)
  })

  it('is not a runner when a live pid is something else now (the pid was reused)', () => {
    expect(isSmokeRunner(process.pid, () => '/usr/bin/vim notes.txt')).toBe(false)
  })

  it('is a runner when it is alive and running scripts/smoke.mjs, or when ps cannot be asked', () => {
    expect(isSmokeRunner(process.pid, () => 'node scripts/smoke.mjs --visible')).toBe(true)
    expect(isSmokeRunner(process.pid, () => null)).toBe(true)
  })
})
