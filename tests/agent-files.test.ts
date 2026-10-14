import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type Anthropic from '@anthropic-ai/sdk'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Agent } from '../src/main/agent'
import type { TrayStore } from '../src/main/tray-store'
import type { Activity, AgentEvent, Project } from '../src/shared/types'

let dir: string
let project: Project | null
let events: AgentEvent[]
let agent: Agent

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-files-'))
  await fs.mkdir(path.join(dir, 'haven', 'src', 'app'), { recursive: true })
  await fs.writeFile(path.join(dir, 'haven', 'src', 'app', 'page.tsx'), 'export default function Page() {}\n')
  await fs.writeFile(path.join(dir, 'haven', '.env'), 'API_KEY=sk-123\n')
  project = { name: 'haven', path: path.join(dir, 'haven') }
  events = []
  agent = new Agent({
    apiKey: () => undefined,
    unsplashKey: () => undefined,
    projects: () => (project ? [project] : []),
    currentProject: () => project,
    setCurrentProject: async () => {},
    allowlist: () => [],
    tray: {} as TrayStore,
    capturePage: () => Promise.reject(new Error('not in tests')),
    deployLogs: () => Promise.reject(new Error('not in tests')),
    emit: (event) => events.push(event),
  })
})
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true })
})

/** Run one tool call the way the loop does. */
const call = (name: string, input: unknown) =>
  (agent as unknown as { runTool(block: Anthropic.Beta.BetaToolUseBlock, signal: AbortSignal): Promise<Anthropic.Beta.BetaToolResultBlockParam> }).runTool(
    { type: 'tool_use', id: 'toolu_1', name, input } as Anthropic.Beta.BetaToolUseBlock,
    new AbortController().signal,
  )

const steps = () => events.flatMap((e) => (e.type === 'activity' ? [e.activity] : [])).map(({ kind, status, target, detail, results }: Activity) => ({ kind, status, target, detail, results }))

describe('the file tools in the agent', () => {
  it('reads a file as a step, from running to done, and gives the model numbered lines', async () => {
    const result = await call('read_file', { path: './src/app/page.tsx' })
    expect(result.is_error).toBeUndefined()
    expect(String(result.content)).toContain('1\texport default function Page() {}')
    expect(steps()).toEqual([
      { kind: 'read-file', status: 'running', target: 'src/app/page.tsx', detail: undefined, results: undefined },
      { kind: 'read-file', status: 'done', target: 'src/app/page.tsx', detail: undefined, results: undefined },
    ])
  })

  it('shows a refused read as a failed step with a short reason, and tells the model why', async () => {
    const result = await call('read_file', { path: '.env' })
    expect(result.is_error).toBe(true)
    expect(String(result.content)).toContain('never read')
    expect(steps().at(-1)).toMatchObject({ kind: 'read-file', status: 'failed', detail: 'secret file, not read' })
  })

  it('lists the project as a step named after it, with the top entries for the panel', async () => {
    const result = await call('list_files', {})
    expect(String(result.content)).toContain('Files in haven, 2 levels down.')
    expect(String(result.content)).toContain('\nsrc/app/\n')
    expect(String(result.content)).toContain(".env  (secret, can't be read)")
    expect(steps().at(-1)).toMatchObject({ kind: 'list-files', status: 'done', target: 'haven', results: ['src/', '.env'] })
    await call('list_files', { path: 'src', depth: 1 })
    expect(steps().at(-1)).toMatchObject({ target: 'src/', results: ['app/'] })
  })

  it('rejects bad input and works only with a project', async () => {
    expect((await call('read_file', { path: '' })).is_error).toBe(true)
    expect((await call('list_files', { depth: 99 })).is_error).toBe(true)
    project = null
    const result = await call('read_file', { path: 'src/app/page.tsx' })
    expect(result.is_error).toBe(true)
    expect(String(result.content)).toContain('No project is selected')
  })
})
