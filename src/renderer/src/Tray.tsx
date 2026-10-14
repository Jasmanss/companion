import type { DragEvent } from 'react'
import type { SaveResult, TrayItem } from '../../shared/types'
import { CloseIcon, DragIcon } from './icons'

interface Props {
  items: TrayItem[]
  saveResult: SaveResult | null
  onDragOut: (ids: string[]) => (e: DragEvent) => void
  onOpen: (index: number) => void
  onSave: () => void
  onDismissSave: () => void
  onError: (message: string) => void
}

const api = () => window.steward

export function Tray({ items, saveResult, onDragOut, onOpen, onSave, onDismissSave, onError }: Props) {
  const fail = (err: unknown) => onError(err instanceof Error ? err.message : String(err))
  const ids = items.map((item) => item.id)

  return (
    <section className="tray" aria-label="Image tray">
      <div className="tray-head">
        <span className="tray-title">
          Tray{items.length > 0 && <span className="count">{items.length}</span>}
        </span>
        {items.length > 0 && (
          <div className="tray-actions">
            <span className="chip drag-all" draggable onDragStart={onDragOut(ids)} title="Drag everything out at once">
              <DragIcon /> Drag all
            </span>
            <button className="chip" onClick={onSave}>
              Save to project
            </button>
            <button className="chip quiet" onClick={() => api().tray.clear().catch(fail)}>
              Clear
            </button>
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <p className="tray-empty">Drop images here, paste with ⌘V, or ask me to find some.</p>
      ) : (
        <ul className="tray-grid">
          {items.map((item, i) => (
            <li key={item.id} className="thumb" data-tray-id={item.id} title={[item.name, item.note, item.credit, item.source].filter(Boolean).join('\n')}>
              <img src={`tray://${item.id}`} alt={item.name} draggable onDragStart={onDragOut([item.id])} onClick={() => onOpen(i)} />
              <button className="thumb-remove" aria-label={`Remove ${item.name}`} onClick={() => api().tray.remove(item.id).catch(fail)}>
                <CloseIcon />
              </button>
            </li>
          ))}
        </ul>
      )}

      {saveResult && (
        <div className="saved">
          <div className="saved-head">
            <span>
              Saved {saveResult.files.length} {saveResult.files.length === 1 ? 'image' : 'images'} to <code>{saveResult.dir}</code>
            </span>
            <button className="icon-btn" aria-label="Dismiss" onClick={onDismissSave}>
              <CloseIcon />
            </button>
          </div>
          <pre className="snippet">{saveResult.snippet}</pre>
          <div className="saved-actions">
            <button className="chip" onClick={() => api().copyText(saveResult.snippet)}>
              Copy code
            </button>
            <button className="chip quiet" onClick={() => api().tray.reveal(saveResult.files[0])}>
              Show in Finder
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
