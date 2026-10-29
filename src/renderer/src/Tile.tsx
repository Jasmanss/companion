// The panel's home as tiles (design/main-chat.html, Direction F, "Cards, one promoted"; the rule is rankCards in
// src/shared/cards.ts). Every block is the same tile: one heading style (small capitals with an icon and a count), one
// chip look, no bullet points. A tile comes in three sizes: small (half the width), wide, and promoted (full width,
// first, with an accent border; orange, with "Waiting on you", when it waits on you).
import { useState, type ReactNode } from 'react'
import type { Card } from '../../shared/cards'
import type { AlertView, SessionState, SessionView } from '../../shared/types'
import { ago } from './LeftOffCard'

export function Tile({ card, icon, label, count, children }: { card: Card; icon: ReactNode; label: string; count?: number; children: ReactNode }) {
  return (
    <section className={`tile ${card.size}${card.urgent ? ' urgent' : ''}`} data-card={card.kind} aria-label={label}>
      <header className="tile-head">
        {icon}
        <span>{card.urgent ? `Waiting on you · ${label}` : label}</span>
        {count ? <span className="n">{count}</span> : null}
      </header>
      {children}
    </section>
  )
}

const STATE: Record<SessionState, string> = {
  'needs-approval': 'waiting on you',
  'needs-input': 'needs input',
  working: 'working',
  finished: 'finished',
}

/** Every Claude Code session Steward has heard from, as rows (waiting ones first) with a one-line summary. A click shows where it runs, and Dismiss. */
export function SessionRows({ sessions, onDismiss }: { sessions: SessionView[]; onDismiss: (id: string) => void }) {
  const [openId, setOpenId] = useState<string | null>(null)
  if (sessions.length === 0) return <p className="tile-quiet">Quiet. Nothing needs you.</p>
  return (
    <div className="srows">
      {sessions.map((s) => {
        const open = s.id === openId
        return (
          <div key={s.id} className={`srow ${s.state}${open ? ' open' : ''}`}>
            <button className="srow-line" aria-expanded={open} onClick={() => setOpenId(open ? null : s.id)}>
              <i className="sdot" aria-hidden />
              <b>{s.name}</b>
              <span>
                {s.place && `${s.place} · `}
                {s.state === 'finished' ? `finished ${ago(s.updatedAt)}` : STATE[s.state]}
              </span>
            </button>
            {s.detail && <p className="said">{s.detail}</p>}
            {open && (
              <div className="srow-more">
                <p className="session-cwd" title={s.cwd}>
                  {s.cwd}
                </p>
                <button
                  className="chip quiet"
                  onClick={() => {
                    setOpenId(null)
                    onDismiss(s.id)
                  }}
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** Things to ask, as chips: a click puts it in the box, to send or change. */
export const TRY = ['Find 4 landing pages with bento grids', '3 dark desk-setup photos for a hero', 'Run the tests']
export function TryChips({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="chain">
      {TRY.map((t) => (
        <button key={t} className="chip" onClick={() => onPick(t)}>
          {t}
        </button>
      ))}
    </div>
  )
}

/** A build that failed: what broke, and its offer ("Want me to look?"). */
export function FailedBuild({ alert, onAction, onDismiss }: { alert: AlertView; onAction: (alert: AlertView) => void; onDismiss: () => void }) {
  return (
    <>
      <p className="tile-hl">{alert.title}</p>
      {alert.detail && <p className="muted">{alert.detail}</p>}
      <div className="chain">
        {alert.action && (
          <button className="chip primary" onClick={() => onAction(alert)}>
            {alert.action.label}
          </button>
        )}
        <button className="chip quiet" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </>
  )
}

/** Alerts that waited for the panel (a deploy, a merge), as rows. */
export function NewsRows({ alerts, onClear }: { alerts: AlertView[]; onClear: () => void }) {
  return (
    <>
      <div className="nrows">
        {alerts.map((a) => (
          <p key={a.key}>
            <b>{a.title}</b>
            {a.detail && <span> · {a.detail}</span>}
          </p>
        ))}
      </div>
      <div className="chain">
        <button className="chip quiet" onClick={onClear}>
          Clear
        </button>
      </div>
    </>
  )
}

/** A one-time note: its words, and its one button. */
export interface Note {
  text: string
  label: string
  run: () => void
}
export function NoteRows({ notes }: { notes: Note[] }) {
  return (
    <div className="nrows">
      {notes.map((n) => (
        <div key={n.text} className="note-row" role="status">
          <span>{n.text}</span>
          <button className="chip" onClick={n.run}>
            {n.label}
          </button>
        </div>
      ))}
    </div>
  )
}
