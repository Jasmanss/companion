import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'
import { touchOf, type Touch } from '../../shared/activity'
import { canDim } from '../../shared/dim'
import { acceleratorFromKey, formatAccelerator } from '../../shared/shortcuts'
import { DEFAULT_STEWARD, TAB_SIZES } from '../../shared/steward'
import type { ActivityKind, AgentEvent, AlertView, Brief, DockState, LeftOff, Mood, Project, SaveResult, SessionView, SettingsView, TrayItem } from '../../shared/types'
import { usePresence } from './Activity'
import { ChatLog, Composer, type Entry } from './Chat'
import type { StepEntry } from './chat-groups'
import { ContextPill, ProjectSwitcher } from './ContextPill'
import { ChevronRightIcon, GearIcon, HideIcon, NewChatIcon, PinIcon } from './icons'
import { BriefCard } from './BriefCard'
import { LeftOffCard } from './LeftOffCard'
import { Nudge } from './Nudge'
import { applyPanelLook } from './panel-look'
import { isLateNight, pickMood } from './pick-mood'
import { Pill, pillKey } from './Pill'
import { glintFor, workingMood } from './pill/glint'
import { SessionStrip } from './SessionStrip'
import { useTabDrag } from './tab-drag'
import { useDimmed } from './dim'
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
  const [entries, setEntries] = useState<Entry[]>([])
  const [busy, setBusy] = useState(false)
  const [agentMood, setAgentMood] = useState<Mood | null>(null)
  const [typing, setTyping] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [saveResult, setSaveResult] = useState<SaveResult | null>(null)
  const [viewIndex, setViewIndex] = useState(0)
  const [sessions, setSessions] = useState<SessionView[]>([])
  const [nudgeAlerts, setNudgeAlerts] = useState<AlertView[]>([])
  const [banner, setBanner] = useState<AlertView | null>(null)
  /** How many more alerts came with the banner's (the ones that waited for the panel to open). */
  const [bannerMore, setBannerMore] = useState(0)
  /** The one-time note about Steward hiding until it's needed. */
  const [presenceNote, setPresenceNote] = useState<string | null>(null)
  const [eventMood, setEventMood] = useState<Mood | null>(null)
  const [leftOff, setLeftOff] = useState<LeftOff | null>(null)
  const [brief, setBrief] = useState<Brief | null>(null)
  const [lateNight, setLateNight] = useState(() => isLateNight(new Date()))
  const [switcher, setSwitcher] = useState(false)
  const switcherShown = usePresence(switcher)
  /** What the agent is on during this request, for the context pill. */
  const [touch, setTouch] = useState<Touch | null>(null)
  /** The last file the agent read in each project (by path), shown in the pill when it's idle. */
  const [lastFiles, setLastFiles] = useState<Record<string, string>>({})
  /** The steps running now, by id, and the kind of the newest: the character mirrors it. */
  const running = useRef(new Map<string, ActivityKind>())
  const [work, setWork] = useState<ActivityKind | null>(null)
  const currentProject = useRef<string | null>(null)
  const pill = useRef<HTMLButtonElement>(null)
  const composer = useRef<HTMLTextAreaElement>(null)
  const draggingOut = useRef(false)
  const doneTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const showError = useCallback((err: unknown) => setToast(message(err)), [])

  useEffect(() => {
    api.tray.list().then(setItems, showError)
    api.settings.get().then(setSettings, showError)
    api.sessions.list().then(setSessions, showError)
    // The agent can switch projects too.
    const offSettings = api.settings.onChanged(setSettings)
    const offDock = api.dock.onState(setDock)
    const offTray = api.tray.onChanged(setItems)
    const offAgent = api.agent.onEvent(handleAgentEvent)
    const offSessions = api.sessions.onChanged(setSessions)
    const offAlerts = api.alerts.onShow(handleAlerts)
    const offNote = api.presence.onNote(setPresenceNote)
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
      offSettings()
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
      offNote()
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
    // Several that waited for the panel get longer to read.
    const t = setTimeout(() => setBanner(null), bannerMore > 0 ? 12_000 : 6000)
    return () => clearTimeout(t)
  }, [banner, bannerMore])

  useEffect(() => {
    currentProject.current = settings?.currentProject ?? null
  }, [settings?.currentProject])

  // Settings → Steward, with the defaults for anything an older main process doesn't send.
  const look = { ...DEFAULT_STEWARD, ...settings?.steward }
  // Only when needed, the tab slides in from the screen edge and back as a transform in the page (see styles.css), so
  // every frame is the compositor's. The window never moves: macOS puts a window that is partly off screen back on it.
  useEffect(() => {
    const root = document.documentElement
    const jump = (out: boolean) => {
      root.dataset.slideJump = ''
      root.dataset.slide = out ? 'out' : 'in'
      // Read the style now, so the jump is over before the transitions come back.
      void getComputedStyle(document.getElementById('root')!).transform
      delete root.dataset.slideJump
    }
    const slide = ({ out, animate }: { out: boolean; animate: boolean }) => {
      if (!animate) return jump(out)
      // Coming in: the first frame is drawn away, and the next one starts the slide.
      if (!out && root.dataset.slide === 'out') requestAnimationFrame(() => (root.dataset.slide = 'in'))
      else root.dataset.slide = out ? 'out' : 'in'
    }
    void api.presence.slid().then(jump)
    return api.presence.onSlide(slide)
  }, [])

  // The tab and the nudge hang a little past the screen edge (so the window's rounded corners are off the screen); the
  // part that hangs over stays empty (see styles.css).
  useEffect(() => {
    const set = (points: number) => document.documentElement.style.setProperty('--overhang', `${points}px`)
    void api.dock.overhang().then(set)
    return api.dock.onOverhang(set)
  }, [])

  // The tab and the panel's animations face away from the screen edge it sits on.
  useEffect(() => {
    document.documentElement.dataset.edge = look.edge
  }, [look.edge])

  // The glass's tint and frost, from Settings → Steward.
  useEffect(() => applyPanelLook({ tint: look.tint, frost: look.frost }), [look.tint, look.frost])

  // The switcher belongs to the open panel; tucking away closes it.
  useEffect(() => {
    if (dock !== 'expanded') setSwitcher(false)
  }, [dock])

  const closeSwitcher = useCallback((refocus: boolean) => {
    setSwitcher(false)
    if (refocus) pill.current?.focus()
  }, [])

  /** Alerts the main process let through: the nudge shows them when tucked away, a banner when the panel is open. */
  function handleAlerts(list: AlertView[]) {
    setNudgeAlerts(list)
    setBanner(list[0] ?? null)
    setBannerMore(Math.max(0, list.length - 1))
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
        // Working, however the request started (the panel, an alert's offer, the demo).
        if (activity.status === 'running') setBusy(true)
        if (activity.status === 'running') running.current.set(activity.id, activity.kind)
        else running.current.delete(activity.id)
        setWork([...running.current.values()].at(-1) ?? null)
        // The pill follows whatever the agent starts on; a step that failed lets go of it.
        const touched = touchOf(activity)
        if (touched && activity.status === 'running') setTouch(touched)
        else if (touched && activity.status === 'failed') setTouch((t) => (t?.text === touched.text ? null : t))
        const project = currentProject.current
        if (activity.kind === 'read-file' && activity.status === 'done' && activity.target && project) {
          const file = activity.target
          setLastFiles((prev) => ({ ...prev, [project]: file }))
        }
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
        setTouch(null)
        running.current.clear()
        setWork(null)
        setAgentMood('done')
        doneTimer.current = setTimeout(() => setAgentMood(null), 2500)
        break
    }
  }

  // Dropping images in from Finder or a browser. Dragging toward the peek pops the panel open.
  // The panel's own shortcuts, as you set them in Settings.
  const switchKey = settings?.shortcuts?.switchProject.accelerator ?? ''
  const settingsKey = settings?.shortcuts?.openSettings.accelerator ?? ''

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
      // Already handled, like Esc closing the switcher.
      if (e.defaultPrevented) return
      const pressed = acceleratorFromKey(e)
      if (pressed && pressed === switchKey) {
        if (dock !== 'expanded') return
        e.preventDefault()
        setSwitcher((open) => !open)
        return
      }
      if (pressed && pressed === settingsKey) {
        e.preventDefault()
        void api.settings.open()
        return
      }
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
  }, [dock, showError, switchKey, settingsKey])

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

  const pickProject = (project: Project) => {
    setSwitcher(false)
    composer.current?.focus()
    if (project.path !== settings?.currentProject) api.settings.setCurrentProject(project.path).then(setSettings, showError)
  }

  const addProject = () => {
    setSwitcher(false)
    api.settings.addProjectAndSwitch().then(setSettings, showError)
  }

  const newChat = () => {
    setEntries([])
    void api.agent.reset()
  }

  // The pin is the "tuck away when I click elsewhere" setting, so Settings shows it too.
  const pinned = settings?.keepPanelOpen ?? false
  const waiting = sessions.some((s) => s.state === 'needs-approval' || s.state === 'needs-input')
  const mood = workingMood(pickMood({ agentMood, eventMood, listening: dragOver || typing, waiting, lateNight, tucked: dock === 'collapsed' || dock === 'hidden' }), work)
  const glint = glintFor(work)
  // Docked in the notch, the notch window shows the character: it gets the same mood.
  useEffect(() => api.notch.reportMood(mood, glint), [mood, glint])
  const tab = TAB_SIZES[look.size].pill
  // The tab can be dragged up or down its edge; a plain click still opens the panel.
  const tabDrag = useTabDrag(() => void api.dock.expand())
  // Dim when idle: the tab's eyes fade after a while at rest, until something happens or the cursor comes near.
  const [near, setNear] = useState(false)
  useEffect(() => api.presence.onNear(setNear), [])
  const tabDimmed = useDimmed(canDim({ enabled: look.dimWhenIdle, atRest: dock === 'collapsed' && !busy, near }), mood)
  const noKey = settings?.apiKeySource === 'none'

  /** "Want me to look?" and the like: open the panel and ask the agent. */
  const runAction = (alert: AlertView) => {
    if (!alert.action) return
    setBanner(null)
    void api.dock.expand()
    if (noKey) return setToast('Add your Anthropic API key in Settings first.')
    send(alert.action.prompt)
  }
  const hide = settings?.shortcuts?.hideFromEdge
  const hideKey = hide?.active ? ` (${formatAccelerator(hide.accelerator)})` : ''
  const project = settings?.projects.find((p) => p.path === settings.currentProject) ?? null
  const lastFile = project ? lastFiles[project.path] : undefined
  // Working: what it's on right now. Idle: the last file it read here.
  const pillTouch: Touch | null = (busy && touch) || (lastFile ? { kind: 'file', text: lastFile } : null)

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
    return (
      <Nudge alerts={nudgeAlerts} onOpen={() => api.dock.expand()} onDismiss={tuckAway} onAction={runAction}>
        <Pill mood={mood} glint={glint} width={tab.width} height={tab.height} cls="peek" look={look} />
      </Nudge>
    )
  }

  if (dock === 'collapsed' || dock === 'hidden') {
    const open = settings?.shortcuts?.togglePanel
    return (
      <button className="peek" data-app {...tabDrag} title={open?.active ? `${look.name} (${formatAccelerator(open.accelerator)})` : look.name}>
        <Pill mood={mood} glint={glint} width={tab.width} height={tab.height} cls="peek" look={look} tucked dimmed={tabDimmed} />
        {items.length > 0 && <span className="peek-count">{items.length}</span>}
      </button>
    )
  }

  return (
    <div className={`panel ${dragOver ? 'drag-over' : ''}`} data-app>
      <header className="panel-head">
        <Pill mood={mood} glint={glint} width={64} height={54} cls="header" look={look} />
        <div className="head-text">
          <div className="head-top">
            <span className="name">{look.name}</span>
            <div className="head-actions">
              <button className="icon-btn" aria-label="New chat" title="New chat" disabled={entries.length === 0 || busy} onClick={newChat}>
                <NewChatIcon />
              </button>
              <button
                className={`icon-btn ${pinned ? 'on' : ''}`}
                aria-label={pinned ? 'Unpin panel' : 'Keep panel open'}
                aria-pressed={pinned}
                onClick={() => api.settings.update({ keepPanelOpen: !pinned }).then(setSettings, showError)}
              >
                <PinIcon on={pinned} />
              </button>
              <button className="icon-btn" aria-label="Settings" title={settingsKey ? `Settings (${formatAccelerator(settingsKey)})` : 'Settings'} onClick={() => api.settings.open()}>
                <GearIcon />
              </button>
              <button className="icon-btn" aria-label="Hide from the screen edge" title={`Hide from the screen edge${hideKey}. Bring it back from the menu bar icon.`} onClick={() => api.dock.hide()}>
                <HideIcon />
              </button>
              <button className="icon-btn" aria-label="Tuck away" title="Tuck away (Esc)" onClick={() => api.dock.collapse()}>
                <ChevronRightIcon />
              </button>
            </div>
          </div>
          {settings && (
            <ContextPill
              project={project}
              touch={pillTouch}
              live={busy}
              open={switcher}
              shortcut={switchKey && formatAccelerator(switchKey)}
              onToggle={() => setSwitcher(!switcher)}
              pillRef={pill}
            />
          )}
        </div>
      </header>
      {switcherShown.mounted && settings && (
        <ProjectSwitcher
          settings={settings}
          anchor={pill}
          leaving={switcherShown.leaving}
          onPick={pickProject}
          onAdd={addProject}
          onClose={closeSwitcher}
        />
      )}

      <SessionStrip sessions={sessions} onDismiss={(id) => api.sessions.dismiss(id).catch(showError)} />
      {banner && (
        <div className="banner" role="status" onClick={() => setBanner(null)}>
          <strong>{banner.title}</strong>
          {banner.detail && <span>{banner.detail}</span>}
          {bannerMore > 0 && <span>and {bannerMore} more</span>}
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
        {presenceNote && (
          <div className="notice" role="status">
            {presenceNote}
            <button className="chip" onClick={() => setPresenceNote(null)}>
              Got it
            </button>
          </div>
        )}
        {brief && <BriefCard brief={brief} onDismiss={() => setBrief(null)} />}
        {leftOff && <LeftOffCard card={leftOff} onDismiss={() => setLeftOff(null)} />}
        {noKey && (
          <div className="notice">
            Add your Anthropic API key to start chatting.
            <button className="chip" onClick={() => api.settings.open('connections')}>
              Open settings
            </button>
          </div>
        )}
        <ChatLog entries={entries} onApprove={(id, ok) => api.agent.approve(id, ok)} />
      </div>
      <Composer
        busy={busy}
        disabled={noKey}
        onSend={send}
        onStop={() => api.agent.cancel()}
        onTyping={(on) => {
          setTyping(on)
          // Each key you type, it nods along.
          if (on) pillKey()
        }}
        inputRef={composer}
      />

      {dragOver && <div className="drop-overlay">Drop to add to the tray</div>}
      {toast && (
        <div className="toast" role="alert" onClick={() => setToast(null)}>
          {toast}
        </div>
      )}
    </div>
  )
}
