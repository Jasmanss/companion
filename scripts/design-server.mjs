// Serves design/ on localhost and reloads open pages whenever a file in it changes (including after a git pull).
// Files are served as they are, so pages behave exactly as they do when opened from disk.
import { spawn } from 'node:child_process'
import { createReadStream, statSync, watch } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(fileURLToPath(import.meta.url), '../../design')
const port = process.env.PORT ? Number(process.env.PORT) : 4321
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.glb': 'model/gltf-binary',
  '.hdr': 'application/octet-stream',
}
const RELOAD = '<script>new EventSource("/__reload").onmessage = () => location.reload()</script>'

const clients = new Set()
let pending
watch(root, { recursive: true }, () => {
  // A pull or a save can touch several files at once; reload once they settle.
  clearTimeout(pending)
  pending = setTimeout(() => clients.forEach((res) => res.write('data: reload\n\n')), 120)
})

async function listing() {
  const pages = (await readdir(root)).filter((f) => f.endsWith('.html') && f !== 'index.html').sort()
  const links = pages.map((f) => `<li><a href="/${f}">${f.replace(/\.html$/, '')}</a></li>`).join('')
  return `<!doctype html><meta charset="utf-8"><title>Steward designs</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 16px}a{color:#2f6feb}</style>
<h1>Steward designs</h1><ul>${links}</ul>`
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  if (url.pathname === '/__reload') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
    res.write(': connected\n\n')
    clients.add(res)
    req.on('close', () => clients.delete(res))
    return
  }
  let rel
  try {
    rel = decodeURIComponent(url.pathname)
  } catch {
    res.writeHead(400).end()
    return
  }
  if (rel.endsWith('/')) rel += 'index.html'
  const file = path.join(root, rel)
  // Never serve anything outside design/.
  if (file !== root && !file.startsWith(root + path.sep)) {
    res.writeHead(403).end()
    return
  }
  let stat
  try {
    stat = statSync(file)
  } catch {
    stat = null
  }
  if (stat?.isDirectory()) {
    res.writeHead(302, { Location: url.pathname + '/' }).end()
    return
  }
  const type = TYPES[path.extname(file)] ?? 'application/octet-stream'
  if (!stat) {
    if (rel === '/index.html') {
      res.writeHead(200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-store' }).end((await listing()) + RELOAD)
      return
    }
    res.writeHead(404).end('Not found')
    return
  }
  if (type.startsWith('text/html')) {
    const html = await readFile(file, 'utf8')
    const out = html.includes('</body>') ? html.replace('</body>', `${RELOAD}</body>`) : html + RELOAD
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' }).end(out)
    return
  }
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' })
  createReadStream(file).pipe(res)
})
// If the port is taken (4321 is also Astro's default), try the next few.
let tries = 0
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE' && !process.env.PORT && tries < 20) {
    tries++
    server.listen(port + tries, '127.0.0.1')
    return
  }
  console.error(`Couldn't start the design server: ${err.message}`)
  process.exit(1)
})
server.on('listening', () => {
  const link = `http://127.0.0.1:${server.address().port}/`
  console.log(`Designs at ${link} (reloads on change, Ctrl+C to stop)`)
  if (process.platform === 'darwin' && !process.env.NO_OPEN) spawn('open', [link], { stdio: 'ignore', detached: true }).unref()
})
server.listen(port, '127.0.0.1')
