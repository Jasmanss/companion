import type { LeftOff } from '../../shared/types'
import { CloseIcon } from './icons'

export function ago(at: number, now = Date.now()): string {
  const minutes = Math.round((now - at) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  return hours < 48 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`
}

/** Branch, the last commits, what's not committed or pushed, and the last thing Claude said there. */
export function LeftOffBody({ card }: { card: LeftOff }) {
  if (!card.isGit && !card.claude) return <p className="muted small">Not a git repo, and no Claude sessions yet.</p>
  const status = [
    card.branch && `on ${card.branch}`,
    card.uncommitted.count > 0 && `${card.uncommitted.count} uncommitted`,
    card.unpushed === null ? card.isGit && 'no upstream' : card.unpushed > 0 ? `${card.unpushed} unpushed` : 'pushed',
  ].filter(Boolean)
  return (
    <>
      {status.length > 0 && <p className="leftoff-status">{status.join(' · ')}</p>}
      {card.commits.length > 0 && (
        <ul className="leftoff-commits">
          {card.commits.map((c) => (
            <li key={c.hash}>
              <code>{c.hash}</code> {c.subject} <span className="muted">· {c.when}</span>
            </li>
          ))}
        </ul>
      )}
      {card.uncommitted.files.length > 0 && (
        <p className="leftoff-files muted small">
          Changed: {card.uncommitted.files.join(', ')}
          {card.uncommitted.count > card.uncommitted.files.length && ` and ${card.uncommitted.count - card.uncommitted.files.length} more`}
        </p>
      )}
      {card.claude && (
        <blockquote className="leftoff-claude">
          <span className="muted small">Claude said {card.claude.at ? ago(card.claude.at) : ''}</span>
          <p>{card.claude.text}</p>
        </blockquote>
      )}
    </>
  )
}

export function LeftOffCard({ card, onDismiss }: { card: LeftOff; onDismiss: () => void }) {
  return (
    <section className="card" aria-label={`Where you left off in ${card.project}`}>
      <header className="card-head">
        <span>
          Where you left off · <strong>{card.project}</strong>
        </span>
        <button className="icon-btn" aria-label="Dismiss" onClick={onDismiss}>
          <CloseIcon />
        </button>
      </header>
      <LeftOffBody card={card} />
    </section>
  )
}
