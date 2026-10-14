import { describe, expect, it } from 'vitest'
import { cleanName, colorHex, DEFAULT_STEWARD, MAX_NAME, PILL_COLOR_IDS, PILL_COLORS, TAB_SIZES } from '../src/shared/steward'

describe("the character's colors", () => {
  it('are six at most, with silver among them and first, as the default', () => {
    expect(PILL_COLORS.length).toBeLessThanOrEqual(6)
    expect(PILL_COLORS[0]).toEqual({ id: 'silver', name: 'Silver', hex: '#c7ccd5' })
    expect(DEFAULT_STEWARD.color).toBe('silver')
    expect(PILL_COLORS.map((c) => c.id)).toEqual([...PILL_COLOR_IDS])
    expect(new Set(PILL_COLORS.map((c) => c.hex)).size).toBe(PILL_COLORS.length)
  })

  it('turn into their hex, and anything unknown into silver', () => {
    expect(colorHex('mint')).toBe('#8fe0c0')
    expect(colorHex('coral' as never)).toBe('#c7ccd5')
  })
})

describe('cleanName', () => {
  it('keeps a name to one tidy line', () => {
    expect(cleanName('  Pip  ')).toBe('Pip')
    expect(cleanName('Pip\nthe\tPill')).toBe('Pip the Pill')
    expect(cleanName('Pip\u2028Pill\u0000')).toBe('Pip Pill')
    expect(cleanName('Jarvis 🤖')).toBe('Jarvis 🤖')
  })

  it(`cuts it at ${MAX_NAME} characters without splitting an emoji, and makes an empty one Steward`, () => {
    expect(cleanName('a'.repeat(40))).toBe('a'.repeat(MAX_NAME))
    expect([...cleanName('🤖'.repeat(30))]).toHaveLength(MAX_NAME)
    expect(cleanName('')).toBe('Steward')
    expect(cleanName(' \n ')).toBe('Steward')
  })
})

describe('the tab sizes', () => {
  it('fit the character inside the tab, a bigger tab for medium', () => {
    for (const { tab, pill } of Object.values(TAB_SIZES)) {
      expect(pill.width).toBeLessThan(tab.width)
      expect(pill.height).toBeLessThan(tab.height)
    }
    expect(TAB_SIZES.medium.tab.width).toBeGreaterThan(TAB_SIZES.small.tab.width)
    // The blocky version draws whole pixel cells: 3 points in the small tab, 4 in the medium one.
    expect(Math.floor(TAB_SIZES.small.pill.width / 16)).toBe(3)
    expect(Math.floor(TAB_SIZES.medium.pill.width / 16)).toBe(4)
  })
})
