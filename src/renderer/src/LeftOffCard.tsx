import type { LeftOff } from '../../shared/types'

export function ago(at: number, now = Date.now()): string {
  const minutes = Math.round((now - at) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  return hours < 48 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`
}

/** Where the branch stands: what's not committed or pushed. */
function standing(card: LeftOff): string[] {
  return [
    card.uncommitted.count > 0 && `${card.uncommitted.count} uncommitted`,
    card.unpushed === null ? card.isGit && 'no upstream' : card.unpushed > 0 ? `${card.unpushed} unpushed` : 'pushed',
  ].filter((s): s is string => !!s)
}

/**
 * Where you left off, in full: the branch and where it stands, the last two commits as a short timeline (no bullets),
 * what's changed and not committed, and the last thing Claude said there.
 */
export function LeftOffBody({ card }: { card: LeftOff }) {
  if (!card.isGit && !card.claude) return <p className="muted small">Not a git repo, and no Claude sessions yet.</p>
  const status = standing(card)
  return (
    <>
      {(card.branch || status.length > 0) && (
        <p className="tile-hl">
          {card.branch ? `On ${card.branch}` : 'Here'}
          {status.length > 0 && `, ${status.join(', ')}`}.
        </p>
      )}
      {card.commits.length > 0 && (
        <div className="timeline">
          {card.commits.slice(0, 2).map((c) => (
            <div key={c.hash} className="tl-item">
              {c.subject}
              <small>
                {c.hash} · {c.when}
              </small>
            </div>
          ))}
        </div>
      )}
      {card.uncommitted.files.length > 0 && (
        <p className="leftoff-files muted small">
          Changed: {card.uncommitted.files.join(', ')}
          {card.uncommitted.count > card.uncommitted.files.length && ` and ${card.uncommitted.count - card.uncommitted.files.length} more`}
        </p>
      )}
      {card.claude && (
        <p className="tile-quote">
          <b>Claude said {card.claude.at ? ago(card.claude.at) : ''}:</b> {card.claude.text}
        </p>
      )}
    </>
  )
}

/** Where you left off, small: the branch, where it stands, and the last commits as short hashes. */
export function LeftOffSmall({ card }: { card: LeftOff }) {
  const status = standing(card)
  return (
    <>
      <div className="tile-big">{card.branch ?? card.project}</div>
      {status.length > 0 && <p className="muted small">{status.join(' · ')}</p>}
      {card.commits.length > 0 && (
        <div className="chain">
          {card.commits.slice(0, 3).map((c) => (
            <code key={c.hash} className="hash" title={`${c.subject} · ${c.when}`}>
              {c.hash.slice(0, 5)}
            </code>
          ))}
        </div>
      )}
    </>
  )
}
