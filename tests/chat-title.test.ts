import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { chatTitle, readChatTitle, TITLE_TAIL_BYTES } from '../src/main/transcript'

const title = (customTitle: string) => ({ type: 'custom-title', customTitle, sessionId: 's1' })
const line = (o: object) => `${JSON.stringify(o)}\n`

describe("a chat's name", () => {
  it('is the newest custom-title in the log, so a renamed chat has its new name', () => {
    expect(chatTitle([title('Main building'), { type: 'user' }])).toBe('Main building')
    expect(chatTitle([title('Main building'), { type: 'assistant' }, title('Notch island')])).toBe('Notch island')
  })

  it('is null for a log with none: a terminal session, or a chat with no name yet', () => {
    expect(chatTitle([{ type: 'user' }, { type: 'assistant' }])).toBeNull()
    expect(chatTitle([title('   ')])).toBeNull()
    expect(chatTitle([])).toBeNull()
  })

  it('is tidied: one line, and not too long', () => {
    expect(chatTitle([title('  Fix   the\nlogin  ')])).toBe('Fix the login')
    expect(chatTitle([title('x'.repeat(100))])).toHaveLength(60)
  })

  describe('read from a big log', () => {
    const dir = fs.mkdtemp(path.join(os.tmpdir(), 'steward-title-'))
    afterAll(async () => fs.rm(await dir, { recursive: true, force: true }))
    // About 3 MB of turns, much more than is read.
    const filler = line({ type: 'assistant', message: 'x'.repeat(1000) }).repeat(3000)

    it('is found near the end without reading the whole file', async () => {
      const file = path.join(await dir, 'near-end.jsonl')
      await fs.writeFile(file, line(title('Old name')) + filler + line(title('Main building')) + line({ type: 'user' }))
      expect((await fs.stat(file)).size).toBeGreaterThan(10 * TITLE_TAIL_BYTES)
      expect(await readChatTitle(file)).toBe('Main building')
    })

    it('is not looked for past the end that is read', async () => {
      const file = path.join(await dir, 'only-at-start.jsonl')
      await fs.writeFile(file, line(title('Main building')) + filler)
      expect(await readChatTitle(file)).toBeNull()
    })

    it("is null when the log can't be read", async () => {
      expect(await readChatTitle(path.join(await dir, 'missing.jsonl'))).toBeNull()
    })
  })
})
