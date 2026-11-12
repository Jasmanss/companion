// Checks the built site before it can be published. Plain Node, no dependencies.
//   node site/check.mjs           check site/dist (npm run site:check builds it first)
//   node site/check.mjs <folder>  check another folder
// It fails when the site could leak something private, looks like it takes a request, links anywhere outside itself,
// or ships a file that is too heavy. A recording can still show things no script can find, so a person watches it too.
import { readdir, readFile, stat } from 'node:fs/promises'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), 'dist'))

const MB = 1024 * 1024
const VIDEO = { exts: new Set(['.mp4', '.m4v', '.mov', '.webm']), max: 12 * MB, what: 'a video over 12 MB' }
const IMAGE = { exts: new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.svg', '.ico']), max: 200 * 1024, what: 'an image over 200 KB' }
const TEXT = new Set(['.html', '.htm', '.css', '.js', '.mjs', '.json', '.svg', '.txt', '.md', '.xml', '.webmanifest'])

// Looked for anywhere in a text file, code and comments included, since all of it is public once published.
const ANYWHERE = [
  [/\/Users\//, 'a home folder path'],
  [/Good Projects/i, 'the private folder name'],
  [/\blocal_[0-9a-f]{4}/i, 'a chat session id'],
  [/\bclaude\/[\w.-]+/i, 'a branch name'],
  [/Jasmanss/i, 'the GitHub username'],
  [/\bsk-ant-/i, 'an API key'],
  [/https?:\/\//i, 'an external URL'],
  [/\b(?:src|href|poster|action|srcset)\s*=\s*["']?\/\//i, 'an external URL'],
  [/url\(\s*["']?\/\//i, 'an external URL'],
  [/@import\b/i, 'a stylesheet import'],
  [/<(?:form|input|textarea|select)\b/i, 'a form control'],
  [/\btype\s*=\s*["']?submit\b/i, 'a submit button'],
  [/mailto:/i, 'a mail link'],
  [/<!-- (?:end )?needs\b/, 'a build marker (the build should have taken it out)'],
]
// Looked for in what a visitor can read: the page without its styles (whose colors look like PR numbers).
const READABLE = [
  [/\bplanned\b/i, 'the word "planned"'],
  [/Visual Review/i, 'an unshown feature (Visual Review)'],
  [/Overnight Watch/i, 'an unshown feature (Overnight Watch)'],
  [/\b(?:Portfolio|haven|tally|bite)\b/i, 'a real project name'],
  [/\bPR\s*#?\d+|pull request|(?<![\w&#])#\d{1,5}\b/i, 'a PR number'],
  [/sign[ -]?up|wait[ -]?list|pricing|buy now|get started|download/i, 'words that offer something'],
]
// The one sentence allowed to use those words, by its exact text.
const ALLOWED = ['It is not for sale and has no download or waitlist.']

const problems = []
const shown = (path) => (relative(process.cwd(), path).startsWith('..') ? path : relative(process.cwd(), path) || '.')
const lineOf = (text, index) => text.slice(0, index).split('\n').length
const flag = (file, text, index, what) => problems.push(`${relative(dir, file)}${text ? `:${lineOf(text, index)}` : ''}: ${what}`)

async function files(folder) {
  const found = []
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name)
    if (entry.isDirectory()) found.push(...(await files(path)))
    else found.push(path)
  }
  return found
}

const exists = (path) => stat(path).then(() => true, () => false)
const attr = (tag, name) => tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))?.slice(1).find((v) => v !== undefined)

// Every video needs a poster that exists and a label, its files must exist, and it may only play by itself when muted.
async function checkMedia(file, html) {
  for (const m of html.matchAll(/<video\b[^>]*>([\s\S]*?)<\/video>/gi)) {
    const tag = m[0].slice(0, m[0].indexOf('>') + 1)
    const poster = attr(tag, 'poster')
    if (!poster) flag(file, html, m.index, 'a video with no poster')
    else if (!(await exists(join(dirname(file), poster)))) flag(file, html, m.index, `a missing poster (${poster})`)
    if (!attr(tag, 'aria-label')?.trim() && !attr(tag, 'aria-labelledby')) flag(file, html, m.index, 'a video with no label')
    if (/\bautoplay\b/i.test(tag) && !/\bmuted\b/i.test(tag)) flag(file, html, m.index, 'autoplay without muted')
    const sources = [attr(tag, 'src'), ...[...m[1].matchAll(/<source\b[^>]*>/gi)].map((s) => attr(s[0], 'src'))].filter(Boolean)
    if (!sources.length) flag(file, html, m.index, 'a video with no file')
    for (const src of sources) if (!(await exists(join(dirname(file), src)))) flag(file, html, m.index, `a missing video file (${src})`)
  }
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    if (attr(m[0], 'alt') === undefined) flag(file, html, m.index, 'an image with no alt text')
  }
}

if (!(await exists(join(dir, 'index.html')))) {
  console.error(`site check: no index.html in ${shown(dir)}. Build the site first (npm run site:check does).`)
  process.exit(1)
}

const all = await files(dir)
for (const file of all) {
  const ext = extname(file).toLowerCase()
  const size = (await stat(file)).size
  for (const kind of [VIDEO, IMAGE]) if (kind.exts.has(ext) && size > kind.max) flag(file, '', 0, `${kind.what} (${(size / MB).toFixed(1)} MB)`)
  if (!TEXT.has(ext)) continue
  const text = await readFile(file, 'utf8')
  for (const [rule, what] of ANYWHERE) for (const m of text.matchAll(new RegExp(rule, rule.flags + 'g'))) flag(file, text, m.index, what)
  let readable = text.replace(/<style\b[\s\S]*?<\/style>/gi, (s) => s.replace(/[^\n]/g, ' '))
  if (ext === '.css') readable = ''
  for (const sentence of ALLOWED) readable = readable.split(sentence).join(' '.repeat(sentence.length))
  for (const [rule, what] of READABLE) for (const m of readable.matchAll(new RegExp(rule, rule.flags + 'g'))) flag(file, readable, m.index, what)
  if (ext === '.html' || ext === '.htm') await checkMedia(file, text)
}

if (problems.length) {
  console.error(`site check: ${problems.length} problem${problems.length === 1 ? '' : 's'} in ${shown(dir)}`)
  for (const p of problems) console.error(`  ${p}`)
  process.exit(1)
}
console.log(`site check: ${all.length} file${all.length === 1 ? '' : 's'} checked, nothing private, no requests, no outside links, sizes fine`)
