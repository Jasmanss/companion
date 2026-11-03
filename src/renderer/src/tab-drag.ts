// Dragging the tab up or down its screen edge, from its page. A press that moves more than 5 points is a drag (see
// shared/tab-place): the main process moves the window and saves where it ends up, and the click that ends a drag doesn't
// open the panel. Anything less is still a click.
import { useRef, type PointerEvent } from 'react'
import { isDrag } from '../../shared/tab-place'

export function useTabDrag(onClick: () => void) {
  const press = useRef<{ x: number; y: number; dragging: boolean } | null>(null)
  const dragged = useRef(false)
  const end = (e: PointerEvent<HTMLElement>) => {
    if (press.current?.dragging) window.steward.dock.drag('end')
    e.currentTarget.classList.remove('dragging')
    press.current = null
  }
  return {
    onPointerDown(e: PointerEvent<HTMLElement>) {
      if (e.button !== 0) return
      // The window moves under the cursor, and a quick drag can outrun it: the tab keeps the pointer until it's let go.
      e.currentTarget.setPointerCapture(e.pointerId)
      press.current = { x: e.screenX, y: e.screenY, dragging: false }
      dragged.current = false
    },
    onPointerMove(e: PointerEvent<HTMLElement>) {
      const p = press.current
      if (!p) return
      const dy = e.screenY - p.y
      if (!p.dragging && isDrag(e.screenX - p.x, dy)) {
        p.dragging = true
        dragged.current = true
        e.currentTarget.classList.add('dragging')
        window.steward.dock.drag('start')
      }
      if (p.dragging) window.steward.dock.drag('move', dy)
    },
    onPointerUp: end,
    onPointerCancel: end,
    onClick() {
      if (dragged.current) dragged.current = false
      else onClick()
    },
  }
}
