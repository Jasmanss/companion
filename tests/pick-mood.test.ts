import { describe, expect, it } from 'vitest'
import { isLateNight, pickMood } from '../src/renderer/src/pick-mood'

const calm = { agentMood: null, eventMood: null, listening: false, waiting: false, lateNight: false, tucked: true }

describe('pickMood', () => {
  it('rests when nothing is going on, and is sleepy after midnight', () => {
    expect(pickMood(calm)).toBe('resting')
    expect(pickMood({ ...calm, tucked: false })).toBe('idle')
    expect(pickMood({ ...calm, lateNight: true })).toBe('sleepy')
  })

  it('puts the chat first, then short event moods, then sessions waiting, then a lingering worry', () => {
    expect(pickMood({ ...calm, agentMood: 'thinking', eventMood: 'celebrating' })).toBe('thinking')
    expect(pickMood({ ...calm, eventMood: 'celebrating', waiting: true })).toBe('celebrating')
    expect(pickMood({ ...calm, eventMood: 'worried', waiting: true })).toBe('needs-you')
    expect(pickMood({ ...calm, eventMood: 'worried', lateNight: true })).toBe('worried')
  })
})

describe('isLateNight', () => {
  it('is true from midnight until 5am', () => {
    expect(isLateNight(new Date(2026, 9, 9, 0, 5))).toBe(true)
    expect(isLateNight(new Date(2026, 9, 9, 4, 59))).toBe(true)
    expect(isLateNight(new Date(2026, 9, 9, 5, 0))).toBe(false)
    expect(isLateNight(new Date(2026, 9, 9, 23, 30))).toBe(false)
  })
})
