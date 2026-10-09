import { randomBytes, timingSafeEqual } from 'node:crypto'
import { promises as fs } from 'node:fs'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import { parseHookPayload, type HookPayload } from './hook-payload'

export const HOOK_PATH = '/claude-hook'
/** Tried in order, then any free port. The chosen one is written to `hook-port` for the hook command. */
const PREFERRED_PORTS = [47831, 47832, 47833]
const MAX_BODY_BYTES = 1_000_000
const TOKEN_PATTERN = /^[a-f0-9]{64}$/

/** The shared secret hooks must send. Made on first run and kept in the app's data folder. */
export async function loadOrCreateToken(dir: string): Promise<string> {
  const file = path.join(dir, 'hook-token')
  const existing = await fs.readFile(file, 'utf8').then(
    (s) => s.trim(),
    () => '',
  )
  if (TOKEN_PATTERN.test(existing)) return existing
  const token = randomBytes(32).toString('hex')
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(file, token, { mode: 0o600 })
  return token
}

/** Why a request is refused (status and reason), or null if its body may be read. */
export function refusal(req: Pick<http.IncomingMessage, 'method' | 'url' | 'headers'>, token: string, port: number): { status: number; reason: string } | null {
  if (req.method !== 'POST' || req.url !== HOOK_PATH) return { status: 404, reason: 'not found' }
  // Browsers send Origin on cross-site POSTs; hook commands (curl) never do.
  if (req.headers.origin !== undefined) return { status: 403, reason: 'browser requests are not accepted' }
  // A web page that rebinds its domain to 127.0.0.1 still sends its own Host.
  const host = req.headers.host
  if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return { status: 403, reason: 'unexpected host' }
  const auth = req.headers.authorization ?? ''
  const given = Buffer.from(auth.startsWith('Bearer ') ? auth.slice(7) : '')
  const expected = Buffer.from(token)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { status: 401, reason: 'bad token' }
  if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) return { status: 415, reason: 'expected JSON' }
  return null
}

/** Receives Claude Code hook events on 127.0.0.1 and hands validated payloads to `onEvent`. */
export class HookServer {
  private server: http.Server | null = null
  port = 0

  constructor(
    private readonly dir: string,
    private readonly onEvent: (event: HookPayload) => void,
  ) {}

  async start(): Promise<void> {
    const token = await loadOrCreateToken(this.dir)
    const server = http.createServer((req, res) => this.handle(req, res, token))
    this.server = server
    this.port = await listen(server)
    await fs.writeFile(path.join(this.dir, 'hook-port'), String(this.port))
  }

  /**
   * Also write the port and token to another folder that exists, for hook commands that still read from there
   * (ones installed before the rename), so they keep working until they're updated.
   */
  async mirrorTo(dir: string): Promise<void> {
    if (!this.port || !(await fs.stat(dir).then((s) => s.isDirectory(), () => false))) return
    await fs.writeFile(path.join(dir, 'hook-token'), await loadOrCreateToken(this.dir), { mode: 0o600 })
    await fs.chmod(path.join(dir, 'hook-token'), 0o600)
    await fs.writeFile(path.join(dir, 'hook-port'), String(this.port))
  }

  stop(): void {
    this.server?.close()
    this.server = null
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse, token: string): void {
    const refused = refusal(req, token, this.port)
    if (refused) {
      req.resume()
      res.writeHead(refused.status).end()
      return
    }
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        res.writeHead(413).end()
        req.destroy()
      } else chunks.push(chunk)
    })
    req.on('end', () => {
      if (res.writableEnded) return
      const payload = parseHookPayload(Buffer.concat(chunks).toString('utf8'))
      // Answer first so the hook (and Claude Code) never waits on Steward.
      res.writeHead(payload ? 204 : 400).end()
      if (payload) this.onEvent(payload)
    })
  }
}

async function listen(server: http.Server): Promise<number> {
  for (const port of [...PREFERRED_PORTS, 0]) {
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(port, '127.0.0.1', () => {
          server.off('error', reject)
          resolve()
        })
      })
      return (server.address() as AddressInfo).port
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw err
    }
  }
  throw new Error('No free port for the Claude Code hook server')
}
