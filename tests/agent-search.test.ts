import type Anthropic from '@anthropic-ai/sdk'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Agent } from '../src/main/agent'
import type { TrayStore } from '../src/main/tray-store'
import type { AgentEvent, Project } from '../src/shared/types'

type Params = Anthropic.Beta.MessageCreateParams
type Block = Anthropic.Beta.BetaContentBlock

/** The scripted API: each request is recorded as it was sent, and `reply` decides the response. */
const api = vi.hoisted(() => ({
  requests: [] as Params[],
  reply: (() => {
    throw new Error('no reply scripted')
  }) as (params: Params, n: number) => { message: unknown; failAfter?: number },
}))

// The real SDK, with only the streaming call swapped for the script. No network, no key.
vi.mock('@anthropic-ai/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@anthropic-ai/sdk')>()
  class ScriptedAnthropic extends actual.default {
    constructor(options: ConstructorParameters<typeof actual.default>[0] = {}) {
      super({ ...options, apiKey: 'not-a-real-key' })
      ;(this.beta.messages as unknown as { stream: unknown }).stream = (params: Params) => {
        // The agent keeps appending to the same messages array, so keep a copy of what was sent.
        const sent = JSON.parse(JSON.stringify(params)) as Params
        api.requests.push(sent)
        const { message, failAfter } = api.reply(sent, api.requests.length)
        return scriptedStream(message as Anthropic.Beta.BetaMessage, failAfter)
      }
    }
  }
  return { ...actual, default: ScriptedAnthropic }
})

/** Streams a message the way the API does: each block starts, its input or text streams in, it stops. */
function scriptedStream(message: Anthropic.Beta.BetaMessage, failAfter?: number) {
  const events: unknown[] = []
  message.content.forEach((block, index) => {
    if (block.type === 'server_tool_use' || block.type === 'tool_use') {
      events.push({ type: 'content_block_start', index, content_block: { ...block, input: {} } })
      events.push({ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(block.input) } })
    } else if (block.type === 'text') {
      events.push({ type: 'content_block_start', index, content_block: { ...block, text: '' } })
      events.push({ type: 'content_block_delta', index, delta: { type: 'text_delta', text: block.text } })
    } else {
      events.push({ type: 'content_block_start', index, content_block: block })
    }
    events.push({ type: 'content_block_stop', index })
  })
  return {
    async *[Symbol.asyncIterator]() {
      for (const [i, event] of events.entries()) {
        // How the SDK fails on a tool input that isn't valid JSON: partway through the stream.
        if (failAfter !== undefined && i >= failAfter) throw new Error('Unable to parse tool parameter JSON from model.')
        yield event
      }
    },
    finalMessage: async () => message,
  }
}

const message = (stop_reason: Anthropic.Beta.BetaStopReason, content: unknown[], container?: string) => ({
  id: 'msg_test',
  type: 'message',
  role: 'assistant',
  model: 'claude-sonnet-5-5',
  content: content as Block[],
  stop_reason,
  stop_sequence: null,
  container: container ? { id: container, expires_at: '2026-11-16T12:00:00Z', skills: null } : null,
})

let ids = 0
/**
 * Dynamic filtering, as web_search_20260209 does it by default: one code run that searches from inside the container.
 * Each search is a server_tool_use with a caller and its result; the code run's own result comes last, unless it paused.
 */
function codeRun(queries: string[], { finished = true } = {}): unknown[] {
  const code = `srvtoolu_code${++ids}`
  const caller = { type: 'code_execution_20260120', tool_id: code }
  const blocks: unknown[] = [{ type: 'server_tool_use', id: code, name: 'code_execution', input: { code: 'results = [web_search(q) for q in queries]' } }]
  for (const query of queries) {
    const id = `srvtoolu_search${++ids}`
    blocks.push({ type: 'server_tool_use', id, name: 'web_search', input: { query }, caller })
    blocks.push({
      type: 'web_search_tool_result',
      tool_use_id: id,
      caller,
      content: [{ type: 'web_search_result', url: 'https://linear.app/pricing', title: 'Pricing', encrypted_content: 'x', page_age: null }],
    })
  }
  if (finished) blocks.push({ type: 'code_execution_tool_result', tool_use_id: code, content: { type: 'code_execution_result', stdout: 'linear.app/pricing', stderr: '', return_code: 0, content: [] } })
  return blocks
}

/** What a model that keeps going back to the web searches for, every time it gets the chance. */
const SAME_SIX = ['saas pricing page design', 'best saas pricing pages', 'pricing page examples', 'saas pricing table design', 'pricing page inspiration', 'stripe pricing page']

const text = (t: string) => ({ type: 'text', text: t, citations: null })

let events: AgentEvent[]
let agent: Agent
const project: Project = { name: 'haven', path: '/tmp/haven' }

beforeEach(() => {
  api.requests.length = 0
  ids = 0
  events = []
  agent = new Agent({
    apiKey: () => undefined,
    unsplashKey: () => undefined,
    projects: () => [project],
    currentProject: () => project,
    setCurrentProject: async () => {},
    allowlist: () => [],
    tray: { list: () => [] } as unknown as TrayStore,
    capturePage: () => Promise.reject(new Error('not in tests')),
    deployLogs: () => Promise.reject(new Error('not in tests')),
    emit: (event) => events.push(event),
  })
})

/** Each web search the panel showed, by its query. */
const searches = () =>
  events.flatMap((e) => (e.type === 'activity' && e.activity.kind === 'search-web' && e.activity.status !== 'running' ? [e.activity.target ?? '?'] : []))
const errors = () => events.flatMap((e) => (e.type === 'error' ? [e.message] : []))
const said = () => events.flatMap((e) => (e.type === 'text' ? [e.delta] : [])).join('')

describe('web search across one answer', () => {
  it('sends the code container back, so a paused or resumed answer keeps what its searches found', async () => {
    api.reply = (_params, n) => {
      if (n === 1) return { message: message('pause_turn', codeRun(SAME_SIX.slice(0, 2)), 'container_1') }
      if (n === 2) return { message: message('tool_use', [text('Checking the tray.'), { type: 'tool_use', id: 'toolu_1', name: 'list_tray', input: {} }], 'container_1') }
      return { message: message('end_turn', [text('Linear has the cleanest one.')], 'container_1') }
    }
    await agent.send('find me good saas pricing pages')

    expect(api.requests.map((r) => r.container)).toEqual([undefined, 'container_1', 'container_1'])
    expect(errors()).toEqual([])

    // A new question starts a new answer, in a new container.
    api.reply = () => ({ message: message('end_turn', [text('Sure.')], 'container_2') })
    await agent.send('thanks')
    expect(api.requests[3].container).toBeUndefined()
  })

  it('stops searching once the answer has used its searches, and answers with what it found', async () => {
    // max_uses (6) only holds within one request: searches made from code start over with every request.
    api.reply = (params) =>
      params.tool_choice?.type === 'none'
        ? { message: message('end_turn', [text("Here's what I found.")], 'container_1') }
        : { message: message('pause_turn', codeRun(SAME_SIX), 'container_1') }
    await agent.send('find me good saas pricing pages')

    expect(searches()).toHaveLength(12)
    expect(errors()).toEqual([])
    expect(said()).toBe("Here's what I found.")
    expect(api.requests.map((r) => r.tool_choice?.type ?? 'auto')).toEqual(['auto', 'auto', 'none'])
  })

  it('lets a paused code run finish before cutting searches off', async () => {
    api.reply = (_params, n) => {
      if (n === 1) return { message: message('pause_turn', codeRun(SAME_SIX), 'container_1') }
      // Paused partway through a code run: its result isn't back yet, and resuming it is the next request's job.
      if (n === 2) return { message: message('pause_turn', codeRun(SAME_SIX, { finished: false }), 'container_1') }
      return { message: message('end_turn', [text('Done.')], 'container_1') }
    }
    await agent.send('find me good saas pricing pages')

    expect(errors()).toEqual([])
    expect(api.requests).toHaveLength(3)
    expect(api.requests[2].tool_choice).toBeUndefined()
  })

  it('counts the searches of a request that failed partway, so a retry cannot start them all over', async () => {
    api.reply = (params, n) => {
      if (params.tool_choice?.type === 'none') return { message: message('end_turn', [text('Done.')]) }
      // The first try streams the code run's start (3 events) and all six searches with their results (5 each),
      // then a tool input that isn't valid JSON ends it.
      return { message: message('pause_turn', codeRun(SAME_SIX)), failAfter: n === 1 ? 3 + 6 * 5 : undefined }
    }
    await agent.send('find me good saas pricing pages')

    // The retry ran the same six again: they count, and the answer is out of searches after it.
    expect(searches()).toEqual([...SAME_SIX, ...SAME_SIX])
    expect(errors()).toEqual([])
    expect(api.requests.map((r) => r.tool_choice?.type ?? 'auto')).toEqual(['auto', 'auto', 'none'])
  })
})
