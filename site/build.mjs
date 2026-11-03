// Builds the showcase site into site/dist (git-ignored). Plain Node, no dependencies.
//   node site/build.mjs           build
//   node site/build.mjs --serve   build, then serve the result at http://127.0.0.1:4173 (PORT overrides the port)
// Only the names listed below are copied, so a stray file in site/ can never end up in the published folder.
import { cp, mkdir, readFile, rm, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, extname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const out = join(root, 'dist')

// index.html is required. The rest are added by later phases and skipped while they do not exist.
const PAGE = 'index.html'
const OPTIONAL = ['clips', 'posters', 'demo']

async function exists(path) {
  return stat(path).then(() => true, () => false)
}

async function build() {
  await rm(out, { recursive: true, force: true })
  await mkdir(out, { recursive: true })
  if (!(await exists(join(root, PAGE)))) throw new Error(`site/${PAGE} is missing`)
  const copied = [PAGE]
  await cp(join(root, PAGE), join(out, PAGE))
  for (const name of OPTIONAL) {
    if (!(await exists(join(root, name)))) continue
    await cp(join(root, name), join(out, name), { recursive: true })
    copied.push(`${name}/`)
  }
  console.log(`site: built ${copied.join(', ')} into site/dist`)
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mp4': 'video/mp4',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
}

function serve(port) {
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname)
    const file = normalize(join(out, path.endsWith('/') ? `${path}index.html` : path))
    if (file !== out && !file.startsWith(out + sep)) return void res.writeHead(403).end()
    try {
      const body = await readFile(file)
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' }).end(body)
    } catch {
      res.writeHead(404).end('Not found')
    }
  })
  server.listen(port, '127.0.0.1', () => console.log(`site: serving http://127.0.0.1:${port}`))
}

await build()
if (process.argv.includes('--serve')) serve(Number(process.env.PORT) || 4173)
