import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { siteOf, summarize, summaryText } from '../../shared/activity'
import type { ActivityKind } from '../../shared/types'
import { foldSteps, type StepEntry } from './chat-groups'
import { CameraIcon, FileIcon, FolderIcon, GlobeIcon, ImageIcon, LogsIcon, PhotosIcon, SearchIcon, ShieldOkIcon, TerminalIcon } from './icons'

const ICONS: Record<ActivityKind, () => ReactNode> = {
  thinking: () => null,
  'read-file': FileIcon,
  'list-files': FolderIcon,
  'search-web': SearchIcon,
  'fetch-page': GlobeIcon,
  'run-command': TerminalIcon,
  screenshot: CameraIcon,
  'add-image': ImageIcon,
  'read-logs': LogsIcon,
  'search-photos': PhotosIcon,
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Keeps something mounted for a moment after it closes, so it can leave the way it came in. */
export function usePresence(open: boolean, ms = 220): { mounted: boolean; leaving: boolean } {
  const [mounted, setMounted] = useState(open)
  useEffect(() => {
    if (open) return setMounted(true)
    const timer = setTimeout(() => setMounted(false), ms)
    return () => clearTimeout(timer)
  }, [open, ms])
  return { mounted: open || mounted, leaving: !open && mounted }
}

/** "Thinking", with a light sweeping across the letters. */
export function ThinkingRow() {
  const shine = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const el = shine.current
    if (el) el.style.setProperty('--sw', `${el.offsetWidth}px`)
  }, [])
  return (
    <div className="act think" role="status">
      <span className="shine" ref={shine}>
        <span className="base">Thinking</span>
        <span className="win" aria-hidden="true">
          <span className="lit">Thinking</span>
        </span>
      </span>
    </div>
  )
}

/** A steady color per site for its little letter badge (no favicons are fetched). */
function siteColor(site: string): string {
  let h = 0
  for (const ch of site) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return `hsl(${h % 360} 55% 42%)`
}

const stagger = (i: number): CSSProperties => ({ animationDelay: `${i * 0.12}s` })

/** How many found sites are dealt out as cards; the chips under them name all of them. */
const DEALT = 5

/**
 * Searching the web: a little deck of pages flips while it searches (the top page slides off and goes to the back).
 * Then the sites it found are dealt out as cards, one at a time, and named in chips underneath.
 */
function SearchDeck({ running, sites }: { running: boolean; sites: string[] }) {
  const dealt = sites.slice(0, DEALT)
  if (!running && !sites.length) return null
  return (
    <>
      <span className="deck" aria-hidden="true">
        {running
          ? // Each card is one third of the loop apart: one in front, one in the middle, one at the back.
            [0, 1.4, 0.7].map((lag) => (
              <span key={lag} className="deck-card" style={{ animationDelay: `-${lag}s` }}>
                <i /><i /><i /><i />
              </span>
            ))
          : dealt.map((site, i) => (
              <span key={site} className="deck-card dealt" style={{ '--i': i } as CSSProperties}>
                <span className="fav" style={{ background: siteColor(site) }}>
                  {site[0]?.toUpperCase()}
                </span>
                <i /><i />
              </span>
            ))}
      </span>
      {!running && (
        <span className="doms">
          {sites.map((site, i) => (
            <span key={site} className="dom" style={{ animationDelay: `${0.35 + dealt.length * 0.15 + i * 0.08}s` }}>
              <span className="fav" style={{ background: siteColor(site) }}>
                {site[0]?.toUpperCase()}
              </span>
              {site}
            </span>
          ))}
        </span>
      )}
    </>
  )
}

/** Command output: the last lines tick in, with a ✓ or ✗ exit badge at the end. */
function Terminal({ step }: { step: StepEntry }) {
  const lines = (step.output ?? '').replace(/\n+$/, '').split('\n')
  const shown = step.output ? lines.slice(-8) : []
  const first = lines.length - shown.length
  const ended = step.exitCode !== undefined
  const ok = step.exitCode === 0 && step.activity.status === 'done'
  return (
    <>
      <div className="term">
        <div>
          <span className="p">$</span> {step.activity.target}
          {!ended && step.activity.status === 'running' && <span className="tcur" />}
        </div>
        {shown.map((line, i) => (
          <div key={first + i} className={`ol ${/✓|\bpass(ed)?\b/i.test(line) ? 'g' : /✗|×|\bfail(ed)?\b|\berror\b/i.test(line) ? 'r' : /^\s*>/.test(line) ? 'd' : ''}`}>
            {line || ' '}
          </div>
        ))}
        {step.activity.status !== 'running' && <span className={`exit ${ok ? 'ok' : 'bad'}`}>{ok ? '✓ exit 0' : `✗ ${step.activity.detail ?? 'failed'}`}</span>}
      </div>
      {ended && lines.length > shown.length && (
        <details className="all-output">
          <summary>All output</summary>
          <pre>{step.output}</pre>
        </details>
      )}
    </>
  )
}

/** A screenshot or added image: a shutter flash, then a copy flies up into its slot in the tray. */
function Shot({ step }: { step: StepEntry }) {
  const { activity: a } = step
  const box = useRef<HTMLSpanElement>(null)
  const flown = useRef(false)
  const ready = a.status === 'done' && a.image
  useEffect(() => {
    if (!ready || flown.current) return
    // The tray already has the new thumbnail: keep it hidden until the flying copy lands on it.
    const slot = traySlot(a.image!)
    if (slot && !reducedMotion()) slot.style.opacity = '0'
    const timer = setTimeout(() => {
      flown.current = true
      if (box.current) flyToTray(box.current, a.image!)
      else if (slot) slot.style.opacity = ''
    }, a.kind === 'screenshot' ? 560 : 260)
    return () => {
      clearTimeout(timer)
      if (!flown.current && slot) slot.style.opacity = ''
    }
  }, [ready, a.image, a.kind])
  return (
    <span className={`shot ${a.kind === 'add-image' ? 'small' : ''}`} ref={box}>
      {ready ? <img src={`tray://${a.image}`} alt="" /> : <span className="pagemock" aria-hidden="true"><i /><i /><i /><i /></span>}
      {ready && a.kind === 'screenshot' && <span className="flash" aria-hidden="true" />}
    </span>
  )
}

const traySlot = (image: string) => document.querySelector<HTMLElement>(`[data-tray-id="${CSS.escape(image)}"]`)

/** Fly a copy of an element into the tray thumbnail for this image, which then lands with a small pop. */
export function flyToTray(from: HTMLElement, image: string): void {
  const slot = traySlot(image)
  if (!slot) return
  const land = () => {
    slot.classList.remove('landed')
    void slot.offsetWidth
    slot.classList.add('landed')
  }
  const a = from.getBoundingClientRect()
  const b = slot.getBoundingClientRect()
  if (reducedMotion() || !a.width || !b.width) {
    slot.style.opacity = ''
    return land()
  }
  const flyer = from.cloneNode(true) as HTMLElement
  flyer.className = 'flyer'
  flyer.querySelector('.flash')?.remove()
  Object.assign(flyer.style, { left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px` })
  document.body.append(flyer)
  slot.style.opacity = '0'
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      flyer.style.transform = `translate(${b.left - a.left}px, ${b.top - a.top}px) scale(${b.width / a.width}, ${b.height / a.height})`
    }),
  )
  setTimeout(() => {
    flyer.remove()
    slot.style.opacity = ''
    land()
  }, 640)
}

/** One step: an icon, what it's doing, its own small animation, and a spinner, ✓ or ✗. Compact rows skip the extras. */
export function ActivityRow({ step, compact = false }: { step: StepEntry; compact?: boolean }) {
  const a = step.activity
  const running = a.status === 'running'
  // A command that ran without a Run card says so, and why it could: Auto judged it safe, or it's on your list.
  const ranBy = a.kind === 'run-command' && a.ranBy ? (a.ranBy === 'auto' ? 'auto · safe' : 'on your list') : null
  const Icon = ranBy ? ShieldOkIcon : ICONS[a.kind]
  const file = a.target ?? ''
  const cut = file.lastIndexOf('/')
  const results = a.results ?? []

  let target: ReactNode = null
  let extra: ReactNode = null
  switch (a.kind) {
    case 'search-web':
      if (a.target) target = <span className="q">{a.target}</span>
      if (!compact) extra = <SearchDeck running={running} sites={results} />
      break
    case 'search-photos':
      if (a.target) target = <span className="q">{a.target}</span>
      if (results.length)
        extra = (
          <span className="photos">
            {results.map((url, i) => (
              <i key={url} style={{ ...stagger(i), backgroundImage: `url("${url}")` }} />
            ))}
          </span>
        )
      break
    case 'read-file':
      if (compact) target = <span className="tgt">{file.slice(cut + 1)}</span>
      else
        extra = (
          <span className="fchip">
            <span className="mini" aria-hidden="true">
              <i /><i /><i /><i /><i />
              {running && <span className="scan" />}
            </span>
            <span className="fn">{file.slice(cut + 1)}</span>
            <span className="fp">{file.slice(0, cut + 1)}</span>
          </span>
        )
      break
    case 'list-files':
      if (a.target) target = <span className="tgt">{a.target}</span>
      if (results.length)
        extra = (
          <span className="ents">
            {results.map((name, i) => (
              <span key={name} className="ent" style={stagger(i)}>
                {name}
              </span>
            ))}
          </span>
        )
      break
    case 'fetch-page': {
      const site = a.target ? siteOf(a.target) : ''
      if (compact) target = <span className="tgt">{site}</span>
      else if (a.target)
        extra = (
          <>
            <span className="site">
              <span className="fav" style={{ background: siteColor(site) }}>
                {site[0]?.toUpperCase()}
              </span>
              <span>{a.target.replace(/^https?:\/\/(www\.)?/, '')}</span>
            </span>
            <span className={`prog ${running ? 'busy' : 'full'}`} aria-hidden="true">
              <i className="fill" />
              <i className="shim" />
            </span>
          </>
        )
      break
    }
    case 'run-command':
      if (compact) target = <code className="tgt">{a.target}</code>
      else extra = <Terminal step={step} />
      break
    case 'screenshot':
    case 'add-image':
      if (a.target) target = <span className="tgt">{a.target}</span>
      if (!compact) extra = <Shot step={step} />
      break
    default:
      if (a.target) target = <span className="tgt">{a.target}</span>
  }

  return (
    <div className={`act ${a.status} k-${a.kind}`}>
      <span className="ai">
        <Icon />
      </span>
      <span className="at">
        <span className="l">
          <b className="lab">{ranBy ? (a.status === 'running' ? 'Running automatically' : 'Ran automatically') : a.label}</b>
          {ranBy && <span className={`ran-by ${a.ranBy}`}>{ranBy}</span>}
          {target}
          {a.status === 'failed' && a.detail && a.kind !== 'run-command' && <span className="fail-why">{a.detail}</span>}
        </span>
        {!compact && extra}
      </span>
      <span className="st" aria-label={running ? 'working' : a.status === 'done' ? 'done' : 'failed'}>
        {running ? <i className="spin" /> : <b>{a.status === 'done' ? '✓' : '✗'}</b>}
      </span>
    </div>
  )
}

/**
 * Steps in a row. Each shows in full while it runs and for a moment after, then folds into one quiet line,
 * "Read 3 files · Searched the web · Ran npm test", which opens to show them all.
 */
export function StepsGroup({ steps }: { steps: StepEntry[] }) {
  const [now, setNow] = useState(() => Date.now())
  const [open, setOpen] = useState(false)
  const { folded, live, next } = foldSteps(steps, now)
  const list = usePresence(open && folded.length > 0)

  useEffect(() => {
    if (next === null) return
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, next - Date.now()) + 30)
    return () => clearTimeout(timer)
  }, [next])

  const parts = summarize(folded.map((s) => s.activity))
  return (
    <div className="steps-group">
      {folded.length > 0 && (
        <>
          <button className="summary" aria-expanded={open} onClick={() => setOpen(!open)} title={summaryText(folded.map((s) => s.activity))}>
            <span className="chev" aria-hidden="true">
              ›
            </span>
            <span>
              {parts.map((p, i) => (
                <span key={i}>
                  {i > 0 && ' · '}
                  <span className={p.failed ? 'bad' : undefined}>
                    {p.text}
                    {p.failed && ' ✗'}
                  </span>
                </span>
              ))}
            </span>
          </button>
          {list.mounted && (
            <div className={`steps ${list.leaving ? 'leaving' : ''}`}>
              {folded.map((s, i) => (
                <div key={s.id} className="step-in" style={{ animationDelay: `${i * 0.04}s` }}>
                  <ActivityRow step={s} compact />
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {live.map((s) => (
        <ActivityRow key={s.id} step={s} />
      ))}
    </div>
  )
}
