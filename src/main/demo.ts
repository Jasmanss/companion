import type { Activity, ActivityKind, AgentEvent, Mood } from '../shared/types'

/** What the demo needs from the agent: the same step and event plumbing a real request uses. */
export interface DemoStage {
  start(kind: ActivityKind, target?: string): Activity
  update(step: Activity, patch: Partial<Activity>): void
  finish(step: Activity, ok: boolean, patch?: Partial<Activity>): void
  emit(event: AgentEvent): void
  mood(mood: Mood): void
  /** Adds the made-up screenshot to the tray and returns its id. */
  addScreenshot(): Promise<string>
  signal: AbortSignal
}

const TEST_OUTPUT = [
  '> steward@0.1.0 test',
  '> vitest run',
  '',
  ' ✓ tests/activity.test.ts (9 tests)',
  ' ✓ tests/commands.test.ts (11 tests)',
  ' ✓ tests/agent.test.ts (14 tests)',
  ' ✓ tests/moods.test.ts (9 tests)',
  '',
  ' Test Files  4 passed (4)',
  '      Tests  43 passed (43)',
]

const REPLY =
  "Here's the plan: frost the panel with **macOS vibrancy**, keep the text dark and a little heavier so it reads on glass, and give every step its own small animation. The tests pass, and I put a screenshot of the deploy in your tray."

/**
 * A made-up request with every kind of step, for seeing the panel's animations without calling the API:
 * thinking, a web search, a page read, a folder listing, a file read, a command with output, a screenshot, and a streamed reply.
 */
export async function playDemo(s: DemoStage): Promise<void> {
  const wait = (ms: number) =>
    new Promise<void>((resolve, reject) => {
      if (s.signal.aborted) return reject(new Error('stopped'))
      const timer = setTimeout(resolve, ms)
      s.signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timer)
          reject(new Error('stopped'))
        },
        { once: true },
      )
    })

  let step = s.start('thinking')
  await wait(1400)
  s.finish(step, true)

  step = s.start('search-web')
  await wait(400)
  s.update(step, { target: 'liquid glass panel design' })
  await wait(1300)
  s.finish(step, true, { results: ['developer.apple.com', 'dribbble.com', 'mobbin.com', 'css-tricks.com'] })

  step = s.start('fetch-page', 'https://developer.apple.com/design/human-interface-guidelines/materials')
  await wait(1600)
  s.finish(step, true)

  step = s.start('list-files', 'src/renderer/')
  await wait(900)
  s.finish(step, true, { results: ['src/', 'index.html'] })

  step = s.start('read-file', 'src/renderer/src/styles.css')
  await wait(1200)
  s.finish(step, true)

  step = s.start('run-command', 'npm test')
  await wait(500)
  for (const line of TEST_OUTPUT) {
    s.emit({ type: 'output', activityId: step.id, command: 'npm test', chunk: `${line}\n` })
    await wait(160)
  }
  s.emit({ type: 'output', activityId: step.id, command: 'npm test', exitCode: 0, text: TEST_OUTPUT.join('\n') })
  s.finish(step, true)

  step = s.start('screenshot', 'vercel.com/haven')
  await wait(900)
  s.finish(step, true, { image: await s.addScreenshot() })
  await wait(1000)

  step = s.start('thinking')
  await wait(700)
  s.finish(step, true)

  s.mood('talking')
  for (const word of REPLY.split(' ')) {
    s.emit({ type: 'text', delta: `${word} ` })
    await wait(45 + Math.random() * 45)
  }
}
