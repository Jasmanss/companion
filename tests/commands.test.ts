import os from 'node:os'
import { describe, expect, it } from 'vitest'
import { alwaysAsks, isAllowlisted, runCommand, stripAnsi } from '../src/main/commands'

describe('isAllowlisted', () => {
  const list = ['git status', 'npm test']

  it('allows exact matches, ignoring extra spaces', () => {
    expect(isAllowlisted('git status', list)).toBe(true)
    expect(isAllowlisted('  npm   test ', list)).toBe(true)
  })

  it('rejects anything not on the list', () => {
    expect(isAllowlisted('git push', list)).toBe(false)
    expect(isAllowlisted('npm test --watch', list)).toBe(false)
    expect(isAllowlisted('', list)).toBe(false)
  })

  it('rejects allowlisted commands chained with something else', () => {
    for (const cmd of ['git status; rm -rf ~', 'git status && curl x', 'git status | sh', 'npm test > out', 'git status $(whoami)', 'npm test `id`']) {
      expect(isAllowlisted(cmd, [...list, cmd])).toBe(false)
    }
  })
})

// These run real processes, so they can't use fake timers. Each command would run for 30 s if it weren't stopped, and
// stopping it takes well under a second (2 s more when it ignores SIGTERM). A test passes in about 2 s at most and only
// fails if the stopping breaks, so a busy machine can't decide the result. (They used to sleep 5 s and allow 3 to 4.5 s,
// close to the 5 s each test gets.)
const NEVER_ENDS = 'sleep 30'
const STOPPED_WITHIN_MS = 10_000
const TEST_TIMEOUT_MS = 20_000

describe('runCommand', () => {
  it('captures output and the exit code', async () => {
    const result = await runCommand('echo hello && exit 3', os.tmpdir())
    expect(result.output.trim()).toBe('hello')
    expect(result.exitCode).toBe(3)
    expect(result.timedOut).toBe(false)
  })

  it('stops commands that run too long', async () => {
    const result = await runCommand(NEVER_ENDS, os.tmpdir(), { timeoutMs: 200 })
    expect(result.timedOut).toBe(true)
  }, TEST_TIMEOUT_MS)

  it('stops what the command started, not just the shell', async () => {
    const started = Date.now()
    const result = await runCommand(`${NEVER_ENDS}; echo finished`, os.tmpdir(), { timeoutMs: 200 })
    expect(result.timedOut).toBe(true)
    expect(result.output).not.toContain('finished')
    // A sleep left running would hold the output open for the full 30 s.
    expect(Date.now() - started).toBeLessThan(STOPPED_WITHIN_MS)
  }, TEST_TIMEOUT_MS)

  it('kills commands that ignore SIGTERM', async () => {
    const started = Date.now()
    const result = await runCommand(`trap '' TERM; ${NEVER_ENDS}; echo finished`, os.tmpdir(), { timeoutMs: 200 })
    expect(result.timedOut).toBe(true)
    expect(result.output).not.toContain('finished')
    expect(Date.now() - started).toBeLessThan(STOPPED_WITHIN_MS)
  }, TEST_TIMEOUT_MS)

  it('stops the same way when the request is cancelled', async () => {
    const controller = new AbortController()
    const started = Date.now()
    const pending = runCommand(`${NEVER_ENDS}; echo finished`, os.tmpdir(), { signal: controller.signal })
    setTimeout(() => controller.abort(), 200)
    const result = await pending
    expect(result.exitCode).not.toBe(0)
    expect(result.output).not.toContain('finished')
    expect(Date.now() - started).toBeLessThan(STOPPED_WITHIN_MS)
  }, TEST_TIMEOUT_MS)
})

describe('stripAnsi', () => {
  it('removes color codes', () => {
    expect(stripAnsi('\u001b[32mok\u001b[0m')).toBe('ok')
  })
})

describe('alwaysAsks', () => {
  it('flags deploys, rollbacks and pushes', () => {
    for (const cmd of ['vercel', 'vercel --prod', 'npx vercel deploy', 'vc rollback', 'vercel promote dpl_123', 'npm run deploy', 'git push', 'git  push origin main', 'firebase deploy']) {
      expect(alwaysAsks(cmd), cmd).toBe(true)
    }
    for (const cmd of ['git status', 'npm test', 'ls', 'git pull', 'npm run build']) expect(alwaysAsks(cmd), cmd).toBe(false)
  })

  it('wins over the allowlist', () => {
    expect(isAllowlisted('vercel --prod', ['vercel --prod'])).toBe(false)
    expect(isAllowlisted('git push', ['git push'])).toBe(false)
    expect(isAllowlisted('npm test', ['npm test'])).toBe(true)
  })
})
