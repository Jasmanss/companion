import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AppState } from '../src/main/app-state'

const dirs: string[] = []
afterEach(async () => {
  for (const d of dirs.splice(0)) await fs.rm(d, { recursive: true, force: true })
})

async function stateWith(contents: unknown): Promise<AppState> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'steward-state-'))
  dirs.push(dir)
  const file = path.join(dir, 'state.json')
  await fs.writeFile(file, JSON.stringify(contents))
  const state = new AppState(file)
  await state.load()
  return state
}

describe('the saved Watch', () => {
  it('reads back a night, the wake time and the last end', async () => {
    const night = { id: '20261025-231000', since: 1, until: 2, away: true, activeSince: null }
    const state = await stateWith({ lastSeenAt: 0, watch: { night, wakeTime: '06:45', ended: { at: 3, why: 'up' }, unseen: '20261024-230000' } })
    expect(state.watch).toEqual({ night, wakeTime: '06:45', ended: { at: 3, why: 'up' }, unseen: '20261024-230000' })
  })

  it('drops what does not read: a night of the wrong shape, an end for no reason', async () => {
    const state = await stateWith({ lastSeenAt: 0, watch: { night: { id: '../x', since: 1, until: 2 }, wakeTime: 7, ended: { at: 3, why: 'bored' }, unseen: '../../etc' } })
    expect(state.watch).toEqual({ night: undefined, wakeTime: undefined, ended: undefined, unseen: undefined })
    expect((await stateWith({ lastSeenAt: 0 })).watch).toEqual({ night: undefined, wakeTime: undefined, ended: undefined })
  })

  it('keeps it across a restart', async () => {
    const state = await stateWith({ lastSeenAt: 0 })
    const night = { id: '20261025-231000', since: 1, until: 2, away: false, activeSince: 5 }
    await state.update({ watch: { night, wakeTime: '07:30' } })
    const file = path.join(dirs[0], 'state.json')
    const again = new AppState(file)
    await again.load()
    expect(again.watch.night).toEqual(night)
  })
})
