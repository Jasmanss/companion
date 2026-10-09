import { describe, expect, it } from 'vitest'
import { parseHookPayload } from '../src/main/hook-payload'

// Shapes captured from a real run of Claude Code in desktop mode.
const permissionRequest = {
  session_id: 'e3e2c621',
  transcript_path: '/Users/me/.claude/projects/-x/e3e2c621.jsonl',
  cwd: '/Users/me/portlkit',
  prompt_id: '92e357b1',
  permission_mode: 'default',
  hook_event_name: 'PermissionRequest',
  tool_name: 'Bash',
  tool_input: { command: 'touch hello.txt', description: 'Create hello.txt file' },
  permission_suggestions: [{ type: 'setMode', mode: 'acceptEdits', destination: 'session' }],
}

describe('parseHookPayload', () => {
  it('keeps the fields Steward uses and drops the rest', () => {
    expect(parseHookPayload(JSON.stringify(permissionRequest))).toEqual({
      session_id: 'e3e2c621',
      transcript_path: '/Users/me/.claude/projects/-x/e3e2c621.jsonl',
      cwd: '/Users/me/portlkit',
      prompt_id: '92e357b1',
      hook_event_name: 'PermissionRequest',
      tool_name: 'Bash',
      tool_input: { command: 'touch hello.txt', description: 'Create hello.txt file' },
    })
  })

  it('reads Notification and Stop events', () => {
    expect(parseHookPayload(JSON.stringify({ hook_event_name: 'Notification', session_id: 's', cwd: '/a', message: 'Claude is waiting for your input' }))).toMatchObject({
      message: 'Claude is waiting for your input',
    })
    expect(parseHookPayload(JSON.stringify({ hook_event_name: 'Stop', session_id: 's', cwd: '/a', stop_hook_active: false }))).toMatchObject({ hook_event_name: 'Stop' })
  })

  it('cuts very long text instead of rejecting the event', () => {
    const parsed = parseHookPayload(JSON.stringify({ hook_event_name: 'Stop', session_id: 's', cwd: '/a', last_assistant_message: 'x'.repeat(10_000) }))
    expect(parsed?.hook_event_name === 'Stop' && parsed.last_assistant_message?.length).toBe(4001)
  })

  it('rejects anything else', () => {
    expect(parseHookPayload('{')).toBeNull()
    expect(parseHookPayload('[]')).toBeNull()
    expect(parseHookPayload(JSON.stringify({ ...permissionRequest, hook_event_name: 'PreToolUse' }))).toBeNull()
    expect(parseHookPayload(JSON.stringify({ ...permissionRequest, session_id: '' }))).toBeNull()
    expect(parseHookPayload(JSON.stringify({ ...permissionRequest, cwd: 'relative/path' }))).toBeNull()
    expect(parseHookPayload(JSON.stringify({ ...permissionRequest, tool_name: 42 }))).toBeNull()
    expect(parseHookPayload(JSON.stringify({ ...permissionRequest, session_id: 'x'.repeat(500) }))).toBeNull()
  })
})
