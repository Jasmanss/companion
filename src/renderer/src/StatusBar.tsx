// While a chat is open the home's cards fold into this one line (design/main-chat.html, Direction F; the counts are
// statusCounts in shared/cards). Amber is the cue that something waits on you, and a click goes to it. Working and images
// open their card above the thread, so the sessions and the tray are still in reach.
import type { StatusCounts, Unfolded } from '../../shared/cards'
import { HandIcon, ImageIcon } from './icons'

export function StatusBar({ counts, unfolded, onWaiting, onToggle }: { counts: StatusCounts; unfolded: Unfolded | null; onWaiting: () => void; onToggle: (what: 'sessions' | 'tray') => void }) {
  const { working, waiting, images } = counts
  return (
    <div className="status-bar" role="group" aria-label="What's going on">
      <button type="button" className="sb" aria-expanded={unfolded === 'sessions'} title="Show the sessions" onClick={() => onToggle('sessions')}>
        <i className={working > 0 ? 'sb-dot live' : 'sb-dot'} aria-hidden />
        <b>{working}</b> working
      </button>
      <button type="button" className={waiting > 0 ? 'sb warn' : 'sb'} disabled={waiting === 0} aria-expanded={unfolded === 'waiting'} title={waiting > 0 ? 'Go to what waits on you' : 'Nothing waits on you'} onClick={onWaiting}>
        <HandIcon />
        <b>{waiting}</b> waiting
      </button>
      <button type="button" className="sb" aria-expanded={unfolded === 'tray'} title="Show the tray" onClick={() => onToggle('tray')}>
        <ImageIcon />
        <b>{images}</b> {images === 1 ? 'image' : 'images'}
      </button>
    </div>
  )
}
