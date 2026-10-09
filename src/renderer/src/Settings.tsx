import { useEffect, useState } from 'react'
import type { Project, SettingsView } from '../../shared/types'

const api = () => window.companion

const MODIFIERS: Record<string, string> = { Control: '⌃', Alt: '⌥', Shift: '⇧', Command: '⌘' }

/** "Alt+Shift+Space" → "⌥⇧ Space" */
export function formatHotkey(accelerator: string): string {
  const parts = accelerator.split('+')
  const key = parts.pop()
  return `${parts.map((m) => MODIFIERS[m] ?? m).join('')} ${key}`
}

export function Settings({ settings, onChange, onError }: { settings: SettingsView; onChange: (s: SettingsView) => void; onError: (message: string) => void }) {
  const [apiKey, setApiKey] = useState('')
  const [unsplashKey, setUnsplashKey] = useState('')
  const [allowlist, setAllowlist] = useState(settings.allowlist.join('\n'))
  const [suggestions, setSuggestions] = useState<Project[]>([])

  useEffect(() => {
    api().settings.suggestProjects().then(setSuggestions, () => setSuggestions([]))
  }, [settings.projects])

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
        <h2>Commands that skip approval</h2>
        <p className="muted">Exact commands only, one per line. Everything else asks first.</p>
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
