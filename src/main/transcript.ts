import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** Session logs are read from the end; turns and replies of interest are recent. */
const TAIL_BYTES = 512 * 1024

/** Only Claude Code's own session logs are ever read, whatever path a payload names. */
export function isTranscriptPath(file: string, home = os.homedir()): boolean {
  const root = path.join(home, '.claude', 'projects') + path.sep
  const resolved = path.resolve(file)
  return resolved.startsWith(root) && resolved.endsWith('.jsonl')
}

/** The last lines of a session log, parsed. Unparseable lines are skipped. Read-only. */
export async function readTail(file: string, bytes = TAIL_BYTES): Promise<Record<string, unknown>[]> {
  const handle = await fs.open(file, 'r')
  try {
    const { size } = await handle.stat()
    const start = Math.max(0, size - bytes)
    const buffer = Buffer.alloc(size - start)
    await handle.read(buffer, 0, buffer.length, start)
    const lines = buffer.toString('utf8').split('\n')
    if (start > 0) lines.shift() // probably cut mid-line
    const out: Record<string, unknown>[] = []
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        out.push(JSON.parse(line) as Record<string, unknown>)
      } catch {
        // not JSON; ignore
      }
    }
    return out
  } finally {
    await handle.close()
  }
}

/** When the turn with this prompt id began: the earliest log line that carries it. */
export function turnStartedAt(lines: Record<string, unknown>[], promptId: string): number | null {
  let earliest: number | null = null
  for (const line of lines) {
    if (line.promptId !== promptId || typeof line.timestamp !== 'string') continue
    const t = Date.parse(line.timestamp)
    if (!Number.isNaN(t) && (earliest === null || t < earliest)) earliest = t
  }
  return earliest
}

/** The chat's name is looked for in this much of the end of its log: logs run to tens of MB, and the name repeats. */
export const TITLE_TAIL_BYTES = 256 * 1024
const MAX_TITLE = 60

/**
 * The chat's own name in the Claude app: the newest custom-title line (the app writes one now and then, and again when
 * the chat is renamed). Null when there's none, as in a terminal session or a chat with no name yet.
 */
export function chatTitle(lines: Record<string, unknown>[]): string | null {
  for (let i = lines.length - 1; i >= 0; i--) {
    const { type, customTitle } = lines[i]
    if (type !== 'custom-title' || typeof customTitle !== 'string') continue
    const title = customTitle.replace(/\s+/g, ' ').trim()
    if (title) return title.length > MAX_TITLE ? `${title.slice(0, MAX_TITLE - 1)}…` : title
  }
  return null
}

/** The chat's name from the end of its log only, or null (none there, or the log can't be read). */
export function readChatTitle(file: string, bytes = TITLE_TAIL_BYTES): Promise<string | null> {
  return readTail(file, bytes).then(chatTitle, () => null)
}
