import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { addressLabel, CARD_SHOT, filesChangedLabel, noChangesReason, PHONE_SHOT, reviewNote, reviewPictureUrl } from '../../shared/review'
import type { ReviewRegion, ReviewView } from '../../shared/types'
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon } from './icons'

const api = () => window.steward

const message = (err: unknown) => (err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err))

/** How to compare: a slider over the two, the two next to each other, or one at a time. */
export type CompareMode = 'slide' | 'side' | 'flip'
const MODES: { mode: CompareMode; label: string }[] = [
  { mode: 'slide', label: 'Slide' },
  { mode: 'side', label: 'Side by side' },
  { mode: 'flip', label: 'Flip' },
]

/** Pages are photographed this wide (or a phone's width), so at 100% a picture is the page's real size. */
const PAGE_WIDTH = CARD_SHOT.width
/** The space around the pictures, and between them side by side. */
const PAD = 14
const GAP = 14
/** How far ← → move the slider, and with Shift. */
const STEP = 5
const BIG_STEP = 20

const clampX = (x: number) => Math.max(5, Math.min(95, x))
/** The outline sits this far outside the change, so the change itself stays in view. */
const MARK_PAD = 4

/** The changed areas, outlined over a picture shown at `scale`. The one being looked at is stronger. */
function Marks({ regions, scale, at }: { regions: ReviewRegion[]; scale: number; at: number }) {
  return (
    <div className="rvv-marks" aria-hidden="true">
      {regions.map((r, i) => (
        <div
          key={i}
          className={`rvv-mark${i === at ? ' on' : ''}`}
          data-i={i}
          style={{ left: r.x * scale - MARK_PAD, top: r.y * scale - MARK_PAD, width: r.width * scale + 2 * MARK_PAD, height: r.height * scale + 2 * MARK_PAD }}
        />
      ))}
    </div>
  )
}

/**
 * Visual Review, big: the whole page before and after in nearly the whole screen. Slide, side by side or flip; fit to the
 * width or 100%; the same two decisions as the card. Esc goes back to the panel (App handles it, as for the tray's viewer).
 * Only this review's two pictures are loaded, and they go when it closes.
 */
export function ReviewViewer({
  reviews,
  index,
  onIndex,
  onDone,
}: {
  reviews: ReviewView[]
  index: number
  onIndex: (index: number) => void
  /** A decision was made: back to the panel, which says what happened. */
  onDone: (text: string) => void
}) {
  const review = reviews[index]
  // Desktop or a phone's width (when the project asks for it): it opens on the phone's when only that changed.
  const [size, setSize] = useState<'desktop' | 'phone'>(review.phone?.only ? 'phone' : 'desktop')
  const phone = size === 'phone' ? review.phone : null
  const page = phone
    ? { width: PHONE_SHOT.width, heightBefore: phone.heightBefore, heightAfter: phone.heightAfter, beforeFrom: phone.beforeFrom, regions: phone.regions }
    : { width: PAGE_WIDTH, heightBefore: review.heightBefore, heightAfter: review.heightAfter, beforeFrom: review.beforeFrom, regions: review.regions }
  const hasBefore = page.beforeFrom !== 'none'
  const [mode, setMode] = useState<CompareMode>('slide')
  const [real, setReal] = useState(false)
  const [x, setX] = useState(55)
  const [showing, setShowing] = useState<'before' | 'after'>('after')
  // Show changes: the changed areas outlined, and which one is being looked at.
  const [marked, setMarked] = useState(false)
  const [at, setAt] = useState(0)
  const regions = page.regions ?? []
  const cannotMark = noChangesReason(page)
  const scroller = useRef<HTMLDivElement>(null)
  const [room, setRoom] = useState(0)
  const go = (next: number) => onIndex(Math.max(0, Math.min(reviews.length - 1, next)))
  const shown: CompareMode = hasBefore ? mode : 'flip'

  // How wide the pictures can be: the scroller, less its padding.
  useLayoutEffect(() => {
    const box = scroller.current
    if (!box) return
    const measure = () => setRoom(box.clientWidth - 2 * PAD)
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(box)
    return () => watch.disconnect()
  }, [])

  // Another review starts at its top, showing the page as it is now, with nothing outlined.
  useEffect(() => {
    setSize(review.phone?.only ? 'phone' : 'desktop')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [review.id])
  useEffect(() => {
    scroller.current?.scrollTo(0, 0)
    setShowing('after')
    setMarked(false)
    setAt(0)
    // Arrow keys up and down scroll the page from the start.
    scroller.current?.focus({ preventScroll: true })
  }, [review.id, size])

  // Showing changes brings the one being looked at into view (side by side, the left one; both scroll together).
  useEffect(() => {
    if (!marked) return
    const mark = scroller.current?.querySelector(`.rvv-mark[data-i="${at}"]`)
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    mark?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: still ? 'auto' : 'smooth' })
  }, [marked, at, mode, real, review.id, size])

  /** The next changed area (or the one before), outlining them all if they weren't. */
  const step = (by: number) => {
    if (cannotMark) return
    if (!marked) {
      setMarked(true)
      setAt(by < 0 ? regions.length - 1 : 0)
    } else setAt((now) => (now + by + regions.length) % regions.length)
  }

  // Keys, before the panel's own (which takes Esc back to the panel). Typing a note is left alone.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target
      const typing = t instanceof HTMLTextAreaElement || (t instanceof HTMLInputElement && t.type !== 'range')
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || typing) return
      const take = () => {
        e.preventDefault()
        e.stopPropagation()
      }
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && shown === 'slide') {
        take()
        const by = (e.shiftKey ? BIG_STEP : STEP) * (e.key === 'ArrowLeft' ? -1 : 1)
        setX((now) => clampX(now + by))
      } else if (e.key === '1' || e.key === '2' || e.key === '3') {
        take()
        if (hasBefore) setMode(MODES[Number(e.key) - 1].mode)
      } else if (e.key === ' ' && !(t instanceof HTMLButtonElement)) {
        take()
        if (!hasBefore) return
        if (mode !== 'flip') setMode('flip')
        else setShowing((now) => (now === 'after' ? 'before' : 'after'))
      } else if (e.key === 'z' || e.key === 'Z') {
        take()
        setReal((now) => !now)
      } else if (e.key === '[' || e.key === ']') {
        take()
        go(index + (e.key === '[' ? -1 : 1))
      } else if ((e.key === 'p' || e.key === 'P') && review.phone) {
        take()
        setSize((now) => (now === 'phone' ? 'desktop' : 'phone'))
      } else if (e.key === 'c' || e.key === 'C') {
        take()
        if (!cannotMark) setMarked((now) => !now)
      } else if (e.key === 'n' || e.key === 'N') {
        take()
        step(e.shiftKey ? -1 : 1)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  const side = shown === 'side'
  const scale = real ? 1 : Math.min(1, Math.max(0.1, (side ? (room - GAP) / 2 : room) / page.width))
  const width = Math.round(page.width * scale)
  const tall = (h: number | null) => Math.round((h ?? 0) * scale)
  const before = reviewPictureUrl(review.id, phone ? 'before-phone' : 'before')
  const after = reviewPictureUrl(review.id, phone ? 'after-phone' : 'after')
  const flipped = hasBefore && showing === 'before'

  // Slide: press anywhere on the picture and drag.
  const dragging = useRef(false)
  const slideTo = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    setX(clampX(((e.clientX - r.left) / r.width) * 100))
  }

  return (
    <div className="viewer review-viewer" data-app role="dialog" aria-label={`What changed in ${review.project}, big`}>
      <header className="viewer-head rvv-head">
        <div className="rvv-title">
          <span className="viewer-name">{review.project}</span>
          <span className="chip">{addressLabel(review.address)}</span>
          {review.filesChanged !== null && <span className="chip quiet">{filesChangedLabel(review.filesChanged)}</span>}
          {reviews.length > 1 && (
            <span className="rvv-count">
              <button className="icon-btn" aria-label="Previous review" title="Previous review ([)" disabled={index === 0} onClick={() => go(index - 1)}>
                <ChevronLeftIcon />
              </button>
              <span>
                Review {index + 1} of {reviews.length}
              </span>
              <button className="icon-btn" aria-label="Next review" title="Next review (])" disabled={index === reviews.length - 1} onClick={() => go(index + 1)}>
                <ChevronRightIcon />
              </button>
            </span>
          )}
        </div>
        <span className="rvv-seg" role="group" aria-label="How to compare">
          {MODES.map((m, i) => (
            <button key={m.mode} aria-pressed={shown === m.mode} disabled={!hasBefore} title={`${m.label} (${i + 1})`} onClick={() => setMode(m.mode)}>
              {m.label}
            </button>
          ))}
        </span>
        {review.phone && (
          <span className="rvv-seg" role="group" aria-label="Width">
            <button aria-pressed={size === 'desktop'} title="The desktop's width (P)" onClick={() => setSize('desktop')}>
              Desktop
            </button>
            <button aria-pressed={size === 'phone'} title={`A phone's width, 390 px (P)${review.phone.changed ? '' : ': it looks the same there'}`} onClick={() => setSize('phone')}>
              Phone
            </button>
          </span>
        )}
        <span className="rvv-changes">
          <span className="rvv-seg">
            <button aria-pressed={marked} disabled={Boolean(cannotMark)} title={cannotMark ?? 'Outline what changed (C), and go from one change to the next (N)'} onClick={() => setMarked(!marked)}>
              Show changes
            </button>
          </span>
          {marked && (
            <span className="rvv-count" aria-live="polite">
              <button className="icon-btn" aria-label="Previous change" title="Previous change (Shift N)" onClick={() => step(-1)}>
                <ChevronLeftIcon />
              </button>
              <span>
                {at + 1} of {regions.length}
              </span>
              <button className="icon-btn" aria-label="Next change" title="Next change (N)" onClick={() => step(1)}>
                <ChevronRightIcon />
              </button>
            </span>
          )}
        </span>
        <span className="rvv-seg" role="group" aria-label="Size">
          <button aria-pressed={!real} title="Fit to the width (Z)" onClick={() => setReal(false)}>
            Fit
          </button>
          <button aria-pressed={real} title="The page's real size (Z)" onClick={() => setReal(true)}>
            100%
          </button>
        </span>
        <button className="icon-btn" aria-label="Back to the panel" title="Back to the panel (Esc)" onClick={() => api().dock.expand()}>
          <CloseIcon />
        </button>
      </header>

      {(review.said || page.beforeFrom !== 'turn-start' || review.phone?.only) && (
        <div className="rvv-note">
          {review.said && (
            <p className="rv-said">
              <b>Claude says:</b> {review.said} <span className="rv-said-src">from Claude's reply</span>
            </p>
          )}
          {review.phone?.only && <p className="muted small">Only a phone's width looks different: at the desktop's, the page looks the same.</p>}
          {page.beforeFrom === 'none' && <p className="muted small">There is no earlier picture of this page{phone ? " at a phone's width" : ''}, so only how it looks now is shown.</p>}
          {page.beforeFrom === 'last-look' && <p className="muted small">The before picture is from the last time Steward looked, not from when you sent the prompt.</p>}
        </div>
      )}

      <div className="rvv-stage" ref={scroller} tabIndex={-1}>
        {shown === 'slide' && (
          <div
            className="rvv-box rvv-slide"
            style={{ width, height: Math.max(tall(page.heightBefore), tall(page.heightAfter)), '--x': `${x}%` } as CSSProperties}
            onPointerDown={(e) => {
              if (e.button !== 0) return
              dragging.current = true
              e.currentTarget.setPointerCapture(e.pointerId)
              slideTo(e)
            }}
            onPointerMove={(e) => dragging.current && slideTo(e)}
            onPointerUp={() => (dragging.current = false)}
            onPointerCancel={() => (dragging.current = false)}
          >
            <img className="rvv-pic" src={before} width={width} alt="The page before" draggable={false} />
            <img className="rvv-pic rvv-after" src={after} width={width} alt="The page now" draggable={false} />
            {marked && <Marks regions={regions} scale={scale} at={at} />}
            <span className="rv-tag b">Before</span>
            <span className="rv-tag a">After</span>
            <div className="rvv-bar">
              <div className="rvv-knob" />
            </div>
            <input
              className="rvv-range"
              type="range"
              min={5}
              max={95}
              value={Math.round(x)}
              onChange={(e) => setX(Number(e.target.value))}
              aria-label="Slide to compare the page before and after"
            />
          </div>
        )}
        {shown === 'side' && (
          <div className="rvv-sbs" style={{ gap: GAP }}>
            <figure>
              <figcaption>Before</figcaption>
              <div className="rvv-box" style={{ width }}>
                <img className="rvv-pic" src={before} width={width} alt="The page before" draggable={false} />
                {marked && <Marks regions={regions} scale={scale} at={at} />}
              </div>
            </figure>
            <figure>
              <figcaption>After</figcaption>
              <div className="rvv-box" style={{ width }}>
                <img className="rvv-pic" src={after} width={width} alt="The page now" draggable={false} />
                {marked && <Marks regions={regions} scale={scale} at={at} />}
              </div>
            </figure>
          </div>
        )}
        {shown === 'flip' && (
          <div className={`rvv-box rvv-flip${hasBefore ? ' can-flip' : ''}`} style={{ width }} onClick={() => hasBefore && setShowing(flipped ? 'after' : 'before')}>
            {/* Both stay loaded, so a flip is instant; only one shows. */}
            {hasBefore && <img className="rvv-pic" src={before} width={width} alt="The page before" draggable={false} hidden={!flipped} />}
            <img className="rvv-pic" src={after} width={width} alt="The page now" draggable={false} hidden={flipped} />
            {marked && <Marks regions={regions} scale={scale} at={at} />}
            {hasBefore ? (
              <button
                className={`rv-tag ${flipped ? 'b' : 'a'} rvv-flip-tag`}
                onClick={(e) => {
                  e.stopPropagation()
                  setShowing(flipped ? 'after' : 'before')
                }}
              >
                {flipped ? 'Before' : 'After'} · Space flips
              </button>
            ) : (
              <span className="rv-tag a">Now</span>
            )}
          </div>
        )}
      </div>

      <Decide key={review.id} review={review} atPhone={Boolean(phone)} scale={scale} side={side} onDone={onDone} />

      <p className="rvv-keys">
        <kbd>Esc</kbd> back · <kbd>←</kbd> <kbd>→</kbd> move the slider (<kbd>Shift</kbd> for more) · <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> Slide, Side by side, Flip ·{' '}
        <kbd>Space</kbd> flip · <kbd>Z</kbd> Fit or 100%{review.phone && <> · <kbd>P</kbd> phone or desktop</>}
        {!cannotMark && <> · <kbd>C</kbd> show changes, <kbd>N</kbd> the next one</>}
        {reviews.length > 1 && <> · <kbd>[</kbd> <kbd>]</kbd> other reviews</>} · scroll or <kbd>↑</kbd> <kbd>↓</kbd> for the rest of the page
      </p>
    </div>
  )
}

/**
 * The bottom bar: Looks good, Send it back (the note box), Open in Preview, and how big the pictures are shown. What
 * goes wrong is said here: the panel's own messages aren't drawn while the viewer is.
 */
function Decide({ review, atPhone, scale, side, onDone }: { review: ReviewView; atPhone: boolean; scale: number; side: boolean; onDone: (text: string) => void }) {
  const [asking, setAsking] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const onError = (text: string) => setError(text)
  const problem = error && (
    <p className="rvv-error" role="alert">
      {error}
    </p>
  )

  const decide = (work: Promise<unknown>, done: string) => {
    setBusy(true)
    setError(null)
    work.then(
      () => onDone(done),
      (err: unknown) => {
        setBusy(false)
        onError(message(err))
      },
    )
  }

  if (asking) {
    return (
      <footer className="rvv-foot sending">
        {problem}
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            // Esc here puts the note away, not the viewer.
            if (e.key !== 'Escape') return
            e.preventDefault()
            setAsking(false)
          }}
          placeholder="What should change?"
          rows={2}
          autoFocus
          aria-label="What should change?"
        />
        <pre className="rv-out">
          {reviewNote({ project: review.project, address: review.address, note, afterFile: review.files.after, beforeFile: review.files.before, phoneFile: review.files.phoneAfter })}
        </pre>
        <div className="rv-buttons">
          <button className="btn primary" disabled={busy} onClick={() => decide(api().review.sendBack(review.id, note), 'Copied. Paste it into the session; the picture is saved at the path in the note.')}>
            Copy note for the session
          </button>
          <button className="btn" disabled={busy} onClick={() => setAsking(false)}>
            Cancel
          </button>
        </div>
      </footer>
    )
  }
  return (
    <footer className="rvv-foot">
      {problem}
      <button className="btn primary" disabled={busy} onClick={() => decide(api().review.markGood(review.id), 'Marked as reviewed.')}>
        Looks good
      </button>
      <button className="btn" disabled={busy} onClick={() => setAsking(true)}>
        Send it back
      </button>
      <button className="btn rvv-preview" onClick={() => api().review.openFull(review.id, atPhone ? 'after-phone' : 'after').catch((err: unknown) => onError(message(err)))}>
        Open in Preview
      </button>
      <span className="rvv-zoom muted small">
        {Math.round(scale * 100)}% of the real page{side && scale < 1 ? ' (each side)' : ''}
      </span>
    </footer>
  )
}
