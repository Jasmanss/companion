import { useEffect, useRef } from 'react'
import type { AlertView, Mood } from '../../shared/types'
import { Face } from './Face'
import { CloseIcon } from './icons'

const STAY_MS = 10_000

/** Peeking out with a message. Never takes focus; a click opens the panel. Tucks back in after a while unless hovered. */
export function Nudge({
  alerts,
  mood,
  onOpen,
  onDismiss,
  onAction,
}: {
  alerts: AlertView[]
  mood: Mood
  onOpen: () => void
  onDismiss: () => void
  onAction: (alert: AlertView) => void
}) {
  const hovered = useRef(false)
  const lead = alerts[0]

  useEffect(() => {
    const timer = setInterval(() => {
      if (!hovered.current) onDismiss()
    }, STAY_MS)
    return () => clearInterval(timer)
  }, [alerts, onDismiss])

  if (!lead) return null
  const more = alerts.length - 1
  return (
    <div
      className={`nudge ${lead.level}`}
      data-app
      role="button"
      tabIndex={-1}
      onClick={onOpen}
      onMouseEnter={() => (hovered.current = true)}
      onMouseLeave={() => (hovered.current = false)}
    >
      <Face mood={mood} width={50} height={44} />
      <div className="nudge-text">
        <span className="nudge-title">{lead.title}</span>
        {lead.detail && <span className="nudge-detail">{lead.detail}</span>}
        {more > 0 && <span className="nudge-more">and {more} more</span>}
        {lead.action && (
          <button
            className="chip nudge-action"
            onClick={(e) => {
              e.stopPropagation()
              onAction(lead)
            }}
          >
            {lead.action.label}
          </button>
        )}
      </div>
      <button
        className="nudge-close"
        aria-label="Tuck away"
        onClick={(e) => {
          e.stopPropagation()
          onDismiss()
        }}
      >
        <CloseIcon />
      </button>
    </div>
  )
}
