import { describe, expect, it } from 'vitest'
import { islandBodyKind } from '../src/shared/notch'
import { PILL_COLORS } from '../src/shared/steward'
import { BACKDROP, contrast, glassEdgeFor } from '../src/renderer/src/pill/color'

const hex = (id: string) => PILL_COLORS.find((c) => c.id === id)!.hex

describe("Steward's body in the island (notch island Phase 4)", () => {
  it('is the look you chose', () => {
    expect(islandBodyKind('glass', false)).toBe('glass')
    expect(islandBodyKind('flat', false)).toBe('flat')
    expect(islandBodyKind('blocky', false)).toBe('blocky')
  })

  it('is the flat body for Glass with Reduce Transparency on, and otherwise unchanged by it', () => {
    expect(islandBodyKind('glass', true)).toBe('flat')
    expect(islandBodyKind('flat', true)).toBe('flat')
    expect(islandBodyKind('blocky', true)).toBe('blocky')
  })
})

describe('the fine edge on a glass Steward over the menu bar', () => {
  // The brief's table: glass reads on a dark bar except Graphite, and nearly vanishes on a light bar in Silver and Lilac.
  const rows: [string, 'dark' | 'light', boolean][] = [
    ['silver', 'dark', false],
    ['lilac', 'dark', false],
    ['graphite', 'dark', true],
    ['silver', 'light', true],
    ['lilac', 'light', true],
    ['graphite', 'light', false],
  ]
  for (const [id, bar, edged] of rows) {
    it(`${id} on a ${bar} bar ${edged ? 'gets' : 'needs no'} edge`, () => {
      const light = bar === 'light'
      const edge = glassEdgeFor({ color: hex(id), tinted: true, light, onBar: true })
      expect(edge !== null).toBe(edged)
      // Darker than the bar on a light one, lighter on a dark one, so it stands out from it.
      if (edge) expect(contrast(edge, BACKDROP(light))).toBeGreaterThan(2)
    })
  }

  it('is never drawn off the bar (the panel has its own frost)', () => {
    for (const [id, bar] of rows) expect(glassEdgeFor({ color: hex(id), tinted: true, light: bar === 'light', onBar: false })).toBeNull()
  })

  it('outlines clear glass on the bar, which is nearly the bar itself', () => {
    expect(glassEdgeFor({ color: hex('silver'), tinted: false, light: false, onBar: true })).not.toBeNull()
    expect(glassEdgeFor({ color: hex('silver'), tinted: false, light: true, onBar: true })).not.toBeNull()
  })
})
