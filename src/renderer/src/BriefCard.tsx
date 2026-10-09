import type { Brief } from '../../shared/types'
import { CloseIcon } from './icons'
import { LeftOffBody } from './LeftOffCard'

/** The morning brief. Links open in the browser. */
export function BriefCard({ brief, onDismiss }: { brief: Brief; onDismiss: () => void }) {
  const prs = brief.dependabot?.flatMap((p) => p.prs.map((pr) => ({ ...pr, project: p.project }))) ?? []
  return (
    <section className="card brief" aria-label="Morning brief">
      <header className="card-head">
        <span>
          <strong>{brief.greeting}</strong> · {brief.date}
        </span>
        <button className="icon-btn" aria-label="Dismiss" onClick={onDismiss}>
          <CloseIcon />
        </button>
      </header>
      <p>{brief.summary}</p>

      {brief.failed.length > 0 && (
        <>
          <h3>Broke</h3>
          <ul>
            {brief.failed.map((d) => (
              <li key={d.uid}>
                <strong>{d.project}</strong>: {d.errorMessage ?? d.commit ?? 'build failed'}
                {d.inspectorUrl && (
                  <>
                    {' '}
                    <a href={d.inspectorUrl} target="_blank" rel="noreferrer">
                      logs
                    </a>
                  </>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {brief.ready.length > 0 && (
        <>
          <h3>Deployed</h3>
          <ul>
            {brief.ready.map((d) => (
              <li key={d.uid}>
                <strong>{d.project}</strong>
                {d.target === 'production' && ' (production)'}
                {d.commit && `: ${d.commit}`}
                {d.url && (
                  <>
                    {' '}
                    <a href={`https://${d.url}`} target="_blank" rel="noreferrer">
                      open
                    </a>
                  </>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {brief.sessions.length > 0 && (
        <>
          <h3>Sessions finished</h3>
          <ul>
            {brief.sessions.map((s) => (
              <li key={s.id}>
                <strong>{s.name}</strong>
                {s.detail && `: ${s.detail}`}
              </li>
            ))}
          </ul>
        </>
      )}

      {brief.leftOff && (
        <>
          <h3>Where you left off · {brief.leftOff.project}</h3>
          <LeftOffBody card={brief.leftOff} />
        </>
      )}

      {prs.length > 0 && (
        <>
          <h3>Dependabot</h3>
          <ul>
            {prs.map((pr) => (
              <li key={pr.url}>
                <a href={pr.url} target="_blank" rel="noreferrer">
                  {pr.project} #{pr.number}
                </a>{' '}
                {pr.title}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
