import { spawnSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

// The site check (site/check.mjs) runs on a built site folder; each test builds a small one in a temp folder.
const CHECK = path.join(__dirname, '..', 'site', 'check.mjs')
const made: string[] = []
afterEach(async () => {
  await Promise.all(made.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })))
})

/** Writes the files (text, or a byte count for a sparse file of that size) and runs the check on them. */
async function check(files: Record<string, string | number>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'site-check-'))
  made.push(dir)
  for (const [name, body] of Object.entries(files)) {
    const file = path.join(dir, name)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, typeof body === 'number' ? '' : body)
    if (typeof body === 'number') await fs.truncate(file, body)
  }
  const run = spawnSync(process.execPath, [CHECK, dir], { encoding: 'utf8' })
  return { ok: run.status === 0, out: run.stdout + run.stderr }
}
const page = (body: string) => `<!doctype html><html><head><style>:root{--ink:#050608}</style></head><body>${body}</body></html>`
const CLOSING = '<p>A personal project, made for one person. It is not for sale and has no download or waitlist.</p>'
const VIDEO = '<video muted loop playsinline preload="none" poster="posters/w.jpg" aria-label="A walkthrough"><source src="clips/w.mp4" type="video/mp4"></video>'

describe('the site check', () => {
  it('passes a clean page, its closing line and a labelled video with its poster', async () => {
    const r = await check({ 'index.html': page(`<h1>Hi</h1><a href="#top">Top</a>${VIDEO}${CLOSING}`), 'posters/w.jpg': 1000, 'clips/w.mp4': 5_000_000 })
    expect(r.out).toContain('nothing private')
    expect(r.ok).toBe(true)
  })

  it('fails without a built page', async () => {
    const r = await check({ 'other.html': page('') })
    expect(r.ok).toBe(false)
    expect(r.out).toContain('no index.html')
  })

  it.each([
    ['<!-- /Users/someone/companion -->', 'a home folder path'],
    ['<p>From Good Projects</p>', 'the private folder name'],
    ['<p>local_0a1b2c3d</p>', 'a chat session id'],
    ['<p>claude/site-phase-2</p>', 'a branch name'],
    ['<p>by Jasmanss</p>', 'the GitHub username'],
    ['<p>Fixed in PR #23</p>', 'a PR number'],
    ['<p>Next: Overnight Watch</p>', 'an unshown feature'],
    ['<p>This is planned.</p>', 'the word "planned"'],
    ['<p>Made for tally</p>', 'a real project name'],
  ])('fails on something private: %s', async (body, why) => {
    const r = await check({ 'index.html': page(body) })
    expect(r.ok).toBe(false)
    expect(r.out).toContain(why)
  })

  it.each([
    ['<form><button type="submit">Go</button></form>', 'a form control'],
    ['<input placeholder="Your email">', 'a form control'],
    ['<a href="mailto:me@example.test">Write</a>', 'a mail link'],
    ['<p>Download Steward</p>', 'words that offer something'],
    ['<p>Join the waitlist</p>', 'words that offer something'],
    ['<p>Sign up today</p>', 'words that offer something'],
  ])('fails on anything that looks like it takes a request: %s', async (body, why) => {
    const r = await check({ 'index.html': page(body) })
    expect(r.ok).toBe(false)
    expect(r.out).toContain(why)
  })

  it.each([
    ['<a href="https://example.test">Out</a>'],
    ['<script src="//cdn.example.test/x.js"></script>'],
    ['<style>@font-face{src:url(//fonts.example.test/a.woff2)}</style>'],
  ])('fails on a link outside the site: %s', async (body) => {
    const r = await check({ 'index.html': page(body) })
    expect(r.ok).toBe(false)
    expect(r.out).toContain('an external URL')
  })

  it('fails a video with no poster, no label, a missing file or sound that plays by itself', async () => {
    const r = await check({ 'index.html': page('<video autoplay src="clips/none.mp4"></video>') })
    expect(r.ok).toBe(false)
    for (const why of ['a video with no poster', 'a video with no label', 'autoplay without muted', 'a missing video file']) expect(r.out).toContain(why)
  })

  it('fails a video over 12 MB and an image over 200 KB', async () => {
    const r = await check({ 'index.html': page(VIDEO), 'posters/w.jpg': 300 * 1024, 'clips/w.mp4': 13 * 1024 * 1024 })
    expect(r.ok).toBe(false)
    expect(r.out).toContain('a video over 12 MB')
    expect(r.out).toContain('an image over 200 KB')
  })
})
