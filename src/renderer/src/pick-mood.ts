import type { Mood } from '../../shared/types'

/** After midnight and before 5am, Steward is sleepy. */
export const isLateNight = (now: Date) => now.getHours() < 5

/** The reactions that outrank you typing: what needs you, and what just happened. The rest only says what's going on. */
const LOUD: ReadonlySet<Mood> = new Set(['mad', 'needs-you', 'confused', 'celebrating', 'proud', 'done', 'nod', 'hello'])

/**
 * What the face shows, most pressing first: the chat itself, a deploy that just failed, an approval waiting, the other
 * reactions that need you or just happened (main/reactions.ts ranks them), you typing, Overnight Watch, what's going on
 * (chats working, a lingering worry), the hour, and otherwise resting or idle.
 */
export function pickMood(s: { agentMood: Mood | null; eventMood: Mood | null; listening: boolean; waiting: boolean; lateNight: boolean; tucked: boolean; watching?: boolean }): Mood {
  if (s.agentMood) return s.agentMood
  if (s.eventMood === 'mad') return 'mad'
  if (s.waiting) return 'needs-you'
  if (s.eventMood && LOUD.has(s.eventMood)) return s.eventMood
  if (s.listening) return 'listening'
  // Watching overnight it keeps a half-lidded eye on things, chats working or not.
  if (s.watching) return 'watching'
  if (s.eventMood) return s.eventMood
  if (s.lateNight) return 'sleepy'
  return s.tucked ? 'resting' : 'idle'
}
