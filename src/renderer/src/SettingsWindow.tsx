import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { SettingsSection, SettingsView } from '../../shared/types'
import { BellIcon, FaceIcon, FolderIcon, KeyboardIcon, PlugIcon, SlidersIcon } from './icons'
import { ConnectionsSection, GeneralSection, NotificationsSection, ProjectsSection, ShortcutsSection, StewardSection, type SectionProps } from './Settings'

const api = window.steward

const SECTIONS: { id: SettingsSection; label: string; Icon: () => ReactNode }[] = [
  { id: 'general', label: 'General', Icon: SlidersIcon },
  { id: 'steward', label: 'Steward', Icon: FaceIcon },
  { id: 'projects', label: 'Projects', Icon: FolderIcon },
  { id: 'shortcuts', label: 'Shortcuts', Icon: KeyboardIcon },
  { id: 'connections', label: 'Connections', Icon: PlugIcon },
  { id: 'notifications', label: 'Notifications', Icon: BellIcon },
]

const LAST_SECTION = 'steward.settings.section'
const isSection = (value: unknown): value is SettingsSection => SECTIONS.some((s) => s.id === value)

/** The section asked for (in the address), else the one open last time, else General. */
function firstSection(): SettingsSection {
  const asked = location.hash.slice(1)
  if (isSection(asked)) return asked
  try {
    const last = localStorage.getItem(LAST_SECTION)
    if (isSection(last)) return last
  } catch {
    // no storage: start at General
  }
  return 'general'
}

/** The Settings window: a sidebar of sections and the one that's open. Every change applies right away. */
export function SettingsWindow() {
  const [settings, setSettings] = useState<SettingsView | null>(null)
  const [section, setSection] = useState<SettingsSection>(firstSection)
  const [error, setError] = useState<string | null>(null)
  const nav = useRef<HTMLElement>(null)

  useEffect(() => {
    api.settings.get().then(setSettings, (err: unknown) => setError(String(err)))
    // Changes made anywhere (here, the panel, the agent) land here too.
    const offChanged = api.settings.onChanged(setSettings)
    const offSection = api.settings.onSection(setSection)
    // Frosted by macOS (vibrant) or solid, like the panel.
    const showAppearance = ({ vibrant }: { vibrant: boolean }) => document.documentElement.toggleAttribute('data-vibrant', vibrant)
    api.appearance.get().then(showAppearance, () => {})
    const offAppearance = api.appearance.onChange(showAppearance)
    return () => {
      offChanged()
      offSection()
      offAppearance()
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(LAST_SECTION, section)
    } catch {
      // not remembered, that's all
    }
  }, [section])

  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setError(null), 6000)
    return () => clearTimeout(t)
  }, [error])

  // Esc and ⌘W close the window.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.defaultPrevented) return
      if (e.key === 'Escape' || (e.metaKey && !e.altKey && !e.ctrlKey && e.key.toLowerCase() === 'w')) {
        e.preventDefault()
        void api.settings.close()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /** Up and down move through the sidebar, like a list. */
  const onNavKey = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const i = SECTIONS.findIndex((s) => s.id === section)
    const next = SECTIONS[(i + (e.key === 'ArrowDown' ? 1 : SECTIONS.length - 1)) % SECTIONS.length].id
    setSection(next)
    nav.current?.querySelector<HTMLButtonElement>(`[data-section="${next}"]`)?.focus()
  }

  const current = SECTIONS.find((s) => s.id === section)!
  const props: SectionProps | null = settings && { settings, onChange: setSettings, onError: setError }

  return (
    <div className="set-window" data-settings>
      <nav className="set-side" aria-label="Settings sections" ref={nav} onKeyDown={onNavKey}>
        {/* Room for the traffic lights, and somewhere to drag the window by. */}
        <div className="set-drag" />
        {SECTIONS.map(({ id, label, Icon }) => (
          <button key={id} data-section={id} className="set-nav" aria-current={id === section ? 'page' : undefined} onClick={() => setSection(id)}>
            <span className="set-nav-icon">
              <Icon />
            </span>
            {label}
          </button>
        ))}
        {settings && <span className="set-version">Steward {settings.version}</span>}
      </nav>
      <main className="set-main" aria-labelledby="set-title">
        <header className="set-head">
          <h1 id="set-title">{current.label}</h1>
        </header>
        {/* Keyed, so each section fades in. */}
        <div className="set-body" key={section}>
          {props &&
            {
              general: <GeneralSection {...props} />,
              steward: <StewardSection />,
              projects: <ProjectsSection {...props} />,
              shortcuts: <ShortcutsSection {...props} />,
              connections: <ConnectionsSection {...props} />,
              notifications: <NotificationsSection {...props} />,
            }[section]}
        </div>
        {error && (
          <div className="set-toast" role="alert" onClick={() => setError(null)}>
            {error}
          </div>
        )}
      </main>
    </div>
  )
}
