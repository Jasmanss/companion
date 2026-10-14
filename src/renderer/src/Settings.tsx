import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { ClaudeHookStatus, DeployStatus, Mood, NotificationPrefs, Project, SettingsPatch, SettingsView } from '../../shared/types'
import { Face } from './Face'
import { formatHotkey } from './hotkeys'
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

const MOODS: [Mood, string][] = [
  ['idle', 'Idle'],
  ['listening', 'Listening'],
  ['thinking', 'Thinking'],
  ['talking', 'Talking'],
  ['done', 'Done'],
  ['needs-you', 'Needs you'],
  ['worried', 'Worried'],
  ['celebrating', 'Celebrating'],
  ['sleepy', 'Sleepy'],
  ['resting', 'Resting'],
]

/** A live preview of the face, in any mood. The character's own options join it here when the Pill arrives. */
export function StewardSection() {
  const [mood, setMood] = useState<Mood>('idle')
  return (
    <>
      <div className="set-preview">
        <div className="set-stage">
          <Face mood={mood} width={150} height={127} />
        </div>
        <div className="set-moods" role="radiogroup" aria-label="Preview a mood">
          {MOODS.map(([m, label]) => (
            <button key={m} role="radio" aria-checked={m === mood} className={`chip ${m === mood ? 'on' : ''}`} onClick={() => setMood(m)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <p className="set-note">
        This is the face in your panel right now. The Pill takes its place soon, and its options will live here: version,
        color, frost, personality, name, screen edge and size.
      </p>
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

/** "⌥⇧ Space" as keycaps. */
function Keys({ combo }: { combo: string }) {
  const [mods, key] = combo.includes(' ') ? combo.split(' ') : ['', combo]
  return (
    <span className="set-keys">
      {[...mods].map((m) => (
        <kbd key={m}>{m}</kbd>
      ))}
      <kbd>{key}</kbd>
    </span>
  )
}

export function ShortcutsSection({ settings }: { settings: SettingsView }) {
  const global = (accelerator: string) => (accelerator ? <Keys combo={formatHotkey(accelerator)} /> : <span className="set-value">None: another app has it</span>)
  return (
    <>
      <Group title="Anywhere" note="Steward takes the first of these that's free when it starts.">
        <Row label="Open or tuck away the panel">{global(settings.hotkeys.open)}</Row>
        <Row label="Hide from the screen edge, and bring it back">{global(settings.hotkeys.hide)}</Row>
      </Group>
      <Group title="In the panel">
        <Row label="Switch project">
          <Keys combo="⌘ K" />
        </Row>
        <Row label="Settings" note="Also in the menu bar icon">
          <Keys combo="⌘ ," />
        </Row>
        <Row label="Add what's on the clipboard to the tray">
          <Keys combo="⌘ V" />
        </Row>
        <Row label="Tuck away">
          <Keys combo="Esc" />
        </Row>
      </Group>
      <Group title="In Settings">
        <Row label="Close Settings">
          <Keys combo="⌘ W" />
          <span className="set-or">or</span>
          <Keys combo="Esc" />
        </Row>
      </Group>
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
