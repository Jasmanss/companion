import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Markdown } from './Markdown'

export type Entry =
  | { kind: 'user'; id: number; text: string }
  | { kind: 'assistant'; id: number; text: string }
  | { kind: 'activity'; id: number; text: string }
  | { kind: 'approval'; id: number; approvalId: string; command: string; cwd: string; why?: string; status: 'pending' | 'approved' | 'declined' }
  | { kind: 'output'; id: number; command: string; exitCode: number | null; text: string }
  | { kind: 'error'; id: number; text: string }

export function ChatLog({ entries, onApprove }: { entries: Entry[]; onApprove: (approvalId: string, approved: boolean) => void }) {
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    void end.current?.scrollIntoView({ block: 'end' })
  }, [entries])

  return (
    <div className="log" role="log" aria-live="polite">
      {entries.length === 0 && (
        <div className="hint">
          <p>Try:</p>
          <ul>
            <li>“Find 4 landing pages with bento grids”</li>
            <li>“3 dark desk-setup photos for a hero”</li>
            <li>“Run the tests”</li>
          </ul>
        </div>
      )}
      {entries.map((entry) => {
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
                <Markdown text={entry.text} />
              </div>
            )
          case 'activity':
            return (
              <p key={entry.id} className="activity">
                {entry.text}
              </p>
            )
          case 'error':
            return (
              <p key={entry.id} className="msg error" role="alert">
                {entry.text}
              </p>
            )
          case 'output':
            return (
              <details key={entry.id} className="output">
                <summary>
                  Output of <code>{entry.command}</code> {entry.exitCode === 0 ? '· ok' : `· exit ${entry.exitCode ?? '?'}`}
                </summary>
                <pre>{entry.text || '(no output)'}</pre>
              </details>
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

export function Composer({
  busy,
  disabled,
  onSend,
  onStop,
  onTyping,
}: {
  busy: boolean
  disabled: boolean
  onSend: (text: string) => void
  onStop: () => void
  onTyping: (typing: boolean) => void
}) {
  const [text, setText] = useState('')
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

  return (
    <div className="composer">
      <textarea
        value={text}
        rows={Math.min(5, Math.max(1, text.split('\n').length))}
        placeholder={disabled ? 'Add an API key in Settings to chat' : 'Ask for designs, images, or a command…'}
        disabled={disabled}
        onChange={(e) => {
          setText(e.target.value)
          onTyping(e.target.value.length > 0)
        }}
        onBlur={() => onTyping(false)}
        onKeyDown={onKeyDown}
        aria-label="Message"
      />
      {busy ? (
        <button className="btn" onClick={onStop}>
          Stop
        </button>
      ) : (
        <button className="btn primary" onClick={send} disabled={disabled || !text.trim()}>
          Send
        </button>
      )}
    </div>
  )
}
