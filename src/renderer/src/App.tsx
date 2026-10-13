import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'
import type { AgentEvent, AlertView, Brief, DockState, LeftOff, Mood, SaveResult, SessionView, SettingsView, TrayItem } from '../../shared/types'
import { ChatLog, Composer, type Entry } from './Chat'
import type { StepEntry } from './chat-groups'
import { Face } from './Face'
import { ChevronRightIcon, GearIcon, HideIcon, NewChatIcon, PinIcon } from './icons'
import { BriefCard } from './BriefCard'
import { LeftOffCard } from './LeftOffCard'
import { Nudge } from './Nudge'
import { isLateNight, pickMood } from './pick-mood'
import { SessionStrip } from './SessionStrip'
import { formatHotkey, Settings } from './Settings'
import { Tray } from './Tray'
import { Viewer } from './Viewer'

const api = window.steward
let nextId = 1

const message = (err: unknown) => (err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err))

/** Pull an image URL out of a browser drag (the <img> itself, or the link it sat in). */
function urlFromDrag(data: DataTransfer): { url: string; source?: string } | null {
  const uri = data
    .getData('text/uri-list')
    .split('\n')
    .find((line) => line && !line.startsWith('#'))
  const img = data.getData('text/html').match(/<img[^>]+src="([^"]+)"/i)?.[1]?.replace(/&amp;/g, '&')
  if (img && /^https?:/.test(img)) return { url: img, source: uri && uri !== img ? uri : undefined }
  return uri && /^https?:/.test(uri) ? { url: uri } : null
}

const canDrop = (e: globalThis.DragEvent) => ['Files', 'text/uri-list', 'text/html'].some((t) => e.dataTransfer?.types.includes(t))

export function App() {
  const [dock, setDock] = useState<DockState>('collapsed')
  const [items, setItems] = useState<TrayItem[]>([])
  const [settings, setSettings] = useState<SettingsView | null>(null)
  const [view, setView] = useState<'chat' | 'settings'>('chat')
  const [entries, setEntries] = useState<Entry[]>([])
  const [busy, setBusy] = useState(false)
  const [agentMood, setAgentMood] = useState<Mood | null>(null)
  const [typing, setTyping] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [saveResult, setSaveResult] = useState<SaveResult | null>(null)
  const [viewIndex, setViewIndex] = useState(0)
  const [sessions, setSessions] = useState<SessionView[]>([])
  const [nudgeAlerts, setNudgeAlerts] = useState<AlertView[]>([])
  const [banner, setBanner] = useState<AlertView | null>(null)
  const [eventMood, setEventMood] = useState<Mood | null>(null)
  const [leftOff, setLeftOff] = useState<LeftOff | null>(null)
  const [brief, setBrief] = useState<Brief | null>(null)
  const [lateNight, setLateNight] = useState(() => isLateNight(new Date()))
  const draggingOut = useRef(false)
  const doneTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const showError = useCallback((err: unknown) => setToast(message(err)), [])

  useEffect(() => {
    api.tray.list().then(setItems, showError)
    api.settings.get().then(setSettings, showError)
    api.sessions.list().then(setSessions, showError)
    const offDock = api.dock.onState(setDock)
    const offTray = api.tray.onChanged(setItems)
    const offAgent = api.agent.onEvent(handleAgentEvent)
    const offSessions = api.sessions.onChanged(setSessions)
    const offAlerts = api.alerts.onShow(handleAlerts)
    const offMood = api.alerts.onMood(setEventMood)
    const offLeftOff = api.leftOff.onShow(setLeftOff)
    // The brief already includes where you left off.
    const offBrief = api.brief.onShow((b) => {
      setBrief(b)
      setLeftOff(null)
    })
    // Frosted by macOS (vibrant) or solid: the CSS draws the glass to match.
    const showAppearance = ({ vibrant }: { vibrant: boolean }) => document.documentElement.toggleAttribute('data-vibrant', vibrant)
    api.appearance.get().then(showAppearance, () => {})
    const offAppearance = api.appearance.onChange(showAppearance)
    const clock = setInterval(() => setLateNight(isLateNight(new Date())), 60_000)
    return () => {
      offAppearance()
      offMood()
      offLeftOff()
      offBrief()
      clearInterval(clock)
      offDock()
      offTray()
      offAgent()
      offSessions()
      offAlerts()
    }
    // The handlers only use state setters and refs, so subscribing once is correct.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(t)
  }, [toast])

  useEffect(() => {
    if (!banner) return
    const t = setTimeout(() => setBanner(null), 6000)
    return () => clearTimeout(t)
  }, [banner])

  /** Alerts the main process let through: the nudge shows them when tucked away, a banner when the panel is open. */
  function handleAlerts(list: AlertView[]) {
    setNudgeAlerts(list)
    setBanner(list[0] ?? null)
  }

  const tuckAway = useCallback(() => {
    void api.dock.collapse()
  }, [])

  function handleAgentEvent(event: AgentEvent) {
    switch (event.type) {
      case 'mood':
        clearTimeout(doneTimer.current)
        setAgentMood(event.mood)
        break
      case 'text':
        setEntries((prev) => {
          const last = prev.at(-1)
          if (last?.kind === 'assistant') return [...prev.slice(0, -1), { ...last, text: last.text + event.delta }]
          return [...prev, { kind: 'assistant', id: nextId++, text: event.delta, streaming: true }]
        })
        break
      case 'activity': {
        const activity = event.activity
        setEntries((prev) => {
          const i = prev.findIndex((e) => e.kind === 'step' && e.activity.id === activity.id)
          // Thinking that's over leaves no trace.
          if (activity.kind === 'thinking' && activity.status !== 'running') return i < 0 ? prev : prev.toSpliced(i, 1)
          const finishedAt = activity.status === 'running' ? undefined : Date.now()
          if (i < 0) return [...prev, { kind: 'step', id: nextId++, activity, finishedAt }]
          const step = prev[i] as StepEntry
          return prev.with(i, { ...step, activity, finishedAt: step.finishedAt ?? finishedAt })
        })
        break
      }
      case 'output':
        setEntries((prev) =>
          prev.map((e) => {
            if (e.kind !== 'step' || e.activity.id !== event.activityId) return e
            if (event.exitCode !== undefined) return { ...e, output: event.text ?? e.output, exitCode: event.exitCode }
            return { ...e, output: ((e.output ?? '') + (event.chunk ?? '')).slice(-8000) }
          }),
        )
        break
      case 'approval':
        setEntries((prev) => [
          ...prev,
          { kind: 'approval', id: nextId++, approvalId: event.id, command: event.command, cwd: event.cwd, why: event.why, status: 'pending' },
        ])
        break
      case 'approval-resolved':
        setEntries((prev) =>
          prev.map((e) => (e.kind === 'approval' && e.approvalId === event.id ? { ...e, status: event.approved ? 'approved' : 'declined' } : e)),
        )
        break
      case 'stopped':
        setEntries((prev) => [...prev, { kind: 'notice', id: nextId++, text: 'Stopped.' }])
        break
      case 'error':
        setEntries((prev) => [...prev, { kind: 'error', id: nextId++, text: event.message }])
        break
      case 'done':
        setEntries((prev) => prev.map((e) => (e.kind === 'assistant' && e.streaming ? { ...e, streaming: false } : e)))
        setBusy(false)
        setAgentMood('done')
        doneTimer.current = setTimeout(() => setAgentMood(null), 2500)
        break
    }
  }

  // Dropping images in from Finder or a browser. Dragging toward the peek pops the panel open.
  useEffect(() => {
    const onEnter = (e: globalThis.DragEvent) => {
      if (draggingOut.current || !canDrop(e)) return
      e.preventDefault()
      setDragOver(true)
      if (dock === 'collapsed') void api.dock.expand()
    }
    const onOver = (e: globalThis.DragEvent) => {
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = draggingOut.current ? 'none' : 'copy'
    }
    const onLeave = (e: globalThis.DragEvent) => {
      if (!e.relatedTarget) setDragOver(false)
    }
    const onDrop = async (e: globalThis.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      if (draggingOut.current || !e.dataTransfer) return endDragOut()
      try {
        const paths = [...e.dataTransfer.files].map((f) => api.tray.pathForFile(f)).filter(Boolean)
        if (paths.length) return await api.tray.addPaths(paths)
        const link = urlFromDrag(e.dataTransfer)
        if (!link) throw new Error("That didn't look like an image.")
        await api.tray.addUrl(link.url, link.source)
      } catch (err) {
        showError(err)
      }
    }
    // The native drag-out ends without a DOM event; the next pointer move over the window means it's over.
    const endDragOut = () => {
      if (!draggingOut.current) return
      draggingOut.current = false
      api.tray.dragEnded()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (dock === 'viewing') void api.dock.expand()
      else void api.dock.collapse()
    }
    // ⌘V outside the message box adds whatever's on the clipboard: files, an image, or an image link.
    const onPaste = async (e: ClipboardEvent) => {
      const editing = e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement
      if (editing || !e.clipboardData) return
      e.preventDefault()
      try {
        const files = [...e.clipboardData.files]
        const paths = files.map((f) => api.tray.pathForFile(f)).filter(Boolean)
        if (paths.length) return await api.tray.addPaths(paths)
        const images = files.filter((f) => f.type.startsWith('image/'))
        for (const image of images) await api.tray.addBytes(new Uint8Array(await image.arrayBuffer()), image.type, image.name)
        if (images.length) return
        const text = e.clipboardData.getData('text/plain').trim()
        if (!/^https?:\/\/\S+$/.test(text)) throw new Error('Nothing on the clipboard to add. Copy an image, an image file, or an image link.')
        await api.tray.addUrl(text)
      } catch (err) {
        showError(err)
      }
    }
    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragover', onOver)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('drop', onDrop)
    window.addEventListener('pointermove', endDragOut)
    window.addEventListener('keydown', onKey)
    window.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('drop', onDrop)
      window.removeEventListener('pointermove', endDragOut)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('paste', onPaste)
    }
  }, [dock, showError])

  const dragOut = (ids: string[]) => (e: DragEvent) => {
    e.preventDefault()
    draggingOut.current = true
    api.tray.startDrag(ids)
  }

  const send = (text: string) => {
    setEntries((prev) => [...prev, { kind: 'user', id: nextId++, text }])
    setBusy(true)
    api.agent.send(text).catch((err) => {
      setBusy(false)
      showError(err)
    })
  }

  const saveToProject = () => {
    api.tray.saveToProject([]).then((result) => {
      if (result) setSaveResult(result)
      api.settings.get().then(setSettings, () => {})
    }, showError)
  }

  const openViewer = (index: number) => {
    setViewIndex(index)
    void api.dock.view()
  }

  const newChat = () => {
    setEntries([])
    void api.agent.reset()
  }

  const waiting = sessions.some((s) => s.state === 'needs-approval' || s.state === 'needs-input')
  const mood = pickMood({ agentMood, eventMood, listening: dragOver || typing, waiting, lateNight, tucked: dock === 'collapsed' || dock === 'hidden' })
  const noKey = settings?.apiKeySource === 'none'

  /** "Want me to look?" and the like: open the panel and ask the agent. */
  const runAction = (alert: AlertView) => {
    if (!alert.action) return
    setBanner(null)
    void api.dock.expand()
    if (noKey) return setToast('Add your Anthropic API key in Settings first.')
    send(alert.action.prompt)
  }
  const hideKey = settings?.hotkeys.hide ? ` (${formatHotkey(settings.hotkeys.hide)})` : ''

  if (dock === 'viewing' && items.length > 0) {
    return (
      <Viewer
        items={items}
        index={Math.min(viewIndex, items.length - 1)}
        onIndex={setViewIndex}
        onClose={() => api.dock.expand()}
        onRemove={(id) => api.tray.remove(id).catch(showError)}
        onDragOut={dragOut}
      />
    )
  }

  if (dock === 'nudge') {
    return <Nudge alerts={nudgeAlerts} mood={mood} onOpen={() => api.dock.expand()} onDismiss={tuckAway} onAction={runAction} />
  }

  if (dock === 'collapsed' || dock === 'hidden') {
    return (
      <button className="peek" data-app onClick={() => api.dock.expand()} title="Steward (⌥ Space)">
        <Face mood={mood} width={50} height={44} idle />
        {items.length > 0 && <span className="peek-count">{items.length}</span>}
      </button>
    )
  }

  return (
    <div className={`panel ${dragOver ? 'drag-over' : ''}`} data-app>
      <header className="panel-head">
        <Face mood={mood} width={64} height={54} />
        <div className="head-text">
          <span className="name">Steward</span>
          {settings && (
            <select
              className="project-select"
              value={settings.currentProject ?? ''}
              onChange={(e) => api.settings.setCurrentProject(e.target.value || null).then(setSettings, showError)}
              aria-label="Current project"
            >
              <option value="">No project</option>
              {settings.projects.map((p) => (
                <option key={p.path} value={p.path}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="head-actions">
          <button className="icon-btn" aria-label="New chat" title="New chat" disabled={entries.length === 0 || busy} onClick={newChat}>
            <NewChatIcon />
          </button>
          <button
            className={`icon-btn ${pinned ? 'on' : ''}`}
            aria-label={pinned ? 'Unpin panel' : 'Keep panel open'}
            aria-pressed={pinned}
            onClick={() => {
              setPinned(!pinned)
              void api.dock.setPinned(!pinned)
            }}
          >
            <PinIcon on={pinned} />
          </button>
          <button
            className={`icon-btn ${view === 'settings' ? 'on' : ''}`}
            aria-label="Settings"
            aria-pressed={view === 'settings'}
            onClick={() => setView(view === 'settings' ? 'chat' : 'settings')}
          >
            <GearIcon />
          </button>
          <button className="icon-btn" aria-label="Hide from the screen edge" title={`Hide from the screen edge${hideKey}. Bring it back from the menu bar icon.`} onClick={() => api.dock.hide()}>
            <HideIcon />
          </button>
          <button className="icon-btn" aria-label="Tuck away" title="Tuck away (Esc)" onClick={() => api.dock.collapse()}>
            <ChevronRightIcon />
          </button>
        </div>
      </header>

      <SessionStrip sessions={sessions} onDismiss={(id) => api.sessions.dismiss(id).catch(showError)} />
      {banner && (
        <div className="banner" role="status" onClick={() => setBanner(null)}>
          <strong>{banner.title}</strong>
          {banner.detail && <span>{banner.detail}</span>}
          {banner.action && (
            <button
              className="chip"
              onClick={(e) => {
                e.stopPropagation()
                runAction(banner)
              }}
            >
              {banner.action.label}
            </button>
          )}
        </div>
      )}

      {view === 'settings' && settings ? (
        <div className="body scroll">
          <button className="chip back" onClick={() => setView('chat')}>
            ← Back to chat
          </button>
          <Settings settings={settings} onChange={setSettings} onError={showError} />
        </div>
      ) : (
        <>
          <Tray
            items={items}
            saveResult={saveResult}
            onDragOut={dragOut}
            onOpen={openViewer}
            onSave={saveToProject}
            onDismissSave={() => setSaveResult(null)}
            onError={showError}
          />
          <div className="body">
            {brief && <BriefCard brief={brief} onDismiss={() => setBrief(null)} />}
            {leftOff && <LeftOffCard card={leftOff} onDismiss={() => setLeftOff(null)} />}
            {noKey && (
              <div className="notice">
                Add your Anthropic API key to start chatting.
                <button className="chip" onClick={() => setView('settings')}>
                  Open settings
                </button>
              </div>
            )}
            <ChatLog entries={entries} onApprove={(id, ok) => api.agent.approve(id, ok)} />
          </div>
          <Composer busy={busy} disabled={noKey} onSend={send} onStop={() => api.agent.cancel()} onTyping={setTyping} />
        </>
      )}

      {dragOver && <div className="drop-overlay">Drop to add to the tray</div>}
      {toast && (
        <div className="toast" role="alert" onClick={() => setToast(null)}>
          {toast}
        </div>
      )}
    </div>
  )
}
