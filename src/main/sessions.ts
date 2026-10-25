import { promises as fs } from 'node:fs'
import path from 'node:path'
import { sayFrom } from '../shared/review'
import type { Project, SessionState, SessionView } from '../shared/types'
import type { AlertInput } from './alerts'
import type { HookPayload } from './hook-payload'
import { isTranscriptPath, readChatTitle, readTail, turnStartedAt } from './transcript'

const KEEP_FOR_MS = 12 * 60 * 60 * 1000
const MAX_SESSIONS = 20
/** Chat names remembered, by session: plenty for a day's chats. */
const MAX_TITLES = 200
/** A turn shorter than this probably happened while you watched, so its finishing isn't news. */
const NOTEWORTHY_TURN_MS = 60_000
/** PermissionRequest already covers permission prompts; the rest aren't about you. */
const IGNORED_NOTIFICATIONS = new Set(['permission_prompt', 'auth_success', 'elicitation_complete', 'elicitation_response'])

/** The project a folder belongs to: the one whose path is it or contains it, most specific first. */
export function matchProject(cwd: string, projects: Project[], caseInsensitive = process.platform === 'darwin'): Project | null {
  const norm = (p: string) => {
    const resolved = path.resolve(p)
    return caseInsensitive ? resolved.toLowerCase() : resolved
  }
  const target = norm(cwd)
  let best: Project | null = null
  for (const project of projects) {
    const rel = path.relative(norm(project.path), target)
    const inside = rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
    if (inside && (!best || project.path.length > best.path.length)) best = project
  }
  return best
}

/** "Bash: npm test", "Edit: page.tsx": what a session is asking to do. */
export function describePermission(tool: string, input?: Record<string, unknown>): string {
  const field = (key: string) => (typeof input?.[key] === 'string' ? (input[key] as string) : undefined)
  const file = field('file_path')
  const subject = tool === 'Bash' ? field('command') : file ? path.basename(file) : (field('url') ?? field('pattern'))
  const text = (subject ? `${tool}: ${subject}` : tool).replace(/\s+/g, ' ')
  return text.length > 160 ? `${text.slice(0, 159)}…` : text
}

function summary(text: string | undefined): string | undefined {
  const flat = text?.replace(/\s+/g, ' ').trim()
  if (!flat) return undefined
  return flat.length > 200 ? `${flat.slice(0, 199)}…` : flat
}

interface Session extends SessionView {
  transcriptPath?: string
  /** The log's size when approval was requested; growth means it was answered. */
  sizeAtRequest?: number | null
}

interface Deps {
  projects(): Project[]
  now?(): number
  fileSize?(file: string): Promise<number | null>
  turnStart?(file: string, promptId: string): Promise<number | null>
  /** The chat's own name in the Claude app, from its log. */
  chatTitle?(file: string): Promise<string | null>
}

/** What every Claude Code session is doing, from its hook events. */
export class SessionTracker {
  private sessions = new Map<string, Session>()
  /** Each session's chat name in the Claude app, once looked for; null: it has none. */
  private titles = new Map<string, string | null>()

  constructor(private readonly deps: Deps) {}

  /**
   * Record a hook event. Returns the alert it deserves, if any. A session is called by its chat's name in the Claude
   * app (looked for when it first shows up, and again when it stops, in case it was renamed), with the project or
   * folder as a second word; with no chat name, by the project or folder.
   */
  async apply(event: HookPayload): Promise<AlertInput | null> {
    const now = this.now()
    const project = matchProject(event.cwd, this.deps.projects())
    const transcriptPath = event.transcript_path && isTranscriptPath(event.transcript_path) ? event.transcript_path : undefined
    await this.lookForTitle(event.session_id, transcriptPath, event.hook_event_name === 'Stop')
    const { name, place } = this.names(event)
    const set = (state: SessionState, detail: string | undefined, extra: Partial<Session> = {}) =>
      this.sessions.set(event.session_id, { id: event.session_id, name, place, projectPath: project?.path ?? null, cwd: event.cwd, state, detail, updatedAt: now, transcriptPath, ...extra })

    switch (event.hook_event_name) {
      case 'PermissionRequest': {
        const detail = describePermission(event.tool_name, event.tool_input)
        set('needs-approval', detail, { sizeAtRequest: transcriptPath ? await this.fileSize(transcriptPath) : null })
        return { key: `approval:${event.session_id}:${event.prompt_id ?? ''}:${detail}`, level: 'urgent', title: `${name} is waiting on you`, detail, mood: 'needs-you' }
      }
      case 'Notification': {
        if (event.notification_type && IGNORED_NOTIFICATIONS.has(event.notification_type)) return null
        const detail = summary(event.message)
        set('needs-input', detail)
        return { key: `input:${event.session_id}:${event.prompt_id ?? ''}:${detail ?? ''}`, level: 'urgent', title: `${name} needs your input`, detail, mood: 'needs-you' }
      }
      case 'Stop': {
        // A Stop hook asked Claude to keep going, so this isn't the real end.
        if (event.stop_hook_active) return null
        // What Claude said, in plain words (Visual Review's "Claude says"): no markdown, no "Want me to commit?".
        const detail = sayFrom(event.last_assistant_message) ?? undefined
        set('finished', detail)
        const started = transcriptPath && event.prompt_id ? await this.turnStart(transcriptPath, event.prompt_id) : null
        const level = started !== null && now - started < NOTEWORTHY_TURN_MS ? 'quiet' : 'normal'
        return { key: `finished:${event.session_id}:${event.prompt_id ?? now}`, level, title: `${name} finished`, detail, mood: 'done' }
      }
      // A turn starting is Visual Review's business (review.ts), not the session strip's.
      case 'UserPromptSubmit':
        return null
    }
  }

  /** Sessions waiting on approval go back to working once their log grows. Returns whether anything changed. */
  async refresh(): Promise<boolean> {
    let changed = false
    for (const session of this.sessions.values()) {
      if (session.state !== 'needs-approval' || !session.transcriptPath || session.sizeAtRequest == null) continue
      const size = await this.fileSize(session.transcriptPath)
      if (size !== null && size > session.sizeAtRequest) {
        Object.assign(session, { state: 'working', detail: undefined, sizeAtRequest: undefined, updatedAt: this.now() })
        changed = true
      }
    }
    return changed
  }

  /** Waiting sessions first, then the most recent. */
  list(): SessionView[] {
    const cutoff = this.now() - KEEP_FOR_MS
    for (const [id, s] of this.sessions) if (s.updatedAt < cutoff) this.sessions.delete(id)
    const waiting = (s: Session) => (s.state === 'needs-approval' || s.state === 'needs-input' ? 0 : 1)
    return [...this.sessions.values()]
      .sort((a, b) => waiting(a) - waiting(b) || b.updatedAt - a.updatedAt)
      .slice(0, MAX_SESSIONS)
      .map(({ id, name, place, projectPath, cwd, state, detail, updatedAt }) => ({ id, name, place, projectPath, cwd, state, detail, updatedAt }))
  }

  /** How many sessions are waiting on you. */
  waitingCount(): number {
    return this.list().filter((s) => s.state === 'needs-approval' || s.state === 'needs-input').length
  }

  dismiss(id: string): void {
    this.sessions.delete(id)
  }

  /** What a session is called: its chat's name if it has one (with the project or folder as place), else the project or folder. */
  names(event: Pick<HookPayload, 'session_id' | 'cwd'>): { name: string; place?: string } {
    const folder = matchProject(event.cwd, this.deps.projects())?.name ?? path.basename(event.cwd)
    const title = this.titles.get(event.session_id)
    return title ? { name: title, place: folder } : { name: folder }
  }

  /** Read the chat's name from its log the first time a session shows up, and again when asked (a Stop). */
  private async lookForTitle(id: string, file: string | undefined, again: boolean): Promise<void> {
    if (!file || (this.titles.has(id) && !again)) return
    const found = await (this.deps.chatTitle ?? readChatTitle)(file)
    // Not in the end of the log this time (a long tool output can push it further back): the name it had stays.
    this.titles.set(id, found ?? this.titles.get(id) ?? null)
    if (this.titles.size > MAX_TITLES) this.titles.delete(this.titles.keys().next().value!)
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now()
  }

  private fileSize(file: string): Promise<number | null> {
    return this.deps.fileSize ? this.deps.fileSize(file) : fs.stat(file).then((s) => s.size, () => null)
  }

  private turnStart(file: string, promptId: string): Promise<number | null> {
    if (this.deps.turnStart) return this.deps.turnStart(file, promptId)
    return readTail(file).then((lines) => turnStartedAt(lines, promptId), () => null)
  }
}
