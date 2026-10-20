import os from 'node:os'
import { describe, expect, it } from 'vitest'
import type { HookPayload } from '../src/main/hook-payload'
import { describePermission, matchProject, SessionTracker } from '../src/main/sessions'

// Logs are only read from under ~/.claude/projects.
const LOG = `${os.homedir()}/.claude/projects/x/s1.jsonl`

const projects = [
  { name: 'steward', path: '/Users/me/Documents/steward' },
  { name: 'Portlkit', path: '/Users/me/Documents/portlkit' },
  { name: 'docs', path: '/Users/me/Documents/portlkit/docs' },
]

describe('matchProject', () => {
  it('matches the folder itself and anything inside it', () => {
    expect(matchProject('/Users/me/Documents/steward', projects, false)?.name).toBe('steward')
    expect(matchProject('/Users/me/Documents/steward/src/main/', projects, false)?.name).toBe('steward')
  })

  it('prefers the most specific project', () => {
    expect(matchProject('/Users/me/Documents/portlkit/docs/guide', projects, false)?.name).toBe('docs')
    expect(matchProject('/Users/me/Documents/portlkit/src', projects, false)?.name).toBe('Portlkit')
  })

  it("doesn't match a sibling that only shares a prefix, or a parent", () => {
    expect(matchProject('/Users/me/Documents/steward-2', projects, false)).toBeNull()
    expect(matchProject('/Users/me/Documents', projects, false)).toBeNull()
  })

  it('ignores case on case-insensitive disks', () => {
    expect(matchProject('/users/me/documents/PORTLKIT', projects, true)?.name).toBe('Portlkit')
    expect(matchProject('/users/me/documents/PORTLKIT', projects, false)).toBeNull()
  })
})

describe('describePermission', () => {
  it('names the command or file', () => {
    expect(describePermission('Bash', { command: 'npm   test' })).toBe('Bash: npm test')
    expect(describePermission('Edit', { file_path: '/a/b/page.tsx' })).toBe('Edit: page.tsx')
    expect(describePermission('Task')).toBe('Task')
  })
})

describe('SessionTracker', () => {
  const event = (e: Partial<HookPayload> & Pick<HookPayload, 'hook_event_name'>) =>
    ({ session_id: 's1', cwd: '/Users/me/Documents/portlkit', prompt_id: 'p1', ...e }) as HookPayload

  it('turns a permission request into an urgent alert named after the project', async () => {
    const tracker = new SessionTracker({ projects: () => projects, now: () => 1000 })
    const alert = await tracker.apply(event({ hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command: 'npm test' } }))
    expect(alert).toMatchObject({ level: 'urgent', title: 'Portlkit is waiting on you', detail: 'Bash: npm test', mood: 'needs-you' })
    expect(tracker.list()).toMatchObject([{ id: 's1', name: 'Portlkit', state: 'needs-approval' }])
    expect(tracker.waitingCount()).toBe(1)
  })

  it('keeps short turns quiet and long ones worth a nudge', async () => {
    const now = 10 * 60_000
    const short = new SessionTracker({ projects: () => projects, now: () => now, turnStart: async () => now - 20_000 })
    expect((await short.apply(event({ hook_event_name: 'Stop', transcript_path: LOG })))?.level).toBe('quiet')
    const long = new SessionTracker({ projects: () => projects, now: () => now, turnStart: async () => now - 5 * 60_000 })
    expect((await long.apply(event({ hook_event_name: 'Stop', transcript_path: LOG })))?.level).toBe('normal')
  })

  it('ignores notifications that PermissionRequest already covers, and Stops a hook kept going', async () => {
    const tracker = new SessionTracker({ projects: () => projects })
    expect(await tracker.apply(event({ hook_event_name: 'Notification', notification_type: 'permission_prompt', message: 'Claude needs your permission' }))).toBeNull()
    expect(await tracker.apply(event({ hook_event_name: 'Stop', stop_hook_active: true }))).toBeNull()
    expect(tracker.list()).toEqual([])
  })

  it('marks an approval answered once the session log grows', async () => {
    let size = 100
    const tracker = new SessionTracker({ projects: () => projects, fileSize: async () => size })
    await tracker.apply(event({ hook_event_name: 'PermissionRequest', tool_name: 'Bash', transcript_path: LOG }))
    expect(await tracker.refresh()).toBe(false)
    size = 180
    expect(await tracker.refresh()).toBe(true)
    expect(tracker.list()[0].state).toBe('working')
  })

  it('never reads a log path outside ~/.claude/projects', async () => {
    const read: string[] = []
    const tracker = new SessionTracker({ projects: () => projects, fileSize: async (f) => (read.push(f), 1) })
    await tracker.apply(event({ hook_event_name: 'PermissionRequest', tool_name: 'Bash', transcript_path: '/etc/passwd.jsonl' }))
    expect(read).toEqual([])
  })
})

describe('SessionTracker and a turn starting', () => {
  it('says nothing and changes nothing: Visual Review handles it', async () => {
    const tracker = new SessionTracker({ projects: () => projects, now: () => 1000 })
    const event: HookPayload = { hook_event_name: 'UserPromptSubmit', session_id: 's1', cwd: '/Users/me/Documents/steward', prompt_id: 'p1' }
    expect(await tracker.apply(event)).toBeNull()
    expect(tracker.list()).toEqual([])
  })
})
