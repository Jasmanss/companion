import { useEffect, useState } from 'react'
import type { WatchView } from '../../shared/types'
import { CloseIcon, GlobeIcon, LogsIcon, MoonIcon, PlugIcon, TerminalIcon } from './icons'

const api = () => window.steward

const message = (err: unknown) => (err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err))

/** "11:10 PM". */
export const clock = (at: number) => new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

/** The words for what there is to watch tonight. */
function sessionsLine(plan: WatchView['plan']): string {
  const working = plan.working.length ? `${plan.working.length} working now: ${plan.working.join(', ')}` : 'None working now. Any you start tonight are noted.'
  return plan.waiting ? `${working} · ${plan.waiting} waiting on you` : working
}

/** The words for CI on main: the projects on GitHub, or why there are none. */
const ciLine = (ci: string[] | null) =>
  ci === null ? "None: gh isn't installed, so Steward can't see GitHub." : ci.length ? `${ci.join(', ')} (GitHub)` : 'None: no project is on GitHub.'

const macLine = (onBattery: boolean) =>
  onBattery ? 'On battery. Plug it in for the night, and keep the lid open: a closed lid sleeps it.' : 'Plugged in. Keep the lid open: a closed lid sleeps it.'

/**
 * Overnight Watch in the panel. Not watching: the goodnight card, what Steward can see tonight, the wake time and Go
 * rest, and the last night's report. Watching: since when, until when, and Stop watching or I'm up. The night is written
 * down and reported in the morning; calls and texts come later, and the card says so.
 */
export function GoodnightCard({ view, onClose, onReport, onError }: { view: WatchView; onClose: () => void; onReport: (id: string) => void; onError: (message: string) => void }) {
  const [wake, setWake] = useState(view.wakeTime)
  const [busy, setBusy] = useState(false)
  // Go rest was just pressed: "Goodnight. I've got it.", then Steward tucks away.
  const [said, setSaid] = useState(false)
  useEffect(() => setWake(view.wakeTime), [view.wakeTime])
  useEffect(() => {
    if (!said) return
    const t = setTimeout(() => {
      setSaid(false)
      void api().dock.collapse()
    }, 1600)
    return () => clearTimeout(t)
  }, [said])

  const run = (work: Promise<unknown>, after?: () => void) => {
    setBusy(true)
    work.then(
      () => {
        setBusy(false)
        after?.()
      },
      (err: unknown) => {
        setBusy(false)
        onError(message(err))
      },
    )
  }

  if (view.watching && view.since && view.until) {
    const nothing = view.plan.waiting ? `${view.plan.waiting} waiting on you.` : 'Nothing needs you.'
    return (
      <section className="card goodnight watching" aria-label="Overnight Watch">
        <header className="card-head">
          <span className="gn-title">
            <span className="gn-dot" aria-hidden="true" />
            {said ? "Goodnight. I've got it." : `Watching since ${clock(view.since)}`}
          </span>
        </header>
        <p className="gn-sub muted small">
          Until {clock(view.until)} · the Mac stays awake{view.onBattery ? ' · on battery, so it may still sleep' : ''}
        </p>
        <p className="gn-sub small">
          {view.plan.working.length ? `${view.plan.working.length} ${view.plan.working.length === 1 ? 'session' : 'sessions'} working. ` : ''}
          {nothing}
        </p>
        <div className="rv-buttons">
          <button className="btn" disabled={busy} onClick={() => run(api().watch.stop('stopped'))}>
            Stop watching
          </button>
          <button className="btn primary" disabled={busy} onClick={() => run(api().watch.stop('up'), onClose)}>
            I'm up
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="card goodnight" aria-label="Goodnight">
      <header className="card-head">
        <span className="gn-title">
          <MoonIcon />
          Goodnight
        </span>
        <button className="icon-btn" aria-label="Close" title="Close" onClick={onClose}>
          <CloseIcon />
        </button>
      </header>
      <p className="gn-sub muted small">
        Here's what I'll watch tonight.
        {view.lastNight && (
          <>
            {' '}
            <button className="rv-link" onClick={() => onReport(view.lastNight!)}>
              The last night's report
            </button>
          </>
        )}
      </p>
      <ul className="gn-list">
        <li>
          <TerminalIcon />
          <span>
            Claude Code sessions<small>{sessionsLine(view.plan)}</small>
          </span>
        </li>
        <li>
          <GlobeIcon />
          <span>
            Deploys<small>{view.plan.deploys.length ? `${view.plan.deploys.join(', ')} (Vercel)` : 'None: no project is linked to Vercel.'}</small>
          </span>
        </li>
        <li>
          <LogsIcon />
          <span>
            CI on main<small>{ciLine(view.plan.ci)}</small>
          </span>
        </li>
        <li className={view.onBattery ? 'warn' : ''}>
          <PlugIcon />
          <span>
            Mac<small>{macLine(view.onBattery)}</small>
          </span>
        </li>
      </ul>
      <label className="gn-wake">
        <span>Wake me no later than</span>
        <input type="time" value={wake} required onChange={(e) => setWake(e.target.value)} onBlur={() => wake && void api().watch.setWakeTime(wake)} aria-label="Wake time" />
      </label>
      <p className="gn-sub muted small">Alerts wait while you're away, and in the morning there's a report of the night. Calls and texts come later.</p>
      <div className="gn-foot">
        <span className="muted small">Nothing is ever approved for you.</span>
        <button className="btn primary" disabled={busy || !wake} onClick={() => run(api().watch.start(wake), () => setSaid(true))}>
          Go rest
        </button>
      </div>
    </section>
  )
}
