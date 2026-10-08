import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { imagesDirFor, saveImagesToProject, slugify } from '../src/main/projects'

let dir: string
let src: string

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'project-'))
  src = path.join(dir, 'source.png')
  await fs.writeFile(src, 'png')
})
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true })
})

describe('slugify', () => {
  it('makes tidy file names', () => {
    expect(slugify('My Hero Shot (1).PNG')).toBe('my-hero-shot-1')
    expect(slugify('Café déjà vu.jpg')).toBe('cafe-deja-vu')
    expect(slugify('???.png')).toBe('image')
  })
})

describe('imagesDirFor', () => {
  it('uses public/images when the project has a public folder', async () => {
    await fs.mkdir(path.join(dir, 'public'))
    expect((await imagesDirFor(dir)).dir).toBe(path.join(dir, 'public', 'images'))
  })

  it('falls back to assets/images', async () => {
    expect((await imagesDirFor(dir)).dir).toBe(path.join(dir, 'assets', 'images'))
  })
})

describe('saveImagesToProject', () => {
  it('copies with unique names and returns Next.js code for Next projects', async () => {
    await fs.mkdir(path.join(dir, 'public'))
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ dependencies: { next: '16.0.0' } }))

    const result = await saveImagesToProject(dir, [
      { file: src, name: 'Hero.png', width: 1600, height: 900 },
      { file: src, name: 'Hero.png' },
    ])

    expect(result.files.map((f) => path.basename(f))).toEqual(['hero.png', 'hero-2.png'])
    expect(result.snippet).toContain('import Image from "next/image"')
    expect(result.snippet).toContain('<Image src="/images/hero.png" alt="" width={1600} height={900} />')
    expect(result.snippet).toContain('<Image src="/images/hero-2.png" alt="" fill />')
  })

  it('returns plain img tags with relative paths for other projects', async () => {
    const result = await saveImagesToProject(dir, [{ file: src, name: 'shot.png', width: 10, height: 20 }])
    expect(result.snippet).toBe('<img src="./assets/images/shot.png" alt="" width="10" height="20" />')
    await expect(fs.access(path.join(dir, 'assets', 'images', 'shot.png'))).resolves.toBeUndefined()
  })
})
