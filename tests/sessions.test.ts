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

  it('keeps what Claude said on finishing in plain words, as Visual Review does: no markdown, no closing question', async () => {
    const tracker = new SessionTracker({ projects: () => projects, now: () => 1000 })
    const said = '**Island Phase 2 is done.** I moved the panel to the `side` in [notch.ts](src/shared/notch.ts).\n\n- one\n- two\n\nWant me to push it?'
    const alert = await tracker.apply(event({ hook_event_name: 'Stop', last_assistant_message: said }))
    expect(tracker.list()[0].detail).toBe('Island Phase 2 is done. I moved the panel to the side in notch.ts.')
    expect(alert?.detail).toBe('Island Phase 2 is done. I moved the panel to the side in notch.ts.')
    // Only a question, or nothing: no detail.
    await tracker.apply(event({ hook_event_name: 'Stop', prompt_id: 'p2', last_assistant_message: 'Want me to commit this?' }))
    expect(tracker.list()[0].detail).toBeUndefined()
  })

  it("calls a session by its chat's name, with the project as a second word, and keeps the project name without one", async () => {
    let title: string | null = 'Main building'
    const reads: string[] = []
    const tracker = new SessionTracker({ projects: () => projects, now: () => 1000, fileSize: async () => 1, chatTitle: async (file) => (reads.push(file), title) })
    const alert = await tracker.apply(event({ hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command: 'npm test' }, transcript_path: LOG }))
    expect(alert?.title).toBe('Main building is waiting on you')
    expect(tracker.list()).toMatchObject([{ name: 'Main building', place: 'Portlkit' }])
    expect(tracker.names({ session_id: 's1', cwd: '/Users/me/Documents/portlkit' })).toEqual({ name: 'Main building', place: 'Portlkit' })
    // Read once when it shows up, not on every event.
    await tracker.apply(event({ hook_event_name: 'Notification', message: 'Which file?', transcript_path: LOG }))
    expect(reads).toEqual([LOG])
    // Renamed, and stopped: read again, the new name.
    title = 'Notch island'
    expect((await tracker.apply(event({ hook_event_name: 'Stop', transcript_path: LOG })))?.title).toBe('Notch island finished')
    expect(reads).toHaveLength(2)
    // Not found in the end of the log this time: the name it had stays.
    title = null
    await tracker.apply(event({ hook_event_name: 'Stop', prompt_id: 'p2', transcript_path: LOG }))
    expect(tracker.list()[0].name).toBe('Notch island')
    // A terminal session, or a chat with no name: the project, and no second word.
    const plain = new SessionTracker({ projects: () => projects, chatTitle: async () => null })
    await plain.apply(event({ hook_event_name: 'Stop', transcript_path: LOG }))
    expect(plain.list()[0]).toMatchObject({ name: 'Portlkit' })
    expect(plain.list()[0].place).toBeUndefined()
    // A slow read, and a chat first heard from at its Stop: the alert, and anything named after the Stop (the island's
    // note), already have the chat's name, never the folder's.
    const slow = new SessionTracker({ projects: () => projects, chatTitle: () => new Promise((resolve) => setTimeout(() => resolve('Main building'), 30)) })
    expect((await slow.apply(event({ hook_event_name: 'Stop', transcript_path: LOG })))?.title).toBe('Main building finished')
    expect(slow.names({ session_id: 's1', cwd: '/Users/me/Documents/portlkit' }).name).toBe('Main building')
    // No log named at all: nothing is read.
    const none = new SessionTracker({ projects: () => projects, chatTitle: async () => 'never' })
    await none.apply(event({ hook_event_name: 'Stop' }))
    expect(none.list()[0].name).toBe('Portlkit')
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
