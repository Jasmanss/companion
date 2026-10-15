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
  <section id="${esc(s.id)}" class="card ${esc(s.id)}">
    <h2><span class="dot"></span>${esc(s.title)} <span class="count">${s.items.length}</span></h2>
    <ul>${s.items.map(entry).join('')}
    </ul>
  </section>`

// The look is Steward's own (src/renderer/src/styles.css): the Ice tint, glass panels, 14px corners, the system font,
// RGB-triplet tokens, and the Pill. Light and dark follow the Mac.
const html = `<title>Steward Status</title>
<style>
:root {
  --tint: 200, 228, 255;
  --glow: 96, 190, 255;
  --ink: 18, 70, 120;
  --soft: 178, 220, 255;
  --live: 26, 140, 255;
  --t1: #0d1015;
  --t2: rgb(var(--ink));
  --t3: rgba(var(--ink), 0.78);
  --fill: 255, 255, 255;
  --frost: 0.5;
  --edge: rgba(255, 255, 255, 0.85);
  --inset: rgba(var(--ink), 0.07);
  --inset2: rgba(var(--ink), 0.14);
  --line: rgba(var(--ink), 0.12);
  --warm: 176, 100, 0;
  --warm-bg: rgba(255, 190, 80, 0.26);
  --ok: 31, 138, 76;
  --shadow: rgba(20, 30, 60, 0.18);
  --bg1: #d9e8fb;
  --bg2: #eef4fc;
  --blob: 150, 200, 255;
  --pill1: #ffffff;
  --pill2: #c9d3e0;
  --pill-eye: 26, 140, 255;
  --radius: 14px;
  --font: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
  --spring: cubic-bezier(0.2, 0.8, 0.2, 1);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --t1: #f5f7fa; --t2: rgb(var(--soft)); --t3: rgba(var(--soft), 0.78);
    --fill: 24, 27, 34; --edge: rgba(255, 255, 255, 0.26);
    --inset: rgba(255, 255, 255, 0.07); --inset2: rgba(255, 255, 255, 0.12); --line: rgba(255, 255, 255, 0.1);
    --live: 96, 190, 255; --warm: 255, 196, 107; --warm-bg: rgba(255, 196, 107, 0.14); --ok: 95, 214, 142; --shadow: rgba(0, 0, 0, 0.5);
    --bg1: #0c1017; --bg2: #141a24; --blob: 40, 90, 160;
    --pill1: #e9eef5; --pill2: #8d99ab; --pill-eye: 96, 190, 255;
    color-scheme: dark;
  }
}
:root[data-theme="dark"] {
  --t1: #f5f7fa; --t2: rgb(var(--soft)); --t3: rgba(var(--soft), 0.78);
  --fill: 24, 27, 34; --edge: rgba(255, 255, 255, 0.26);
  --inset: rgba(255, 255, 255, 0.07); --inset2: rgba(255, 255, 255, 0.12); --line: rgba(255, 255, 255, 0.1);
  --live: 96, 190, 255; --warm: 255, 196, 107; --warm-bg: rgba(255, 196, 107, 0.14); --ok: 95, 214, 142; --shadow: rgba(0, 0, 0, 0.5);
  --bg1: #0c1017; --bg2: #141a24; --blob: 40, 90, 160;
  --pill1: #e9eef5; --pill2: #8d99ab; --pill-eye: 96, 190, 255;
  color-scheme: dark;
}
* { box-sizing: border-box; }
body {
  min-height: 100vh;
  background:
    radial-gradient(60rem 30rem at 85% -10%, rgba(var(--blob), 0.55), transparent 70%),
    radial-gradient(45rem 28rem at -10% 40%, rgba(var(--blob), 0.35), transparent 70%),
    linear-gradient(180deg, var(--bg1), var(--bg2));
  background-color: var(--bg1);
  background-attachment: fixed;
  color: var(--t1);
  font: 500 14px/1.45 var(--font);
  -webkit-font-smoothing: antialiased;
}
main { max-width: 40rem; margin: 0 auto; padding-block: 28px 56px; padding-inline: 16px; display: flex; flex-direction: column; gap: 14px; }
header { display: flex; align-items: center; gap: 12px; padding-bottom: 6px; }
.pill {
  flex: none; position: relative; width: 46px; height: 26px; border-radius: 999px;
  background: linear-gradient(180deg, var(--pill1), var(--pill2));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9), inset 0 -2px 4px rgba(0, 0, 0, 0.12), 0 4px 10px var(--shadow);
}
.pill::before, .pill::after {
  content: ""; position: absolute; top: 8px; width: 5px; height: 9px; border-radius: 999px;
  background: rgb(var(--pill-eye)); box-shadow: 0 0 6px 1px rgba(var(--pill-eye), 0.7);
}
.pill::before { left: 14px; }
.pill::after { right: 14px; }
h1 { font-size: 1.35rem; line-height: 1.2; margin: 0; font-weight: 700; letter-spacing: -0.01em; text-wrap: balance; }
.sub { margin: 2px 0 0; color: var(--t3); font-size: 0.8rem; font-weight: 500; }
.card {
  border-radius: var(--radius); padding: 14px 14px 6px;
  background: rgba(var(--fill), var(--frost));
  -webkit-backdrop-filter: blur(24px) saturate(1.8); backdrop-filter: blur(24px) saturate(1.8);
  border: 1px solid var(--line);
  box-shadow: inset 0 1px 0 var(--edge), 0 8px 24px var(--shadow);
}
h2 { display: flex; align-items: center; gap: 8px; font-size: 0.95rem; font-weight: 700; margin: 0 0 6px; color: var(--t1); }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--c, rgb(var(--live))); box-shadow: 0 0 6px 0 var(--c, rgb(var(--live))); }
.waiting { --c: rgb(var(--warm)); background: linear-gradient(var(--warm-bg), var(--warm-bg)), rgba(var(--fill), 0.7); border-color: rgba(var(--warm), 0.4); }
.progress { --c: rgb(var(--live)); }
.next { --c: rgb(var(--ink)); }
.ideas { --c: var(--t3); }
.done { --c: rgb(var(--ok)); }
:root[data-theme="dark"] .next { --c: rgb(var(--soft)); }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .next { --c: rgb(var(--soft)); } }
.count { margin-left: auto; font-size: 0.72rem; font-weight: 600; padding: 1px 8px; border-radius: 999px; background: var(--inset); color: var(--t2); font-variant-numeric: tabular-nums; }
ul { list-style: none; margin: 0 -8px; padding: 0; }
li { padding: 9px 8px; border-radius: 10px; transition: background 0.25s var(--spring); }
li + li { border-top: 1px solid var(--line); border-top-left-radius: 0; border-top-right-radius: 0; }
li:hover { background: var(--inset); }
.row { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
.name { font-weight: 700; min-width: 0; overflow-wrap: anywhere; }
time { flex: none; font-size: 0.72rem; font-weight: 600; padding: 1px 8px; border-radius: 999px; background: var(--inset); color: var(--t2); font-variant-numeric: tabular-nums; white-space: nowrap; }
li p { margin: 2px 0 0; color: var(--t3); overflow-wrap: anywhere; }
.waiting li p { color: var(--t1); opacity: 0.82; }
.tag { display: inline-block; font-size: 0.7rem; font-weight: 600; padding: 1px 7px; border-radius: 999px; background: rgba(var(--warm), 0.18); color: var(--t1); }
footer { color: var(--t3); font-size: 0.75rem; text-align: center; padding-top: 6px; }
@media (prefers-reduced-motion: reduce) { li { transition: none; } }
</style>
<main>
  <header>
    <div class="pill" aria-hidden="true"></div>
    <div>
      <h1>Steward status</h1>
      <p class="sub">Checked against git and GitHub on ${short(data.checked)}. Each date is when that line last changed.</p>
    </div>
  </header>${data.sections.map(section).join('')}
  <footer>Source: docs/status/status.json. Roadmap &amp; design keeps this page current.</footer>
</main>
`
writeFileSync(join(dir, 'index.html'), html)
console.log('wrote docs/status/index.html', html.length, 'bytes')
