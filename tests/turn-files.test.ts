import { execFileSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { committedSince, filesChangedSince, lookAtFiles, parseNames, parseStatusZ, TURN_GIT } from '../src/main/turn-files'
import { filesChangedLabel } from '../src/shared/review'

describe('reading git', () => {
  it('reads status entries, with a rename taking its old path along, and odd names as they are', () => {
    const out = [' M src/app.tsx', '?? new file.txt', 'R  src/b.ts', 'src/a.ts', 'D  gone.css', ' M "quoted"', ''].join('\0')
    expect(parseStatusZ(out)).toEqual([
      { code: ' M', path: 'src/app.tsx' },
      { code: '??', path: 'new file.txt' },
      { code: 'R ', path: 'src/b.ts' },
      { code: 'D ', path: 'gone.css' },
      { code: ' M', path: '"quoted"' },
    ])
    expect(parseStatusZ('')).toEqual([])
  })

  it('reads the names of committed files, skipping the blank lines between commits', () => {
    expect(parseNames('a.ts\nb.ts\n\nc.ts\n')).toEqual(['a.ts', 'b.ts', 'c.ts'])
  })

  it('only ever runs read-only commands with fixed arguments (the date is its own clock)', () => {
    expect(TURN_GIT).toEqual({ root: ['rev-parse', '--show-toplevel'], status: ['status', '--porcelain=v1', '-z', '--untracked-files=all'] })
    expect(committedSince(Date.UTC(2026, 9, 24, 12))).toEqual(['log', '--since=2026-10-24T12:00:00.000Z', '--name-only', '--format=', '--no-renames'])
    // git reads whole seconds: part of one rounds up, so a commit made just before the prompt isn't counted.
    expect(committedSince(Date.UTC(2026, 9, 24, 12) + 300)[1]).toBe('--since=2026-10-24T12:00:01.000Z')
  })

  it('says it in words', () => {
    expect(filesChangedLabel(1)).toBe('1 file changed')
    expect(filesChangedLabel(3)).toBe('3 files changed')
  })
})

describe('counting the files a turn changed', () => {
  const at = 1_000_000
  const fake = (o: { status: string; log?: string; times: Record<string, number> }) => ({
    git: async (args: readonly string[]) => (args[0] === 'rev-parse' ? '/repo\n' : args[0] === 'status' ? o.status : (o.log ?? '')),
    mtime: async (file: string) => o.times[file] ?? null,
  })

  it('counts what was written after the turn began, and not what was already changed before', async () => {
    const deps = fake({ status: [' M old.ts', ' M new.ts', '?? added.ts', ''].join('\0'), times: { '/repo/old.ts': at - 60_000, '/repo/new.ts': at + 5000, '/repo/added.ts': at + 9000 } })
    expect(await filesChangedSince('/repo/app', at, [], deps)).toBe(2)
  })

  it("counts a file deleted during the turn, not one deleted before it, and none it can't tell", async () => {
    const deps = fake({ status: [' D gone.ts', ' D long-gone.ts', ''].join('\0'), times: {} })
    expect(await filesChangedSince('/repo', at, [{ code: ' D', path: 'long-gone.ts' }], deps)).toBe(1)
    expect(await filesChangedSince('/repo', at, null, deps)).toBe(0)
  })

  it('counts the files of commits made during the turn once', async () => {
    const deps = fake({ status: [' M a.ts', ''].join('\0'), log: 'a.ts\nb.ts\n\nc.ts\n', times: { '/repo/a.ts': at + 1 } })
    expect(await filesChangedSince('/repo', at, [], deps)).toBe(3)
  })

  it('gives no count outside a git checkout, or with too much to look at', async () => {
    expect(await filesChangedSince('/tmp', at, null, { git: async () => Promise.reject(new Error('not a git repository')) })).toBeNull()
    const many = Array.from({ length: 5001 }, (_, i) => `?? f${i}`).join('\0')
    expect(await filesChangedSince('/repo', at, [], fake({ status: many, times: {} }))).toBeNull()
  })
})

describe('in a real checkout', () => {
  const dirs: string[] = []
  afterEach(async () => {
    for (const d of dirs.splice(0)) await fs.rm(d, { recursive: true, force: true })
  })

  it('counts the files changed after the look at the start', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'steward-turn-files-'))
    dirs.push(dir)
    const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', HOME: dir } })
    git('init', '-q')
    git('config', 'user.email', 'smoke@example.invalid')
    git('config', 'user.name', 'Smoke')
    await fs.writeFile(path.join(dir, 'kept.txt'), 'one')
    await fs.writeFile(path.join(dir, 'edited.txt'), 'one')
    await fs.writeFile(path.join(dir, 'deleted.txt'), 'one')
    git('add', '.')
    git('commit', '-qm', 'start')
    // Before the turn: one file already changed by hand, long ago.
    await fs.writeFile(path.join(dir, 'kept.txt'), 'two')
    const old = new Date(Date.now() - 10 * 60_000)
    await fs.utimes(path.join(dir, 'kept.txt'), old, old)

    const start = await lookAtFiles(dir)
    const since = Date.now()
    await fs.writeFile(path.join(dir, 'edited.txt'), 'two')
    await fs.rm(path.join(dir, 'deleted.txt'))
    await fs.mkdir(path.join(dir, 'src'))
    await fs.writeFile(path.join(dir, 'src', 'new.txt'), 'new')
    // From a folder inside the checkout, as a project can be.
    expect(await filesChangedSince(path.join(dir, 'src'), since, start)).toBe(3)
  })
})
