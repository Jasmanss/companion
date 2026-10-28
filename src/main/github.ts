import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { z } from 'zod'
import type { Project } from '../shared/types'

/** Where Homebrew and the installer put gh. Apps opened from Finder don't get a shell PATH. */
const GH_PATHS = ['/opt/homebrew/bin/gh', '/usr/local/bin/gh', '/usr/bin/gh']

/** The only gh commands Steward runs: read-only, fixed arguments, in a project folder. */
export const GH_COMMANDS = {
  dependabot: ['pr', 'list', '--author', 'app/dependabot', '--state', 'open', '--json', 'number,title,url', '--limit', '20'],
  merged: ['pr', 'list', '--state', 'merged', '--json', 'number,title,url,mergedAt', '--limit', '5'],
  /** Overnight Watch: the newest runs on main. Only the workflow's name and how it went; never a commit message. */
  ciMain: ['run', 'list', '--branch', 'main', '--json', 'databaseId,workflowName,status,conclusion,updatedAt', '--limit', '10'],
} as const

/** Read-only git with fixed arguments, like the left-off commands: where a project's code lives, to tell if it's on GitHub. */
export const GIT_REMOTE = ['remote', 'get-url', 'origin'] as const

/** An origin on GitHub: https://github.com/owner/repo(.git) or git@github.com:owner/repo(.git). */
export const isGitHubRemote = (url: string): boolean => /^(?:https:\/\/(?:[^@/\s]+@)?github\.com\/|(?:ssh:\/\/)?git@github\.com[:/])[\w.-]+\/[\w.-]+?(?:\.git)?\/?$/.test(url.trim())

export type GhRunner = (args: readonly string[], cwd: string) => Promise<string>

export function findGh(): string | null {
  return GH_PATHS.find((p) => existsSync(p)) ?? null
}

export function ghRunner(gh: string): GhRunner {
  return (args, cwd) =>
    new Promise((resolve, reject) => {
      execFile(gh, args, { cwd, timeout: 15_000, maxBuffer: 2_000_000, env: { ...process.env, GH_PROMPT_DISABLED: '1', NO_COLOR: '1' } }, (err, stdout) =>
        err ? reject(err) : resolve(stdout),
      )
    })
}

const PullRequest = z.object({ number: z.number(), title: z.string().max(500), url: z.string().url() })
const MergedPullRequest = PullRequest.extend({ mergedAt: z.string() })

export type PullRequest = z.infer<typeof PullRequest>

/** Open Dependabot PRs per project; projects that aren't on GitHub (or where gh fails) are skipped. */
export async function dependabotPRs(projects: Project[], gh: GhRunner): Promise<{ project: string; prs: PullRequest[] }[]> {
  const results = await Promise.allSettled(
    projects.map(async (project) => ({ project: project.name, prs: z.array(PullRequest).parse(JSON.parse(await gh(GH_COMMANDS.dependabot, project.path))) })),
  )
  return results.flatMap((r) => (r.status === 'fulfilled' && r.value.prs.length ? [r.value] : []))
}

/**
 * Notices PRs being merged. The first look at a project only takes note of what's there, so only merges
 * that happen while Steward is running are celebrated, once each.
 */
export class MergeTracker {
  private seen = new Map<string, Set<number>>()

  update(projectPath: string, merged: { number: number }[]): number[] {
    const known = this.seen.get(projectPath)
    this.seen.set(projectPath, new Set([...(known ?? []), ...merged.map((pr) => pr.number)]))
    if (!known) return []
    return merged.filter((pr) => !known.has(pr.number)).map((pr) => pr.number)
  }
}

const CiRun = z.object({
  databaseId: z.number(),
  workflowName: z.string().max(200),
  status: z.string().max(40),
  conclusion: z.string().max(40),
  updatedAt: z.string(),
})
export type CiRun = z.infer<typeof CiRun>

/** How a run on main went: red (failed, timed out, couldn't start), green, or neither (still going, cancelled, skipped). */
export function ciResult(run: Pick<CiRun, 'status' | 'conclusion'>): 'red' | 'green' | null {
  if (run.status !== 'completed') return null
  if (run.conclusion === 'success') return 'green'
  return run.conclusion === 'failure' || run.conclusion === 'timed_out' || run.conclusion === 'startup_failure' ? 'red' : null
}

/** What `gh run list` printed, as runs. Anything that doesn't read is dropped, not guessed at. */
export function parseCiRuns(out: string): CiRun[] {
  const list: unknown = JSON.parse(out)
  if (!Array.isArray(list)) return []
  return list.map((r) => CiRun.safeParse(r)).flatMap((r) => (r.success ? [r.data] : []))
}

/** The newest runs on a project's main branch on GitHub. Rejects when it isn't on GitHub, or gh can't say. */
export async function mainRuns(project: Project, gh: GhRunner): Promise<CiRun[]> {
  return parseCiRuns(await gh(GH_COMMANDS.ciMain, project.path))
}

export type CiChange = { kind: 'failed' | 'passed'; run: CiRun }

/**
 * Notices runs on main finishing, like DeployTracker: the first look at a project only takes note of what's there (a
 * new one each night, so the day's runs are never news), and after that a run that ends red or green says so once.
 */
export class CiTracker {
  private done = new Map<string, Set<number>>()

  update(projectPath: string, runs: CiRun[]): CiChange[] {
    const known = this.done.get(projectPath)
    const finished = runs.filter((r) => ciResult(r) !== null)
    this.done.set(projectPath, new Set([...(known ?? []), ...finished.map((r) => r.databaseId)]))
    if (!known) return []
    return finished
      .filter((r) => !known.has(r.databaseId))
      .reverse()
      .map((run) => ({ kind: ciResult(run) === 'red' ? 'failed' : 'passed', run }))
  }
}

export async function mergedPRs(project: Project, gh: GhRunner): Promise<z.infer<typeof MergedPullRequest>[]> {
  return z.array(MergedPullRequest).parse(JSON.parse(await gh(GH_COMMANDS.merged, project.path)))
}
