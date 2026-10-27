import { describe, expect, it } from 'vitest'
import { isLateNight, pickMood } from '../src/renderer/src/pick-mood'

const calm = { agentMood: null, eventMood: null, listening: false, waiting: false, lateNight: false, tucked: true }

describe('pickMood', () => {
  it('rests when nothing is going on, and is sleepy after midnight', () => {
    expect(pickMood(calm)).toBe('resting')
    expect(pickMood({ ...calm, tucked: false })).toBe('idle')
    expect(pickMood({ ...calm, lateNight: true })).toBe('sleepy')
  })

  it('puts the chat first, then a failed deploy, an approval waiting, then the reactions, then a lingering worry', () => {
    expect(pickMood({ ...calm, agentMood: 'thinking', eventMood: 'celebrating' })).toBe('thinking')
    expect(pickMood({ ...calm, eventMood: 'mad', waiting: true })).toBe('mad')
    expect(pickMood({ ...calm, eventMood: 'celebrating', waiting: true })).toBe('needs-you')
    expect(pickMood({ ...calm, eventMood: 'worried', waiting: true })).toBe('needs-you')
    expect(pickMood({ ...calm, eventMood: 'worried', lateNight: true })).toBe('worried')
  })

  it('lets what needs you or just happened beat you typing, and you typing beat what is only going on', () => {
    for (const mood of ['confused', 'proud', 'done', 'nod', 'hello', 'celebrating'] as const) expect(pickMood({ ...calm, eventMood: mood, listening: true })).toBe(mood)
    for (const mood of ['focused', 'juggling', 'worried'] as const) expect(pickMood({ ...calm, eventMood: mood, listening: true })).toBe('listening')
    // A chat working shows even tucked away and late at night: the face follows the chats.
    expect(pickMood({ ...calm, eventMood: 'focused', lateNight: true })).toBe('focused')
  })

  it('watches overnight with chats working or not, late or not, and still shows what needs you', () => {
    const watching = { ...calm, watching: true }
    expect(pickMood(watching)).toBe('watching')
    expect(pickMood({ ...watching, lateNight: true, eventMood: 'juggling' })).toBe('watching')
    expect(pickMood({ ...watching, eventMood: 'worried' })).toBe('watching')
    expect(pickMood({ ...watching, waiting: true })).toBe('needs-you')
    expect(pickMood({ ...watching, eventMood: 'mad' })).toBe('mad')
    expect(pickMood({ ...watching, eventMood: 'done' })).toBe('done')
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
