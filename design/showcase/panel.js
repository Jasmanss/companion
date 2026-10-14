// 5. The panel: the chat, the tray and image viewer, the context pill, the ⌘K switcher, approval cards, the session
// strip, peek alerts, the morning brief, where you left off and the Settings window, drawn like the app's
// (src/renderer/src/*.tsx and styles.css). What isn't designed yet gets a placeholder card.
import { setMood } from '../pill/eyes.js'
import { wait, demo, h, esc, stepRow, finish, GRADS, collapse } from '../shared/activity.js'
import { ICONS } from '../shared/icons.js'
import { filterProjects, switcherRows, PROJECTS } from '../shared/switcher.js'
import { TINTS, applyTint } from '../shared/glass.js'
import { S, set, onChange, stage, pill, look, card, PILL_COLORS, VERSIONS } from './state.js'
import { headHTML, composerHTML, setCtx } from './mock.js'

const desk = (inner, hgt, cls = '') => `<div class="demo gx ${cls}" style="height:${hgt}px"><div class="wall"></div>${inner}</div>`
const SHOTS = [['hero-glass.png', 'Screenshot of haven at 1440 wide', GRADS[0]], ['dashboard.png', 'From dribbble.com', GRADS[2]], ['panel-dark.png', 'Unsplash · Jo Kim', GRADS[4]], ['blobs.png', 'Unsplash · Ana Ruiz', GRADS[3]], ['sunset.jpg', 'Dropped in from Finder', GRADS[1]], ['sky.png', 'Pasted', GRADS[5]]]

export function render(host) {
  host.insertAdjacentHTML('beforeend', `<div class="grid">
    ${card({ id: 'p-chat', section: 5, title: 'The chat', status: 'app', from: ['glass-lab.html', 'src/renderer/src/Chat.tsx'],
      desc: 'Your messages on the right, replies with simple formatting, finished steps folded into one line, and the box to type in. An empty chat suggests things to try.',
      tools: '<span class="seg" id="p-chatseg"><button data-chat="full" aria-pressed="true">Conversation</button><button data-chat="empty" aria-pressed="false">Empty</button></span>',
      body: desk(`<div class="mpanel glass">${headHTML({ slot: 'p-chat-pill' })}<div class="rchat static" id="p-chatlog"></div>${composerHTML()}</div>`, 470) })}
    ${card({ id: 'p-ctx', section: 5, title: 'The context pill', status: 'app', from: ['glass-lab.html', 'src/renderer/src/ContextPill.tsx'],
      desc: 'Under the name: the project, then what the agent is touching right now, with a live dot while it works. A file\'s folders give way before its name. Click it, or press ⌘K, for the switcher.',
      body: desk(`<div class="mpanel glass short">${headHTML({ slot: 'p-ctx-pill' })}</div>`, 120) })}
    ${card({ id: 'p-switch', section: 5, title: 'The ⌘K project switcher', status: 'app', from: ['glass-lab.html', 'src/renderer/src/switcher.ts'],
      desc: 'Grows out of the context pill. Search as you type: the start of a name first, then a word inside it, then a folder on its path, then the letters in order. Type in it, or watch it type.',
      body: desk(`<div class="mpanel glass short">${headHTML({ slot: 'p-sw-pill' })}</div><div class="mswitch glass thick"><input id="p-swin" placeholder="Switch project…" autocomplete="off" aria-label="Search projects"><ul class="swl" id="p-swl" role="listbox"></ul></div>`, 420) })}
    ${card({ id: 'p-tray', section: 5, title: 'The tray and the image viewer', status: 'app', from: ['glass-lab.html', 'src/renderer/src/Tray.tsx', 'src/renderer/src/Viewer.tsx'],
      desc: 'Images you drop, paste or ask for. Drag them out one at a time or all at once, or save them into the project. Click one to open the viewer, with arrows and a strip of the rest.',
      body: desk(`<div class="mpanel glass"><section class="tray"><div class="tray-head"><span><b>Tray</b><span class="count">6</span></span><span class="tray-acts"><span class="chip">${ICONS.drag} Drag all</span><span class="chip">Save to project</span><span class="chip quiet">Clear</span></span></div><ul class="tray-grid">${SHOTS.map(([n, , g], i) => `<li class="thumb" data-shot="${i}" style="background:${g}" title="${n}"><button class="thumb-x" aria-label="Remove ${n}">${ICONS.close}</button></li>`).join('')}</ul></section><p class="hintline">Click a picture to open it.</p></div><div class="viewer glass" id="p-viewer" hidden></div>`, 400) })}
    ${card({ id: 'p-approval', section: 5, title: 'Approval cards', status: 'app', from: 'src/renderer/src/Chat.tsx',
      desc: 'Anything risky asks first: deploys, rollbacks and git push always do. The character waits with wide eyes and a "!". Run it or skip it.',
      tools: '<button class="btn" id="p-apreset">Reset</button>',
      body: desk(`<div class="mpanel glass">${headHTML({ slot: 'p-ap-pill' })}<div class="rchat static" id="p-aplog"></div></div>`, 360) })}
    ${card({ id: 'p-sessions', section: 5, title: 'The session strip', status: 'app', from: 'src/renderer/src/SessionStrip.tsx',
      desc: 'Every Claude Code session Steward has heard from, waiting ones first. Click one for what it last said and where it runs. With the panel open, a new alert shows as a banner at the top.',
      body: desk(`<div class="mpanel glass">${headHTML({ slot: 'p-ss-pill' })}<div class="banner"><strong>haven needs your OK</strong><span>Claude Code wants to run git push origin main</span><span class="chip">Open the session</span></div><section class="sessions"><ul class="session-chips" id="p-chips"></ul><div id="p-sdetail"></div></section><div class="rchat static"><p class="hint">Steward hears from sessions through Claude Code hooks.</p></div></div>`, 350) })}
    ${card({ id: 'p-nudge', section: 5, title: 'Peek alerts', status: 'app', from: 'src/renderer/src/Nudge.tsx',
      desc: 'Tucked away, Steward peeks out from the screen edge with the news and the character reacts: mad for a failed deploy, wide eyes when a session needs you, a party when a PR merges. It never takes focus and tucks back in after a while.',
      body: desk('<div class="nudge solid" id="p-nudgebox"><span class="nslot"></span><div class="ntext"><b class="ntitle"></b><span class="ndetail"></span><span class="nmore"></span><span class="chip naction"></span></div><button class="nclose" aria-label="Tuck away">' + ICONS.close + '</button></div>', 190) })}
    ${card({ id: 'p-brief', section: 5, title: 'The morning brief', status: 'app', from: 'src/renderer/src/BriefCard.tsx',
      desc: 'The first time you open the panel each morning: what broke, what deployed, which sessions finished overnight, where you left off and any Dependabot PRs.',
      body: desk(`<div class="mpanel glass scroll"><section class="bcard"><header class="bhead"><span><strong>Good morning</strong> · Tue 14 Oct</span><button class="ib" aria-label="Dismiss">${ICONS.close}</button></header>
        <p>One deploy failed overnight and two went out. Two sessions finished.</p>
        <h4>Broke</h4><ul><li><strong>haven</strong>: Missing environment variable DATABASE_URL <a href="#f-p-brief">logs</a></li></ul>
        <h4>Deployed</h4><ul><li><strong>tally</strong> (production): Fix rounding in totals <a href="#f-p-brief">open</a></li><li><strong>bite</strong>: New menu page <a href="#f-p-brief">open</a></li></ul>
        <h4>Sessions finished</h4><ul><li><strong>haven</strong>: Moved the hero onto glass, tests pass</li><li><strong>steward</strong>: Showcase page</li></ul>
        <h4>Where you left off · haven</h4><p class="lo-status">on main · 2 uncommitted · pushed</p>
        <h4>Dependabot</h4><ul><li><a href="#f-p-brief">companion #4</a> Bump @types/node from 22 to 26</li></ul></section></div>`, 420) })}
    ${card({ id: 'p-leftoff', section: 5, title: 'Where you left off', status: 'app', from: 'src/renderer/src/LeftOffCard.tsx',
      desc: 'Switching to a project you haven\'t opened in a while shows its branch, the last commits, what isn\'t committed or pushed, and the last thing Claude said there.',
      body: desk(`<div class="mpanel glass scroll"><section class="bcard"><header class="bhead"><span>Where you left off · <strong>haven</strong></span><button class="ib" aria-label="Dismiss">${ICONS.close}</button></header>
        <p class="lo-status">on v1.1-hub · 2 uncommitted · 1 unpushed</p>
        <ul class="lo-commits"><li><code>7b49851</code> Hero on frosted glass <span class="muted">· 2h ago</span></li><li><code>035efef</code> Tighter headline <span class="muted">· yesterday</span></li><li><code>30920c8</code> Glass nav bar <span class="muted">· 2 days ago</span></li></ul>
        <p class="muted small">Changed: src/app/page.tsx, src/app/globals.css</p>
        <blockquote class="lo-claude"><span class="muted small">Claude said 2h ago</span><p>The hero is on glass now. Next I'd check the contrast of the headline on light wallpapers.</p></blockquote></section></div>`, 330) })}
    ${card({ id: 'p-settings', section: 5, title: 'The Settings window', status: 'app', from: ['glass-lab.html', 'src/renderer/src/SettingsWindow.tsx', 'src/renderer/src/Settings.tsx'], cls: 'wide',
      desc: 'Its own window, with a sidebar of sections. Every change applies right away. In this mock, Version, Color and the mouth drive the whole page, like the controls at the top.',
      body: desk('<div class="setwin" id="p-setwin"></div>', 560, 'setdesk') })}
    ${card({ id: 'p-review', section: 5, title: 'Visual Review', status: 'planned', from: null,
      desc: 'When a Claude Code session finishes, Steward slides out with a before and after of the running app, changed areas marked, a tests badge and a one-line risk note, with Looks good and Send it back.',
      body: '<div class="placeholder">Not designed yet</div>' })}
    ${card({ id: 'p-watch', section: 5, title: 'Overnight Watch', status: 'planned', from: null,
      desc: 'A goodnight card, then Steward watches sessions, deploys and CI while you sleep, calls or texts only when something is urgent, and turns the morning brief into a night report.',
      body: '<div class="placeholder">Not designed yet</div>' })}
  </div>`)
  chat('full')
  host.querySelector('#p-chatseg').addEventListener('click', (e) => { const b = e.target.closest('[data-chat]'); if (b) chat(b.dataset.chat) })
  contextPill(host)
  switcher(host)
  tray(host)
  approval(host)
  sessions(host)
  nudge(host)
  settings(host)
  build()
  onChange(['color', 'version', 'dark', 'mouth', 'think'], build)
}

/* ---------------- the characters in the headers ---------------- */
let apGroup, nudgeGroup
function build() {
  stage.clear('p')
  for (const [id, seed] of [['p-chat-pill', 11], ['p-ctx-pill', 12], ['p-sw-pill', 13], ['p-ss-pill', 14]]) {
    const slot = document.getElementById(id)
    slot.replaceChildren()
    pill(slot, 64, 54, { owner: 'p', seed, mood: id === 'p-ss-pill' ? 'needs-you' : 'idle' })
  }
  const ap = document.getElementById('p-ap-pill')
  ap.replaceChildren()
  apGroup = pill(ap, 64, 54, { owner: 'p', seed: 15, mood: apMood })
  const ns = document.querySelector('#p-nudgebox .nslot')
  ns.replaceChildren()
  nudgeGroup = pill(ns, 50, 44, { owner: 'p', seed: 16, mood: ALERTS[alertAt].mood })
  settingsPreview()
}

/* ---------------- chat ---------------- */
function chat(mode) {
  document.querySelectorAll('#p-chatseg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.chat === mode)))
  const log = document.getElementById('p-chatlog')
  if (mode === 'empty') { log.innerHTML = '<div class="hint"><p>Try:</p><ul><li>“Find 4 landing pages with bento grids”</li><li>“3 dark desk-setup photos for a hero”</li><li>“Run the tests”</li></ul></div>'; return }
  log.innerHTML = '<p class="msg user">Why is the haven build failing?</p>'
  const rows = [['read-logs', ICONS.logs, 'Read build logs'], ['read-file', ICONS.file, 'Read']].map(([k, i, l]) => { const r = stepRow(k, i, l); finish(r); return r })
  collapse(log, rows, [{ kind: 'read-logs' }, { kind: 'read-file' }])
  log.append(h(`<div class="reply md"><p>The build stops at a type error in <code>page.tsx</code>: <code>blur</code> isn't a prop of <code>Hero</code>.</p><ul><li>Rename it to <code>frost</code>, which <code>Hero</code> takes.</li><li>Or add <code>blur?: number</code> to its props.</li></ul><p>Want me to make the first change and run the build?</p></div>`))
}

/* ---------------- context pill ---------------- */
function contextPill(host) {
  const el = host.querySelector('#f-p-ctx'), slot = el.querySelector('.ctxhost')
  const STEPS = [[null, false, 1600], ['src/components/Hero.tsx', true, 1800], ['src/app/globals.css', true, 1600], ['web: liquid glass css', true, 1800], ['$ npm run build', true, 2000], ['src/app/globals.css', false, 2200]]
  demo(el, slot, async (_, tok) => { for (const [t, live, ms] of STEPS) { setCtx(slot, 'haven', t ?? 'src/app/page.tsx', live); await wait(ms, tok) } }, { clear: false, gap: 0 })
}

/* ---------------- ⌘K switcher ---------------- */
function switcher(host) {
  const el = host.querySelector('#f-p-switch'), input = el.querySelector('#p-swin'), list = el.querySelector('#p-swl')
  let sel = 0, items = []
  const show = () => { items = filterProjects(input.value); list.innerHTML = switcherRows(items, sel, 'haven', input.value) }
  const run = demo(el, input, async (_, tok) => {
    for (const q of ['hav', 'doc', 'tly', '']) {
      input.value = ''; sel = 0; show()
      await wait(700, tok)
      for (const ch of q) { input.value += ch; show(); await wait(160, tok) }
      await wait(1700, tok)
    }
  }, { clear: false, gap: 600 })
  // Typing takes over from the demo.
  input.addEventListener('focus', () => run.cancel())
  input.addEventListener('input', () => { sel = 0; show() })
  input.addEventListener('keydown', (e) => {
    const n = items.length + 1
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % n; show() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + n) % n; show() }
    else if (e.key === 'Escape') { input.value = ''; sel = 0; show() }
  })
  list.addEventListener('pointermove', (e) => { const li = e.target.closest('li[data-i]'); if (li && +li.dataset.i !== sel) { sel = +li.dataset.i; show() } })
  show()
}

/* ---------------- tray and viewer ---------------- */
function tray(host) {
  const el = host.querySelector('#f-p-tray'), viewer = el.querySelector('#p-viewer')
  let at = 0
  const draw = () => {
    const [n, note, g] = SHOTS[at]
    viewer.innerHTML = `<div class="vhead"><span class="vtitle"><b>${esc(n)}</b><small>${esc(note)}</small></span><span class="vcount">${at + 1} of ${SHOTS.length}</span><button class="ib" data-v="close" aria-label="Close">${ICONS.close}</button></div>
      <div class="vbody"><div class="vstage"><i style="background:${g}"></i></div><button class="vnav prev" data-v="prev" aria-label="Previous">${ICONS.back}</button><button class="vnav next" data-v="next" aria-label="Next">${ICONS.tuck}</button></div>
      <ul class="vstrip">${SHOTS.map((s, i) => `<li><button data-v="${i}" class="${i === at ? 'on' : ''}" style="background:${s[2]}" aria-label="${esc(s[0])}"></button></li>`).join('')}</ul>`
  }
  el.addEventListener('click', (e) => {
    const t = e.target.closest('[data-shot]'), v = e.target.closest('[data-v]')
    if (t && !e.target.closest('.thumb-x')) { at = +t.dataset.shot; draw(); viewer.hidden = false; return }
    if (!v) return
    const k = v.dataset.v
    if (k === 'close') viewer.hidden = true
    else { at = k === 'prev' ? (at + SHOTS.length - 1) % SHOTS.length : k === 'next' ? (at + 1) % SHOTS.length : +k; draw() }
  })
}

/* ---------------- approval cards ---------------- */
let apMood = 'needs-you'
function approval(host) {
  const el = host.querySelector('#f-p-approval'), log = el.querySelector('#p-aplog')
  const mood = (m) => { apMood = m; if (apGroup) setMood(apGroup.st, m) }
  const reset = () => {
    log.innerHTML = `<p class="msg user">Ship the glass hero.</p><div class="approval"><p class="approval-title">Run this?<span class="cwd">in haven</span></p><pre class="command">npm run build &amp;&amp; vercel deploy --prod</pre><p class="why">Deploys the hero change to production.</p><div class="approval-actions"><button class="btn primary" data-ap="run">Run</button><button class="btn" data-ap="skip">Skip</button></div></div>`
    mood('needs-you')
  }
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-ap]')
    if (e.target.closest('#p-apreset')) return reset()
    if (!b) return
    const card = b.closest('.approval'), ran = b.dataset.ap === 'run'
    card.classList.add(ran ? 'approved' : 'declined')
    card.querySelector('.approval-title').firstChild.textContent = ran ? 'Ran' : 'Skipped'
    card.querySelector('.approval-actions').remove()
    if (!ran) { mood('idle'); log.append(h('<div class="reply">OK, I won\'t deploy. It\'s ready whenever you are.</div>')); return }
    mood('thinking')
    const row = stepRow('run-command', ICONS.term, 'Running', ' <span class="tgt">vercel deploy --prod</span>')
    log.append(row)
    await new Promise((r) => setTimeout(r, 1800))
    finish(row, true, 'Ran')
    mood('celebrating')
    log.append(h('<div class="reply">Deployed. haven.vercel.app has the glass hero.</div>'))
    setTimeout(() => mood('idle'), 3000)
  })
  reset()
}

/* ---------------- session strip ---------------- */
function sessions(host) {
  const S_ = [
    { id: 'a', name: 'haven', state: 'needs-approval', label: 'waiting on you', detail: 'Wants to run git push origin main.', cwd: '~/code/haven' },
    { id: 'b', name: 'tally', state: 'working', label: 'working', detail: 'Running the tests after the rounding fix.', cwd: '~/code/tally' },
    { id: 'c', name: 'bite', state: 'finished', label: 'finished 4m ago', detail: 'Added the menu page. Tests pass.', cwd: '~/code/bite' },
  ]
  let open = null
  const chips = host.querySelector('#p-chips'), detail = host.querySelector('#p-sdetail')
  const draw = () => {
    chips.innerHTML = S_.map((s) => `<li><button class="session-chip ${s.state}${s.id === open ? ' on' : ''}" data-s="${s.id}" aria-expanded="${s.id === open}"><span class="session-dot"></span><b>${s.name}</b><span class="session-state">${s.label}</span></button></li>`).join('')
    const s = S_.find((x) => x.id === open)
    detail.innerHTML = s ? `<div class="session-detail"><p>${esc(s.detail)}</p><p class="session-cwd">${esc(s.cwd)}</p><button class="chip quiet">Dismiss</button></div>` : ''
  }
  chips.addEventListener('click', (e) => { const b = e.target.closest('[data-s]'); if (b) { open = open === b.dataset.s ? null : b.dataset.s; draw() } })
  open = 'a'
  draw()
}

/* ---------------- peek alerts ---------------- */
const ALERTS = [
  { mood: 'mad', urgent: true, title: 'haven deploy failed', detail: 'Missing environment variable DATABASE_URL', more: 'and 1 more', action: 'Want me to look?' },
  { mood: 'needs-you', urgent: false, title: 'A session needs your OK', detail: 'haven wants to run git push origin main', more: '', action: 'Open it' },
  { mood: 'celebrating', urgent: false, title: 'PR merged', detail: 'companion #7: Phase 4, the Pill in the app', more: '', action: '' },
]
let alertAt = 0
function nudge(host) {
  const el = host.querySelector('#f-p-nudge'), box = el.querySelector('#p-nudgebox')
  const show = (a) => {
    box.classList.toggle('urgent', a.urgent)
    box.querySelector('.ntitle').textContent = a.title
    box.querySelector('.ndetail').textContent = a.detail
    box.querySelector('.nmore').textContent = a.more
    box.querySelector('.naction').textContent = a.action
    box.querySelector('.naction').hidden = !a.action
    if (nudgeGroup) setMood(nudgeGroup.st, a.mood)
    box.classList.remove('out', 'in'); void box.offsetWidth; box.classList.add('in')
  }
  demo(el, box, async (_, tok) => {
    for (let i = 0; i < ALERTS.length; i++) {
      alertAt = i
      show(ALERTS[i])
      await wait(3800, tok)
      box.classList.add('out')
      await wait(500, tok)
    }
  }, { clear: false, gap: 300 })
}

/* ---------------- settings window ---------------- */
const SECTIONS = [['general', 'General', 'sliders'], ['steward', 'Steward', 'face'], ['projects', 'Projects', 'folder'], ['shortcuts', 'Shortcuts', 'key'], ['connections', 'Connections', 'plug'], ['notifications', 'Notifications', 'bell']]
const PREVIEWS = [['idle', 'Idle', 'idle'], ['listening', 'Listening', 'listening'], ['thinking', 'Thinking', 'thinking'], ['reading', 'Reading a file', 'thinking', 'step'], ['searching', 'Searching the web', 'thinking', 'search'], ['talking', 'Talking', 'talking'], ['done', 'Happy', 'done'], ['needs-you', 'Needs you', 'needs-you'], ['mad', 'Mad', 'mad'], ['sleepy', 'Sleepy', 'sleepy']]
const loc = { sec: 'steward', preview: 'idle', glass: 'tinted', personality: 'lively', name: 'Steward', edge: 'right', size: 'small', tint: 'ice', frost: 50 }
const TAB = { small: { tab: [56, 132], pill: [50, 44] }, medium: { tab: [70, 160], pill: [64, 56] } }
let previewGroup
function settings(host) {
  const win = host.querySelector('#p-setwin')
  win.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return
    if (b.dataset.sec) { loc.sec = b.dataset.sec; return drawSettings() }
    if (b.dataset.preview) { loc.preview = b.dataset.preview; return drawSettings() }
    if (b.dataset.k) {
      const k = b.dataset.k, v = b.dataset.v
      if (k === 'version' || k === 'color') return set({ [k]: v })
      if (k === 'mouth') return set({ mouth: !S.mouth })
      loc[k] = v
      drawSettings()
    }
  })
  win.addEventListener('input', (e) => {
    if (e.target.dataset.name !== undefined) { loc.name = e.target.value.trim() || 'Steward'; win.querySelector('.set-title').textContent = loc.name }
    if (e.target.dataset.frost !== undefined) loc.frost = +e.target.value
  })
  drawSettings()
}
function drawSettings() {
  const win = document.getElementById('p-setwin')
  const seg = (k, items, cur) => `<span class="sseg">${items.map(([v, l]) => `<button data-k="${k}" data-v="${v}" aria-pressed="${v === cur}">${l}</button>`).join('')}</span>`
  const row = (label, ctl, note = '') => `<div class="srow"><span class="slabel">${label}${note ? `<small>${note}</small>` : ''}</span><span class="sctl">${ctl}</span></div>`
  const sw = (on, k = '') => `<button class="sswitch${on ? ' on' : ''}" ${k ? `data-k="${k}"` : ''} role="switch" aria-checked="${on}"></button>`
  const group = (title, rows, note = '') => `<section class="sgroup">${title ? `<h4>${title}</h4>` : ''}<div class="sbox">${rows}</div>${note ? `<p class="snote">${note}</p>` : ''}</section>`
  const color = PILL_COLORS.find((c) => c.hex === S.color)
  let body
  if (loc.sec === 'steward') {
    const t = TAB[loc.size]
    body = `<div class="spreview"><div class="sstage gx"><div class="wall"></div></div><div class="sscreen ${loc.edge}"><div class="stab solid" style="width:${t.tab[0]}px;height:${t.tab[1]}px"></div></div></div>
      <div class="smoods">${PREVIEWS.map(([id, l]) => `<button class="chip${id === loc.preview ? ' on' : ''}" data-preview="${id}">${l}</button>`).join('')}</div>
      ${group('Look', row('Version', seg('version', VERSIONS, S.version)) +
        row('Color', `<span class="scolors">${PILL_COLORS.filter((c) => c.inApp).map((c) => `<button data-k="color" data-v="${c.hex}" aria-pressed="${c.hex === S.color}" title="${c.name}" aria-label="${c.name}" style="background:${c.hex}"></button>`).join('')}</span>`, color?.inApp ? color.name : `${color?.name}: not one of the app's six`) +
        (S.version === 'glass' ? row('Glass', seg('glass', [['tinted', 'Tinted'], ['clear', 'Clear']], loc.glass), loc.glass === 'clear' ? 'No tint: the color only shows in its marks, like the “!”' : '') : '') +
        row('A mouth when it talks', sw(S.mouth, 'mouth'), 'Without one, its eyes bounce with the words.'))}
      ${group('Personality', row('Personality', seg('personality', [['calm', 'Calm'], ['lively', 'Lively']], loc.personality), 'How much it moves') + row('Name', `<input class="sname" data-name value="${esc(loc.name)}" maxlength="24" aria-label="Name">`, 'Shown in the panel. The chat answers to it too.'))}
      ${group('At the screen edge', row('Screen edge', seg('edge', [['left', 'Left'], ['right', 'Right']], loc.edge)) + row('Size', seg('size', [['small', 'Small'], ['medium', 'Medium']], loc.size), 'How big the tab at the screen edge is.'))}
      ${group('The panel', row('Tint', `<span class="scolors">${Object.entries(TINTS).map(([k, t]) => `<button data-k="tint" data-v="${k}" aria-pressed="${k === loc.tint}" title="${t.name}" aria-label="${t.name}" style="background:rgb(${t.glass})"></button>`).join('')}</span>`, TINTS[loc.tint].name) +
        row('Frost', `<span class="srange"><small>Clear</small><input type="range" min="0" max="100" step="5" value="${loc.frost}" data-frost aria-label="Frost"><small>Frosted</small></span>`, 'How milky the glass is. With Reduce Transparency on, the panel is solid.'))}`
  } else {
    body = {
      general: group('', row('Open Steward at login', sw(true)) + row('Tuck the panel away when I click elsewhere', sw(true)) + row('Appearance', '<span class="sval">Matches your Mac</span>', 'Light and dark follow System Settings, and so do Reduce Transparency and Reduce Motion.')),
      projects: group('Your projects', PROJECTS.slice(0, 4).map((p, i) => row(`<span class="spi" style="background:${p.c}">${p.name[0].toUpperCase()}</span>${esc(p.name)}`, i === 0 ? '<span class="stag">Current</span>' : '<button class="btn small">Remove</button>', esc(p.path))).join('') + row('Add a project', '<button class="btn small">Choose folder…</button>')) +
        group('Commands that skip approval', '<pre class="sarea">npm test\nnpm run lint\nnpm run typecheck</pre>', 'Exact commands only, one per line. Everything else asks first, and deploys, rollbacks and git push always do.'),
      shortcuts: group('Anywhere', row('Show or tuck Steward', '<span class="keys"><kbd>⌥</kbd><kbd>Space</kbd></span><button class="btn small">Change</button>') + row('Hide from the screen edge', '<span class="keys"><kbd>⌥</kbd><kbd>⇧</kbd><kbd>Space</kbd></span><button class="btn small">Change</button>')) +
        group('In the panel', row('Switch project', '<span class="keys"><kbd>⌘</kbd><kbd>K</kbd></span><button class="btn small">Change</button>') + row('Settings', '<span class="keys"><kbd>⌘</kbd><kbd>,</kbd></span><button class="btn small">Change</button>'), 'Change opens a keyboard that shows every shortcut already taken.'),
      connections: group('', row('Anthropic', '<span class="sstatus on">Connected</span>', 'Stored in your keychain') + row('Vercel', '<span class="sstatus on">Connected</span>', 'Watches your deploys') + row('Unsplash', '<span class="sstatus">Not set</span>', 'Optional, turns on photo search') + row('Claude Code hooks', '<span class="sstatus on">On</span>', 'Lets Steward hear from your sessions')),
      notifications: group('', row('Peek out when a session needs me', sw(true)) + row('Failed builds', sw(true)) + row('Finished sessions', sw(true)) + row('Morning brief', sw(true))),
    }[loc.sec]
  }
  // Like the real window, this one takes the panel's tint.
  applyTint(win.closest('.demo'), TINTS[loc.tint])
  win.innerHTML = `<nav class="sside"><div class="lights"><i class="tl-r"></i><i class="tl-y"></i><i class="tl-g"></i></div>${SECTIONS.map(([k, l, ic]) => `<button class="snav" data-sec="${k}" aria-current="${k === loc.sec}">${ICONS[ic]}${l}</button>`).join('')}<span class="sver">Steward 0.1.0</span></nav>
    <div class="smain"><h3 class="set-title">${loc.sec === 'steward' ? esc(loc.name) : SECTIONS.find((s) => s[0] === loc.sec)[1]}</h3>${body}</div>`
  settingsPreview()
}
/** The Settings preview: the character big, and the tab at its real size against the screen edge it's on. */
function settingsPreview() {
  stage.clear('p-set')
  const win = document.getElementById('p-setwin')
  const big = win?.querySelector('.sstage'), tab = win?.querySelector('.stab')
  if (!big) return
  big.querySelectorAll('.pv').forEach((v) => v.remove())
  tab.replaceChildren()
  const p = PREVIEWS.find((x) => x[0] === loc.preview), t = TAB[loc.size]
  previewGroup = stage.group({ seed: 21, anchor: win, mood: p[2], glint: p[3], think: S.think, mouth: S.mouth, owner: 'p-set' })
  const lk = look({ tinted: loc.glass === 'tinted' })
  stage.view(previewGroup, S.version, big, 196, 125, lk)
  stage.view(previewGroup, S.version, tab, t.pill[0], t.pill[1], lk)
}
