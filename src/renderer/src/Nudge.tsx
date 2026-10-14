import { useEffect, useRef, type ReactNode } from 'react'
import type { AlertView } from '../../shared/types'
import { CloseIcon } from './icons'

const STAY_MS = 10_000

/** Peeking out with a message. Never takes focus; a click opens the panel. Tucks back in after a while unless hovered. */
export function Nudge({
  alerts,
  onOpen,
  onDismiss,
  onAction,
  children,
}: {
  alerts: AlertView[]
  onOpen: () => void
  onDismiss: () => void
  onAction: (alert: AlertView) => void
  /** The character, peeking out with it. */
  children: ReactNode
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
      {children}
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
