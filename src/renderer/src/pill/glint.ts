import type { ActivityKind, Mood } from '../../../shared/types'
import type { Glint } from './eyes'

/** Reading lights the thinking dots up one at a time; searching sends them circling; anything else is the wave. */
export function glintFor(kind: ActivityKind | null): Glint {
  if (kind === 'read-file' || kind === 'list-files' || kind === 'read-logs') return 'step'
  if (kind === 'search-web' || kind === 'fetch-page' || kind === 'search-photos') return 'search'
  return 'sweep'
}

/**
 * The character mirrors what the agent is doing: while a step runs (a search in the middle of a reply, say) it
 * thinks about that, even if the words had started. Waiting for your OK, or anything else, shows as it is.
 */
export function workingMood(mood: Mood, work: ActivityKind | null): Mood {
  return work && work !== 'thinking' && mood === 'talking' ? 'thinking' : mood
}
