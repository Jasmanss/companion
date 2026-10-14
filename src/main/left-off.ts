import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { LeftOff, Project } from '../shared/types'
import { readTail } from './transcript'

/**
 * The only git commands this module runs: read-only, fixed arguments, no shell. The model never builds them,
 * and what they print is shown as text, never acted on.
 */
export const GIT_COMMANDS = {
  branch: ['rev-parse', '--abbrev-ref', 'HEAD'],
  log: ['log', '-3', '--format=%h%x1f%s%x1f%cr'],
  status: ['status', '--porcelain'],
  unpushed: ['rev-list', '--count', '@{upstream}..HEAD'],
} as const

export type GitRunner = (args: readonly string[], cwd: string) => Promise<string>

export const runGit: GitRunner = (args, cwd) =>
  new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      // No optional locks, so reading never gets in the way of Claude Code or you working in the repo.
      { cwd, timeout: 5000, maxBuffer: 1_000_000, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' } },
      (err, stdout) => (err ? reject(err) : resolve(stdout)),
    )
  })

export function parseLog(stdout: string): LeftOff['commits'] {
  return stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash, subject, when] = line.split('\x1f')
      return { hash, subject: subject ?? '', when: when ?? '' }
    })
}

export function parseStatus(stdout: string): LeftOff['uncommitted'] {
  const lines = stdout.split('\n').filter((l) => l.trim())
  return { count: lines.length, files: lines.slice(0, 5).map((l) => l.slice(3).replace(/^"|"$/g, '')) }
}

/** Where Claude Code keeps session logs for a folder: every character that isn't a letter or digit becomes "-". */
export function claudeProjectDir(projectPath: string, home = os.homedir()): string {
  return path.join(home, '.claude', 'projects', projectPath.replace(/[^a-zA-Z0-9]/g, '-'))
}

/** The last thing Claude said in a session log: the newest main-thread assistant text. */
export function lastAssistantText(lines: Record<string, unknown>[]): { text: string; at: number } | null {
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]
    if (line.type !== 'assistant' || line.isSidechain) continue
    const content = (line.message as { content?: unknown } | undefined)?.content
    if (!Array.isArray(content)) continue
    const text = content
      .filter((b): b is { type: 'text'; text: string } => b?.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text)
      .join('\n')
      .replace(/\s+/g, ' ')
      .trim()
    if (!text) continue
    return { text: text.length > 400 ? `${text.slice(0, 399)}…` : text, at: typeof line.timestamp === 'string' ? Date.parse(line.timestamp) : 0 }
  }
  return null
}

/** The newest session log for exactly this folder, read from the end. Read-only. */
export async function lastClaudeMessage(projectPath: string, home = os.homedir()): Promise<LeftOff['claude']> {
  const dir = claudeProjectDir(projectPath, home)
  const names = await fs.readdir(dir).catch(() => [] as string[])
  const logs = await Promise.all(
    names
      .filter((n) => n.endsWith('.jsonl'))
      .map(async (n) => ({ file: path.join(dir, n), mtime: (await fs.stat(path.join(dir, n)).catch(() => null))?.mtimeMs ?? 0 })),
  )
  // The newest few, in case the very newest has no reply yet.
  for (const { file } of logs.sort((a, b) => b.mtime - a.mtime).slice(0, 3)) {
    const found = lastAssistantText(await readTail(file).catch(() => []))
    if (found) return found
  }
  return null
}

/** The "where you left off" card for one project. Anything that can't be read is simply left out. */
export async function whereYouLeftOff(project: Project, { git = runGit, home = os.homedir() }: { git?: GitRunner; home?: string } = {}): Promise<LeftOff> {
  // Only trailing whitespace is trimmed: porcelain status uses a leading space as a column.
  const run = (args: readonly string[]) => git(args, project.path).then(
    (out) => out.trimEnd(),
    () => null,
  )
  const [branch, log, status, unpushed, claude] = await Promise.all([
    run(GIT_COMMANDS.branch),
    run(GIT_COMMANDS.log),
    run(GIT_COMMANDS.status),
    run(GIT_COMMANDS.unpushed),
    lastClaudeMessage(project.path, home),
  ])
  return {
    project: project.name,
    path: project.path,
    isGit: branch !== null,
    branch,
    commits: log ? parseLog(log) : [],
    uncommitted: status ? parseStatus(status) : { count: 0, files: [] },
    unpushed: unpushed !== null && /^\d+$/.test(unpushed) ? Number(unpushed) : null,
    claude,
  }
}
