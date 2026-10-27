import { describe, expect, it } from 'vitest'
import { MoodBoard } from '../src/main/moods'

describe('MoodBoard', () => {
  it('shows short moods for a while, then nothing', () => {
    const board = new MoodBoard()
    board.apply('celebrating', '/p', 0)
    expect(board.current(1000)).toBe('celebrating')
    expect(board.nextChange(1000)).toBe(12_000)
    expect(board.current(12_000)).toBeNull()
  })

  it('keeps worried underneath short moods, and lets good news for that project clear it', () => {
    const board = new MoodBoard()
    board.apply('worried', '/portlkit', 0)
    board.apply('done', undefined, 100)
    expect(board.current(200)).toBe('done')
    expect(board.current(6000)).toBe('worried')
    // A deploy for another project is celebrated but doesn't end this worry.
    board.apply('celebrating', '/haven', 7000)
    expect(board.current(8000)).toBe('celebrating')
    expect(board.current(20_000)).toBe('worried')
    board.apply('celebrating', '/portlkit', 21_000)
    expect(board.current(40_000)).toBeNull()
  })

  it('is mad for a moment when something breaks, then worried until good news for that project', () => {
    const board = new MoodBoard()
    board.apply('mad', '/haven', 0)
    expect(board.current(1000)).toBe('mad')
    expect(board.nextChange(1000)).toBe(6000)
    expect(board.current(6000)).toBe('worried')
    expect(board.current(10 * 60_000)).toBe('worried')
    board.apply('celebrating', '/haven', 10 * 60_000)
    expect(board.current(10 * 60_000 + 13_000)).toBeNull()
  })

  it('ignores moods that are not about events', () => {
    const board = new MoodBoard()
    board.apply('needs-you', undefined, 0)
    board.apply(undefined, undefined, 0)
    expect(board.current(1)).toBeNull()
  })

  it('says a deploy is still in trouble while good news for another project shows on top', () => {
    const b = new MoodBoard()
    b.apply('mad', '/a', 0)
    expect(b.troubled(1000)).toBe(true)
    b.apply('celebrating', '/b', 2000)
    expect(b.current(2500)).toBe('celebrating')
    expect(b.troubled(2500)).toBe(true)
    // Good news for that project ends it (once mad's own moment is over).
    b.apply('celebrating', '/a', 7000)
    expect(b.troubled(7000)).toBe(false)
    expect(new MoodBoard().troubled(0)).toBe(false)
  })
})
