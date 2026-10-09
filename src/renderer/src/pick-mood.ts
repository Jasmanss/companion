import type { Mood } from '../../shared/types'

/** After midnight and before 5am, Companion is sleepy. */
export const isLateNight = (now: Date) => now.getHours() < 5

/**
 * What the face shows, most pressing first: the chat itself, a short event mood (celebrating, done), you typing,
 * sessions waiting on you, a lingering worry, the hour, and otherwise resting or idle.
 */
export function pickMood(s: { agentMood: Mood | null; eventMood: Mood | null; listening: boolean; waiting: boolean; lateNight: boolean; tucked: boolean }): Mood {
  if (s.agentMood) return s.agentMood
  if (s.eventMood && s.eventMood !== 'worried') return s.eventMood
  if (s.listening) return 'listening'
  if (s.waiting) return 'needs-you'
  if (s.eventMood) return s.eventMood
  if (s.lateNight) return 'sleepy'
  return s.tucked ? 'resting' : 'idle'
}
