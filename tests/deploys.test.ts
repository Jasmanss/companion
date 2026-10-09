import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { DeployTracker, DeployWatcher, fetchBuildLog, findVercelLink, listDeployments, type DeployChange, type LinkedProject } from '../src/main/deploys'
import type { DeployInfo } from '../src/shared/types'

const link: LinkedProject = { project: { name: 'portalkit', path: '/Users/me/portalkit' }, projectId: 'prj_abc', orgId: 'team_xyz', name: 'portalkit' }

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('findVercelLink', () => {
  it('reads .vercel/project.json, and ignores folders without a valid one', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'companion-vercel-'))
    try {
      expect(await findVercelLink({ name: 'x', path: dir })).toBeNull()
      await fs.mkdir(path.join(dir, '.vercel'))
      await fs.writeFile(path.join(dir, '.vercel', 'project.json'), '{"orgId": 1}')
      expect(await findVercelLink({ name: 'x', path: dir })).toBeNull()
      await fs.writeFile(path.join(dir, '.vercel', 'project.json'), JSON.stringify({ projectId: 'prj_1', orgId: 'team_2', projectName: 'portal' }))
      expect(await findVercelLink({ name: 'x', path: dir })).toMatchObject({ projectId: 'prj_1', orgId: 'team_2', name: 'portal' })
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })
})

describe('Vercel API', () => {
  it('lists a project’s deployments for the right team, with the token', async () => {
    let seen: { url: string; auth: string } | null = null
    const deploys = await listDeployments(link, 'tok', async (url, init) => {
      seen = { url, auth: (init.headers as Record<string, string>).Authorization }
      return json({
        deployments: [
          { uid: 'dpl_1', url: 'portalkit-abc.vercel.app', created: 1000, readyState: 'ERROR', target: 'production', errorMessage: 'Build failed', meta: { githubCommitMessage: 'Fix nav\n\nlong body', githubCommitRef: 'main' } },
        ],
        pagination: {},
      })
    })
    expect(seen!.url).toBe('https://api.vercel.com/v7/deployments?teamId=team_xyz&projectId=prj_abc&limit=5')
    expect(seen!.auth).toBe('Bearer tok')
    expect(deploys[0]).toMatchObject({ uid: 'dpl_1', project: 'portalkit', state: 'ERROR', commit: 'Fix nav', branch: 'main', errorMessage: 'Build failed' })
  })

  it('says when the token is rejected', async () => {
    await expect(listDeployments(link, 'bad', async () => json({ error: {} }, 403))).rejects.toThrow(/rejected the token/)
  })

  it('turns build events into plain log lines and refuses odd ids', async () => {
    const log = await fetchBuildLog('dpl_1', 'team_xyz', 'tok', async () =>
      json([
        { type: 'command', created: 1, payload: { text: 'Running "npm run build"' } },
        { type: 'stdout', created: 2, text: 'Compiling…' },
        { type: 'stderr', created: 3, payload: { text: "Type error: Property 'x' does not exist" } },
        null,
      ]),
    )
    expect(log).toBe(`Running "npm run build"\nCompiling…\n! Type error: Property 'x' does not exist`)
    await expect(fetchBuildLog('../../v2/user', 'team_xyz', 'tok')).rejects.toThrow(/not a deployment id/)
  })
})

const deploy = (uid: string, state: string): DeployInfo => ({ uid, state, project: 'portalkit', projectPath: '/p', url: `${uid}.vercel.app`, created: 1, target: null })

describe('DeployTracker', () => {
  it('stays quiet about what was already there, then reports each finish once', () => {
    const tracker = new DeployTracker()
    expect(tracker.update('/p', [deploy('dpl_old', 'ERROR'), deploy('dpl_1', 'BUILDING')])).toEqual([])
    expect(tracker.update('/p', [deploy('dpl_1', 'READY')])).toEqual([{ kind: 'ready', deploy: deploy('dpl_1', 'READY') }])
    expect(tracker.update('/p', [deploy('dpl_1', 'READY')])).toEqual([])
    // A new deployment that already failed between checks still counts.
    expect(tracker.update('/p', [deploy('dpl_2', 'ERROR')]).map((c) => c.kind)).toEqual(['failed'])
    expect(tracker.update('/p', [deploy('dpl_3', 'CANCELED')])).toEqual([])
  })
})

describe('DeployWatcher', () => {
  it('does nothing without a token, and reports changes across checks', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'companion-watch-'))
    await fs.mkdir(path.join(dir, '.vercel'))
    await fs.writeFile(path.join(dir, '.vercel', 'project.json'), JSON.stringify({ projectId: 'prj_1', orgId: 'team_2' }))
    try {
      let token: string | undefined = undefined
      let state = 'BUILDING'
      let calls = 0
      const changes: DeployChange[] = []
      const watcher = new DeployWatcher({
        projects: () => [{ name: 'site', path: dir }],
        token: () => token,
        onChanges: (c) => changes.push(...c),
        git: async () => 'abc123',
        fetcher: async () => {
          calls++
          return json({ deployments: [{ uid: 'dpl_9', url: 'site.vercel.app', created: 5, readyState: state }], pagination: {} })
        },
      })
      await watcher.tick()
      expect(calls).toBe(0)
      token = 'tok'
      await watcher.tick()
      state = 'READY'
      await watcher.tick()
      expect(changes.map((c) => `${c.kind}:${c.deploy.uid}`)).toEqual(['ready:dpl_9'])
      expect(watcher.recent()[0]).toMatchObject({ uid: 'dpl_9', state: 'READY', project: 'site' })
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })
})
