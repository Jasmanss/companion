import { describe, expect, it } from 'vitest'
import { historyLine, REVIEW_VIEWER_GAP, reviewViewerRect, SAID_MAX, sayFrom } from '../src/shared/review'

describe('sayFrom: the "Claude says" note', () => {
  it('keeps the first two sentences of a plain reply', () => {
    expect(sayFrom('I changed the headline. The Start button is blue now. I also tidied the footer.')).toBe('I changed the headline. The Start button is blue now.')
  })

  it('takes the markdown off', () => {
    expect(sayFrom('**Done:** I made the `Hero` button blue in [page.tsx](src/app/page.tsx).')).toBe('Done: I made the Hero button blue in page.tsx.')
    expect(sayFrom('I updated the *pricing* cards and __the__ ~~old~~ footer.')).toBe('I updated the pricing cards and the old footer.')
  })

  it('leaves names with underscores and stars in them alone', () => {
    expect(sayFrom('I renamed hero_title to hero_heading. Nothing else moved.')).toBe('I renamed hero_title to hero_heading. Nothing else moved.')
  })

  it('drops code blocks, headings and tables', () => {
    const text = ['## Summary', '', 'I moved the logos under the hero.', '', '```tsx', '<Logos />', '```', '', '| File | Change |', '|---|---|', '| page.tsx | logos |'].join('\n')
    expect(sayFrom(text)).toBe('I moved the logos under the hero.')
  })

  it('reads a list after a colon as one thought, and each item as a sentence', () => {
    expect(sayFrom("Here's what changed:\n\n- The headline is shorter\n- The button is blue\n- Logos sit under the hero")).toBe("Here's what changed: The headline is shorter. The button is blue.")
    expect(sayFrom('1. Made the card corners rounder\n2. Added a shadow')).toBe('Made the card corners rounder. Added a shadow.')
  })

  it('skips questions, and gives nothing when a question is all there is', () => {
    expect(sayFrom('I made the button blue. Want me to also change the footer?')).toBe('I made the button blue.')
    expect(sayFrom('Want me to also change the footer?')).toBeNull()
    expect(sayFrom('Should I commit this? Or keep going?')).toBeNull()
  })

  it('skips a word or two like "Done." when more follows, and keeps it when it is all there is', () => {
    expect(sayFrom('Done! The pricing table is above the fold now. The cards are wider.')).toBe('The pricing table is above the fold now. The cards are wider.')
    expect(sayFrom('Done.')).toBe('Done.')
  })

  it('does not split at a dot inside a word or before a small letter', () => {
    expect(sayFrom('I edited page.tsx and styles.css, e.g. the hero spacing. Then I checked it.')).toBe('I edited page.tsx and styles.css, e.g. the hero spacing. Then I checked it.')
  })

  it(`is never longer than ${SAID_MAX} characters`, () => {
    const long = `I changed ${'the hero and the cards and '.repeat(20)}the footer.`
    const said = sayFrom(long)!
    expect(said.length).toBeLessThanOrEqual(SAID_MAX)
    expect(said.endsWith('…')).toBe(true)
    // Two sentences that don't fit together: only the first.
    const first = `I changed the headline ${'and more '.repeat(20)}today.`
    expect(sayFrom(`${first} ${'Then the button. '.repeat(10)}`)).toBe(first)
  })

  it('gives nothing for nothing', () => {
    expect(sayFrom(undefined)).toBeNull()
    expect(sayFrom('')).toBeNull()
    expect(sayFrom('   \n\n ')).toBeNull()
    expect(sayFrom('```\nonly code\n```')).toBeNull()
    expect(sayFrom('## Summary')).toBeNull()
  })
})

describe('historyLine: a look in the history, in words', () => {
  it('says what it found, and what became of a review', () => {
    expect(historyLine({ found: 'review', decided: 'new' })).toBe('The page changed: a review is waiting.')
    expect(historyLine({ found: 'review', decided: 'good' })).toBe('The page changed: you marked it Looks good.')
    expect(historyLine({ found: 'review', decided: 'sent-back' })).toBe('The page changed: you sent it back.')
    expect(historyLine({ found: 'review', decided: 'gone' })).toBe('The page changed: the review is no longer kept.')
    expect(historyLine({ found: 'same' })).toBe('No visible change.')
    expect(historyLine({ found: 'login', text: 'localhost:3000 sends you to /login, so ...' })).toBe('Only a login page.')
    expect(historyLine({ found: 'failed', text: 'Nothing is answering at localhost:3000. Start the app, then try again.' })).toBe(
      "Couldn't see it: nothing is answering at localhost:3000. Start the app, then try again.",
    )
    expect(historyLine({ found: 'failed', text: 'localhost:3000 loaded, but the page is blank.' })).toBe("Couldn't see it: localhost:3000 loaded, but the page is blank.")
    expect(historyLine({ found: 'failed' })).toBe("Couldn't see it.")
  })
})

describe('reviewViewerRect: the big viewer', () => {
  const macbook14 = { x: 0, y: 33, width: 1512, height: 949 }

  it('is the work area less the gap all round, so it stays inside it', () => {
    const r = reviewViewerRect(macbook14)
    expect(r).toEqual({ x: REVIEW_VIEWER_GAP, y: 33 + REVIEW_VIEWER_GAP, width: 1512 - 2 * REVIEW_VIEWER_GAP, height: 949 - 2 * REVIEW_VIEWER_GAP })
    expect(r.x).toBeGreaterThanOrEqual(macbook14.x)
    expect(r.y).toBeGreaterThanOrEqual(macbook14.y)
    expect(r.x + r.width).toBeLessThanOrEqual(macbook14.x + macbook14.width)
    expect(r.y + r.height).toBeLessThanOrEqual(macbook14.y + macbook14.height)
  })

  it('is wide enough there for a 1,440 wide page at about 100%', () => {
    expect(reviewViewerRect(macbook14).width).toBeGreaterThanOrEqual(1440)
  })

  it('works on a second screen to the left, and never goes below nothing', () => {
    expect(reviewViewerRect({ x: -1920, y: 0, width: 1920, height: 1080 })).toEqual({ x: -1896, y: 24, width: 1872, height: 1032 })
    expect(reviewViewerRect({ x: 0, y: 0, width: 30, height: 30 })).toEqual({ x: 24, y: 24, width: 0, height: 0 })
  })
})
