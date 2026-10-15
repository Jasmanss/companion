// Builds docs/status/index.html from docs/status/status.json.
// Usage: node docs/status/build.mjs
// The HTML is the page published as the private status artifact. No scripts, no external resources.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const dir = dirname(fileURLToPath(import.meta.url))
const data = JSON.parse(readFileSync(join(dir, 'status.json'), 'utf8'))

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const short = (iso) => {
  const [, m, d] = iso.split('-').map(Number)
  return `${MONTHS[m - 1]} ${d}`
}

const entry = (i) => `
      <li>
        <div class="row"><span class="name">${esc(i.name)}</span><time datetime="${esc(i.date)}">${short(i.date)}</time></div>
        <p>${esc(i.line)}${i.tag ? ` <span class="tag">${esc(i.tag)}</span>` : ''}</p>
      </li>`

const section = (s) => `
  <section id="${esc(s.id)}"${s.id === 'waiting' ? ' class="waiting"' : ''}>
    <h2>${esc(s.title)} <span class="count">${s.items.length}</span></h2>
    <ul>${s.items.map(entry).join('')}
    </ul>
  </section>`

const html = `<title>Steward Status</title>
<style>
:root {
  --bg: #f6f6f3;
  --fg: #1d1f24;
  --muted: #5d626b;
  --line: #dcdcd6;
  --wait-bg: #fbf0d4;
  --wait-line: #e2c36b;
  --tag-bg: #ebe9e0;
  --font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif;
  --mono: ui-monospace, "SF Mono", Menlo, monospace;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #14161a; --fg: #e8e9ec; --muted: #9aa0aa; --line: #2c3037;
    --wait-bg: #2c2512; --wait-line: #6b5a22; --tag-bg: #262a31; color-scheme: dark;
  }
}
:root[data-theme="dark"] {
  --bg: #14161a; --fg: #e8e9ec; --muted: #9aa0aa; --line: #2c3037;
  --wait-bg: #2c2512; --wait-line: #6b5a22; --tag-bg: #262a31; color-scheme: dark;
}
body { background: var(--bg); color: var(--fg); font-family: var(--font); font-size: 15px; line-height: 1.45; }
main { max-width: 42rem; margin: 0 auto; padding-block: 24px 48px; padding-inline: 16px; }
h1 { font-size: 1.4rem; margin: 0 0 4px; text-wrap: balance; }
.sub { color: var(--muted); margin: 0 0 24px; font-size: 0.85rem; }
section { margin-bottom: 28px; }
h2 { font-size: 0.78rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); margin: 0 0 8px; font-weight: 600; }
.count { font-weight: 400; margin-left: 4px; }
ul { list-style: none; margin: 0; padding: 0; }
li { padding-block: 10px; border-top: 1px solid var(--line); }
li:last-child { border-bottom: 1px solid var(--line); }
.row { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; }
.name { font-weight: 600; min-width: 0; overflow-wrap: anywhere; }
time { color: var(--muted); font-size: 0.8rem; font-variant-numeric: tabular-nums; white-space: nowrap; }
li p { margin: 2px 0 0; color: var(--muted); overflow-wrap: anywhere; }
.tag { display: inline-block; font-size: 0.72rem; background: var(--tag-bg); color: var(--fg); border-radius: 4px; padding: 1px 6px; margin-left: 2px; }
.waiting { background: var(--wait-bg); border: 1px solid var(--wait-line); border-radius: 10px; padding: 14px 14px 6px; }
.waiting h2 { color: var(--fg); }
.waiting li { border-color: var(--wait-line); }
.waiting li:last-child { border-bottom: 0; }
.waiting li p { color: var(--fg); }
.waiting .tag { background: var(--bg); }
footer { color: var(--muted); font-size: 0.78rem; }
code { font-family: var(--mono); font-size: 0.9em; }
</style>
<main>
  <h1>Steward status</h1>
  <p class="sub">Checked against git and GitHub on ${short(data.checked)}. Date on each line is when it last changed.</p>${data.sections.map(section).join('')}
  <footer>Source: docs/status/status.json in the roadmap-design worktree. Roadmap &amp; design keeps this page current.</footer>
</main>
`
writeFileSync(join(dir, 'index.html'), html)
console.log('wrote docs/status/index.html', html.length, 'bytes')
