import { useState } from 'react'
import type { SessionState, SessionView } from '../../shared/types'

const LABEL: Record<SessionState, string> = {
  'needs-approval': 'waiting on you',
  'needs-input': 'needs input',
  working: 'working',
  finished: 'finished',
}

function ago(at: number): string {
  const minutes = Math.round((Date.now() - at) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  return `${Math.round(minutes / 60)}h ago`
}

/** Every Claude Code session Companion has heard from, waiting ones first. */
export function SessionStrip({ sessions, onDismiss }: { sessions: SessionView[]; onDismiss: (id: string) => void }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const open = sessions.find((s) => s.id === openId)
  if (sessions.length === 0) return null

  return (
    <section className="sessions" aria-label="Claude Code sessions">
      <ul className="session-chips">
        {sessions.map((s) => (
          <li key={s.id}>
            <button className={`session-chip ${s.state} ${s.id === openId ? 'on' : ''}`} onClick={() => setOpenId(s.id === openId ? null : s.id)} aria-expanded={s.id === openId}>
              <span className="session-dot" aria-hidden />
              <span className="session-name">{s.name}</span>
              <span className="session-state">{s.state === 'finished' ? `finished ${ago(s.updatedAt)}` : LABEL[s.state]}</span>
            </button>
          </li>
        ))}
      </ul>
      {open && (
        <div className="session-detail">
          {open.detail && <p className="session-detail-text">{open.detail}</p>}
          <p className="session-cwd" title={open.cwd}>
            {open.cwd}
          </p>
          <button
            className="chip quiet"
            onClick={() => {
              setOpenId(null)
              onDismiss(open.id)
            }}
          >
            Dismiss
          </button>
        </div>
      )}
    </section>
  )
}
