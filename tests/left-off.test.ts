import { describe, expect, it } from 'vitest'
import { claudeProjectDir, GIT_COMMANDS, lastAssistantText, parseLog, parseStatus, whereYouLeftOff } from '../src/main/left-off'

describe('git output', () => {
  it('reads the last commits', () => {
    expect(parseLog('a1b2c3d\x1fFix header spacing\x1f3 hours ago\n9f8e7d6\x1fAdd pricing page\x1f2 days ago\n')).toEqual([
      { hash: 'a1b2c3d', subject: 'Fix header spacing', when: '3 hours ago' },
      { hash: '9f8e7d6', subject: 'Add pricing page', when: '2 days ago' },
    ])
  })

  it('counts uncommitted changes and lists the first few', () => {
    expect(parseStatus(' M src/app.tsx\n?? notes.md\nR  old.ts -> new.ts\n')).toEqual({ count: 3, files: ['src/app.tsx', 'notes.md', 'old.ts -> new.ts'] })
    expect(parseStatus('')).toEqual({ count: 0, files: [] })
  })
})

describe('claude session logs', () => {
  it('finds the folder Claude Code uses for a project', () => {
    expect(claudeProjectDir('/Users/me/Documents/steward', '/Users/me')).toBe('/Users/me/.claude/projects/-Users-me-Documents-steward')
    expect(claudeProjectDir('/Users/me/Library/Application Support/x.y', '/Users/me')).toBe('/Users/me/.claude/projects/-Users-me-Library-Application-Support-x-y')
  })

  it('takes the last main-thread assistant text, skipping tool calls and subagents', () => {
    const lines = [
      { type: 'assistant', timestamp: '2026-10-09T01:00:00Z', message: { content: [{ type: 'text', text: 'Older reply' }] } },
      { type: 'assistant', timestamp: '2026-10-09T02:00:00Z', message: { content: [{ type: 'text', text: 'The header is fixed;\n  next is the footer.' }] } },
      { type: 'assistant', timestamp: '2026-10-09T03:00:00Z', message: { content: [{ type: 'tool_use', name: 'Bash' }] } },
      { type: 'assistant', isSidechain: true, timestamp: '2026-10-09T04:00:00Z', message: { content: [{ type: 'text', text: 'subagent' }] } },
      { type: 'user', message: { content: 'thanks' } },
    ]
    expect(lastAssistantText(lines)).toEqual({ text: 'The header is fixed; next is the footer.', at: Date.parse('2026-10-09T02:00:00Z') })
    expect(lastAssistantText([])).toBeNull()
  })
})

describe('whereYouLeftOff', () => {
  it('runs only the fixed read-only git commands, in the project folder', async () => {
    const calls: { args: readonly string[]; cwd: string }[] = []
    const outputs = new Map<readonly string[], string>([
      [GIT_COMMANDS.branch, 'main\n'],
      [GIT_COMMANDS.log, 'a1b2c3d\x1fFix header\x1f1 hour ago\n'],
      [GIT_COMMANDS.status, ' M app.tsx\n'],
      [GIT_COMMANDS.unpushed, '2\n'],
    ])
    const card = await whereYouLeftOff(
      { name: 'Portlkit', path: '/Users/me/portlkit' },
      {
        home: '/nonexistent',
        git: async (args, cwd) => {
          calls.push({ args, cwd })
          return outputs.get(args) ?? ''
        },
      },
    )
    expect(calls.map((c) => c.args)).toEqual(Object.values(GIT_COMMANDS))
    expect(new Set(calls.map((c) => c.cwd))).toEqual(new Set(['/Users/me/portlkit']))
    expect(card).toMatchObject({ project: 'Portlkit', isGit: true, branch: 'main', unpushed: 2, uncommitted: { count: 1, files: ['app.tsx'] }, claude: null })
    expect(card.commits).toHaveLength(1)
  })

  it('copes with folders that are not repos or have no upstream', async () => {
    const card = await whereYouLeftOff({ name: 'x', path: '/tmp/x' }, { home: '/nonexistent', git: async () => Promise.reject(new Error('not a git repository')) })
    expect(card).toMatchObject({ isGit: false, branch: null, commits: [], unpushed: null, uncommitted: { count: 0, files: [] } })
  })
})
