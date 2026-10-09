import { useEffect, useRef, useState, type DragEvent, type MouseEvent } from 'react'
import type { TrayItem } from '../../shared/types'
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, ExternalIcon, TrashIcon } from './icons'

interface Props {
  items: TrayItem[]
  index: number
  onIndex: (index: number) => void
  onClose: () => void
  onRemove: (id: string) => void
  onDragOut: (ids: string[]) => (e: DragEvent) => void
}

/** The big view of tray images: flip with the arrows or ← →, click to zoom, Esc to go back. */
export function Viewer({ items, index, onIndex, onClose, onRemove, onDragOut }: Props) {
  const item = items[index]
  const strip = useRef<HTMLOListElement>(null)
  const go = (next: number) => onIndex(Math.min(items.length - 1, Math.max(0, next)))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') onIndex(Math.max(0, index - 1))
      else if (e.key === 'ArrowRight') onIndex(Math.min(items.length - 1, index + 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, items.length, onIndex])

  useEffect(() => {
    void strip.current?.children[index]?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
  }, [index])

  if (!item) return null
  return (
    <div className="viewer" data-app>
      <header className="viewer-head">
        <div className="viewer-title">
          <span className="viewer-name">{item.name}</span>
          {(item.note || item.credit) && <span className="viewer-note">{[item.note, item.credit].filter(Boolean).join(' · ')}</span>}
        </div>
        <span className="viewer-count">
          {index + 1} / {items.length}
        </span>
        {item.source && /^https?:/.test(item.source) && (
          <a className="icon-btn" href={item.source} target="_blank" rel="noreferrer" aria-label="Open the source page" title="Open the source page">
            <ExternalIcon />
          </a>
        )}
        <button className="icon-btn" aria-label="Remove from tray" title="Remove from tray" onClick={() => onRemove(item.id)}>
          <TrashIcon />
        </button>
        <button className="icon-btn" aria-label="Close viewer" title="Back to the panel (Esc)" onClick={onClose}>
          <CloseIcon />
        </button>
      </header>

      <div className="viewer-body">
        {/* Keyed so zoom and scroll reset for each image. */}
        <Zoomable key={item.id} item={item} onDragOut={onDragOut} />
        {index > 0 && (
          <button className="viewer-nav prev" aria-label="Previous image" onClick={() => go(index - 1)}>
            <ChevronLeftIcon />
          </button>
        )}
        {index < items.length - 1 && (
          <button className="viewer-nav next" aria-label="Next image" onClick={() => go(index + 1)}>
            <ChevronRightIcon />
          </button>
        )}
      </div>

      {items.length > 1 && (
        <ol className="viewer-strip" ref={strip}>
          {items.map((it, i) => (
            <li key={it.id}>
              <button className={i === index ? 'on' : ''} aria-label={`Show ${it.name}`} aria-current={i === index} onClick={() => go(i)}>
                <img src={`tray://${it.id}`} alt="" draggable={false} />
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

/** Fits the image to the width; a click zooms in around the pointer, another zooms back out. */
function Zoomable({ item, onDragOut }: { item: TrayItem; onDragOut: Props['onDragOut'] }) {
  const [zoomWidth, setZoomWidth] = useState<number | null>(null)
  const scroller = useRef<HTMLDivElement>(null)

  const toggleZoom = (e: MouseEvent<HTMLImageElement>) => {
    const box = scroller.current
    if (!box) return
    const image = e.currentTarget
    const rect = image.getBoundingClientRect()
    const boxRect = box.getBoundingClientRect()
    const relX = (e.clientX - rect.left) / rect.width
    const relY = (e.clientY - rect.top) / rect.height
    setZoomWidth(zoomWidth ? null : Math.max(image.naturalWidth, rect.width * 2))
    // Keep the spot under the pointer in place.
    requestAnimationFrame(() => {
      const next = image.getBoundingClientRect()
      box.scrollLeft = relX * next.width - (e.clientX - boxRect.left)
      box.scrollTop = relY * next.height - (e.clientY - boxRect.top)
    })
  }

  return (
    <div className={`viewer-stage ${zoomWidth ? 'zoomed' : ''}`} ref={scroller}>
      <img
        src={`tray://${item.id}`}
        alt={item.note ?? item.name}
        style={zoomWidth ? { width: zoomWidth } : undefined}
        draggable
        onDragStart={onDragOut([item.id])}
        onClick={toggleZoom}
      />
    </div>
  )
}
