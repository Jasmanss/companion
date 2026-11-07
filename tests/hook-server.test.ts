import { promises as fs } from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { HookPayload } from '../src/main/hook-payload'
import { HOLD_PATH, HOOK_PATH, holdAnswer, HookServer, loadOrCreateToken, refusal, type HeldStop } from '../src/main/hook-server'

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

describe('the hold hook', () => {
  const stop = JSON.stringify({ hook_event_name: 'Stop', session_id: 's1', prompt_id: 'p1', cwd: '/Users/me/haven' })
  let dir: string
  let server: HookServer
  let held: HeldStop[]
  let events: HookPayload[]

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'steward-hold-'))
    held = []
    events = []
    server = new HookServer(
      dir,
      (e) => events.push(e),
      (_e, h) => held.push(h),
    )
    await server.start()
  })
  afterEach(async () => {
    server.stop()
    await fs.rm(dir, { recursive: true, force: true })
  })

  /** A POST like the hook's. Its response comes when Steward answers. */
  const post = async (body: string, signal?: AbortSignal) => {
    const token = await fs.readFile(path.join(dir, 'hook-token'), 'utf8')
    return fetch(`http://127.0.0.1:${server.port}${HOLD_PATH}`, { method: 'POST', signal, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body })
  }
  const heldSoon = async () => {
    await expect.poll(() => held.length).toBe(1)
    return held[0]
  }

  it('takes the hold path as it does the plain one', () => {
    expect(refusal({ method: 'POST', url: HOLD_PATH, headers: okHeaders }, TOKEN, 4000)).toBeNull()
    expect(refusal({ method: 'POST', url: HOLD_PATH, headers: { ...okHeaders, authorization: undefined } }, TOKEN, 4000)?.status).toBe(401)
  })

  it('stays open until answered, and a note comes out as what makes Claude keep going', async () => {
    const response = post(stop)
    const hold = await heldSoon()
    let done = false
    void response.then(() => (done = true))
    await new Promise((r) => setTimeout(r, 30))
    expect(done).toBe(false)
    hold.answer('Make it blue')
    const res = await response
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ decision: 'block', reason: 'Make it blue' })
    expect(JSON.parse(holdAnswer('x'))).toEqual({ decision: 'block', reason: 'x' })
    // It doesn't count as the event itself: that's the plain hook's.
    expect(events).toEqual([])
  })

  it('answers nothing at all to let Claude stop, and only once', async () => {
    const response = post(stop)
    const hold = await heldSoon()
    hold.answer(null)
    hold.answer('too late')
    const res = await response
    expect(res.status).toBe(204)
    expect(await res.text()).toBe('')
  })

  it('tells when the hook goes away unanswered, and not after an answer', async () => {
    const abort = new AbortController()
    const response = post(stop, abort.signal).catch(() => 'aborted')
    const hold = await heldSoon()
    let gone = 0
    hold.whenGone(() => gone++)
    abort.abort()
    await response
    await expect.poll(() => gone).toBe(1)

    held.length = 0
    const second = post(stop)
    const answered = await heldSoon()
    answered.whenGone(() => gone++)
    answered.answer(null)
    await second
    await new Promise((r) => setTimeout(r, 30))
    expect(gone).toBe(1)
  })

  it('answers at once to what it cannot hold', async () => {
    expect((await post('not json')).status).toBe(400)
    expect((await post(JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: 's1', cwd: '/x' }))).status).toBe(204)
    expect(held).toEqual([])
  })

  it('without a hold handler, lets Claude stop', async () => {
    server.stop()
    server = new HookServer(dir, () => {})
    await server.start()
    expect((await post(stop)).status).toBe(204)
  })
})

describe('HookServer', () => {
  let dir: string
  let server: HookServer
  let events: HookPayload[]

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'steward-hooks-'))
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

describe('HookServer.mirrorTo', () => {
  it('writes the port and a private copy of the token where older hook commands look', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'steward-mirror-'))
    const legacy = await fs.mkdtemp(path.join(os.tmpdir(), 'steward-legacy-'))
    const server = new HookServer(dir, () => {})
    try {
      await server.start()
      await server.mirrorTo(legacy)
      expect(await fs.readFile(path.join(legacy, 'hook-port'), 'utf8')).toBe(String(server.port))
      expect(await fs.readFile(path.join(legacy, 'hook-token'), 'utf8')).toBe(await fs.readFile(path.join(dir, 'hook-token'), 'utf8'))
      expect((await fs.stat(path.join(legacy, 'hook-token'))).mode & 0o777).toBe(0o600)
      // A folder that doesn't exist isn't created.
      await server.mirrorTo(path.join(legacy, 'nope'))
      expect(await fs.readdir(legacy)).toEqual(['hook-port', 'hook-token'])
    } finally {
      server.stop()
      await fs.rm(dir, { recursive: true, force: true })
      await fs.rm(legacy, { recursive: true, force: true })
    }
  })
})
