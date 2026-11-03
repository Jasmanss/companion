import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type Anthropic from '@anthropic-ai/sdk'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Agent } from '../src/main/agent'
import type { TrayStore } from '../src/main/tray-store'
import type { AgentEvent, CommandMode, Project } from '../src/shared/types'

let dir: string
let project: Project
let events: AgentEvent[]
let agent: Agent
let mode: CommandMode | undefined
let allowlist: string[]

/** An agent for a project folder, with the Running commands setting read each time, as the app does. */
const makeAgent = (withMode: boolean) =>
  new Agent({
    apiKey: () => undefined,
    unsplashKey: () => undefined,
    projects: () => [project],
    currentProject: () => project,
    setCurrentProject: async () => {},
    allowlist: () => allowlist,
    ...(withMode ? { commandMode: () => mode as CommandMode } : {}),
    tray: {} as TrayStore,
    capturePage: () => Promise.reject(new Error('not in tests')),
    deployLogs: () => Promise.reject(new Error('not in tests')),
    emit: (event) => events.push(event),
  })

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-commands-'))
  await fs.mkdir(path.join(dir, 'haven', 'src'), { recursive: true })
  await fs.writeFile(path.join(dir, 'haven', 'keep.txt'), 'keep\n')
  await fs.writeFile(path.join(dir, 'haven', 'old.txt'), 'old\n')
  project = { name: 'haven', path: path.join(dir, 'haven') }
  events = []
  mode = 'ask'
  allowlist = []
  agent = makeAgent(true)
})
afterEach(async () => {
  agent.cancel()
  await fs.rm(dir, { recursive: true, force: true })
})

const exists = (file: string) => fs.access(path.join(project.path, file)).then(() => true, () => false)

/** Run one tool call the way the loop does. */
const call = (name: string, input: unknown) =>
  (agent as unknown as { runTool(block: Anthropic.Beta.BetaToolUseBlock, signal: AbortSignal): Promise<Anthropic.Beta.BetaToolResultBlockParam> }).runTool(
    { type: 'tool_use', id: 'toolu_1', name, input } as Anthropic.Beta.BetaToolUseBlock,
    new AbortController().signal,
  )

const approvals = () => events.flatMap((e) => (e.type === 'approval' ? [e] : []))
const resolved = () => events.flatMap((e) => (e.type === 'approval-resolved' ? [e] : []))
const steps = () => events.flatMap((e) => (e.type === 'activity' && e.activity.kind === 'run-command' ? [`${e.activity.status} ${e.activity.target}`] : []))
const result = (r: Anthropic.Beta.BetaToolResultBlockParam) => JSON.parse(String(r.content)) as { exit_code: number | null; output: string }
const tick = () => new Promise((resolve) => setTimeout(resolve, 5))

/** Starts a command, and waits until it either asked for approval or finished. Returns the pending call. */
async function run(command: string) {
  const pending = call('run_command', { command, why: 'because' })
  let done = false
  void pending.then(() => (done = true))
  while (approvals().length === 0 && !done) await tick()
  return pending
}

describe('run_command in Ask each time', () => {
  it('shows the Run card for a command, and runs it once the user presses Run', async () => {
    const pending = run('echo hi')
    await waitFor(() => approvals().length === 1)
    expect(approvals()[0]).toMatchObject({ command: 'echo hi', cwd: project.path, why: 'because' })
    expect(steps()).toEqual([])
    agent.approve(approvals()[0].id, true)
    const out = result(await pending)
    expect(out).toMatchObject({ exit_code: 0 })
    expect(out.output.trim()).toBe('hi')
    expect(resolved()).toEqual([{ type: 'approval-resolved', id: approvals()[0].id, approved: true }])
    expect(steps()).toEqual(['running echo hi', 'done echo hi'])
  })

  it('does not run a declined command', async () => {
    const pending = run('rm old.txt')
    await waitFor(() => approvals().length === 1)
    agent.approve(approvals()[0].id, false)
    expect(String((await pending).content)).toBe('The user declined to run this command.')
    expect(await exists('old.txt')).toBe(true)
    expect(steps()).toEqual([])
  })

  it('still lets an allowlisted command through without a card', async () => {
    allowlist = ['echo hi']
    const out = result(await run('echo hi'))
    expect(out.exit_code).toBe(0)
    expect(approvals()).toEqual([])
    expect(steps()).toEqual(['running echo hi', 'done echo hi'])
  })

  it('is what an agent without the setting does', async () => {
    agent = makeAgent(false)
    void run('echo hi')
    await waitFor(() => approvals().length === 1)
    expect(steps()).toEqual([])
  })

  it('asks for a safe command too, which Auto would run', async () => {
    void run('git status')
    await waitFor(() => approvals().length === 1)
  })
})

describe('run_command in Auto', () => {
  beforeEach(() => {
    mode = 'auto'
  })

  it('runs a safe command with no card, and shows it as a step', async () => {
    const out = result(await run('echo hi && ls'))
    expect(out.exit_code).toBe(0)
    expect(out.output).toContain('hi')
    expect(out.output).toContain('keep.txt')
    expect(approvals()).toEqual([])
    expect(resolved()).toEqual([])
    expect(steps()).toEqual(['running echo hi && ls', 'done echo hi && ls'])
  })

  it('shows the Run card for a risky command, and only deletes after Run', async () => {
    const pending = run('rm old.txt')
    await waitFor(() => approvals().length === 1)
    expect(approvals()[0]).toMatchObject({ command: 'rm old.txt', cwd: project.path })
    expect(await exists('old.txt')).toBe(true)
    agent.approve(approvals()[0].id, true)
    expect(result(await pending).exit_code).toBe(0)
    expect(await exists('old.txt')).toBe(false)
  })

  it('does not run a risky command the user declines', async () => {
    const pending = run('rm old.txt')
    await waitFor(() => approvals().length === 1)
    agent.approve(approvals()[0].id, false)
    expect(String((await pending).content)).toBe('The user declined to run this command.')
    expect(await exists('old.txt')).toBe(true)
  })

  it('asks for a chain when one part of it is risky', async () => {
    void run('ls && rm old.txt')
    await waitFor(() => approvals().length === 1)
    expect(await exists('old.txt')).toBe(true)
  })

  it.each(['vercel --prod', 'git push', 'npm run deploy', 'echo hi > out.txt', 'cat /etc/hosts', 'cat ../outside.txt', 'ls ~', 'npm install', 'sudo ls'])('asks for %s', async (command) => {
    void run(command)
    await waitFor(() => approvals().length === 1)
    expect(approvals()[0].command).toBe(command)
    expect(steps()).toEqual([])
    expect(await exists('out.txt')).toBe(false)
  })

  it('moves a file onto a free name with no card, and asks before moving one onto a name that is taken', async () => {
    expect(result(await run('mv old.txt older.txt')).exit_code).toBe(0)
    expect(approvals()).toEqual([])
    expect(await exists('older.txt')).toBe(true)
    void run('mv keep.txt older.txt')
    await waitFor(() => approvals().length === 1)
    expect(await exists('keep.txt')).toBe(true)
  })

  it('looks at the folder of the current project, so ../ out of it asks even for a safe command', async () => {
    await fs.writeFile(path.join(dir, 'outside.txt'), 'x')
    void run('cat ../outside.txt')
    await waitFor(() => approvals().length === 1)
  })

  it('still runs an exact allowlist entry without a card', async () => {
    allowlist = ['rm old.txt']
    // An exact allowlist entry is the user's own word, so it still runs; Auto does not change that.
    expect(result(await run('rm old.txt')).exit_code).toBe(0)
    expect(approvals()).toEqual([])
  })

  it('goes back to asking as soon as the setting does, with no restart', async () => {
    expect(result(await run('echo one')).exit_code).toBe(0)
    expect(approvals()).toEqual([])
    mode = 'ask'
    void run('echo two')
    await waitFor(() => approvals().length === 1)
    expect(approvals()[0].command).toBe('echo two')
  })
})

describe('what the chat says about how a command ran', () => {
  const ranBy = () => events.flatMap((e) => (e.type === 'activity' && e.activity.kind === 'run-command' ? [e.activity.ranBy ?? 'card'] : []))

  it('marks a command Auto ran by itself, and one from your list, and not one you ran from its card', async () => {
    mode = 'auto'
    await run('echo hi')
    expect(ranBy()).toEqual(['auto', 'auto'])
    events = []
    mode = 'ask'
    allowlist = ['echo hi']
    await run('echo hi')
    expect(ranBy()).toEqual(['list', 'list'])
    events = []
    const pending = run('echo bye')
    await waitFor(() => approvals().length === 1)
    agent.approve(approvals()[0].id, true)
    await pending
    expect(ranBy()).toEqual(['card', 'card'])
  })

  it('says on the card why Auto still asks, and gives no reason in Ask each time', async () => {
    mode = 'auto'
    void run('rm old.txt')
    await waitFor(() => approvals().length === 1)
    expect(approvals()[0].reason).toBe('deleting files always asks')
    agent.approve(approvals()[0].id, false)
    events = []
    void run('git push')
    await waitFor(() => approvals().length === 1)
    expect(approvals()[0].reason).toBe('pushing always asks')
    agent.approve(approvals()[0].id, false)
    events = []
    mode = 'ask'
    void run('git push')
    await waitFor(() => approvals().length === 1)
    expect(approvals()[0].reason).toBeUndefined()
    agent.approve(approvals()[0].id, false)
  })
})

describe('the instructions the agent gets', () => {
  const prompt = () => (agent as unknown as { systemPrompt(): string }).systemPrompt()

  it('says the user approves each command in Ask each time', () => {
    const text = prompt()
    expect(text).toContain('The user approves each command before it runs')
    expect(text).not.toContain('Auto')
    expect(text).not.toContain('{COMMANDS}')
  })

  it('says safe commands run straight away in Auto, and what still waits', () => {
    mode = 'auto'
    const text = prompt()
    expect(text).toContain('Running commands to Auto')
    expect(text).toContain('Risky ones still wait for the user to press Run')
    expect(text).not.toContain('The user approves each command before it runs')
    expect(text).not.toContain('{COMMANDS}')
  })

  it('says deploys, rollbacks and git push always need approval, in both modes', () => {
    for (const m of ['ask', 'auto'] as const) {
      mode = m
      expect(prompt()).toContain("Deploys, rollbacks and git push always need the user's approval.")
    }
  })
})

/** Polls until the condition holds (the agent's events arrive from awaited work). */
async function waitFor(condition: () => boolean, ms = 4000) {
  const end = Date.now() + ms
  while (!condition()) {
    if (Date.now() > end) throw new Error('timed out waiting')
    await tick()
  }
}
