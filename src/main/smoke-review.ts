import http from 'node:http'
import type { AddressInfo } from 'node:net'

/** Two versions of a small page, for the smoke check: B has a longer heading and a different button. A spinner and a fade run in both. */
export function smokePage(version: 'a' | 'b'): string {
  const a = version === 'a'
  return `<!doctype html><meta charset="utf-8"><title>Acme</title><style>
  body{margin:0;font:16px -apple-system,system-ui,sans-serif;background:#f7f8fa;color:#1c2330}
  header{position:fixed;top:0;left:0;right:0;height:56px;background:#fff;border-bottom:1px solid #e3e6ec;display:flex;align-items:center;padding:0 32px;font-weight:700}
  main{padding:120px 64px 64px}
  h1{font-size:56px;letter-spacing:-.03em;margin:0 0 12px}
  p{color:#6b7385;font-size:20px;margin:0 0 28px;max-width:600px}
  a{display:inline-block;padding:14px 28px;border-radius:10px;font-weight:700;background:${a ? '#cfd4de' : '#2f6feb'};color:${a ? '#3a4250' : '#fff'}}
  .cards{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:48px}.cards div{height:140px;border-radius:14px;background:#fff;border:1px solid #e3e6ec}
  .spin{position:absolute;top:70px;right:40px;width:28px;height:28px;border-radius:6px;background:#e0662c;animation:spin 1s linear infinite}
  .fade{animation:fade 2s ease-in-out infinite alternate}
  @keyframes spin{to{transform:rotate(360deg)}} @keyframes fade{from{opacity:.2}to{opacity:1}}
</style><header>Acme</header><div class="spin"></div><main><h1>${a ? 'Build faster' : 'Build faster, ship calmer'}</h1><p class="fade">A small toolkit for web teams.</p><a>${a ? 'Learn more' : 'Get started'}</a><div class="cards"><div></div><div></div><div></div></div></main>`
}

/** A login page, for a page that sends you to one. */
const LOGIN_PAGE = '<!doctype html><meta charset="utf-8"><title>Sign in</title><body style="font:16px system-ui;margin:120px"><h1>Sign in</h1><input placeholder="Email"></body>'

/**
 * A server on this Mac that serves the page in whichever version it is set to, /away, which sends the visitor to
 * another site, and /private, which sends them to /login (like an app that needs a login).
 */
export async function startPageServer(): Promise<{ port: number; setVersion(version: 'a' | 'b'): void; hits(): number; close(): void }> {
  let version: 'a' | 'b' = 'a'
  let hits = 0
  const server = http.createServer((req, res) => {
    if (req.url === '/away') res.writeHead(302, { location: 'http://example.invalid/' }).end()
    else if (req.url === '/private') res.writeHead(307, { location: '/login' }).end()
    else if (req.url === '/login') res.writeHead(200, { 'content-type': 'text/html' }).end(LOGIN_PAGE)
    else {
      hits++
      res.writeHead(200, { 'content-type': 'text/html' }).end(smokePage(version))
    }
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return { port: (server.address() as AddressInfo).port, setVersion: (v) => (version = v), hits: () => hits, close: () => void server.close() }
}

/** A port on this Mac where nothing is listening (it was free a moment ago), for an app that isn't running. */
export async function deadPort(): Promise<number> {
  const server = http.createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  await new Promise<void>((resolve) => server.close(() => resolve()))
  return port
}
