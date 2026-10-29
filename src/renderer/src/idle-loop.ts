// The idle loop, in the panel's page (the rule is shared/idle-loop): one timer, set for the next move or the end of
// this one, never a poll. The move it gives goes into the mood the panel shows and tells the notch.
import { useEffect, useRef, useState } from 'react'
import { IDLE_START, idleStep, isIdleMove, movePlays, type IdleInput, type IdleMove, type IdleState } from '../../shared/idle-loop'
import type { Mood } from '../../shared/types'

/** The move playing now, or null. Anything in the input changing looks again; the face or an alert changing starts the quiet over. */
export function useIdleMove(o: Omit<IdleInput, 'quietSince'>): IdleMove | null {
  const [move, setMove] = useState<IdleMove | null>(null)
  const loop = useRef<IdleState>(IDLE_START)
  const quiet = useRef({ key: '', since: 0 })
  const { liveliness, mood, spot, reduced, dimmed, alertOut } = o
  useEffect(() => {
    const key = `${mood}|${alertOut}`
    if (quiet.current.key !== key) quiet.current = { key, since: Date.now() }
    let timer: ReturnType<typeof setTimeout> | undefined
    const look = () => {
      const now = Date.now()
      const step = idleStep(loop.current, now, Math.random, { liveliness, mood, spot, reduced, dimmed, alertOut, quietSince: quiet.current.since })
      loop.current = step.state
      setMove(step.move)
      const { until, at } = step
      if (until !== null)
        timer = setTimeout(() => {
          setMove(null)
          if (at !== null) timer = setTimeout(look, at - Date.now())
        }, until - now)
      else if (at !== null) timer = setTimeout(look, at - now)
    }
    look()
    return () => clearTimeout(timer)
  }, [liveliness, mood, spot, reduced, dimmed, alertOut])
  return move
}

/** The face under the idle loop's moves: the mood itself, or, while a move plays, the one before it. */
export function useCalm(mood: Mood): Mood {
  const [calm, setCalm] = useState(mood)
  if (!isIdleMove(mood) && mood !== calm) setCalm(mood)
  return isIdleMove(mood) ? calm : mood
}

/** The face to show where moves are sent rather than picked (the notch): the move while it plays (movePlays), or the calm face. */
export function useMoveShown(mood: Mood, calm: Mood, free: boolean): Mood {
  const [seen, setSeen] = useState({ mood, plays: false })
  const plays = movePlays(seen, mood, free)
  if (seen.mood !== mood || plays !== seen.plays) setSeen({ mood, plays })
  return plays ? mood : calm
}
