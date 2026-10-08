import os from 'node:os'
import { describe, expect, it } from 'vitest'
import { isAllowlisted, runCommand, stripAnsi } from '../src/main/commands'

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
})

describe('stripAnsi', () => {
  it('removes color codes', () => {
    expect(stripAnsi('\u001b[32mok\u001b[0m')).toBe('ok')
  })
})
