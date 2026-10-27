// How many files a Claude Code turn changed, for the Visual Review card ("3 files changed"). Like where you left off
// (left-off.ts): read-only git, fixed arguments, no shell, run by the app and never by the model, and what it prints is
// only counted. A file counts when git lists it as changed and it was written after the turn began, or it was deleted
// during the turn, or a commit made during the turn has it. A file you edited yourself meanwhile counts too: git can't
// tell who wrote it.
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { runGit, type GitRunner } from './left-off'

export const TURN_GIT = {
  root: ['rev-parse', '--show-toplevel'],
  status: ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
} as const

/**
 * The commits made since a moment, and the files each touched. The moment is Steward's own clock, as an ISO date, rounded
 * up to a whole second: git reads only whole seconds, so a commit made the same second before the prompt would count.
 */
export const committedSince = (since: number): string[] => ['log', `--since=${new Date(Math.ceil(since / 1000) * 1000).toISOString()}`, '--name-only', '--format=', '--no-renames']

/** git status's view of one file: its two-letter code (" M", "??", "D ", "R ") and its path from the checkout's top. */
export interface StatusEntry {
  code: string
  path: string
}

/** More files than this listed (a build folder that isn't ignored, say): too many to check, so no count. */
const MAX_ENTRIES = 5000
/** A file's time can be a moment behind the prompt's on some disks: this much earlier still counts. */
const SLACK_MS = 2000

/** `git status --porcelain=v1 -z`: "XY path" entries split by NUL; a rename or copy is followed by its old path. */
export function parseStatusZ(out: string): StatusEntry[] {
  const parts = out.split('\0')
  const entries: StatusEntry[] = []
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (part.length < 4) continue
    const code = part.slice(0, 2)
    entries.push({ code, path: part.slice(3) })
    if (/[RC]/.test(code)) i++
  }
  return entries
}

/** `git log --name-only --format=`: one path a line, blank lines between commits. */
export const parseNames = (out: string): string[] => out.split('\n').filter((line) => line.trim())

export interface TurnFilesDeps {
  git?: GitRunner
  /** When a file was last written (ms), or null if it isn't there. */
  mtime?: (file: string) => Promise<number | null>
}

const fileTime = (file: string) => fs.stat(file).then((s) => s.mtimeMs, () => null)

/** At the turn's start: what git lists as changed in the project's checkout, so deletions can be told apart later. null: not a git checkout. */
export async function lookAtFiles(dir: string, { git = runGit }: TurnFilesDeps = {}): Promise<StatusEntry[] | null> {
  return git(TURN_GIT.status, dir).then(parseStatusZ, () => null)
}

/**
 * How many files changed in the checkout since the turn began (`since`), given what git listed then (`start`, or null
 * if that look failed). null: not a git checkout, or too much to count.
 */
export async function filesChangedSince(dir: string, since: number, start: StatusEntry[] | null, { git = runGit, mtime = fileTime }: TurnFilesDeps = {}): Promise<number | null> {
  const root = await git(TURN_GIT.root, dir).then(
    (out) => out.trim(),
    () => '',
  )
  if (!root) return null
  const [status, committed] = await Promise.all([git(TURN_GIT.status, dir).then(parseStatusZ), git(committedSince(since), dir).then(parseNames, () => [])])
  if (status.length > MAX_ENTRIES) return null
  const wasDeleted = new Set((start ?? []).filter((e) => e.code.includes('D')).map((e) => e.path))
  const changed = new Set(committed)
  for (const entry of status) {
    if (changed.has(entry.path)) continue
    if (entry.code.includes('D')) {
      // Gone: only news if it wasn't already gone when the turn began (unknown without that look, so not counted).
      if (start && !wasDeleted.has(entry.path)) changed.add(entry.path)
      continue
    }
    const at = await mtime(path.join(root, entry.path))
    if (at !== null && at >= since - SLACK_MS) changed.add(entry.path)
  }
  return changed.size
}
