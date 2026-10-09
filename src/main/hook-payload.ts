import { z } from 'zod'

/** Long text is cut rather than rejected: the event still matters even if Claude wrote a lot. */
const text = (max: number) => z.string().transform((s) => (s.length > max ? `${s.slice(0, max)}…` : s))

// Unknown fields are dropped, so only what's listed here ever reaches the app.
const common = {
  session_id: z.string().min(1).max(200),
  cwd: z
    .string()
    .min(1)
    .max(4096)
    .refine((p) => p.startsWith('/'), 'cwd must be an absolute path'),
  transcript_path: z.string().max(4096).optional(),
  prompt_id: z.string().max(200).optional(),
}

export const HookPayload = z.discriminatedUnion('hook_event_name', [
  z.object({
    ...common,
    hook_event_name: z.literal('PermissionRequest'),
    tool_name: z.string().min(1).max(200),
    tool_input: z.record(z.string(), z.unknown()).optional(),
  }),
  z.object({
    ...common,
    hook_event_name: z.literal('Notification'),
    message: text(1000).optional(),
    notification_type: z.string().max(100).optional(),
  }),
  z.object({
    ...common,
    hook_event_name: z.literal('Stop'),
    last_assistant_message: text(4000).optional(),
    stop_hook_active: z.boolean().optional(),
  }),
])
export type HookPayload = z.infer<typeof HookPayload>

/** The hook's JSON body, or null if it isn't one of the events Companion understands. */
export function parseHookPayload(body: string): HookPayload | null {
  let json: unknown
  try {
    json = JSON.parse(body)
  } catch {
    return null
  }
  const parsed = HookPayload.safeParse(json)
  return parsed.success ? parsed.data : null
}
