import { useEffect, useState, type CSSProperties } from 'react'
import { addressLabel, reviewNote } from '../../shared/review'
import type { ReviewProblem, ReviewView } from '../../shared/types'
import { CloseIcon } from './icons'

const api = () => window.steward

const message = (err: unknown) => (err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err))

/** A page this much taller (in pixels) is worth a word. */
const TALLER_BY = 40

/**
 * Visual Review: the page as it was and as it is now, with a slider, and the two buttons that are the whole decision.
 * Looks good marks it reviewed. Send it back asks what should change, then copies a note for the session.
 */
export function ReviewCard({
  review,
  more,
  onLater,
  onDone,
  onError,
}: {
  review: ReviewView
  /** How many more reviews wait behind this one. */
  more: number
  /** Hide it until the panel is opened again. */
  onLater: () => void
  /** A decision was made: say what happened. */
  onDone: (text: string) => void
  onError: (message: string) => void
}) {
  const [x, setX] = useState(55)
  const [asking, setAsking] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const taller = review.heightBefore !== null && review.heightAfter > review.heightBefore + TALLER_BY

  const decide = (work: Promise<unknown>, done: string) => {
    setBusy(true)
    work.then(
      () => onDone(done),
      (err: unknown) => {
        setBusy(false)
        onError(message(err))
      },
    )
  }

  return (
    <section className="card review" aria-label={`What changed in ${review.project}`}>
      <header className="card-head">
        <span>
          What changed in <strong>{review.project}</strong>
        </span>
        <span className="rv-actions">
          <span className="chip">{addressLabel(review.address)}</span>
          <button className="icon-btn" aria-label="Look at this later" title="Later: it comes back when you open the panel again" onClick={onLater}>
            <CloseIcon />
          </button>
        </span>
      </header>

      <div className="rv-ba" style={{ '--x': `${x}%` } as CSSProperties}>
        {review.before && (
          <div className="rv-layer">
            <img src={review.before} alt="The page before" draggable={false} />
          </div>
        )}
        <div className={`rv-layer${review.before ? ' rv-after' : ''}`}>
          <img src={review.after} alt="The page now" draggable={false} />
        </div>
        {review.before && <span className="rv-tag b">Before</span>}
        <span className="rv-tag a">{review.before ? 'After' : 'Now'}</span>
        {review.before && (
          <>
            <div className="rv-bar" />
            <input type="range" min={5} max={95} value={x} onChange={(e) => setX(Number(e.target.value))} aria-label="Slide to compare the page before and after" />
            <div className="rv-ring" />
          </>
        )}
      </div>

      <p className="rv-facts muted small">
        {review.beforeFrom === 'none' && 'There is no earlier picture of this page, so only how it looks now is shown. '}
        {review.beforeFrom === 'last-look' && 'The before picture is from the last time Steward looked, not from when you sent the prompt. '}
        {taller && `The page is taller now (${review.heightAfter} px, was ${review.heightBefore} px): this shows the top. `}
        <button className="rv-link" onClick={() => api().review.openFull(review.id, 'after').catch((err: unknown) => onError(message(err)))}>
          Full image
        </button>
        {more > 0 && ` · ${more} more to look at`}
      </p>

      {asking ? (
        <div className="rv-send">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What should change?" rows={3} autoFocus aria-label="What should change?" />
          <pre className="rv-out">{reviewNote({ project: review.project, address: review.address, note, afterFile: review.files.after, beforeFile: review.files.before })}</pre>
          <div className="rv-buttons">
            <button
              className="btn primary"
              disabled={busy}
              onClick={() => decide(api().review.sendBack(review.id, note), 'Copied. Paste it into the session; the picture is saved at the path in the note.')}
            >
              Copy note for the session
            </button>
            <button className="btn" disabled={busy} onClick={() => setAsking(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="rv-buttons">
          <button className="btn primary" disabled={busy} onClick={() => decide(api().review.markGood(review.id), 'Marked as reviewed.')}>
            Looks good
          </button>
          <button className="btn" disabled={busy} onClick={() => setAsking(true)}>
            Send it back
          </button>
        </div>
      )}
    </section>
  )
}

/** "Nothing is answering…" reads on after a colon as "nothing is answering…". */
const afterColon = (text: string) => (/^[A-Z][a-z]/.test(text) ? text[0].toLowerCase() + text.slice(1) : text)

/**
 * Visual Review couldn't see a project's page: a quiet line where the card would be, one per project, gone once a capture
 * works. Hiding one hides that message until it changes. It never peeks out.
 */
export function ReviewProblems() {
  const [problems, setProblems] = useState<ReviewProblem[]>([])
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set())
  useEffect(() => {
    api().review.problems().then(setProblems, () => {})
    return api().review.onProblems(setProblems)
  }, [])
  const keyOf = (p: ReviewProblem) => `${p.projectPath}\n${p.address}\n${p.reason}`

  return (
    <>
      {problems
        .filter((p) => !hidden.has(keyOf(p)))
        .map((p) => (
          <div className="notice review-problem" role="status" key={p.projectPath}>
            <span>
              {p.login ? (
                <>
                  <strong>Visual Review, {p.project}:</strong> {p.reason}
                </>
              ) : (
                <>
                  <strong>Couldn't photograph {p.project}:</strong> {afterColon(p.reason)}
                </>
              )}
            </span>
            <span className="rv-actions">
              <button className="chip" onClick={() => api().settings.open('projects')}>
                Settings
              </button>
              <button className="icon-btn" aria-label="Hide this message" onClick={() => setHidden(new Set(hidden).add(keyOf(p)))}>
                <CloseIcon />
              </button>
            </span>
          </div>
        ))}
    </>
  )
}
