// The home folding into a chat, and a new chat unfolding it again. The old view stays while it goes (styles.css has the
// moves); with Reduce Motion it's a plain swap.
import { useEffect, useState } from 'react'

/** How long the tiles take to fold away (their last one's delay and its 220 ms), and to come back. */
export const FOLD_MS = { folding: 280, unfolding: 420 } as const

export type HomeChange = keyof typeof FOLD_MS

/** Going from one to the other: the change under way, or null. */
export function useHomeChange(chatting: boolean, reduced: boolean): HomeChange | null {
  const [was, setWas] = useState(chatting)
  const [change, setChange] = useState<HomeChange | null>(null)
  if (was !== chatting) {
    setWas(chatting)
    setChange(reduced ? null : chatting ? 'folding' : 'unfolding')
  }
  useEffect(() => {
    if (!change) return
    const timer = setTimeout(() => setChange(null), FOLD_MS[change])
    return () => clearTimeout(timer)
  }, [change])
  return change
}
