import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { shortcutInfo } from '../../shared/shortcuts'
import { alertPeekAfterSwitch, DEFAULT_NAME, DEFAULT_STEWARD, MAX_NAME, PANEL_TINTS, PILL_COLORS, TAB_SIZES, panelTint } from '../../shared/steward'
import type { ClaudeHookStatus, DeployStatus, Mood, NotchGeometry, NotificationPrefs, Project, SettingsPatch, SettingsView, ShortcutId, StewardPrefs } from '../../shared/types'
import { usePresence } from './Activity'
import { Pill, pillKey } from './Pill'
import type { Glint } from './pill/eyes'
import { Keys, SHORTCUT_COLORS, ShortcutRecorder } from './ShortcutRecorder'
import { badgeColors, tildify } from './switcher'

const api = () => window.steward

const message = (err: unknown) => (err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err))

export interface SectionProps {
  settings: SettingsView
  /** A change was saved; here is everything as it is now. */
  onChange: (settings: SettingsView) => void
  onError: (message: string) => void
}

/** Save something, then show the result, or say what went wrong. Resolves to whether it worked. */
const runner =
  ({ onChange, onError }: SectionProps) =>
  (p: Promise<SettingsView>): Promise<boolean> =>
    p.then(
      (view) => {
        onChange(view)
        return true
      },
      (err: unknown) => {
        onError(message(err))
        return false
      },
    )

/** A titled box of rows, like System Settings. */
function Group({ title, note, children }: { title?: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section className="set-group">
      {title && <h2>{title}</h2>}
      <div className="set-box">{children}</div>
      {note && <p className="set-note">{note}</p>}
    </section>
  )
}

function Row({ label, note, children }: { label: ReactNode; note?: ReactNode; children?: ReactNode }) {
  return (
    <div className="set-row">
      <div className="set-label">
        <span>{label}</span>
        {note && <small>{note}</small>}
      </div>
      {children && <div className="set-ctl">{children}</div>}
    </div>
  )
}

/** A row that's a switch: clicking anywhere on it flips it. */
function SwitchRow({ label, note, checked, disabled, onChange }: { label: string; note?: ReactNode; checked: boolean; disabled?: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className={`set-row ${disabled ? 'disabled' : 'clickable'}`}>
      <div className="set-label">
        <span>{label}</span>
        {note && <small>{note}</small>}
      </div>
      <input type="checkbox" role="switch" className="set-switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

/* ---------- General ---------- */

export function GeneralSection(props: SectionProps) {
  const { settings } = props
  const run = runner(props)
  const update = (patch: SettingsPatch) => run(api().settings.update(patch))
  const login = settings.openAtLogin
  return (
    <>
      <Group>
        <SwitchRow
          label="Open Steward at login"
          note={
            !login.available
              ? 'Works in the installed app, not while developing.'
              : login.needsApproval
                ? 'Waiting for your OK in System Settings → General → Login Items.'
                : undefined
          }
          checked={login.enabled}
          disabled={!login.available}
          onChange={(on) => update({ openAtLogin: on })}
        />
        <SwitchRow
          label="Tuck the panel away when I click elsewhere"
          note="The pin at the top of the panel turns this off and on too."
          checked={!settings.keepPanelOpen}
          onChange={(on) => update({ keepPanelOpen: !on })}
        />
      </Group>
      <Group>
        <Row label="Appearance" note="Light and dark follow System Settings, and so do Reduce Transparency and Reduce Motion.">
          <span className="set-value">Matches your Mac</span>
        </Row>
      </Group>
    </>
  )
}

/* ---------- Steward ---------- */

/** A row of choices, one picked, like macOS's segmented controls. The arrow keys move the pick. */
function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (value: T) => void }) {
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const i = options.findIndex(([v]) => v === value)
    const next = options[(i + step + options.length) % options.length][0]
    onChange(next)
    e.currentTarget.querySelector<HTMLButtonElement>(`[data-value="${next}"]`)?.focus()
  }
  return (
    <div className="set-seg" role="radiogroup" aria-label={label} onKeyDown={onKey}>
      {options.map(([v, text]) => (
        <button key={v} role="radio" data-value={v} aria-checked={v === value} tabIndex={v === value ? 0 : -1} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  )
}

/** Colors as swatches, one picked: the character's colors, or the panel's tints. The arrow keys move the pick. */
function Swatches<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { id: T; name: string; color: string }[]; onChange: (value: T) => void }) {
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const i = options.findIndex((c) => c.id === value)
    const next = options[(i + step + options.length) % options.length].id
    onChange(next)
    e.currentTarget.querySelector<HTMLButtonElement>(`[data-value="${next}"]`)?.focus()
  }
  return (
    <div className="set-colors" role="radiogroup" aria-label={label} onKeyDown={onKey}>
      {options.map((c) => (
        <button
          key={c.id}
          role="radio"
          data-value={c.id}
          aria-checked={c.id === value}
          aria-label={c.name}
          title={c.name}
          tabIndex={c.id === value ? 0 : -1}
          style={{ background: c.color }}
          onClick={() => onChange(c.id)}
        />
      ))}
    </div>
  )
}

const COLOR_SWATCHES = PILL_COLORS.map((c) => ({ id: c.id, name: c.name, color: c.hex }))
const TINT_SWATCHES = PANEL_TINTS.map((t) => ({ id: t.id, name: t.name, color: `rgb(${t.tint})` }))

/**
 * How frosted the panel is, clear to frosted. The panel follows while you drag: a change goes out at most ten
 * times a second, and the last one always does. While you drag, saved values coming back don't move the slider.
 */
function FrostSlider({ value, onChange }: { value: number; onChange: (frost: number) => void }) {
  const [shown, setShown] = useState(value)
  const sent = useRef(value)
  const latest = useRef(value)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dragging = useRef(false)
  const change = useRef(onChange)
  useEffect(() => {
    change.current = onChange
  })
  useEffect(() => {
    if (!dragging.current) setShown(value)
  }, [value])
  // Leaving Settings mid-drag still saves where the slider ended up.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
      if (latest.current !== sent.current) change.current(latest.current)
    },
    [],
  )
  const flush = () => {
    timer.current = null
    if (latest.current === sent.current) return
    sent.current = latest.current
    change.current(latest.current)
    timer.current = setTimeout(flush, 100)
  }
  return (
    <div className="set-range">
      <span aria-hidden="true">Clear</span>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={shown}
        aria-label="Frost"
        aria-valuetext={`${shown}% frosted`}
        onPointerDown={() => (dragging.current = true)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
        onChange={(e) => {
          const frost = Number(e.target.value)
          setShown(frost)
          latest.current = frost
          if (!timer.current) flush()
        }}
      />
      <span aria-hidden="true">Frosted</span>
    </div>
  )
}

/** The name, saved when you press Return or leave the field. Esc puts back the saved one. */
function NameField({ name, onSave }: { name: string; onSave: (name: string) => void }) {
  const [value, setValue] = useState(name)
  // Saved (tidied up), or changed elsewhere: show it as it is.
  useEffect(() => setValue(name), [name])
  const save = () => {
    if (value !== name) onSave(value)
  }
  return (
    <input
      type="text"
      className="set-name"
      value={value}
      maxLength={MAX_NAME}
      spellCheck={false}
      placeholder={DEFAULT_NAME}
      aria-label="Name"
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape' && value !== name) {
          // Only undoes the typing; a second Esc closes Settings as usual.
          e.preventDefault()
          setValue(name)
        }
      }}
    />
  )
}

/** What the preview can show: every mood, and thinking's three kinds. */
const PREVIEWS: { id: string; label: string; mood: Mood; glint?: Glint }[] = [
  { id: 'idle', label: 'Idle', mood: 'idle' },
  { id: 'listening', label: 'Listening', mood: 'listening' },
  { id: 'thinking', label: 'Thinking', mood: 'thinking' },
  { id: 'reading', label: 'Reading a file', mood: 'thinking', glint: 'step' },
  { id: 'searching', label: 'Searching the web', mood: 'thinking', glint: 'search' },
  { id: 'talking', label: 'Talking', mood: 'talking' },
  { id: 'done', label: 'Happy', mood: 'done' },
  { id: 'celebrating', label: 'Celebrating', mood: 'celebrating' },
  { id: 'needs-you', label: 'Needs you', mood: 'needs-you' },
  { id: 'worried', label: 'Worried', mood: 'worried' },
  { id: 'mad', label: 'Mad', mood: 'mad' },
  { id: 'resting', label: 'Resting', mood: 'resting' },
  { id: 'sleepy', label: 'Sleepy', mood: 'sleepy' },
]

/** While the preview listens, someone types to it now and then, so you can see it nod along. */
function useMakeBelieveTyping(on: boolean) {
  useEffect(() => {
    if (!on) return
    let timer: ReturnType<typeof setTimeout>
    const key = () => {
      pillKey()
      // Short bursts, with a longer pause now and then.
      timer = setTimeout(key, Math.random() < 0.18 ? 900 + Math.random() * 1200 : 120 + Math.random() * 200)
    }
    timer = setTimeout(key, 400)
    return () => clearTimeout(timer)
  }, [on])
}

/** The MacBook notch on this Mac's screens, kept up to date (null: none has one right now). */
function useNotch(): NotchGeometry | null {
  const [notch, setNotch] = useState<NotchGeometry | null>(null)
  useEffect(() => {
    void api().notch.geometry().then(setNotch)
    return api().notch.onGeometry(setNotch)
  }, [])
  return notch
}

/** The character: a live preview, then how it looks, how it behaves, its name, and where it sits. */
/** What each choice of "Alerts that peek out" means. Settings → Notifications still decides which kinds are on at all. */
const ALERT_PEEK_NOTES: Record<StewardPrefs['alertPeek'], string> = {
  'needs-me': 'Only when a session needs me. Finished and failed builds and good news wait in the menu bar, and show in the panel when it opens.',
  all: 'Everything I turned on in Notifications.',
  none: 'Nothing, menu bar only. Everything shows in the panel when it opens.',
}

export function StewardSection(props: SectionProps) {
  // (A main process from before the character, or before the panel's tint, sends less: the defaults fill in.)
  const look = { ...DEFAULT_STEWARD, ...props.settings.steward }
  const run = runner(props)
  const set = (patch: Partial<StewardPrefs>) => run(api().settings.update({ steward: patch }))
  const [preview, setPreview] = useState(PREVIEWS[0])
  const tab = TAB_SIZES[look.size]
  // The notch is offered only on screens that have one; elsewhere Steward stays on its edge.
  const hasNotch = useNotch() !== null
  const where = look.notch && hasNotch ? 'notch' : look.edge
  useMakeBelieveTyping(preview.mood === 'listening')
  return (
    <>
      <div className="set-preview">
        <div className="set-stage">
          <Pill mood={preview.mood} glint={preview.glint} width={196} height={125} cls="big" look={look} />
        </div>
        {/* The tab at its real size, against the screen edge it's on. */}
        <div className={`set-screen ${look.edge}`} aria-label={`The tab at the ${look.edge} screen edge, at its real size`} role="img">
          <div className="set-tab" style={{ width: tab.tab.width, height: tab.tab.height }}>
            <Pill mood={preview.mood} glint={preview.glint} width={tab.pill.width} height={tab.pill.height} cls="peek" look={look} />
          </div>
        </div>
      </div>
      <div className="set-moods" role="radiogroup" aria-label="Preview a mood">
        {PREVIEWS.map((p) => (
          <button key={p.id} role="radio" aria-checked={p.id === preview.id} className={`chip ${p.id === preview.id ? 'on' : ''}`} onClick={() => setPreview(p)}>
            {p.label}
          </button>
        ))}
      </div>

      <Group title="Look">
        <Row label="Version">
          <Segmented label="Version" value={look.version} options={[['glass', 'Glass'], ['flat', 'Flat'], ['blocky', 'Blocky']]} onChange={(version) => set({ version })} />
        </Row>
        <Row label="Color" note={PILL_COLORS.find((c) => c.id === look.color)?.name}>
          <Swatches label="Color" value={look.color} options={COLOR_SWATCHES} onChange={(color) => set({ color })} />
        </Row>
        {look.version === 'glass' && (
          <Row label="Glass" note={look.glass === 'clear' ? 'No tint: the color only shows in its marks, like the “!”' : undefined}>
            <Segmented label="Glass" value={look.glass} options={[['tinted', 'Tinted'], ['clear', 'Clear']]} onChange={(glass) => set({ glass })} />
          </Row>
        )}
        <SwitchRow label="A mouth when it talks" note="Without one, its eyes bounce with the words." checked={look.mouth} onChange={(mouth) => set({ mouth })} />
      </Group>

      <Group title="Personality">
        <Row
          label="Personality"
          note={look.personality === 'lively' ? 'Glances around, follows your cursor, and hops when it’s happy.' : 'Mostly keeps still, and glances around now and then.'}
        >
          <Segmented label="Personality" value={look.personality} options={[['calm', 'Calm'], ['lively', 'Lively']]} onChange={(personality) => set({ personality })} />
        </Row>
        <Row label="Name" note="Shown in the panel. The chat answers to it too.">
          <NameField name={look.name} onSave={(name) => set({ name })} />
        </Row>
      </Group>

      <Group title="Where it sits">
        <Row label="Screen edge" note={look.notch && !hasNotch ? 'In the notch again when a screen with one is on.' : undefined}>
          <Segmented
            label="Screen edge"
            value={where}
            options={hasNotch ? [['left', 'Left'], ['notch', 'Notch'], ['right', 'Right']] : [['left', 'Left'], ['right', 'Right']]}
            onChange={(v) => set(v === 'notch' ? { notch: true } : { edge: v, notch: false })}
          />
        </Row>
        {where === 'notch' && (
          <Row label="In the notch" note={look.notchStyle === 'wings' ? 'One eye on each side of the notch, in the menu bar.' : 'A chin below the notch, with the eyes in it.'}>
            <Segmented label="In the notch" value={look.notchStyle} options={[['chin', 'Chin'], ['wings', 'Wings']]} onChange={(notchStyle) => set({ notchStyle })} />
          </Row>
        )}
        <Row label="Size" note="How big the tab at the screen edge is.">
          <Segmented label="Size" value={look.size} options={[['small', 'Small'], ['medium', 'Medium']]} onChange={(size) => set({ size })} />
        </Row>
      </Group>

      <Group title="Presence">
        <Row label="Presence" note={look.presence === 'quiet' ? `Out of sight until you ${where === 'notch' ? 'rest your cursor on the notch' : `push your cursor against the ${where} edge`}, press its shortcut, or a session needs you. The menu bar icon is always there.` : 'Always on screen, at its edge or in the notch.'}>
          <Segmented label="Presence" value={look.presence} options={[['always', 'Always visible'], ['quiet', 'Only when needed']]} onChange={(presence) => set({ presence, alertPeek: alertPeekAfterSwitch(look.presence, presence, look.alertPeek) })} />
        </Row>
        <Row label="Alerts that peek out" note={ALERT_PEEK_NOTES[look.alertPeek]}>
          <Segmented label="Alerts that peek out" value={look.alertPeek} options={[['needs-me', 'Needs me'], ['all', 'Everything'], ['none', 'Nothing']]} onChange={(alertPeek) => set({ alertPeek })} />
        </Row>
      </Group>

      <Group title="The panel">
        <Row label="Tint" note={panelTint(look.tint).name}>
          <Swatches label="Tint" value={look.tint} options={TINT_SWATCHES} onChange={(tint) => set({ tint })} />
        </Row>
        <Row label="Frost" note="How milky the glass is. With Reduce Transparency on, the panel is solid.">
          <FrostSlider value={look.frost} onChange={(frost) => set({ frost })} />
        </Row>
      </Group>
    </>
  )
}

/* ---------- Projects ---------- */

export function ProjectsSection(props: SectionProps) {
  const { settings } = props
  const run = runner(props)
  const saved = settings.allowlist.join('\n')
  const [allowlist, setAllowlist] = useState(saved)
  const [suggestions, setSuggestions] = useState<Project[]>([])
  const colors = useMemo(() => badgeColors(settings.projects), [settings.projects])

  // Once saved (tidied up), or changed elsewhere, the box shows the list as it is.
  useEffect(() => setAllowlist(saved), [saved])

  useEffect(() => {
    api().settings.suggestProjects().then(setSuggestions, () => setSuggestions([]))
  }, [settings.projects])

  return (
    <>
      <Group
        title="Your projects"
        note="Steward reads files in the current project without asking, read-only, and never .env files, keys or credentials. Removing a project only takes it off this list."
      >
        {settings.projects.length === 0 && <Row label="No projects yet" note="Add the folders you work in." />}
        {settings.projects.map((p) => (
          <div className="set-row" key={p.path}>
            <div className="set-project">
              <span className="badge" style={{ background: colors.get(p.path) }} aria-hidden="true">
                {p.name[0]?.toUpperCase()}
              </span>
              <div className="set-label">
                <span>{p.name}</span>
                <small>{tildify(p.path, settings.home)}</small>
              </div>
            </div>
            <div className="set-ctl">
              {p.path === settings.currentProject ? (
                <span className="set-tag">Current</span>
              ) : (
                <button className="btn small" onClick={() => run(api().settings.setCurrentProject(p.path))}>
                  Make current
                </button>
              )}
              <button className="btn small quiet" onClick={() => run(api().settings.removeProject(p.path))} aria-label={`Remove ${p.name}`}>
                Remove
              </button>
            </div>
          </div>
        ))}
        <div className="set-row">
          <button className="btn" onClick={() => run(api().settings.addProject())}>
            Add folder…
          </button>
        </div>
      </Group>

      {suggestions.length > 0 && (
        <Group title="Found in Documents and Desktop">
          <div className="set-chips">
            {suggestions.map((p) => (
              <button key={p.path} className="chip" onClick={() => run(api().settings.addProjectPath(p.path))}>
                + {p.name}
              </button>
            ))}
          </div>
        </Group>
      )}

      <Group title="Commands that skip approval" note="Exact commands only, one per line. Everything else asks first, and deploys, rollbacks and git push always do.">
        <div className="set-field">
          <textarea rows={6} value={allowlist} spellCheck={false} onChange={(e) => setAllowlist(e.target.value)} aria-label="Commands that skip approval" />
          <div className="set-actions">
            <button className="btn" disabled={allowlist === saved} onClick={() => run(api().settings.setAllowlist(allowlist.split('\n')))}>
              Save list
            </button>
          </div>
        </div>
      </Group>
    </>
  )
}

/* ---------- Shortcuts ---------- */

/** One shortcut you can change: its keys, whether it works, and the button that opens the keyboard. */
function ShortcutRow({ id, settings, onChange }: { id: ShortcutId; settings: SettingsView; onChange: (rect: DOMRect) => void }) {
  const s = settings.shortcuts[id]
  const info = shortcutInfo(id)
  const note = !s.accelerator
    ? 'Turned off'
    : !s.active
      ? 'macOS didn’t give it to Steward, so it isn’t working. Pick another.'
      : id === 'openSettings'
        ? 'Also in the menu bar icon'
        : undefined
  return (
    <Row
      label={
        <>
          <i className="set-swatch" style={{ background: SHORTCUT_COLORS[id] }} aria-hidden="true" />
          {info.label}
        </>
      }
      note={note}
    >
      {s.accelerator ? <Keys accelerator={s.accelerator} dim={!s.active} /> : <span className="set-value">Off</span>}
      <button className="btn small" onClick={(e) => onChange(e.currentTarget.getBoundingClientRect())} aria-label={`Change the shortcut for ${info.label}`}>
        Change
      </button>
    </Row>
  )
}

export function ShortcutsSection({ settings, onChange }: SectionProps) {
  const [editing, setEditing] = useState<{ id: ShortcutId; origin: DOMRect } | null>(null)
  const shown = usePresence(editing !== null, 200)
  // Keeps the recorder on screen while it leaves.
  const [last, setLast] = useState(editing)
  if (editing && editing !== last) setLast(editing)
  const open = (id: ShortcutId) => (origin: DOMRect) => setEditing({ id, origin })

  return (
    <>
      <Group
        title="Anywhere"
        note="These work in every app. Steward can’t see other apps’ shortcuts: if one of these doesn’t respond, another app probably has it, so pick another."
      >
        <ShortcutRow id="togglePanel" settings={settings} onChange={open('togglePanel')} />
        <ShortcutRow id="hideFromEdge" settings={settings} onChange={open('hideFromEdge')} />
      </Group>
      <Group title="In the panel">
        <ShortcutRow id="switchProject" settings={settings} onChange={open('switchProject')} />
        <ShortcutRow id="openSettings" settings={settings} onChange={open('openSettings')} />
        <Row label="Add what's on the clipboard to the tray" note="Every Mac app's paste, so it stays">
          <Keys accelerator="Command+V" />
        </Row>
        <Row label="Tuck away">
          <Keys accelerator="Escape" />
        </Row>
      </Group>
      <Group title="In Settings">
        <Row label="Close Settings">
          <Keys accelerator="Command+W" />
          <span className="set-or">or</span>
          <Keys accelerator="Escape" />
        </Row>
      </Group>
      {shown.mounted && last && (
        <ShortcutRecorder id={last.id} settings={settings} origin={last.origin} leaving={shown.leaving} onClose={() => setEditing(null)} onSaved={onChange} />
      )}
    </>
  )
}

/* ---------- Connections ---------- */

/** A key or token: whether it's set, and a field to save a new one. Saved keys are never shown again. */
function SecretField({
  name,
  connected,
  status,
  placeholder,
  primary,
  onSave,
}: {
  name: string
  connected: boolean
  status: ReactNode
  placeholder: string
  primary?: boolean
  onSave: (value: string) => Promise<boolean>
}) {
  const [value, setValue] = useState('')
  return (
    <>
      <Row label={name} note={status}>
        <span className={`set-status ${connected ? 'on' : ''}`}>{connected ? 'Connected' : 'Not set'}</span>
      </Row>
      <div className="set-row">
        <div className="set-inline">
          <input type="password" value={value} placeholder={placeholder} onChange={(e) => setValue(e.target.value)} aria-label={`${name} key`} />
          <button className={`btn ${primary && !connected ? 'primary' : ''}`} disabled={!value.trim()} onClick={() => onSave(value).then((ok) => ok && setValue(''))}>
            {connected ? 'Replace' : 'Save'}
          </button>
        </div>
      </div>
    </>
  )
}

/** The "Connect to Claude Code" switch. Connecting always shows the exact change first. */
function ClaudeConnect({ onError }: { onError: (message: string) => void }) {
  const [status, setStatus] = useState<ClaudeHookStatus | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const fail = (err: unknown) => onError(message(err))

  useEffect(() => {
    api().claude.status().then(setStatus, fail)
    // Only on mount; fail just reports.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!status) return null
  return (
    <Group
      title="Claude Code"
      note={
        <>
          {status.connected
            ? 'Steward peeks out when a session needs you or finishes.'
            : status.outdated
              ? 'Your hooks were set up before the rename and still read from the old data folder. They work for now; update them so they point at Steward.'
              : 'See every Claude Code session in the panel, and get a nudge when one needs you or finishes.'}
          {!status.serverRunning && ' The listener isn’t running, so events won’t arrive until Steward restarts.'}
          {status.error && ` ${status.error}`}
        </>
      }
    >
      <SwitchRow
        label="Connect to Claude Code"
        note="Adds Steward's hooks to ~/.claude/settings.json"
        checked={status.connected || status.outdated || preview !== null}
        onChange={(on) => {
          if (on) api().claude.preview().then(setPreview, fail)
          // Off while only looking at the preview: nothing was added, so there's nothing to remove.
          else if (!status.connected && !status.outdated) setPreview(null)
          else
            api()
              .claude.disconnect()
              .then((next) => {
                setStatus(next)
                setPreview(null)
              }, fail)
        }}
      />
      {status.outdated && preview === null && (
        <div className="set-row">
          <button className="btn" onClick={() => api().claude.preview().then(setPreview, fail)}>
            Update hooks
          </button>
        </div>
      )}
      {preview !== null && (
        <div className="set-row column">
          <p className="set-note flush">
            This is merged into <code>{status.settingsFile}</code>
            {status.outdated ? ', replacing the old entries in place' : ''}. Everything else in it stays as is, the original is backed up to{' '}
            <code>{status.backupFile}</code>, and turning this off removes only these entries.
          </p>
          <pre className="set-code">{preview}</pre>
          <div className="set-actions">
            <button className="btn" onClick={() => setPreview(null)}>
              Cancel
            </button>
            <button
              className="btn primary"
              onClick={() =>
                api()
                  .claude.connect()
                  .then((next) => {
                    setStatus(next)
                    setPreview(null)
                  }, fail)
              }
            >
              {status.outdated ? 'Update these hooks' : 'Add these hooks'}
            </button>
          </div>
        </div>
      )}
    </Group>
  )
}

export function ConnectionsSection(props: SectionProps) {
  const { settings, onError } = props
  const run = runner(props)
  const [deploys, setDeploys] = useState<DeployStatus | null>(null)

  useEffect(() => {
    api().deploys.status().then(setDeploys, () => setDeploys(null))
  }, [settings.projects, settings.hasVercelToken])

  return (
    <>
      <Group note="Keys are stored encrypted in your macOS keychain.">
        <SecretField
          name="Anthropic"
          connected={settings.apiKeySource !== 'none'}
          status={settings.apiKeySource === 'env' ? 'From ANTHROPIC_API_KEY in your environment' : settings.apiKeySource === 'saved' ? 'Saved in your keychain' : 'Needed for chat'}
          placeholder="sk-ant-…"
          primary
          onSave={(key) => run(api().settings.setApiKey(key))}
        />
      </Group>
      <Group>
        <SecretField
          name="Unsplash"
          connected={settings.hasUnsplashKey}
          status={settings.hasUnsplashKey ? 'Photo search is on' : 'Optional: turns on photo search. Free at unsplash.com/developers.'}
          placeholder="Access key"
          onSave={(key) => run(api().settings.setUnsplashKey(key))}
        />
      </Group>
      <Group note={deploys?.lastError ?? undefined}>
        <SecretField
          name="Vercel"
          connected={settings.hasVercelToken}
          status={
            deploys && deploys.linked.length > 0
              ? `Watches deploys for ${deploys.linked.join(', ')}`
              : 'Optional: watches deploys. None of your projects are linked yet (vercel link).'
          }
          placeholder="Token from vercel.com/account/tokens"
          onSave={(token) => run(api().settings.setVercelToken(token))}
        />
      </Group>
      <ClaudeConnect onError={onError} />
    </>
  )
}

/* ---------- Notifications ---------- */

export function NotificationsSection(props: SectionProps) {
  const { settings } = props
  const run = runner(props)
  const n = settings.notifications
  const set = (patch: Partial<NotificationPrefs>) => run(api().settings.update({ notifications: patch }))
  return (
    <>
      <Group
        title="Peek out from the edge when"
        note="Steward always peeks out when it needs your OK to run a command. With a switch off it stays tucked away, but its face still reacts."
      >
        <SwitchRow label="A Claude Code session needs me" note="Waiting for approval or an answer" checked={n.sessionNeedsMe} onChange={(on) => set({ sessionNeedsMe: on })} />
        <SwitchRow label="A Claude Code session finishes" note="Only turns that took a while" checked={n.sessionFinished} onChange={(on) => set({ sessionFinished: on })} />
        <SwitchRow label="A build fails" note="With an offer to read the build log" checked={n.buildFailed} onChange={(on) => set({ buildFailed: on })} />
        <SwitchRow label="A deploy goes out or a PR is merged" checked={n.celebrations} onChange={(on) => set({ celebrations: on })} />
      </Group>
      <Group title="In the panel">
        <SwitchRow label="Morning brief" note="The first time you open the panel each day" checked={n.morningBrief} onChange={(on) => set({ morningBrief: on })} />
        <SwitchRow label="Where you left off" note="When you switch projects, or come back after two hours" checked={n.leftOff} onChange={(on) => set({ leftOff: on })} />
      </Group>
    </>
  )
}
