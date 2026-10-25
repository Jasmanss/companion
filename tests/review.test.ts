import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { HookPayload } from '../src/main/hook-payload'
import type { Project } from '../src/shared/types'
import { describeCaptureError, reviewAlert, ReviewTracker, sameTurnFinished, type Shot } from '../src/main/review'
import type { Diff } from '../src/main/review-diff'
import { REVIEW_LIMITS, ReviewStore } from '../src/main/review-store'

type Start = Extract<HookPayload, { hook_event_name: 'UserPromptSubmit' }>
type Stop = Extract<HookPayload, { hook_event_name: 'Stop' }>

const project = { name: 'site', path: '/Users/me/site', url: 'http://localhost:3000' }
const start = (over: Partial<Start> = {}): Start => ({ hook_event_name: 'UserPromptSubmit', session_id: 's1', prompt_id: 'p1', cwd: '/Users/me/site', ...over })
const stop = (over: Partial<Stop> = {}): Stop => ({ hook_event_name: 'Stop', session_id: 's1', prompt_id: 'p1', cwd: '/Users/me/site', ...over })
const shot = (text: string, height = 900): Shot => ({ png: Buffer.from(text), width: 1440, height })
const diff = (changed: boolean): Diff => ({ changed, changedPixels: changed ? 900 : 0, minPixels: 243, heights: [225, 225] })

/** Let the picture taken at the prompt happen (it takes seconds in life), before the page changes. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

const dirs: string[] = []
afterEach(async () => {
  for (const d of dirs.splice(0)) await fs.rm(d, { recursive: true, force: true })
})

/** A tracker over a real store in a temp folder, with captures it is told to make: a page that is whatever `page` says now. */
async function setup(opts: { projects?: Project[]; page?: () => string | Error | Shot; changed?: boolean } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'steward-review-test-'))
  dirs.push(dir)
  const store = new ReviewStore(dir, REVIEW_LIMITS)
  const state = { page: 'old page', changed: opts.changed ?? true }
  const captured: string[] = []
  const log: string[] = []
  const onChange = vi.fn()
  const onProblems = vi.fn()
  const onChecks = vi.fn()
  const tracker = new ReviewTracker({
    projects: () => opts.projects ?? [project],
    capture: async (url) => {
      captured.push(url)
      const now = opts.page ? opts.page() : state.page
      if (now instanceof Error) throw now
      return typeof now === 'string' ? shot(now) : now
    },
    compare: (a, b) => diff(state.changed && a.toString() !== b.toString()),
    card: (png) => Buffer.from(`card:${png.toString()}`),
    store,
    onChange,
    onProblems,
    onChecks,
    log: (m) => log.push(m),
  })
  return { tracker, store, state, captured, log, onChange, onProblems, onChecks }
}

describe('ReviewTracker, a turn that changed the page', () => {
  it('photographs at the prompt and again at the stop, and keeps a review of both', async () => {
    const { tracker, store, state, captured, onChange } = await setup()
    tracker.turnStarted(start())
    await tick()
    state.page = 'new page'
    const review = await tracker.turnStopped(stop())
    expect(captured).toEqual(['http://localhost:3000', 'http://localhost:3000'])
    expect(review).toMatchObject({ project: 'site', url: 'http://localhost:3000', before: 'turn-start', status: 'new' })
    expect((await store.read(review!.id, 'before'))?.toString()).toBe('old page')
    expect((await store.read(review!.id, 'after'))?.toString()).toBe('new page')
    expect(onChange).toHaveBeenCalledTimes(1)

    const [view] = await tracker.pending()
    expect(view).toMatchObject({ id: review!.id, project: 'site', address: 'http://localhost:3000', beforeFrom: 'turn-start', heightAfter: 900 })
    expect(Buffer.from(view.after.split(',')[1], 'base64').toString()).toBe('card:new page')
    expect(Buffer.from(view.before!.split(',')[1], 'base64').toString()).toBe('card:old page')
  })

  it('waits for the before picture if the turn ended first, and never mixes up two sessions', async () => {
    let release = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'steward-review-test-'))
    dirs.push(dir)
    let calls = 0
    const tracker = new ReviewTracker({
      projects: () => [project],
      capture: async () => {
        const n = ++calls
        if (n === 1) await gate // the first picture is slow
        return shot(`picture ${n}`)
      },
      compare: () => diff(true),
      card: (png) => png,
      store: new ReviewStore(dir),
      onChange: () => {},
    })
    tracker.turnStarted(start({ session_id: 'a', prompt_id: '1' }))
    const ended = tracker.turnStopped(stop({ session_id: 'a', prompt_id: '1' }))
    release()
    const review = await ended
    expect(review?.before).toBe('turn-start')
  })

  it("keeps what Claude said about the turn, from the Stop hook, as the card's note", async () => {
    const { tracker, store, state } = await setup()
    tracker.turnStarted(start())
    await tick()
    state.page = 'new page'
    const review = await tracker.turnStopped(stop({ last_assistant_message: '**Done.** I made the `Start` button blue and moved the logos under the hero.\n\nWant me to commit?' }))
    expect(store.get(review!.id)?.said).toBe('I made the Start button blue and moved the logos under the hero.')
    expect((await tracker.pending())[0].said).toBe('I made the Start button blue and moved the logos under the hero.')
  })

  it('counts the files the turn changed, from a look at its start, and has no count when git cannot say', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'steward-review-test-'))
    dirs.push(dir)
    const state = { page: 'old page' }
    const calls: string[] = []
    const make = (changed: number | null) =>
      new ReviewTracker({
        projects: () => [project],
        capture: async () => shot(state.page),
        compare: (a, b) => diff(a.toString() !== b.toString()),
        card: (png) => png,
        store: new ReviewStore(dir),
        onChange: () => {},
        gitFiles: {
          look: async (d) => (calls.push(`look ${d}`), [{ code: ' D', path: 'old.ts' }]),
          changed: async (d, since, start) => (calls.push(`changed ${d} ${typeof since} ${start?.length}`), changed),
        },
      })
    const tracker = make(3)
    tracker.turnStarted(start())
    await tick()
    state.page = 'new page'
    const review = await tracker.turnStopped(stop())
    expect(review?.filesChanged).toBe(3)
    expect(calls).toEqual(['look /Users/me/site', 'changed /Users/me/site number 1'])
    expect((await tracker.pending())[0].filesChanged).toBe(3)

    const unknown = make(null)
    unknown.turnStarted(start({ prompt_id: 'p2' }))
    await tick()
    state.page = 'newer page'
    const second = await unknown.turnStopped(stop({ prompt_id: 'p2' }))
    expect(second).not.toHaveProperty('filesChanged')
  })

  it('has no note when Claude said nothing worth showing', async () => {
    const { tracker, store, state } = await setup()
    for (const [id, message] of [['1', undefined], ['2', 'Should I also change the footer?']] as const) {
      tracker.turnStarted(start({ prompt_id: id }))
      await tick()
      state.page = `page ${id}`
      const review = await tracker.turnStopped(stop({ prompt_id: id, last_assistant_message: message }))
      expect(store.get(review!.id)).not.toHaveProperty('said')
    }
    expect((await tracker.pending()).map((v) => v.said)).toEqual([null, null])
  })

  it('makes one review however many times the same turn stops', async () => {
    const { tracker, state } = await setup()
    tracker.turnStarted(start())
    await tick()
    state.page = 'new page'
    expect(await tracker.turnStopped(stop())).not.toBeNull()
    // The second Stop has no turn behind it: no stand-in either (the picture was just taken), the page looks the same.
    expect(await tracker.turnStopped(stop())).toBeNull()
  })
})

describe('ReviewTracker, turns that make no card', () => {
  it('says nothing when the page looks the same, and the project has an address to look at', async () => {
    const { tracker, store, onChange } = await setup({ changed: false })
    tracker.turnStarted(start())
    expect(await tracker.turnStopped(stop())).toBeNull()
    expect(store.list()).toEqual([])
    expect(onChange).not.toHaveBeenCalled()
  })

  it('does nothing for a project without an address, or for a folder that is no project', async () => {
    const { tracker, captured } = await setup({ projects: [{ name: 'site', path: '/Users/me/site', url: undefined as unknown as string }] })
    tracker.turnStarted(start())
    expect(await tracker.turnStopped(stop())).toBeNull()
    tracker.turnStarted(start({ cwd: '/Users/me/elsewhere' }))
    expect(await tracker.turnStopped(stop({ cwd: '/Users/me/elsewhere' }))).toBeNull()
    expect(captured).toEqual([])
  })

  it('ignores a Stop that a Stop hook asked to keep going', async () => {
    const { tracker, captured } = await setup()
    tracker.turnStarted(start())
    expect(await tracker.turnStopped(stop({ stop_hook_active: true }))).toBeNull()
    expect(captured).toHaveLength(1) // only the before picture
  })

  it('says why, in the log, when the app is not running at the stop', async () => {
    const { tracker, log } = await setup({ page: () => new Error("ERR_CONNECTION_REFUSED (-102) loading 'http://localhost:3000/'") })
    tracker.turnStarted(start())
    expect(await tracker.turnStopped(stop())).toBeNull()
    expect(log.some((m) => m.includes('Nothing is answering at localhost:3000'))).toBe(true)
  })

  it('is not stopped by a failed before picture: it uses the last look, and says so', async () => {
    let n = 0
    const { tracker, state, store } = await setup({
      page: () => {
        n++
        return n === 2 ? new Error('ERR_CONNECTION_REFUSED') : n === 1 ? 'first look' : 'new page'
      },
    })
    // Something (Try it now, an earlier turn) has looked at the page.
    expect(await tracker.tryIt(project.path)).toMatchObject({ ok: true })
    tracker.turnStarted(start()) // the app is down at the prompt
    state.page = 'ignored'
    const review = await tracker.turnStopped(stop())
    expect(review).toMatchObject({ before: 'last-look' })
    expect((await store.read(review!.id, 'before'))?.toString()).toBe('first look')
  })

  it('shows only the after, labeled, when there is nothing to compare with', async () => {
    const { tracker, store } = await setup()
    const review = await tracker.turnStopped(stop()) // Steward started mid-turn
    expect(review).toMatchObject({ before: 'none', heightBefore: null })
    expect(await store.read(review!.id, 'before')).toBeNull()
    const [view] = await tracker.pending()
    expect(view.before).toBeNull()
    expect(view.files.before).toBeNull()
  })
})

describe('ReviewTracker, a check is never silent', () => {
  it('leaves a quiet note when the page looks the same, and says why in the log', async () => {
    const { tracker, onChecks, log } = await setup({ changed: false })
    tracker.turnStarted(start())
    await tick()
    expect(await tracker.turnStopped(stop())).toBeNull()
    expect(tracker.checks()).toEqual([{ projectPath: project.path, project: 'site', address: 'http://localhost:3000', at: expect.any(Number) }])
    expect(onChecks).toHaveBeenCalledTimes(1)
    expect(log).toContain('no review: site: the page looks the same (0 small pixels changed, it takes 243)')
  })

  it('keeps one note per project: the next check replaces it, and a card takes it away', async () => {
    const { tracker, state } = await setup()
    tracker.turnStarted(start({ prompt_id: 'a' }))
    await tick()
    await tracker.turnStopped(stop({ prompt_id: 'a' })) // same page
    const first = tracker.checks()[0].at
    await new Promise((resolve) => setTimeout(resolve, 5))
    tracker.turnStarted(start({ prompt_id: 'b' }))
    await tick()
    await tracker.turnStopped(stop({ prompt_id: 'b' })) // same again
    expect(tracker.checks()).toHaveLength(1)
    expect(tracker.checks()[0].at).toBeGreaterThan(first)

    tracker.turnStarted(start({ prompt_id: 'c' }))
    await tick()
    state.page = 'new page'
    expect(await tracker.turnStopped(stop({ prompt_id: 'c' }))).not.toBeNull()
    expect(tracker.checks()).toEqual([])
  })

  it('lets a problem replace the note', async () => {
    let down = false
    const { tracker } = await setup({ page: () => (down ? new Error('ERR_CONNECTION_REFUSED') : 'page') })
    tracker.turnStarted(start({ prompt_id: 'a' }))
    await tick()
    await tracker.turnStopped(stop({ prompt_id: 'a' }))
    expect(tracker.checks()).toHaveLength(1)
    down = true
    await tracker.turnStopped(stop({ prompt_id: 'b' }))
    expect(tracker.checks()).toEqual([])
    expect(tracker.problems()).toHaveLength(1)
  })

  it('logs every other way a turn ends without a card', async () => {
    const { tracker, log } = await setup({ projects: [project, { name: 'notes', path: '/Users/me/notes' }] })
    await tracker.turnStopped(stop({ cwd: '/Users/me/elsewhere' }))
    await tracker.turnStopped(stop({ cwd: '/Users/me/notes' }))
    await tracker.turnStopped(stop({ stop_hook_active: true }))
    expect(log).toEqual([
      "no review: /Users/me/elsewhere isn't in any of your projects",
      'no review: notes has no App address',
      "no review: site: Claude is carrying on (a Stop hook asked it to), so the turn hasn't ended",
    ])

    const login = await setup({ page: () => ({ ...shot('login'), landedOn: 'http://localhost:3000/login' }) })
    await login.tracker.turnStopped(stop())
    expect(login.log.some((m) => m.startsWith('no review: site: localhost:3000 sends you to /login'))).toBe(true)
  })

  it('logs the card it makes, with the numbers', async () => {
    const { tracker, state, log } = await setup()
    tracker.turnStarted(start())
    await tick()
    state.page = 'new page'
    await tracker.turnStopped(stop())
    expect(log).toContain('a review of site: the page changed (900 small pixels changed, it takes 243)')
  })
})

describe('ReviewTracker, the history', () => {
  it('keeps every look after a turn, what it found, and what became of a review', async () => {
    let page: string | Error | Shot = 'old page'
    const { tracker, store } = await setup({ page: () => page })
    const turn = async (id: string, now: string | Error | Shot) => {
      tracker.turnStarted(start({ prompt_id: id }))
      await tick()
      page = now
      return tracker.turnStopped(stop({ prompt_id: id }))
    }
    const review = await turn('1', 'new page')
    await turn('2', 'new page') // the same
    await turn('3', new Error('net::ERR_CONNECTION_REFUSED'))
    page = 'new page'
    await turn('4', { ...shot('login'), landedOn: 'http://localhost:3000/login' })
    expect(tracker.history(project.path).map((e) => [e.found, e.text ?? '', e.decided ?? ''])).toEqual([
      ['login', expect.stringContaining('sends you to /login'), ''],
      ['failed', 'Nothing is answering at localhost:3000. Start the app, then try again.', ''],
      ['same', '', ''],
      ['review', '', 'new'],
    ])
    await tracker.markGood(review!.id)
    expect(tracker.history(project.path).at(-1)).toMatchObject({ found: 'review', reviewId: review!.id, decided: 'good' })
    // Kept on disk: a restart reads it back.
    const again = new ReviewStore(path.dirname(path.dirname(path.dirname(store.file(review!.id, 'after')!))), REVIEW_LIMITS)
    await again.load()
    expect(again.history(project.path)).toHaveLength(4)
  })

  it("keeps nothing for a turn it didn't look at, and shows only the address the project has now", async () => {
    const { tracker, store } = await setup({ projects: [{ name: 'site', path: '/Users/me/site' }] })
    tracker.turnStarted(start())
    expect(await tracker.turnStopped(stop())).toBeNull()
    expect(store.history('/Users/me/site')).toEqual([])
    await store.addLook({ projectPath: '/Users/me/site', address: 'http://localhost:3000', at: Date.now(), found: 'same' })
    // No address now: nothing to show for it.
    expect(tracker.history('/Users/me/site')).toEqual([])
  })
})

describe('ReviewTracker, decisions', () => {
  it('Looks good takes it off the list', async () => {
    const { tracker, store, state, onChange } = await setup()
    tracker.turnStarted(start())
    await tick()
    state.page = 'new page'
    const review = (await tracker.turnStopped(stop()))!
    await tracker.markGood(review.id)
    expect(store.get(review.id)?.status).toBe('good')
    expect(await tracker.pending()).toEqual([])
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('Send it back gives the note with the user’s words and the path of the picture, and takes it off the list', async () => {
    const { tracker, store, state } = await setup()
    tracker.turnStarted(start())
    await tick()
    state.page = 'new page'
    const review = (await tracker.turnStopped(stop()))!
    const note = await tracker.sendBack(review.id, 'Make it blue')
    expect(note).toContain('Visual Review of site (localhost:3000): please change this.')
    expect(note).toContain('Make it blue')
    expect(note).toContain(`What I saw: ${store.file(review.id, 'after')}`)
    expect(note).toContain(`What it looked like before: ${store.file(review.id, 'before')}`)
    expect(store.get(review.id)).toMatchObject({ status: 'sent-back', note: 'Make it blue' })
    expect(await tracker.pending()).toEqual([])
    await expect(tracker.sendBack('20261020-120000-deadbeef', 'x')).rejects.toThrow(/isn't there/)
  })

  it('Clear review pictures removes them all', async () => {
    const { tracker, store, state } = await setup()
    tracker.turnStarted(start())
    await tick()
    state.page = 'new page'
    await tracker.turnStopped(stop())
    await tracker.clear()
    expect(store.list()).toEqual([])
    expect(await tracker.pending()).toEqual([])
  })
})

describe('ReviewTracker, Try it now', () => {
  it('shows the page, or says what is wrong', async () => {
    const good = await setup()
    expect(await good.tracker.tryIt(project.path)).toMatchObject({ ok: true, width: 1440, height: 900 })
    expect(await good.tracker.tryIt('/Users/me/nothing')).toEqual({ ok: false, error: 'Add an address first.' })

    const down = await setup({ page: () => new Error('ERR_CONNECTION_REFUSED (-102)') })
    expect(await down.tracker.tryIt(project.path)).toEqual({ ok: false, error: 'Nothing is answering at localhost:3000. Start the app, then try again.' })
  })
})

describe('ReviewTracker, problems the user should see', () => {
  const refused = () => new Error("ERR_CONNECTION_REFUSED (-102) loading 'http://localhost:3000/'")

  it('keeps one plain message per project when the app is not running, and clears it when a capture works', async () => {
    let down = true
    const { tracker, onProblems } = await setup({ page: () => (down ? refused() : 'page') })
    tracker.turnStarted(start())
    await tick()
    expect(tracker.problems()).toEqual([
      expect.objectContaining({ projectPath: project.path, project: 'site', address: 'http://localhost:3000', login: false, reason: 'Nothing is answering at localhost:3000. Start the app, then try again.' }),
    ])
    await tracker.turnStopped(stop())
    expect(tracker.problems()).toHaveLength(1) // the same message again: still one
    expect(onProblems).toHaveBeenCalledTimes(1)

    down = false
    expect(await tracker.tryIt(project.path)).toMatchObject({ ok: true })
    expect(tracker.problems()).toEqual([])
    expect(onProblems).toHaveBeenCalledTimes(2)
  })

  it('says so when the page only shows a login, makes no card of it, and tells Try it now', async () => {
    const login = (text: string): Shot => ({ ...shot(text), landedOn: 'http://localhost:3000/login' })
    let n = 0
    const { tracker, store } = await setup({ page: () => login(`login page ${++n}`) })
    tracker.turnStarted(start())
    await tick()
    expect(await tracker.turnStopped(stop())).toBeNull()
    expect(store.list()).toEqual([])
    const [problem] = tracker.problems()
    expect(problem).toMatchObject({ login: true })
    expect(problem.reason).toContain('sends you to /login')

    const tried = await tracker.tryIt(project.path)
    expect(tried).toMatchObject({ ok: true, login: true })
    expect(tried.ok && tried.note).toContain("Use a page that doesn't need a login")
  })

  it('only shows a problem for the address the project has now', async () => {
    const projects = [{ ...project }]
    const { tracker } = await setup({ projects, page: refused })
    await tracker.tryIt(project.path)
    expect(tracker.problems()).toHaveLength(1)
    projects[0].url = 'http://localhost:4000'
    expect(tracker.problems()).toEqual([])
  })

  it('does not count Steward being busy as a problem with the app', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'steward-review-test-'))
    dirs.push(dir)
    const log: string[] = []
    const tracker = new ReviewTracker({
      projects: () => [project],
      capture: () => new Promise<Shot>(() => {}), // a capture that never finishes holds the queue
      compare: () => diff(true),
      card: (png) => png,
      store: new ReviewStore(dir),
      onChange: () => {},
      log: (m) => log.push(m),
    })
    for (let i = 0; i < 6; i++) tracker.turnStarted(start({ prompt_id: `p${i}` }))
    await tick()
    expect(log.filter((m) => m.includes('busy'))).toHaveLength(2) // two more than the queue holds
    expect(tracker.problems()).toEqual([])
  })
})

describe('the review alert', () => {
  it('needs you: urgent, under its own key, and opens on the card', () => {
    expect(reviewAlert({ id: '20261024-101010-abcdef12', project: 'haven', projectPath: '/Users/me/haven' })).toEqual({
      key: 'review:20261024-101010-abcdef12',
      level: 'urgent',
      title: 'haven changed',
      detail: 'Review what Claude did?',
      scope: '/Users/me/haven',
    })
  })

  it("takes the place of the same turn's finished alert, and no other", () => {
    const same = sameTurnFinished({ session_id: 's1', prompt_id: 'p2' })
    expect(same({ key: 'finished:s1:p2' })).toBe(true)
    expect(same({ key: 'finished:s1:p1' })).toBe(false)
    expect(same({ key: 'finished:s2:p2' })).toBe(false)
    expect(same({ key: 'approval:s1:p2:npm test' })).toBe(false)
    // No prompt id (sessions.ts keys it by the time then): that session's finished alerts.
    const any = sameTurnFinished({ session_id: 's1' })
    expect(any({ key: 'finished:s1:1729800000000' })).toBe(true)
    expect(any({ key: 'finished:s10:1729800000000' })).toBe(false)
  })
})

describe('describeCaptureError', () => {
  it('turns the browser’s errors into words', () => {
    const at = 'http://localhost:3000/pricing'
    expect(describeCaptureError(new Error('ERR_CONNECTION_REFUSED (-102) loading'), at)).toContain('Nothing is answering at localhost:3000/pricing')
    expect(describeCaptureError(new Error('The page took too long to load'), at)).toContain("didn't finish loading")
    expect(describeCaptureError(new Error('The page rendered blank'), at)).toContain('blank')
    expect(describeCaptureError(new Error('something else'), at)).toBe("Couldn't capture localhost:3000/pricing: something else")
  })
})
