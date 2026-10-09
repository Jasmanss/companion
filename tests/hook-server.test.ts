import { promises as fs } from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { HookPayload } from '../src/main/hook-payload'
import { HOOK_PATH, HookServer, loadOrCreateToken, refusal } from '../src/main/hook-server'

const TOKEN = 'a'.repeat(64)
const okHeaders = { host: '127.0.0.1:4000', authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }
const req = (headers: Record<string, string | undefined>, method = 'POST', url = HOOK_PATH) => ({ method, url, headers })

describe('refusal', () => {
  it('accepts a loopback POST with the right token', () => {
    expect(refusal(req(okHeaders), TOKEN, 4000)).toBeNull()
    expect(refusal(req({ ...okHeaders, host: 'localhost:4000' }), TOKEN, 4000)).toBeNull()
  })

  it('rejects a missing or wrong token', () => {
    expect(refusal(req({ ...okHeaders, authorization: undefined }), TOKEN, 4000)?.status).toBe(401)
    expect(refusal(req({ ...okHeaders, authorization: `Bearer ${'b'.repeat(64)}` }), TOKEN, 4000)?.status).toBe(401)
    expect(refusal(req({ ...okHeaders, authorization: TOKEN }), TOKEN, 4000)?.status).toBe(401)
    expect(refusal(req({ ...okHeaders, authorization: 'Bearer short' }), TOKEN, 4000)?.status).toBe(401)
  })

  it('rejects browsers and rebound hosts even with the token', () => {
    expect(refusal(req({ ...okHeaders, origin: 'https://evil.example' }), TOKEN, 4000)?.status).toBe(403)
    expect(refusal(req({ ...okHeaders, host: 'evil.example:4000' }), TOKEN, 4000)?.status).toBe(403)
    expect(refusal(req({ ...okHeaders, host: '127.0.0.1:5000' }), TOKEN, 4000)?.status).toBe(403)
  })

  it('only takes JSON POSTs to the hook path', () => {
    expect(refusal(req(okHeaders, 'GET'), TOKEN, 4000)?.status).toBe(404)
    expect(refusal(req(okHeaders, 'POST', '/other'), TOKEN, 4000)?.status).toBe(404)
    expect(refusal(req({ ...okHeaders, 'content-type': 'text/plain' }), TOKEN, 4000)?.status).toBe(415)
  })
})

describe('HookServer', () => {
  let dir: string
  let server: HookServer
  let events: HookPayload[]

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'companion-hooks-'))
    events = []
    server = new HookServer(dir, (e) => events.push(e))
    await server.start()
  })
  afterEach(async () => {
    server.stop()
    await fs.rm(dir, { recursive: true, force: true })
  })

  const post = async (body: string, headers: Record<string, string> = {}) => {
    const token = await fs.readFile(path.join(dir, 'hook-token'), 'utf8')
    return new Promise<number>((resolve, reject) => {
      const r = http.request(
        { host: '127.0.0.1', port: server.port, path: HOOK_PATH, method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...headers } },
        (res) => {
          res.resume()
          resolve(res.statusCode ?? 0)
        },
      )
      r.on('error', reject)
      r.end(body)
    })
  }

  it('writes its port and a private token, and reuses the token', async () => {
    expect(Number(await fs.readFile(path.join(dir, 'hook-port'), 'utf8'))).toBe(server.port)
    const token = await fs.readFile(path.join(dir, 'hook-token'), 'utf8')
    expect(token).toMatch(/^[a-f0-9]{64}$/)
    expect((await fs.stat(path.join(dir, 'hook-token'))).mode & 0o777).toBe(0o600)
    expect(await loadOrCreateToken(dir)).toBe(token)
  })

  it('passes valid events on and answers 204', async () => {
    const status = await post(JSON.stringify({ hook_event_name: 'Stop', session_id: 's1', cwd: '/Users/me/app', last_assistant_message: 'Done.' }))
    expect(status).toBe(204)
    expect(events).toEqual([{ hook_event_name: 'Stop', session_id: 's1', cwd: '/Users/me/app', last_assistant_message: 'Done.' }])
  })

  it('answers 400 to payloads that are not hook events, and 401 without the token', async () => {
    expect(await post('not json')).toBe(400)
    expect(await post(JSON.stringify({ hook_event_name: 'Stop' }))).toBe(400)
    expect(await post(JSON.stringify({ hook_event_name: 'Stop', session_id: 's1', cwd: '/x' }), { authorization: 'Bearer nope' })).toBe(401)
    expect(events).toHaveLength(0)
  })
})
