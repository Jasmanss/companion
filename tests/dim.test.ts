import { describe, expect, it } from 'vitest'
import { canDim, DIM_AFTER_MS } from '../src/shared/dim'

describe('dim when idle', () => {
  it('waits 20 seconds', () => {
    expect(DIM_AFTER_MS).toBe(20_000)
  })

  it('may dim only with the setting on, at rest, and the cursor away', () => {
    expect(canDim({ enabled: true, atRest: true, near: false })).toBe(true)
    expect(canDim({ enabled: false, atRest: true, near: false })).toBe(false)
    // The panel open, a nudge out, or the agent working is not rest.
    expect(canDim({ enabled: true, atRest: false, near: false })).toBe(false)
    // The cursor coming near wakes it.
    expect(canDim({ enabled: true, atRest: true, near: true })).toBe(false)
  })
})
