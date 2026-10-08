import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { SaveResult } from '../shared/types'

const exists = (p: string) => fs.access(p).then(() => true, () => false)

/** "My Hero Shot (1).PNG" -> "my-hero-shot-1" */
export function slugify(name: string): string {
  const slug = path
    .parse(name)
    .name.normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return slug || 'image'
}

/** Images go in public/images when the project has a public folder (Next, Vite), otherwise assets/images. */
export async function imagesDirFor(projectPath: string): Promise<{ dir: string; publicRoot: string | null }> {
  const publicRoot = path.join(projectPath, 'public')
  if (await exists(publicRoot)) return { dir: path.join(publicRoot, 'images'), publicRoot }
  return { dir: path.join(projectPath, 'assets', 'images'), publicRoot: null }
}

export async function uniqueName(dir: string, base: string, ext: string): Promise<string> {
  let name = base + ext
  for (let n = 2; await exists(path.join(dir, name)); n++) name = `${base}-${n}${ext}`
  return name
}

async function usesNext(projectPath: string): Promise<boolean> {
  try {
    const pkg = JSON.parse(await fs.readFile(path.join(projectPath, 'package.json'), 'utf8'))
    return Boolean(pkg.dependencies?.next ?? pkg.devDependencies?.next)
  } catch {
    return false
  }
}

export interface ImageToSave {
  file: string
  name: string
  width?: number
  height?: number
}

/** Copy images into the project with tidy names and return the code to use them. */
export async function saveImagesToProject(projectPath: string, images: ImageToSave[]): Promise<SaveResult> {
  const { dir, publicRoot } = await imagesDirFor(projectPath)
  await fs.mkdir(dir, { recursive: true })
  const next = await usesNext(projectPath)

  const files: string[] = []
  const lines: string[] = []
  for (const image of images) {
    const name = await uniqueName(dir, slugify(image.name), path.extname(image.file).toLowerCase())
    const dest = path.join(dir, name)
    await fs.copyFile(image.file, dest)
    files.push(dest)
    const src = publicRoot ? '/' + toPosix(path.relative(publicRoot, dest)) : './' + toPosix(path.relative(projectPath, dest))
    lines.push(snippetLine(src, image, next))
  }

  const snippet = (next ? 'import Image from "next/image";\n\n' : '') + lines.join('\n')
  return { dir, files, snippet }
}

function snippetLine(src: string, { width, height }: ImageToSave, next: boolean): string {
  if (next) return `<Image src="${src}" alt=""${width && height ? ` width={${width}} height={${height}}` : ' fill'} />`
  return `<img src="${src}" alt=""${width && height ? ` width="${width}" height="${height}"` : ''} />`
}

const toPosix = (p: string) => p.split(path.sep).join('/')
