import { useEffect, useState } from 'react'
import type { ClaudeHookStatus, DeployStatus, Project, SettingsView } from '../../shared/types'

const api = () => window.steward

const MODIFIERS: Record<string, string> = { Control: '⌃', Alt: '⌥', Shift: '⇧', Command: '⌘' }

/** "Alt+Shift+Space" → "⌥⇧ Space" */
export function formatHotkey(accelerator: string): string {
  const parts = accelerator.split('+')
  const key = parts.pop()
  return `${parts.map((m) => MODIFIERS[m] ?? m).join('')} ${key}`
}

/** The "Connect to Claude Code" toggle. Connecting always shows the exact change first. */
function ClaudeConnect({ onError }: { onError: (message: string) => void }) {
  const [status, setStatus] = useState<ClaudeHookStatus | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const fail = (err: unknown) => onError(err instanceof Error ? err.message : String(err))

  useEffect(() => {
    api().claude.status().then(setStatus, fail)
    // Only on mount; fail just reports.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!status) return null
  return (
    <section>
      <h2>Claude Code</h2>
      <p className="muted">
        {status.connected
          ? 'Connected: Steward peeks out when a session needs you or finishes.'
          : status.outdated
            ? 'Your Claude Code hooks were set up before the rename and still read from the old data folder. They work for now; update them so they point at Steward.'
            : 'Connect to see every Claude Code session here and get a nudge when one needs you or finishes.'}
        {!status.serverRunning && ' (The listener isn’t running, so events won’t arrive until Steward restarts.)'}
      </p>
      {status.error && <p className="muted small">{status.error}</p>}
      <label className="toggle">
        <input
          type="checkbox"
          checked={status.connected || status.outdated || preview !== null}
          onChange={(e) => {
            if (e.target.checked) api().claude.preview().then(setPreview, fail)
            else api().claude.disconnect().then(setStatus, fail)
          }}
        />
        Connect to Claude Code
      </label>
      {status.outdated && preview === null && (
        <button className="btn" onClick={() => api().claude.preview().then(setPreview, fail)}>
          Update hooks
        </button>
      )}
      {preview !== null && (
        <div className="hook-preview">
          <p className="muted small">
            This is merged into <code>{status.settingsFile}</code>
            {status.outdated ? ', replacing the old entries in place' : ''}. Everything else in it stays as is, the original is backed up to{' '}
            <code>{status.backupFile}</code>, and turning this off removes only these entries.
          </p>
          <pre>{preview}</pre>
          <div className="row">
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
            <button className="btn" onClick={() => setPreview(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

export function Settings({ settings, onChange, onError }: { settings: SettingsView; onChange: (s: SettingsView) => void; onError: (message: string) => void }) {
  const [apiKey, setApiKey] = useState('')
  const [unsplashKey, setUnsplashKey] = useState('')
  const [vercelToken, setVercelToken] = useState('')
  const [deploys, setDeploys] = useState<DeployStatus | null>(null)
  const [allowlist, setAllowlist] = useState(settings.allowlist.join('\n'))
  const [suggestions, setSuggestions] = useState<Project[]>([])

  useEffect(() => {
    api().settings.suggestProjects().then(setSuggestions, () => setSuggestions([]))
    api().deploys.status().then(setDeploys, () => setDeploys(null))
  }, [settings.projects, settings.hasVercelToken])

  const run = (p: Promise<SettingsView>) => p.then(onChange, (err: unknown) => onError(err instanceof Error ? err.message : String(err)))

  return (
    <div className="settings">
      <section>
        <h2>Anthropic API key</h2>
        <p className="muted">
          {settings.apiKeySource === 'env'
            ? 'Using ANTHROPIC_API_KEY from your environment.'
            : settings.apiKeySource === 'saved'
              ? 'A key is saved in your keychain.'
              : 'Needed for chat. Stored encrypted in your macOS keychain.'}
        </p>
        <div className="row">
          <input type="password" value={apiKey} placeholder="sk-ant-…" onChange={(e) => setApiKey(e.target.value)} aria-label="Anthropic API key" />
          <button
            className="btn primary"
            disabled={!apiKey.trim()}
            onClick={() => run(api().settings.setApiKey(apiKey)).then(() => setApiKey(''))}
          >
            Save
          </button>
        </div>
      </section>

      <section>
        <h2>Unsplash access key (optional)</h2>
        <p className="muted">{settings.hasUnsplashKey ? 'Photo search is on.' : 'Turns on photo search. Free at unsplash.com/developers.'}</p>
        <div className="row">
          <input type="password" value={unsplashKey} placeholder="Access key" onChange={(e) => setUnsplashKey(e.target.value)} aria-label="Unsplash access key" />
          <button
            className="btn"
            disabled={!unsplashKey.trim()}
            onClick={() => run(api().settings.setUnsplashKey(unsplashKey)).then(() => setUnsplashKey(''))}
          >
            Save
          </button>
        </div>
      </section>

      <section>
        <h2>Projects</h2>
        {settings.projects.length === 0 && <p className="muted">Add the folders you work in so I can run commands and save images there.</p>}
        <ul className="projects">
          {settings.projects.map((p) => (
            <li key={p.path}>
              <label>
                <input
                  type="radio"
                  name="current-project"
                  checked={settings.currentProject === p.path}
                  onChange={() => run(api().settings.setCurrentProject(p.path))}
                />
                <span>{p.name}</span>
              </label>
              <button className="chip quiet" onClick={() => run(api().settings.removeProject(p.path))}>
                Remove
              </button>
            </li>
          ))}
        </ul>
        <button className="chip" onClick={() => run(api().settings.addProject())}>
          Add folder…
        </button>
        {suggestions.length > 0 && (
          <>
            <p className="muted small">Found in Documents and Desktop:</p>
            <div className="suggestions">
              {suggestions.map((p) => (
                <button key={p.path} className="chip quiet" onClick={() => run(api().settings.addProjectPath(p.path))}>
                  + {p.name}
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      <section>
        <h2>Vercel token (optional)</h2>
        <p className="muted">
          {deploys && deploys.linked.length > 0
            ? `Watches deploys for ${deploys.linked.join(', ')}.`
            : 'None of your projects are linked to Vercel yet (`vercel link` adds .vercel/project.json).'}{' '}
          {settings.hasVercelToken ? 'A token is saved in your keychain.' : 'Create a token at vercel.com/account/tokens. Stored encrypted in your keychain.'}
        </p>
        {deploys?.lastError && <p className="muted small">{deploys.lastError}</p>}
        <div className="row">
          <input type="password" value={vercelToken} placeholder="Vercel token" onChange={(e) => setVercelToken(e.target.value)} aria-label="Vercel token" />
          <button className="btn" disabled={!vercelToken.trim()} onClick={() => run(api().settings.setVercelToken(vercelToken)).then(() => setVercelToken(''))}>
            Save
          </button>
        </div>
      </section>

      <ClaudeConnect onError={onError} />

      <section>
        <h2>Commands that skip approval</h2>
        <p className="muted">Exact commands only, one per line. Everything else asks first, and deploys, rollbacks and git push always do.</p>
        <textarea rows={5} value={allowlist} onChange={(e) => setAllowlist(e.target.value)} aria-label="Command allowlist" />
        <button className="btn" onClick={() => run(api().settings.setAllowlist(allowlist.split('\n')))}>
          Save list
        </button>
      </section>

      <section>
        <h2>Shortcuts</h2>
        <p className="muted small">
          Open the panel: {settings.hotkeys.open ? formatHotkey(settings.hotkeys.open) : 'none (taken by another app)'}
          <br />
          Hide from the screen edge and back: {settings.hotkeys.hide ? formatHotkey(settings.hotkeys.hide) : 'none (taken by another app)'}
          <br />
          The menu bar icon does both, and quits.
        </p>
      </section>
    </div>
  )
}
