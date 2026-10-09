import { promises as fs } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import type { DeployInfo, Project } from '../shared/types'
import { runGit, type GitRunner } from './left-off'

const API = 'https://api.vercel.com'
const SLOW_MS = 60_000
const FAST_MS = 15_000
/** How long to check more often after a push. */
const FAST_FOR_MS = 10 * 60_000
/** Read-only and fixed, like the left-off commands: where the branch's upstream points, to notice pushes. */
export const UPSTREAM_COMMAND = ['rev-parse', '@{upstream}'] as const

const VercelLink = z.object({ projectId: z.string().min(1).max(200), orgId: z.string().min(1).max(200), projectName: z.string().max(200).optional() })

export interface LinkedProject {
  project: Project
  projectId: string
  orgId: string
  name: string
}

/** A project linked with `vercel link` has .vercel/project.json. */
export async function findVercelLink(project: Project): Promise<LinkedProject | null> {
  try {
    const parsed = VercelLink.safeParse(JSON.parse(await fs.readFile(path.join(project.path, '.vercel', 'project.json'), 'utf8')))
    if (!parsed.success) return null
    return { project, projectId: parsed.data.projectId, orgId: parsed.data.orgId, name: parsed.data.projectName ?? project.name }
  } catch {
    return null
  }
}

const Deployment = z.object({
  uid: z.string(),
  url: z.string().nullish(),
  created: z.number(),
  readyState: z.string().optional(),
  state: z.string().optional(),
  target: z.string().nullish(),
  inspectorUrl: z.string().nullish(),
  errorMessage: z.string().nullish(),
  ready: z.number().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
})
const DeploymentList = z.object({ deployments: z.array(Deployment) })

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>

const withTeam = (url: URL, orgId: string) => {
  if (orgId.startsWith('team_')) url.searchParams.set('teamId', orgId)
  return url
}

async function vercelGet(url: URL, token: string, fetcher: Fetcher): Promise<unknown> {
  const res = await fetcher(url.toString(), { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) })
  if (res.status === 401 || res.status === 403) throw new Error('Vercel rejected the token. Check it in Settings.')
  if (!res.ok) throw new Error(`Vercel API error (HTTP ${res.status})`)
  return res.json()
}

const firstLine = (s: unknown) => (typeof s === 'string' ? s.split('\n')[0].slice(0, 160) : undefined)

/** The newest few deployments of a linked project. */
export async function listDeployments(link: LinkedProject, token: string, fetcher: Fetcher = fetch): Promise<DeployInfo[]> {
  const url = withTeam(new URL(`${API}/v7/deployments`), link.orgId)
  url.searchParams.set('projectId', link.projectId)
  url.searchParams.set('limit', '5')
  const { deployments } = DeploymentList.parse(await vercelGet(url, token, fetcher))
  return deployments.map((d) => ({
    uid: d.uid,
    project: link.name,
    projectPath: link.project.path,
    state: d.readyState ?? d.state ?? 'UNKNOWN',
    url: d.url ?? null,
    created: d.created,
    ready: d.ready,
    target: d.target ?? null,
    commit: firstLine(d.meta?.githubCommitMessage),
    branch: typeof d.meta?.githubCommitRef === 'string' ? d.meta.githubCommitRef : undefined,
    inspectorUrl: d.inspectorUrl ?? undefined,
    errorMessage: d.errorMessage ?? undefined,
  }))
}

const BuildEvent = z.object({ type: z.string().optional(), text: z.string().optional(), payload: z.object({ text: z.string().optional() }).loose().optional() }).loose()

/** A deployment's build log as plain text, newest lines kept. It's data for the agent to read, never instructions. */
export async function fetchBuildLog(deploymentId: string, orgId: string, token: string, fetcher: Fetcher = fetch): Promise<string> {
  if (!/^dpl_[A-Za-z0-9]+$/.test(deploymentId)) throw new Error('That is not a deployment id')
  const url = withTeam(new URL(`${API}/v3/deployments/${deploymentId}/events`), orgId)
  url.searchParams.set('builds', '1')
  url.searchParams.set('limit', '-1')
  const events = z.array(BuildEvent.nullable()).parse(await vercelGet(url, token, fetcher))
  const lines = events.flatMap((e) => {
    const text = e?.payload?.text ?? e?.text
    return text ? [e?.type === 'stderr' ? `! ${text}` : text] : []
  })
  const tail = lines.slice(-300).join('\n')
  return tail.length > 20_000 ? tail.slice(-20_000) : tail
}

export type DeployChange = { kind: 'failed' | 'ready'; deploy: DeployInfo }

const DONE = new Set(['READY', 'ERROR', 'CANCELED'])

/**
 * Notices deployments finishing. The first look at a project only takes note of what's there, so old
 * deployments never alert; after that, a deployment that becomes READY or ERROR alerts once.
 */
export class DeployTracker {
  private states = new Map<string, string>()
  private seenProjects = new Set<string>()

  update(projectPath: string, deploys: DeployInfo[]): DeployChange[] {
    const first = !this.seenProjects.has(projectPath)
    this.seenProjects.add(projectPath)
    const changes: DeployChange[] = []
    for (const deploy of deploys) {
      const before = this.states.get(deploy.uid)
      this.states.set(deploy.uid, deploy.state)
      if (first || before === deploy.state || (before && DONE.has(before))) continue
      if (deploy.state === 'ERROR') changes.push({ kind: 'failed', deploy })
      else if (deploy.state === 'READY') changes.push({ kind: 'ready', deploy })
    }
    return changes
  }
}

interface WatcherDeps {
  projects(): Project[]
  token(): string | undefined
  onChanges(changes: DeployChange[]): void
  fetcher?: Fetcher
  git?: GitRunner
  now?(): number
}

/** Checks linked Vercel projects while the app is open: every minute, and every 15s for 10 minutes after a push. */
export class DeployWatcher {
  private tracker = new DeployTracker()
  private latest = new Map<string, DeployInfo[]>()
  private upstreams = new Map<string, string>()
  private fastUntil = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private running = false
  lastError: string | null = null

  constructor(private readonly deps: WatcherDeps) {}

  start(): void {
    this.schedule(5_000)
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  /** Something just pushed or deployed: check soon, then often for a while. */
  boost(): void {
    this.fastUntil = this.now() + FAST_FOR_MS
    this.schedule(3_000)
  }

  /** Newest first, across projects. */
  recent(): DeployInfo[] {
    return [...this.latest.values()].flat().sort((a, b) => b.created - a.created)
  }

  async linked(): Promise<LinkedProject[]> {
    const links = await Promise.all(this.deps.projects().map(findVercelLink))
    return links.filter((l): l is LinkedProject => l !== null)
  }

  /** One round of checks. Public for tests. */
  async tick(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      const token = this.deps.token()
      const links = await this.linked()
      if (!token || links.length === 0) return
      await this.noticePushes(links)
      const changes: DeployChange[] = []
      for (const link of links) {
        try {
          const deploys = await listDeployments(link, token, this.deps.fetcher)
          this.latest.set(link.project.path, deploys)
          changes.push(...this.tracker.update(link.project.path, deploys))
          this.lastError = null
        } catch (err) {
          this.lastError = (err as Error).message
        }
      }
      if (changes.length) this.deps.onChanges(changes)
    } finally {
      this.running = false
    }
  }

  private async noticePushes(links: LinkedProject[]): Promise<void> {
    const git = this.deps.git ?? runGit
    for (const { project } of links) {
      const head = await git(UPSTREAM_COMMAND, project.path).then(
        (out) => out.trim(),
        () => null,
      )
      if (!head) continue
      const before = this.upstreams.get(project.path)
      this.upstreams.set(project.path, head)
      if (before && before !== head) this.fastUntil = this.now() + FAST_FOR_MS
    }
  }

  private schedule(delay: number): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      void this.tick().finally(() => this.schedule(this.now() < this.fastUntil ? FAST_MS : SLOW_MS))
    }, delay)
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now()
  }
}
