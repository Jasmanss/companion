import { useEffect, useState, type CSSProperties } from 'react'
import { addressLabel, filesChangedLabel, reviewNote } from '../../shared/review'
import type { ReviewCheck, ReviewProblem, ReviewView } from '../../shared/types'
import { CloseIcon, SearchIcon } from './icons'

const api = () => window.steward

const message = (err: unknown) => (err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err))

/** A page this much taller (in pixels) is worth a word. */
const TALLER_BY = 40

/**
 * Visual Review: the page as it was and as it is now, with a slider, and the two buttons that are the whole decision.
 * Looks good marks it reviewed. Send it back asks what should change, then copies a note for the session. Open big
 * shows the whole page before and after in the big viewer, and what Claude said it did sits under the picture.
 */
export function ReviewCard({
  review,
  more,
  onOpen,
  onLater,
  onDone,
  onError,
}: {
  review: ReviewView
  /** How many more reviews wait behind this one. */
  more: number
  /** Open the big viewer on this review. */
  onOpen: () => void
  /** Hide it until the panel is opened again. Without it (inside the night report) there's no Later. */
  onLater?: () => void
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
          {onLater && (
            <button className="icon-btn" aria-label="Look at this later" title="Later: it comes back when you open the panel again" onClick={onLater}>
              <CloseIcon />
            </button>
          )}
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
        {/* The slider takes drags on the picture, so its corner opens it big. With no before, all of it does. */}
        <button className={`rv-open${review.before ? '' : ' all'}`} onClick={onOpen} aria-label="Open the before and after big" title="Open big">
          <span>
            <SearchIcon />
            Open big
          </span>
        </button>
      </div>

      {review.said && (
        <p className="rv-said" title={review.said}>
          <b>Claude says:</b> {review.said}
        </p>
      )}

      <p className="rv-facts muted small">
        {review.filesChanged !== null && <span className="chip rv-files">{filesChangedLabel(review.filesChanged)}</span>}
        {review.beforeFrom === 'none' && 'There is no earlier picture of this page, so only how it looks now is shown. '}
        {review.beforeFrom === 'last-look' && 'The before picture is from the last time Steward looked, not from when you sent the prompt. '}
        {taller && `The page is taller now (${review.heightAfter} px, was ${review.heightBefore} px): this shows the top. `}
        <button className="rv-link" onClick={onOpen}>
          Open big
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

/** "2:41 PM": when a check happened, today. */
const clock = (at: number) => new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

/**
 * Visual Review's quiet lines, where the cards go: a project whose page couldn't be seen (gone once a capture works), and
 * a project checked after a turn with no visible change (replaced by its next check or card), so a check is never silent.
 * One line per project of each kind. Hiding one hides that line until it changes. They never peek out.
 */
export function ReviewProblems() {
  const [problems, setProblems] = useState<ReviewProblem[]>([])
  const [checks, setChecks] = useState<ReviewCheck[]>([])
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set())
  useEffect(() => {
    api().review.problems().then(setProblems, () => {})
    api().review.checks().then(setChecks, () => {})
    const offProblems = api().review.onProblems(setProblems)
    const offChecks = api().review.onChecks(setChecks)
    return () => {
      offProblems()
      offChecks()
    }
  }, [])
  const keyOf = (p: ReviewProblem) => `${p.projectPath}\n${p.address}\n${p.reason}`
  const checkKey = (c: ReviewCheck) => `check\n${c.projectPath}\n${c.at}`

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
      {checks
        .filter((c) => !hidden.has(checkKey(c)))
        .map((c) => (
          <div className="notice review-problem review-check" role="status" key={`check:${c.projectPath}`}>
            <span>
              Checked <strong>{c.project}</strong> after Claude finished: no visible change · {clock(c.at)}
            </span>
            <button className="icon-btn" aria-label="Hide this line" onClick={() => setHidden(new Set(hidden).add(checkKey(c)))}>
              <CloseIcon />
            </button>
          </div>
        ))}
    </>
  )
}
