import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { NUDGE_WIDTH } from '../../shared/steward'
import type { AlertView } from '../../shared/types'
import { CloseIcon } from './icons'

const STAY_MS = 10_000

/** It tucks back in after a while, unless the cursor is on it. Gives the handlers that say whether it is. */
function useStay(alerts: AlertView[], onDismiss: () => void) {
  const hovered = useRef(false)
  useEffect(() => {
    const timer = setInterval(() => {
      if (!hovered.current) onDismiss()
    }, STAY_MS)
    return () => clearInterval(timer)
  }, [alerts, onDismiss])
  return { onMouseEnter: () => (hovered.current = true), onMouseLeave: () => (hovered.current = false) }
}

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
  const stay = useStay(alerts, onDismiss)
  // Its words are never cut off: the window grows taller than the tab when they need it (with room above and below).
  // It's laid out at its own width, so they measure the same while the window is still widening as it slides out.
  const words = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (words.current) window.steward.dock.nudgeWords(Math.ceil(words.current.getBoundingClientRect().height) + 16)
  }, [alerts])
  const lead = alerts[0]

  if (!lead) return null
  const more = alerts.length - 1
  return (
    <div
      className={`nudge ${lead.level}`}
      style={{ width: NUDGE_WIDTH }}
      data-app
      role="button"
      tabIndex={-1}
      onClick={onOpen}
      {...stay}
    >
      {children}
      <div className="nudge-text" ref={words}>
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

/**
 * Docked in the notch, a nudge comes out under it instead (design/notch.html, "A nudge"): a black shape just under the
 * menu bar line, joined to the notch's chin by concave corners, with one line of text under the chin. The notch window
 * above it is the character, so there's no Pill here. A click opens the panel (an alert's action is on its banner
 * there); the cross, shown while the cursor is on it, tucks it away. Coming out and going back are in styles.css.
 */
/**
 * Whether the page has drawn a frame since this came. The nudge under the notch comes in a window that was hidden, and
 * a page that isn't drawn keeps an old clock: an entrance started before its first frame would be partly over by then,
 * or wholly. Held until that frame, it plays from its start.
 */
function useDrawn(): boolean {
  const [drawn, setDrawn] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setDrawn(true))
    return () => cancelAnimationFrame(frame)
  }, [])
  return drawn
}

export function NotchNudge({
  alerts,
  notchWidth,
  lit,
  onOpen,
  onDismiss,
}: {
  alerts: AlertView[]
  /** The notch's width: the chin the shape joins is this wide, in the middle. */
  notchWidth: number
  /** The color the eyes glow in, for the title. */
  lit: string
  onOpen: () => void
  onDismiss: () => void
}) {
  const stay = useStay(alerts, onDismiss)
  const drawn = useDrawn()
  const lead = alerts[0]
  if (!lead) return null
  const more = alerts.length - 1
  const line = lead.detail ? `${lead.title} · ${lead.detail}` : lead.title
  return (
    <div
      className={`notch-nudge ${lead.level}${drawn ? '' : ' wait'}`}
      data-app
      role="button"
      tabIndex={-1}
      title={more > 0 ? `${line} (and ${more} more)` : line}
      style={{ '--neck': `${notchWidth}px`, '--lit': lit } as CSSProperties}
      onClick={onOpen}
      {...stay}
    >
      <i className="nn-fil l" />
      <i className="nn-fil r" />
      <i className="nn-side l" />
      <i className="nn-mid" />
      <i className="nn-side r" />
      <div className="nn-line">
        <span className="nn-text">
          <b>{lead.title}</b>
          {lead.detail && ` · ${lead.detail}`}
        </span>
        {more > 0 && <span className="nn-more">and {more} more</span>}
      </div>
      <button
        className="nn-close"
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
