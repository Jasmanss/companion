import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type Ref } from 'react'
import type { CommandMode } from '../../shared/types'
import { StepsGroup, ThinkingRow } from './Activity'
import { groupEntries, type Entry } from './chat-groups'
import { SendIcon, ShieldIcon, StopIcon } from './icons'
import { Markdown } from './Markdown'

export type { Entry }

export function ChatLog({ entries, onApprove }: { entries: Entry[]; onApprove: (approvalId: string, approved: boolean) => void }) {
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    void end.current?.scrollIntoView({ block: 'end' })
  }, [entries])
  const blocks = useMemo(() => groupEntries(entries), [entries])

  return (
    <div className="log" role="log" aria-live="polite">
      {blocks.map((block) => {
        if (block.type === 'thinking') return <ThinkingRow key={block.entry.id} />
        if (block.type === 'steps') return <StepsGroup key={block.key} steps={block.steps} />
        const entry = block.entry
        switch (entry.kind) {
          case 'user':
            return (
              <p key={entry.id} className="msg user">
                {entry.text}
              </p>
            )
          case 'assistant':
            return (
              <div key={entry.id} className="msg assistant">
                <Markdown text={entry.text} streaming={entry.streaming} />
              </div>
            )
          case 'notice':
            return (
              <p key={entry.id} className="msg notice-line">
                {entry.text}
              </p>
            )
          case 'error':
            return (
              <p key={entry.id} className="msg error" role="alert">
                {entry.text}
              </p>
            )
          case 'approval':
            return (
              <div key={entry.id} className={`approval ${entry.status}`}>
                <p className="approval-title">
                  {entry.status === 'pending' ? 'Run this?' : entry.status === 'approved' ? 'Ran' : 'Skipped'}
                  <span className="cwd">in {entry.cwd.split('/').pop()}</span>
                </p>
                <pre className="command">{entry.command}</pre>
                {entry.why && <p className="why">{entry.why}</p>}
                {/* Auto never looks like a loophole: what still asks says why. */}
                {entry.reason && entry.status === 'pending' && <p className="why-asks">Auto is on, but {entry.reason}.</p>}
                {entry.status === 'pending' && (
                  <div className="approval-actions">
                    <button className="btn primary" onClick={() => onApprove(entry.approvalId, true)}>
                      Run
                    </button>
                    <button className="btn" onClick={() => onApprove(entry.approvalId, false)}>
                      Skip
                    </button>
                  </div>
                )}
              </div>
            )
        }
      })}
      <div ref={end} />
    </div>
  )
}

/** What each way of running commands means, for the switch's explanation. */
const MODES: Record<CommandMode, { name: string; means: string }> = {
  ask: { name: 'Ask each time', means: 'Every command waits for your Run click.' },
  auto: { name: 'Auto', means: 'Safe commands (reading, searching, tests, lint) run by themselves. Anything that deletes, pushes, deploys, installs or goes outside the project still asks.' },
}

/**
 * Ask | Auto, by the text box: the same setting as Settings → Running commands, so the two never disagree. Hover or
 * focus says what the mode means.
 */
function ModeSwitch({ mode, onMode }: { mode: CommandMode; onMode: (mode: CommandMode) => void }) {
  const tip = useId()
  return (
    <span className="mode">
      <span className="mseg" role="group" aria-label="Running commands" aria-describedby={tip}>
        <button type="button" className="ask" aria-pressed={mode === 'ask'} onClick={() => onMode('ask')}>
          Ask
        </button>
        <button type="button" className="auto" aria-pressed={mode === 'auto'} onClick={() => onMode('auto')}>
          <ShieldIcon />
          Auto
        </button>
      </span>
      <span className="pop" role="tooltip" id={tip}>
        <b>{MODES[mode].name}</b>
        <span>{MODES[mode].means}</span>
        <span className="sep" />
        <span>Same as Settings → Running commands.</span>
      </span>
    </span>
  )
}

export function Composer({
  busy,
  disabled,
  mode,
  onMode,
  onSend,
  draft,
  onStop,
  onTyping,
  inputRef,
}: {
  busy: boolean
  disabled: boolean
  /** How commands run (Settings → Running commands); the switch shows once it's known. */
  mode?: CommandMode
  onMode: (mode: CommandMode) => void
  onSend: (text: string) => void
  /** A thing to try, picked from the panel's Try card: it goes in the box, to send or change first. */
  draft?: { text: string; at: number } | null
  onStop: () => void
  onTyping: (typing: boolean) => void
  inputRef?: Ref<HTMLTextAreaElement>
}) {
  const [text, setText] = useState('')
  const [drafted, setDrafted] = useState(draft)
  if (draft !== drafted) {
    setDrafted(draft)
    if (draft) setText(draft.text)
  }
  const send = () => {
    const trimmed = text.trim()
    if (!trimmed || busy || disabled) return
    onSend(trimmed)
    setText('')
  }
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const typed = text.trim().length > 0
  return (
    <div className="composer">
      <div className="cbox">
        {mode && <ModeSwitch mode={mode} onMode={onMode} />}
        <textarea
          ref={inputRef}
          value={text}
          rows={Math.min(5, Math.max(1, text.split('\n').length))}
          // Short: Ask | Auto shares the box with it.
          placeholder={disabled ? 'Add an API key in Settings' : 'Ask, or run a command…'}
          disabled={disabled}
          onChange={(e) => {
            setText(e.target.value)
            onTyping(e.target.value.length > 0)
          }}
          onBlur={() => onTyping(false)}
          onKeyDown={onKeyDown}
          aria-label="Message"
        />
        {/* Round: quiet while there's nothing to send, filled once there is. */}
        {busy ? (
          <button type="button" className="send on" aria-label="Stop" title="Stop" onClick={onStop}>
            <StopIcon />
          </button>
        ) : (
          <button type="button" className={`send ${typed ? 'on' : ''}`} aria-label="Send" title="Send" onClick={send} disabled={disabled || !typed}>
            <SendIcon />
          </button>
        )}
      </div>
    </div>
  )
}
