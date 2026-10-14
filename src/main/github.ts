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
} as const

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

export async function mergedPRs(project: Project, gh: GhRunner): Promise<z.infer<typeof MergedPullRequest>[]> {
  return z.array(MergedPullRequest).parse(JSON.parse(await gh(GH_COMMANDS.merged, project.path)))
}
