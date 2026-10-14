// Activity animations: what the panel shows while the agent works. Shared by glass-lab.html, search-web.html and
// showcase.html so they never drift apart, and drawn like the app's (src/renderer/src/Activity.tsx). Styles are in
// activity.css. Each step is an async function that adds a row to a box and plays it out; a token (token())
// cancels a run (kill) or pauses it at its next step (hold), which demo() does whenever a card is off screen or
// the tab is hidden.
import { ICONS } from './icons.js'

/**
 * Pages set env.rm from their Motion control. Reduced motion keeps every step and its timing, as the app does
 * (work takes as long as it takes), but things fade in place instead of moving.
 */
export const env = { rm: false }
export const CANCEL = Symbol('cancel')

export const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild }
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

/* ---------------- runs: cancel and pause ---------------- */
export const token = () => ({ dead: false, paused: false, waiters: [] })
const release = (tok) => tok.waiters.splice(0).forEach((go) => go())
/** Pause (on) or resume a run. A paused run stops at its next wait and picks up from there. */
export function hold(tok, on) { if (!tok) return; tok.paused = on; if (!on) release(tok) }
export function kill(tok) { if (!tok) return; tok.dead = true; release(tok) }
/** Wait ms, then throw CANCEL if the run was killed, or sit still while it's paused. */
export async function wait(ms, tok) {
  await new Promise((r) => setTimeout(r, ms))
  while (tok && tok.paused && !tok.dead) await new Promise((r) => tok.waiters.push(r))
  if (tok && tok.dead) throw CANCEL
}

/* ---------------- sample data ---------------- */
export const GRADS = ['linear-gradient(135deg,#ff9ec9,#7cc4ff)', 'linear-gradient(135deg,#ffd47a,#ff7a7a)', 'linear-gradient(135deg,#8ef0b0,#3aa3ff)', 'linear-gradient(135deg,#c8b6ff,#ff9ec9)', 'linear-gradient(135deg,#1e2a44,#6c8cff)', 'linear-gradient(135deg,#ffe6a8,#9be7ff)']
/** Sites a search finds: [domain, badge color, page title]. */
export const SITES = [
  ['developer.apple.com', '#1d1d1f', 'Materials, Apple design guidelines'],
  ['dribbble.com', '#ea4c89', 'Glass UI shots'],
  ['mobbin.com', '#2b2b2b', 'Floating panels in real apps'],
  ['css-tricks.com', '#d9672b', 'backdrop-filter, explained'],
  ['github.com', '#24292f', 'liquid-glass examples'],
]
export const fav = ([d, c]) => `<span class="fav" style="background:${c}">${esc(d[0].toUpperCase())}</span>`

/* ---------------- rows ---------------- */
/** A step row: an icon, a label and whatever follows it, and a spinner until it's finished. */
export function stepRow(kind, icon, label, extra = '') {
  return h(`<div class="act" data-kind="${kind}"><span class="ai">${icon}</span><span class="at"><span class="l"><b class="lab">${label}</b>${extra}</span></span><span class="st"><i class="spin"></i></span></div>`)
}
export function finish(row, ok = true, done) {
  row.classList.add(ok ? 'ok' : 'bad')
  row.querySelector('.st').innerHTML = `<b>${ok ? '✓' : '✗'}</b>`
  if (done) row.querySelector('.lab').textContent = done
}
const add = (row, el) => { row.querySelector('.at').append(el); return el }

/** Each kind of step. box is where rows go; every call returns its row. */
export const ACT = {
  async thinking(box, tok, ms = 1600) {
    const el = h('<div class="act think" role="status"><span class="shine"><span class="base">Thinking</span><span class="win" aria-hidden="true"><span class="lit">Thinking</span></span></span></div>')
    box.append(el)
    el.querySelector('.shine').style.setProperty('--sw', `${el.querySelector('.base').offsetWidth}px`)
    await wait(ms, tok)
    return el
  },
  async readFile(box, tok, path = 'src/app/page.tsx', ms = 1200) {
    const i = path.lastIndexOf('/')
    const row = stepRow('read-file', ICONS.file, 'Reading')
    add(row, h(`<span class="fchip"><span class="mini" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><span class="scan"></span></span><span class="fn">${esc(path.slice(i + 1))}</span><span class="fp">${esc(path.slice(0, i + 1))}</span></span>`))
    box.append(row)
    await wait(ms, tok)
    finish(row, true, 'Read')
    return row
  },
  async listFiles(box, tok, dir = 'src/', ents = ['app/', 'components/', 'lib/', 'styles/', 'page.tsx', 'layout.tsx']) {
    const row = stepRow('list-files', ICONS.folder, 'Listing', ` <span class="tgt">${esc(dir)}</span>`)
    const wrap = add(row, h('<span class="ents"></span>'))
    box.append(row)
    for (const e of ents) { await wait(140, tok); wrap.append(h(`<span class="ent">${esc(e)}</span>`)) }
    await wait(300, tok)
    finish(row, true, 'Listed')
    return row
  },
  /** The deck, as in the app: pages flip while it searches, then the sites it found are dealt out and named. */
  async searchWeb(box, tok, query = 'liquid glass panel design', sites = SITES.slice(0, 4), ms = 2400) {
    const row = stepRow('search-web', ICONS.mag, 'Searching the web', ` <span class="q">${esc(query)}</span>`)
    // Each card is a third of the loop apart: one in front, one in the middle, one at the back.
    const deck = add(row, h(`<span class="deck" aria-hidden="true">${[0, 1.4, 0.7].map((lag) => `<span class="deck-card" style="animation-delay:-${lag}s"><i></i><i></i><i></i><i></i></span>`).join('')}</span>`))
    box.append(row)
    await wait(ms, tok)
    const dealt = sites.slice(0, 5)
    deck.innerHTML = dealt.map((s, i) => `<span class="deck-card dealt" style="--i:${i}">${fav(s)}<i></i><i></i></span>`).join('')
    add(row, h(`<span class="doms">${sites.map((s, i) => `<span class="dom" style="animation-delay:${(0.35 + dealt.length * 0.15 + i * 0.08).toFixed(2)}s">${fav(s)}${esc(s[0])}</span>`).join('')}</span>`))
    finish(row, true, 'Searched the web')
    await wait(500, tok)
    return row
  },
  async fetchPage(box, tok, url = 'developer.apple.com/design/human-interface-guidelines/materials') {
    const site = SITES.find((s) => url.startsWith(s[0])) ?? [url.split('/')[0], '#1d1d1f']
    const row = stepRow('fetch-page', ICONS.globe, 'Reading')
    add(row, h(`<span class="site">${fav(site)}<span>${esc(url)}</span></span>`))
    const prog = add(row, h('<span class="prog" aria-hidden="true"><i class="fill"></i><i class="shim"></i></span>'))
    box.append(row)
    for (const p of [0.2, 0.45, 0.7, 0.88, 1]) { await wait(320, tok); prog.style.setProperty('--p', p) }
    await wait(250, tok)
    finish(row, true, 'Read')
    return row
  },
  async runCommand(box, tok, cmd = 'npm test', ok = true) {
    const row = stepRow('run-command', ICONS.term, 'Running')
    const term = add(row, h(`<div class="term"><div><span class="p">$</span> ${esc(cmd)}<span class="tcur"></span></div></div>`))
    box.append(row)
    const lines = ok
      ? [['d', '> steward@0.1.0 test'], ['d', '> vitest run'], ['g', ' ✓ tests/commands.test.ts (11)'], ['g', ' ✓ tests/agent.test.ts (14)'], ['g', ' ✓ tests/moods.test.ts (9)'], ['', ' Tests  90 passed (90)']]
      : [['d', '> vitest run'], ['g', ' ✓ tests/commands.test.ts (11)'], ['r', ' × tests/switcher.test.ts > filters by path'], ['r', '   expected [] to have length 1'], ['', ' Tests  1 failed | 89 passed (90)']]
    await wait(500, tok)
    for (const [c, l] of lines) { term.append(h(`<div class="ol ${c}">${esc(l)}</div>`)); await wait(230, tok) }
    term.querySelector('.tcur').remove()
    term.append(h(`<span class="exit ${ok ? 'ok' : 'bad'}">${ok ? '✓ exit 0' : '✗ exit 1'}</span>`))
    finish(row, ok, 'Ran')
    return row
  },
  /** A shutter flash, then the thumbnail flies into the tray slot that tray() returns. */
  async screenshot(box, tok, tray) {
    const row = stepRow('screenshot', ICONS.cam, 'Screenshotting', ' <span class="tgt">vercel.com/haven</span>')
    const shot = add(row, h('<span class="shot"><span class="pagemock" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span class="flash"></span></span>'))
    box.append(row)
    await wait(700, tok)
    shot.querySelector('.flash').classList.add('go')
    await wait(380, tok)
    if (tray) await flyTo(shot, tray(), tok)
    finish(row, true, 'Screenshotted')
    return row
  },
  async readLogs(box, tok) {
    const row = stepRow('read-logs', ICONS.logs, 'Reading build logs', ' <span class="tgt">haven · Preview</span>')
    const logs = add(row, h('<div class="logs"></div>'))
    box.append(row)
    const L = ['Cloning github.com/jasman/haven', 'Installing dependencies…', 'added 412 packages in 9s', 'Running "next build"', 'Creating an optimized production build', '<span class="r">Type error: Property \'blur\' does not exist</span>', '<span class="r">  at src/app/page.tsx:42:18</span>']
    for (const l of L) { logs.append(h(`<div class="ol">${l}</div>`)); await wait(260, tok) }
    finish(row, true, 'Read build logs')
    return row
  },
  async searchPhotos(box, tok, q = 'frosted glass abstract') {
    const row = stepRow('search-photos', ICONS.photo, 'Searching photos', ` <span class="q">${esc(q)}</span>`)
    const grid = add(row, h('<span class="photos"></span>'))
    box.append(row)
    await wait(600, tok)
    for (const gd of GRADS.concat(GRADS.slice(0, 2))) { grid.append(h(`<i style="background:${gd}"></i>`)); await wait(150, tok) }
    finish(row, true, 'Searched photos')
    return row
  },
  /** The image drops into the tray slot that tray() returns. */
  async addImage(box, tok, tray) {
    const row = stepRow('add-image', ICONS.image, 'Adding to the tray', ' <span class="tgt">glass-hero.png</span>')
    const img = add(row, h(`<span class="shot small" style="background:${GRADS[3]}"></span>`))
    box.append(row)
    await wait(500, tok)
    if (tray) await flyTo(img, tray(), tok, GRADS[3])
    finish(row, true, 'Added to the tray')
    return row
  },
}

/** Fly a copy of src into slot, which then lands with a small pop. Reduced motion fades instead. */
export async function flyTo(src, slot, tok, bg = 'linear-gradient(135deg,#7cc4ff,#c8b6ff)') {
  if (!slot) return
  const a = src.getBoundingClientRect(), b = slot.getBoundingClientRect()
  if (a.width && b.width) {
    const fly = src.cloneNode(true)
    fly.className = 'flyer'
    fly.querySelector('.flash')?.remove()
    // The copy leaves the glass for the page, so it takes the glass's colors with it.
    const cs = getComputedStyle(src)
    for (const k of ['--paper', '--inset2', '--shadow']) fly.style.setProperty(k, cs.getPropertyValue(k))
    Object.assign(fly.style, { left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px`, background: getComputedStyle(src).background })
    document.body.append(fly)
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    if (env.rm) fly.style.opacity = '0'
    else fly.style.transform = `translate(${b.left - a.left}px,${b.top - a.top}px) scale(${b.width / a.width},${b.height / a.height})`
    await wait(env.rm ? 300 : 620, tok).finally(() => fly.remove())
  }
  slot.classList.remove('slot')
  slot.style.background = bg
  slot.classList.remove('landed'); void slot.offsetWidth; slot.classList.add('landed')
}

/* ---------------- finished steps ---------------- */
/** One quiet line for finished steps, as the app words it: "Read 3 files · Searched the web · Ran npm test". */
export function summarize(steps) {
  const order = [], by = {}
  for (const s of steps) { if (s.kind === 'thinking') continue; if (!by[s.kind]) { by[s.kind] = []; order.push(s.kind) } by[s.kind].push(s) }
  const pl = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`
  return order.map((k) => {
    const xs = by[k], n = xs.length, bad = xs.some((x) => x.status === 'failed')
    const text = {
      'read-file': `Read ${pl(n, 'file')}`, 'list-files': 'Listed files', 'search-web': n === 1 ? 'Searched the web' : `Searched the web ${n} times`,
      'fetch-page': `Read ${pl(n, 'page')}`, 'run-command': n === 1 ? `Ran ${xs[0].target}` : `Ran ${n} commands`, screenshot: `Took ${pl(n, 'screenshot')}`,
      'add-image': `Added ${pl(n, 'image')}`, 'read-logs': 'Read the build logs', 'search-photos': 'Searched photos',
    }[k] || k
    return { text, bad }
  })
}
/** Fold finished rows into the summary line, which opens to list them. */
export function collapse(box, rows, steps) {
  const parts = summarize(steps)
  const btn = h(`<button class="summary" aria-expanded="false"><span class="chev" aria-hidden="true">›</span><span>${parts.map((p) => (p.bad ? `<span class="badx">${esc(p.text)} ✗</span>` : esc(p.text))).join(' · ')}</span></button>`)
  const list = h('<div class="steps" hidden></div>')
  rows.forEach((r) => { r.classList.remove('leaving'); r.style.animation = 'none'; list.append(r) })
  box.append(btn, list)
  btn.onclick = () => {
    const on = btn.getAttribute('aria-expanded') !== 'true'
    btn.setAttribute('aria-expanded', String(on))
    list.hidden = !on
    if (on) list.querySelectorAll('.act').forEach((r, i) => { r.style.animation = `fadeup .3s ${i * 40}ms both` })
  }
  return btn
}
export async function leave(els, tok) { els.forEach((e) => e.classList.add('leaving')); await wait(300, tok); els.forEach((e) => e.remove()) }

/** The reply streams in word by word behind a soft glowing cursor. */
export async function stream(box, tok, text, speed = 42) {
  const p = h('<div class="reply"><span class="cursor"></span></div>')
  box.append(p)
  const cur = p.querySelector('.cursor')
  for (const word of text.split(' ')) {
    const w = document.createElement('span')
    w.className = 'w'; w.dataset.w = word; w.textContent = word
    cur.before(w, document.createTextNode(' '))
    await wait(speed + Math.random() * 40, tok)
  }
  cur.classList.add('gone')
  await wait(300, tok)
  cur.remove()
  return p
}

/* ---------------- searching the web: the earlier takes ---------------- */
const QUERY = 'liquid glass panel design'
const searching = (icon, withQuery = true) => stepRow('search-web', icon, 'Searching the web', withQuery ? ' <span class="q" hidden></span>' : '')
async function showQuery(r, tok) { await wait(450, tok); const q = r.querySelector('.q'); if (q) { q.textContent = QUERY; q.hidden = false } }
const chips = (sites, step = 0.08) => h(`<span class="doms">${sites.map((s, i) => `<span class="dom" style="animation-delay:${(i * step).toFixed(2)}s">${fav(s)}${esc(s[0])}</span>`).join('')}</span>`)

/** FLIP: an element already in its final place starts from another element's spot and moves home. */
function flyFrom(el, from, tok) {
  if (env.rm) return
  const a = from.getBoundingClientRect(), b = el.getBoundingClientRect()
  el.style.transform = `translate(${a.left + a.width / 2 - (b.left + b.width / 2)}px, ${a.top + a.height / 2 - (b.top + b.height / 2)}px) scale(.25)`
  el.style.opacity = '0'
  requestAnimationFrame(() => requestAnimationFrame(() => { if (tok.dead) return; el.style.transform = ''; el.style.opacity = '' }))
}

/** Every take on "Searching the web": the four before the deck, and the deck (D), which is in the app. */
export const SEARCH_TAKES = [
  {
    id: 'before', name: 'Before', tag: 'Replaced', desc: 'What the app had first: a magnifier with an orbiting dot, then the sites it found pop in as chips.',
    async play(g, tok) {
      const r = searching(`<span class="mag">${ICONS.mag}<span class="orbit"><i></i></span></span>`)
      g.append(r)
      await showQuery(r, tok)
      await wait(2000, tok)
      r.querySelector('.orbit')?.remove()
      add(r, chips(SITES.slice(0, 4), 0.12))
      await wait(900, tok)
      finish(r, true, 'Searched the web')
    },
  },
  {
    id: 'bar', name: 'A. Search bar', tag: 'Earlier take', desc: 'The query types itself into a small search field, result rows load in as placeholders, then turn into the sites it found.',
    async play(g, tok) {
      const r = searching(ICONS.mag, false)
      g.append(r)
      const bar = add(r, h(`<span class="sbar">${ICONS.mag}<span class="sbar-q"></span><i class="caret"></i></span>`))
      await wait(350, tok)
      const q = bar.querySelector('.sbar-q')
      for (const ch of QUERY) { const s = document.createElement('span'); s.textContent = ch; q.append(s); if (!env.rm) await wait(32, tok) }
      await wait(250, tok)
      bar.querySelector('.caret').remove()
      bar.classList.add('go')
      const serp = add(r, h('<span class="serp"></span>'))
      for (let i = 0; i < 3; i++) { const e = h('<span class="res"><span class="sf"></span><span class="bars"><i></i><i></i></span><span class="shim"></span></span>'); e.style.animationDelay = `${i * 0.08}s`; serp.append(e) }
      await wait(1500, tok)
      serp.replaceChildren(...SITES.slice(0, 3).map((s, i) => { const e = h(`<span class="res">${fav(s)}<span class="txt"><span class="dn">${esc(s[0])}</span><span class="tt">${esc(s[2])}</span></span></span>`); e.style.animationDelay = `${i * 0.1}s`; return e }))
      await wait(700, tok)
      finish(r, true, 'Searched the web')
    },
  },
  {
    id: 'sonar', name: 'B. Sonar', tag: 'Earlier take', desc: 'The magnifier sends out pings while it searches. Each site it finds shoots out of the magnifier into its chip.',
    async play(g, tok) {
      const r = searching(`${ICONS.mag}<span class="ping"></span><span class="ping"></span>`)
      g.append(r)
      await showQuery(r, tok)
      await wait(2000, tok)
      const icon = r.querySelector('.ai')
      const doms = add(r, h('<span class="doms"></span>'))
      for (const s of SITES.slice(0, 4)) {
        const d = h(`<span class="dom fly">${fav(s)}${esc(s[0])}</span>`)
        doms.append(d)
        flyFrom(d, icon, tok)
        await wait(160, tok)
      }
      await wait(500, tok)
      r.querySelectorAll('.ping').forEach((p) => p.remove())
      finish(r, true, 'Searched the web')
    },
  },
  {
    id: 'lens', name: 'C. Lens over pages', tag: 'Earlier take', desc: 'A lens glides over a row of pages, lifting each one it passes. The pages that matched flip over to show their site; the rest fade.',
    async play(g, tok) {
      const r = searching(ICONS.mag)
      g.append(r)
      const strip = add(r, h(`<span class="strip">${'<span class="pg"><span class="fr"><i></i><i></i><i></i><i></i></span><span class="bk"></span></span>'.repeat(6)}<span class="lens"></span></span>`))
      const pages = [...strip.querySelectorAll('.pg')], lens = strip.querySelector('.lens')
      strip.style.setProperty('--span', `${strip.offsetWidth - 34}px`)
      await showQuery(r, tok)
      // Lift whichever page is under the lens. Does nothing while the run is paused.
      let on = true
      const track = () => {
        if (!on || tok.dead) return
        if (!tok.paused) {
          const lx = lens.getBoundingClientRect(), cx = lx.left + lx.width / 2
          for (const p of pages) { const b = p.getBoundingClientRect(); p.classList.toggle('hot', !env.rm && Math.abs(b.left + b.width / 2 - cx) < 14) }
        }
        requestAnimationFrame(track)
      }
      requestAnimationFrame(track)
      await wait(2200, tok).finally(() => { on = false })
      lens.style.opacity = '0'
      pages.forEach((p) => p.classList.remove('hot'))
      const hits = [0, 2, 3, 5]
      for (const [k, i] of hits.entries()) {
        const bk = pages[i].querySelector('.bk')
        bk.style.background = SITES[k][1]
        bk.textContent = SITES[k][0][0].toUpperCase()
        pages[i].classList.add('flip')
        await wait(140, tok)
      }
      pages.forEach((p, i) => { if (!hits.includes(i)) p.classList.add('miss') })
      add(r, chips(SITES.slice(0, 4)))
      await wait(600, tok)
      finish(r, true, 'Searched the web')
    },
  },
  {
    id: 'deck', name: 'D. Deck of pages', tag: 'In the app', desc: 'A small deck of pages flips while it searches, top page out and to the back. The sites it found are dealt out as cards and named in chips. This is the one in the app.',
    async play(g, tok) { await ACT.searchWeb(g, tok, QUERY, SITES.slice(0, 4), 2600) },
  },
]

/* ---------------- one demo per kind of step ---------------- */
const miniTray = (n) => h(`<div class="minitray">${GRADS.slice(0, n).map((gd) => `<i style="background:${gd}"></i>`).join('')}<i class="slot"></i></div>`)
/**
 * The demos the Glass Lab and the Showcase loop, in the order the Showcase lists them. play(box, tok, n) plays one
 * round (n counts rounds); gap is the pause before the next.
 */
export const DEMOS = [
  { id: 'thinking', title: 'Thinking', desc: 'A light sweeps across the letters.', play: (g, tok) => ACT.thinking(g, tok, 3200) },
  { id: 'read-file', title: 'Reading a file', desc: 'A file chip whose mini page gets scanned top to bottom.',
    async play(g, tok) { await ACT.readFile(g, tok, 'src/app/page.tsx', 2000); await ACT.readFile(g, tok, 'src/app/globals.css', 1600) } },
  { id: 'list-files', title: 'Listing files', desc: 'Entries cascade in. Skips node_modules, .git and build output.', play: (g, tok) => ACT.listFiles(g, tok) },
  { id: 'search-web', title: 'Searching the web', desc: 'A small deck of pages flips while it searches, top page out and to the back. The sites it found are dealt out as cards and named in chips.',
    play: (g, tok) => ACT.searchWeb(g, tok) },
  { id: 'fetch-page', title: 'Reading a web page', desc: 'A site chip with a shimmering progress line that fills as the page loads.', play: (g, tok) => ACT.fetchPage(g, tok) },
  { id: 'run-command', title: 'Running a command', desc: 'The command types out with a blinking cursor, output ticks in, then an exit badge. Alternates pass and fail.',
    play: (g, tok, n) => ACT.runCommand(g, tok, 'npm test', n % 2 === 0), gap: 2000 },
  { id: 'screenshot', title: 'Screenshot', desc: 'A shutter flash, then the thumbnail flies into the tray.',
    async play(g, tok) { const tray = miniTray(3), holder = h('<div></div>'); g.append(holder, tray); await ACT.screenshot(holder, tok, () => tray.querySelector('.slot') || tray.lastElementChild) } },
  { id: 'add-image', title: 'Adding an image', desc: 'The image drops into the tray.',
    async play(g, tok) { const tray = miniTray(2), holder = h('<div></div>'); g.append(holder, tray); await ACT.addImage(holder, tok, () => tray.querySelector('.slot') || tray.lastElementChild) } },
  { id: 'read-logs', title: 'Reading build logs', desc: 'Log lines stream in, with errors in red.', play: (g, tok) => ACT.readLogs(g, tok) },
  { id: 'search-photos', title: 'Searching photos', desc: 'Unsplash results pop in as a grid.', play: (g, tok) => ACT.searchPhotos(g, tok) },
  { id: 'reply', title: 'Streaming reply', desc: 'Words fade in from a slight blur, behind a soft glowing cursor. Nothing reflows.',
    play: (g, tok) => stream(g, tok, 'I moved the hero onto a frosted panel with a bright top edge and a soft inner glow. The text is a weight heavier, so it holds up on glass.') },
  { id: 'summary', title: 'Finished steps', desc: 'When the work is done, the steps fold into one quiet line. Click it to open the list.', gap: 7000,
    async play(g, tok) {
      const rows = []
      for (const p of ['src/app/page.tsx', 'src/app/layout.tsx', 'tailwind.config.ts']) rows.push(await ACT.readFile(g, tok, p, 450))
      rows.push(await ACT.searchWeb(g, tok, 'liquid glass css', SITES.slice(0, 3), 1100))
      const cmd = stepRow('run-command', ICONS.term, 'Running', ' <span class="tgt">npm test</span>')
      g.append(cmd); await wait(800, tok); finish(cmd, true, 'Ran'); rows.push(cmd)
      await wait(700, tok)
      await leave(rows, tok)
      collapse(g, rows, [{ kind: 'read-file' }, { kind: 'read-file' }, { kind: 'read-file' }, { kind: 'search-web' }, { kind: 'run-command', target: 'npm test' }])
    } },
]

/* ---------------- demos that loop while on screen ---------------- */
const demos = new Set()
const onScreen = new IntersectionObserver((list) => {
  for (const e of list) for (const d of demos) if (d.card === e.target) d.see(e.isIntersecting)
}, { rootMargin: '60px' })
document.addEventListener('visibilitychange', () => { for (const d of demos) d.see(d.visible) })

/**
 * Play play(box, tok, n) over and over inside box, starting the first time card comes on screen (auto) or when
 * replay() is called. Off screen or in a hidden tab, its CSS loops freeze (card gets .is-off) and the run pauses at
 * its next step. replay() starts over. clear: empty box before each round. once: play one round only.
 */
export function demo(card, box, play, { gap = 1600, once = false, clear = true, auto = true } = {}) {
  let tok = null, n = 0, started = !auto
  const d = {
    card, visible: false,
    get running() { return !!tok && !tok.dead },
    see(v) {
      d.visible = v
      const live = v && !document.hidden
      card.classList.toggle('is-off', !live)
      if (live && !started) d.replay()
      else hold(tok, !live)
    },
    async replay() {
      kill(tok)
      const mine = token()
      tok = mine
      started = true
      hold(mine, !d.visible || document.hidden)
      try {
        do {
          if (clear) box.replaceChildren()
          await play(box, mine, n++)
          await wait(gap, mine)
        } while (!once)
      } catch (e) { if (e !== CANCEL) console.error(e) }
      if (tok === mine) tok = null
    },
    /** Stop the run where it is; replay() starts it again. */
    cancel() { kill(tok); tok = null },
    stop() { kill(tok); demos.delete(d); onScreen.unobserve(card) },
  }
  demos.add(d)
  card.dataset.demo = ''
  onScreen.observe(card)
  return d
}
