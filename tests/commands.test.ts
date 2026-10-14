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

describe('runCommand', () => {
  it('captures output and the exit code', async () => {
    const result = await runCommand('echo hello && exit 3', os.tmpdir())
    expect(result.output.trim()).toBe('hello')
    expect(result.exitCode).toBe(3)
    expect(result.timedOut).toBe(false)
  })

  it('stops commands that run too long', async () => {
    const result = await runCommand('sleep 5', os.tmpdir(), { timeoutMs: 200 })
    expect(result.timedOut).toBe(true)
  })

  it('stops what the command started, not just the shell', async () => {
    const started = Date.now()
    const result = await runCommand('sleep 5; echo finished', os.tmpdir(), { timeoutMs: 200 })
    expect(result.timedOut).toBe(true)
    expect(result.output).not.toContain('finished')
    expect(Date.now() - started).toBeLessThan(3000)
  })

  it('kills commands that ignore SIGTERM', async () => {
    const started = Date.now()
    const result = await runCommand("trap '' TERM; sleep 6; echo finished", os.tmpdir(), { timeoutMs: 200 })
    expect(result.timedOut).toBe(true)
    expect(result.output).not.toContain('finished')
    expect(Date.now() - started).toBeLessThan(4500)
  })

  it('stops the same way when the request is cancelled', async () => {
    const controller = new AbortController()
    const started = Date.now()
    const pending = runCommand('sleep 5; echo finished', os.tmpdir(), { signal: controller.signal })
    setTimeout(() => controller.abort(), 200)
    const result = await pending
    expect(result.exitCode).not.toBe(0)
    expect(result.output).not.toContain('finished')
    expect(Date.now() - started).toBeLessThan(3000)
  })
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
