import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import type { Touch } from '../../shared/activity'
import type { Project, SettingsView } from '../../shared/types'
import { badgeColors, filterProjects, tildify } from './switcher'

/** The file or folder name stays whole; its folders give way first when space runs out. */
function TouchText({ touch }: { touch: Touch }) {
  if (touch.kind === 'file' || touch.kind === 'folder') {
    const trimmed = touch.text.replace(/\/$/, '')
    const cut = trimmed.lastIndexOf('/')
    return (
      <span className="touch">
        {cut >= 0 && <span className="tdir">{trimmed.slice(0, cut + 1)}</span>}
        <span className="tname">
          {trimmed.slice(cut + 1)}
          {touch.kind === 'folder' && '/'}
        </span>
      </span>
    )
  }
  return (
    <span className={`touch t-${touch.kind}`}>
      <span className="tname">{touch.kind === 'query' ? `“${touch.text}”` : touch.text}</span>
    </span>
  )
}

/**
 * "haven › src/app/page.tsx": the current project, then what the agent is on (a file, page or command) with a live
 * dot while it works, or the last file it read when it's idle. Opens the project switcher.
 */
export function ContextPill({
  project,
  touch,
  live,
  open,
  shortcut,
  onToggle,
  pillRef,
}: {
  project: Project | null
  touch: Touch | null
  live: boolean
  open: boolean
  /** The switcher's shortcut as shown ("⌘K"), or '' when it's turned off. */
  shortcut: string
  onToggle: () => void
  pillRef: RefObject<HTMLButtonElement | null>
}) {
  return (
    <button
      ref={pillRef}
      className={`ctx ${live ? 'live' : ''}`}
      aria-haspopup="dialog"
      aria-expanded={open}
      title={shortcut ? `Switch project (${shortcut})` : 'Switch project'}
      onClick={onToggle}
    >
      <span className="dot" aria-hidden="true" />
      <span className={`proj ${project ? '' : 'none'}`}>{project?.name ?? 'No project'}</span>
      {touch && (
        <>
          <span className="sep" aria-hidden="true">
            ›
          </span>
          {/* Keyed, so each new thing fades in. */}
          <TouchText key={`${touch.kind}:${touch.text}`} touch={touch} />
        </>
      )}
      {shortcut && <kbd>{shortcut}</kbd>}
    </button>
  )
}

/** The name with the matched parts underlined. */
function Highlight({ text, hits }: { text: string; hits: [number, number][] }) {
  const parts = []
  let at = 0
  for (const [start, end] of hits) {
    if (start > at) parts.push(text.slice(at, start))
    parts.push(<mark key={start}>{text.slice(start, end)}</mark>)
    at = end
  }
  parts.push(text.slice(at))
  return <>{parts}</>
}

/**
 * The ⌘K switcher: search-as-you-type over your projects, arrow keys and Enter to switch, and "Add project…" to pick
 * a new folder. It grows out of the pill and goes back into it. A project with a Visual Review waiting has a dot.
 */
export function ProjectSwitcher({
  settings,
  anchor,
  leaving,
  reviewing,
  onPick,
  onAdd,
  onClose,
}: {
  settings: SettingsView
  anchor: RefObject<HTMLElement | null>
  leaving: boolean
  /** The projects with a review waiting for a decision. */
  reviewing?: ReadonlySet<string>
  onPick: (project: Project) => void
  onAdd: () => void
  /** refocus: put focus back on the pill (Esc), rather than leave it where the click went. */
  onClose: (refocus: boolean) => void
}) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const matches = filterProjects(settings.projects, query)
  const colors = useMemo(() => badgeColors(settings.projects), [settings.projects])
  // The last row is always "Add project…".
  const count = matches.length + 1
  const index = Math.min(selected, count - 1)

  // Sit just under the pill and grow from it.
  useLayoutEffect(() => {
    const el = box.current
    const pill = anchor.current?.getBoundingClientRect()
    const parent = el?.offsetParent?.getBoundingClientRect()
    if (!el || !pill || !parent) return
    el.style.top = `${pill.bottom - parent.top + 6}px`
    el.style.transformOrigin = `${pill.left + Math.min(pill.width / 2, 48) - el.getBoundingClientRect().left}px 0`
  }, [anchor])

  // Opened again while still on its way out: start over with an empty search.
  useEffect(() => {
    if (leaving) return
    setQuery('')
    setSelected(0)
    input.current?.focus()
  }, [leaving])

  // A click anywhere else closes it; the pill toggles it itself.
  useEffect(() => {
    if (leaving) return
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (!box.current?.contains(target) && !anchor.current?.contains(target)) onClose(false)
    }
    window.addEventListener('pointerdown', onDown, true)
    return () => window.removeEventListener('pointerdown', onDown, true)
  }, [anchor, leaving, onClose])

  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [index, query])

  const choose = (i: number) => (i === matches.length ? onAdd() : onPick(matches[i].project))

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected((index + (e.key === 'ArrowDown' ? 1 : count - 1)) % count)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(index)
    } else if (e.key === 'Escape') {
      // Handled here, so the panel itself doesn't tuck away.
      e.preventDefault()
      onClose(true)
    } else if (e.key === 'Tab') {
      // The search box is the only thing to focus in here.
      e.preventDefault()
    }
  }

  return (
    <div ref={box} className={`switcher ${leaving ? 'leaving' : ''}`} role="dialog" aria-label="Switch project">
      <input
        ref={input}
        value={query}
        placeholder="Switch project…"
        spellCheck={false}
        role="combobox"
        aria-expanded="true"
        aria-controls="switcher-list"
        aria-autocomplete="list"
        aria-activedescendant={`switcher-${index}`}
        onChange={(e) => {
          setQuery(e.target.value)
          setSelected(0)
        }}
        onKeyDown={onKeyDown}
      />
      <ul id="switcher-list" ref={list} className="sw-list" role="listbox" aria-label="Projects">
        {matches.map((m, i) => (
          <li
            key={m.project.path}
            id={`switcher-${i}`}
            role="option"
            aria-selected={i === index}
            onPointerMove={() => i !== index && setSelected(i)}
            onClick={() => choose(i)}
          >
            <span className="badge" style={{ background: colors.get(m.project.path) }} aria-hidden="true">
              {m.project.name[0]?.toUpperCase()}
            </span>
            <span className="pn">
              <Highlight text={m.project.name} hits={m.hits} />
            </span>
            {reviewing?.has(m.project.path) && <span className="sw-review" role="img" aria-label="a review is waiting" title="A review is waiting" />}
            <span className="pp">{tildify(m.project.path, settings.home)}</span>
            {m.project.path === settings.currentProject && <span className="cur">current</span>}
          </li>
        ))}
        {matches.length === 0 && (
          <li className="none" role="presentation">
            {query.trim() ? `No projects match “${query.trim()}”` : 'No projects yet. Add the folders you work in.'}
          </li>
        )}
        <li
          id={`switcher-${matches.length}`}
          role="option"
          className="add"
          aria-selected={index === matches.length}
          onPointerMove={() => index !== matches.length && setSelected(matches.length)}
          onClick={() => choose(matches.length)}
        >
          <span className="badge" aria-hidden="true">
            +
          </span>
          <span className="pn">Add project…</span>
          <span className="pp">opens the folder picker</span>
        </li>
      </ul>
    </div>
  )
}
