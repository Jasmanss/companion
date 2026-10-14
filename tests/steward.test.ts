import { describe, expect, it } from 'vitest'
import { cleanFrost, cleanName, colorHex, DEFAULT_STEWARD, frostFill, MAX_NAME, PANEL_TINT_IDS, PANEL_TINTS, panelTint, panelVars, PILL_COLOR_IDS, PILL_COLORS, TAB_SIZES } from '../src/shared/steward'

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

/** WCAG contrast between two colors given as "r, g, b". */
const rgb = (c: string) => c.split(',').map(Number)
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t)
const luminance = (c: number[]) => {
  const [r, g, b] = c.map((v) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: number[], b: number[]) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

describe("the panel's tints", () => {
  it('are the five from the glass redesign, Ice first as the default', () => {
    expect(PANEL_TINTS.map((t) => t.id)).toEqual([...PANEL_TINT_IDS])
    expect(PANEL_TINT_IDS).toEqual(['ice', 'lilac', 'mint', 'peach', 'graphite'])
    expect(DEFAULT_STEWARD.tint).toBe('ice')
    expect(panelTint('sky' as never).id).toBe('ice')
  })

  it('give every token as an RGB triplet', () => {
    for (const t of PANEL_TINTS)
      for (const key of ['tint', 'glow', 'ink', 'soft', 'live'] as const) expect(t[key], `${t.id} ${key}`).toMatch(/^\d{1,3}, \d{1,3}, \d{1,3}$/)
  })

  it('stay readable: text on light and dark glass, and the live dot and switches on light glass', () => {
    const white = [255, 255, 255], night = [24, 27, 34]
    for (const t of PANEL_TINTS) {
      // Roughly what the glass looks like: mostly white or mostly night, with some of the tint.
      const light = mix(white, rgb(t.tint), 0.3), dark = mix(night, rgb(t.tint), 0.12)
      expect(contrast(rgb(t.ink), light), `${t.id} ink on light`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(rgb(t.soft), dark), `${t.id} soft on dark`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(rgb(t.glow), dark), `${t.id} glow on dark`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(rgb(t.live), light), `${t.id} live on light`).toBeGreaterThanOrEqual(3)
    }
  })
})

describe('the frost', () => {
  it('maps clear to frosted onto how opaque the fill is, 50 being the panel as it was', () => {
    expect([frostFill(0), frostFill(50), frostFill(100)]).toEqual([0.12, 0.42, 0.72])
    expect(DEFAULT_STEWARD.frost).toBe(50)
  })

  it('is a whole number from 0 to 100, whatever it was given', () => {
    expect([cleanFrost(-5), cleanFrost(250), cleanFrost(64.6)]).toEqual([0, 100, 65])
    expect([cleanFrost('80'), cleanFrost(NaN), cleanFrost(undefined)]).toEqual([50, 50, 50])
    expect(frostFill(500)).toBe(0.72)
  })

  it('and the tint become the CSS custom properties the glass is drawn from', () => {
    expect(panelVars({ tint: 'mint', frost: 0 })).toEqual({
      '--tint': '198, 242, 224',
      '--glow': '70, 214, 160',
      '--ink': '12, 90, 64',
      '--soft': '170, 238, 210',
      '--live-light': '14, 150, 98',
      '--frost': '0.12',
    })
  })
})
