export const LOCK_FILE: string
export const WAIT_MS: number
export function isSmokeRunner(pid: number, ask?: (pid: number) => string | null): boolean
export class LockBusy extends Error {
  held: { pid: number; started: number; where: string }
  waitedMs: number
}
export function acquire(options?: {
  file?: string
  waitMs?: number
  pollMs?: number
  alive?: (pid: number) => boolean
  sleep?: (ms: number) => Promise<void>
  now?: () => number
  log?: (line: string) => void
  where?: string
}): Promise<() => void>
export function release(file?: string): void
