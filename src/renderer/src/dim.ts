// Dim when idle, in a page: the eyes dim once they may (shared/dim) and nothing has woken them for DIM_AFTER_MS.
import { useEffect, useState } from 'react'
import { DIM_AFTER_MS } from '../../shared/dim'

/** wake: anything that should start the wait over when it changes, like the mood. */
export function useDimmed(can: boolean, wake: string): boolean {
  const key = `${can}|${wake}`
  const [dimmedFor, setDimmedFor] = useState<string | null>(null)
  useEffect(() => {
    if (!can) return
    const timer = setTimeout(() => setDimmedFor(key), DIM_AFTER_MS)
    return () => clearTimeout(timer)
  }, [can, key])
  return can && dimmedFor === key
}
