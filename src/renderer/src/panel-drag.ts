// Dragging the panel by its top bar, from its page, like the tab's drag (tab-drag.ts). A press that moves more than 5
// points is a drag (see shared/panel-place): the main process moves the window, kept inside the screen, and saves where
// it ends up. A press on a button, a link or a field is left alone, so they click as always. A double-click on the bar
// puts the panel back where it opens. A JS drag, not a native one: the page wouldn't see a native drag region's events.
import { useRef, type MouseEvent, type PointerEvent } from 'react'
import { isDrag } from '../../shared/panel-place'

/** What on the bar is its own control, not a handle. */
const CONTROLS = 'button, a, input, textarea, select, [role="button"]'
const onControl = (e: { target: EventTarget }) => e.target instanceof Element && e.target.closest(CONTROLS) !== null

export function usePanelDrag() {
  const press = useRef<{ x: number; y: number; dragging: boolean; frame: number; timer: number; to: { x: number; y: number } | null } | null>(null)
  const dock = () => window.steward.dock
  const end = (e: PointerEvent<HTMLElement>) => {
    const p = press.current
    press.current = null
    if (!p?.dragging) return
    cancelAnimationFrame(p.frame)
    clearTimeout(p.timer)
    if (p.to) dock().dragPanel('move', p.to.x, p.to.y)
    dock().dragPanel('end')
    e.currentTarget.classList.remove('dragging')
  }
  return {
    onPointerDown(e: PointerEvent<HTMLElement>) {
      if (e.button !== 0 || onControl(e)) return
      // The window moves under the cursor, and a quick drag can outrun it: the bar keeps the pointer until it's let go.
      e.currentTarget.setPointerCapture(e.pointerId)
      press.current = { x: e.screenX, y: e.screenY, dragging: false, frame: 0, timer: 0, to: null }
    },
    onPointerMove(e: PointerEvent<HTMLElement>) {
      const p = press.current
      if (!p) return
      if (!p.dragging) {
        if (!isDrag(e.screenX - p.x, e.screenY - p.y)) return
        p.dragging = true
        e.currentTarget.classList.add('dragging')
        dock().dragPanel('start', p.x, p.y)
      }
      // At most one move a frame: the latest place the pointer is at. A page that isn't being drawn gets no frames
      // (a test machine nobody looks at), so a timer sends it too, whichever comes first.
      const first = p.to === null
      p.to = { x: e.screenX, y: e.screenY }
      if (!first) return
      const send = () => {
        cancelAnimationFrame(p.frame)
        clearTimeout(p.timer)
        if (press.current !== p || !p.to) return
        dock().dragPanel('move', p.to.x, p.to.y)
        p.to = null
      }
      p.frame = requestAnimationFrame(send)
      p.timer = window.setTimeout(send, 50)
    },
    onPointerUp: end,
    onPointerCancel: end,
    onDoubleClick(e: MouseEvent<HTMLElement>) {
      if (!onControl(e)) void dock().resetPanel()
    },
  }
}
