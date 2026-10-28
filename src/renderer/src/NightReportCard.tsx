import type { NightReport, ReviewView } from '../../shared/types'
import { clock } from './GoodnightCard'
import { CloseIcon } from './icons'
import { ReviewCard } from './ReviewCard'

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** What became of a review that isn't waiting any more. */
const DECIDED: Record<NightReport['reviews'][number]['status'], string> = {
  new: 'a review is waiting',
  good: 'you marked it Looks good',
  'sent-back': 'you sent it back',
  gone: 'the pictures are no longer kept',
}

/**
 * Overnight Watch's night report, the morning after Go rest: one line, when Steward couldn't see, what needed you and
 * what came of it (the urgent ones marked), what changed (Visual Review's card for each review still waiting, a line for
 * the rest), and the deploys and runs on main. Earlier night and Later night step through the nights kept.
 */
export function NightReportCard({
  report,
  pending,
  onStep,
  onDismiss,
  onOpenReview,
  onReviewDone,
  onError,
}: {
  report: NightReport
  /** The reviews waiting for a decision now: the night's ones show as their cards. */
  pending: ReviewView[]
  onStep: (id: string) => void
  onDismiss: () => void
  onOpenReview: (id: string) => void
  onReviewDone: (text: string) => void
  onError: (message: string) => void
}) {
  const changed = report.finished.length > 0 || report.reviews.length > 0
  return (
    <section className="card night-report" aria-label="Night report">
      <header className="card-head">
        <span>
          <strong>{report.title}</strong> · {report.span}
        </span>
        <button className="icon-btn" aria-label="Dismiss" onClick={onDismiss}>
          <CloseIcon />
        </button>
      </header>
      <p className="nr-summary">{report.summary}</p>
      {report.gaps.map((gap) => (
        <p key={gap} className="nr-gap small">
          {gap}
        </p>
      ))}

      {report.needed.length > 0 && (
        <>
          <h3>Needed you</h3>
          <ul className="nr-list">
            {report.needed.map((n) => (
              <li key={`${n.at}-${n.title}`} className={n.urgent ? 'urgent' : undefined}>
                <time>{clock(n.at)}</time>
                <span>
                  {n.urgent && <span className="nr-urgent">Urgent</span>}
                  {n.title}. {n.note && <span className="muted">{n.note}</span>}
                </span>
              </li>
            ))}
            {report.more.needed > 0 && <li className="muted small">And {report.more.needed} more.</li>}
          </ul>
        </>
      )}

      {changed && (
        <>
          <h3>What changed</h3>
          {report.finished.length > 0 && (
            <ul className="nr-list">
              {report.finished.map((f) => (
                <li key={`${f.at}-${f.title}`}>
                  <time>{clock(f.at)}</time>
                  <span>{f.title}.</span>
                </li>
              ))}
              {report.more.finished > 0 && <li className="muted small">And {report.more.finished} more.</li>}
            </ul>
          )}
          {report.reviews.map((r) => {
            const waiting = r.status === 'new' ? pending.find((p) => p.id === r.id) : undefined
            if (waiting) return <ReviewCard key={r.id} review={waiting} more={0} onOpen={() => onOpenReview(r.id)} onDone={onReviewDone} onError={onError} />
            return (
              <p key={r.id} className="nr-review small">
                <time>{clock(r.at)}</time> {r.title}: {DECIDED[r.status]}.{r.said && <span className="muted"> Claude says: {r.said}</span>}
              </p>
            )
          })}
        </>
      )}

      {(report.deploys.length > 0 || report.ci.length > 0) && (
        <>
          <h3>{report.ci.length ? (report.deploys.length ? 'Deploys and CI' : 'CI on main') : 'Deploys'}</h3>
          {report.deploys.map((d) => {
            const failed = d.runs.filter((r) => !r.ok).length
            const out = d.runs.length - failed
            return (
              <div key={d.project} className="nr-deploys">
                <span className="muted small">
                  {d.project}: {out ? `${plural(out, 'deploy')} went out` : 'none went out'}
                  {failed ? `, ${failed} failed` : ''}
                </span>
                <div className="nr-strip" aria-hidden="true">
                  {d.runs.map((r) => (
                    <i key={r.at} className={r.ok ? '' : 'bad'} title={`${clock(r.at)}: ${r.production ? 'production ' : ''}${r.ok ? 'went out' : 'failed'}`} />
                  ))}
                </div>
              </div>
            )
          })}
          {report.ci.map((c) => {
            const red = c.runs.filter((r) => !r.ok).length
            return (
              <div key={`ci-${c.project}`} className="nr-deploys">
                <span className="muted small">
                  {c.project} CI on main: {plural(c.runs.length - red, 'run')} passed{red ? `, ${red} failed` : ''}
                </span>
                <div className="nr-strip" aria-hidden="true">
                  {c.runs.map((r) => (
                    <i key={r.at} className={r.ok ? '' : 'bad'} title={`${clock(r.at)}: ${r.workflow} ${r.ok ? 'passed' : 'failed'}`} />
                  ))}
                </div>
              </div>
            )
          })}
        </>
      )}

      {(report.earlier || report.later) && (
        <div className="nr-steps">
          <button className="chip" disabled={!report.earlier} onClick={() => report.earlier && onStep(report.earlier)}>
            Earlier night
          </button>
          <button className="chip" disabled={!report.later} onClick={() => report.later && onStep(report.later)}>
            Later night
          </button>
        </div>
      )}
    </section>
  )
}
