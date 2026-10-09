import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Anything that could chain, redirect, or expand into a different command.
const SHELL_SYNTAX = /[;&|<>`$\\(){}*?!\n]/
const MAX_OUTPUT = 40_000
const ANSI = new RegExp(String.fromCharCode(27) + '\\[[0-9;?]*[A-Za-z]', 'g')

export function normalizeCommand(command: string): string {
  return command.trim().replace(/\s+/g, ' ')
}

/**
 * Deploys, rollbacks and pushes (which deploy through Git integrations) always show the approval card,
 * whatever the allowlist says.
 */
export function alwaysAsks(command: string): boolean {
  const normalized = normalizeCommand(command).toLowerCase()
  return (
    /(^|\s)(npx |pnpm dlx |bunx |yarn dlx )?(vercel|vc)(\s|$)/.test(normalized) ||
    /\b(deploy|deployment|rollback|promote|redeploy)\b/.test(normalized) ||
    /\bgit\s+push\b/.test(normalized)
  )
}

/** Allowlisted commands run without an approval card; only exact, plain commands qualify. */
export function isAllowlisted(command: string, allowlist: string[]): boolean {
  const normalized = normalizeCommand(command)
  if (!normalized || SHELL_SYNTAX.test(normalized) || alwaysAsks(normalized)) return false
  return allowlist.some((entry) => normalizeCommand(entry) === normalized)
}

export function stripAnsi(text: string): string {
  return text.replace(ANSI, '')
}

export interface CommandResult {
  exitCode: number | null
  output: string
  timedOut: boolean
}

/**
 * Run a shell command in a project folder. Apps launched from Finder get a
 * bare PATH, so a login shell plus the usual install locations are added.
 */
export function runCommand(
  command: string,
  cwd: string,
  opts: { timeoutMs?: number; signal?: AbortSignal; onOutput?: (chunk: string) => void } = {},
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const home = os.homedir()
    const PATH = [process.env.PATH, '/opt/homebrew/bin', '/usr/local/bin', path.join(home, '.volta/bin'), path.join(home, '.bun/bin'), path.join(home, '.local/bin')]
      .filter(Boolean)
      .join(':')
    const shell = existsSync('/bin/zsh') ? '/bin/zsh' : '/bin/sh'
    const child = spawn(shell, ['-lc', command], { cwd, env: { ...process.env, PATH, FORCE_COLOR: '0' }, signal: opts.signal })

    let output = ''
    const onData = (data: Buffer) => {
      const chunk = data.toString()
      output = (output + chunk).slice(-MAX_OUTPUT)
      opts.onOutput?.(chunk)
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)

    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
    }, opts.timeoutMs ?? 120_000)

    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({ exitCode: null, output: `${output}\n${err.message}`.trim(), timedOut })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ exitCode: code, output, timedOut })
    })
  })
}
