// 3. A full request: your message, thinking, reading files, searching the web, running a command and the streaming
// reply, with the character's mood following along the way the app's does (glintFor and workingMood in
// src/renderer/src/pill/glint.ts).
import { ACT, SITES, wait, leave, collapse, stream, demo, h, stepRow, finish, esc } from '../shared/activity.js'
import { ICONS } from '../shared/icons.js'
import { MOODS } from '../pill/eyes.js'
import { S, onChange, stage, pill, card } from './state.js'
import { headHTML, composerHTML, setCtx } from './mock.js'

const PHASES = [
  ['ask', 'You ask', 'listening', 'Listening: the eyes slide apart and nod with each key'],
  ['think', 'Thinking', 'thinking', 'Thinking: three dots in a wave'],
  ['read', 'Reading files', 'thinking', 'Reading: the dots light up one at a time'],
  ['search', 'Searching the web', 'thinking', 'Searching: the dots circle'],
  ['run', 'Running a command', 'thinking', 'Thinking while the command runs'],
  ['reply', 'Streaming reply', 'talking', 'Talking: a mouth that moves with the words'],
  ['done', 'Done', 'done', 'Happy: calm arches'],
]
const ASK = 'Make the hero on haven feel more like Liquid Glass, and check the tests still pass.'
const REPLY = 'The hero now sits on a frosted panel with a bright top edge and a soft inner glow, and the headline is a weight heavier so it holds up on glass. All 90 tests pass.'
let mood = 'idle', glint = 'sweep', el, run

export function render(host) {
  host.insertAdjacentHTML('beforeend', `<div class="grid">${card({ id: 'request', section: 3, title: 'A full request', status: 'app', from: 'glass-lab.html', cls: 'wide',
    desc: 'One request from start to finish, in the panel over a desktop. The character in the header changes mood with each step, and the context pill follows what the agent is touching.',
    tools: '<button class="btn primary" id="r-play">▶ Play a full request</button><button class="btn" id="r-reset">Reset</button>',
    body: `<div class="req">
      <ol class="phases" id="r-phases">${PHASES.map(([id, l, , d]) => `<li data-p="${id}"><b>${l}</b><small>${d}</small></li>`).join('')}</ol>
      <div class="reqscene gx"><div class="wall"></div>
        <div class="rpanel glass">${headHTML({ slot: 'r-pill' })}<div class="rchat" id="r-chat"></div>${composerHTML()}</div>
      </div>
      <p class="moodline">Mood: <b id="r-mood"></b></p>
    </div>` })}</div>`)
  el = host.querySelector('#f-request')
  run = demo(el, el, play, { once: true, clear: false, auto: false, gap: 0 })
  el.querySelector('#r-play').onclick = () => run.replay()
  el.querySelector('#r-reset').onclick = () => { run.cancel(); finished() }
  build()
  finished()
  onChange(['color', 'version', 'dark', 'mouth', 'think'], build)
}

function build() {
  stage.clear('r')
  const slot = document.getElementById('r-pill')
  slot.replaceChildren()
  pill(slot, 64, 54, { owner: 'r', seed: 5, main: true, anchor: el, follow: () => [mood, glint] })
}

function show(phase, m, gl = 'sweep') {
  mood = m; glint = gl
  document.querySelectorAll('#r-phases li').forEach((li) => li.classList.toggle('on', li.dataset.p === phase))
  const label = MOODS.find((x) => x.id === m)?.label ?? m
  document.getElementById('r-mood').textContent = m === 'thinking' ? `${label} (${{ sweep: 'wave', step: 'reading', search: 'searching' }[gl]})` : label
}

/** The finished conversation, as it looks after the request. */
function finished() {
  const chat = document.getElementById('r-chat')
  chat.replaceChildren(h(`<div class="msg user">${esc(ASK)}</div>`))
  const rows = ['src/app/page.tsx', 'src/app/globals.css'].map((p) => { const r = stepRow('read-file', ICONS.file, 'Read', ` <span class="tgt">${esc(p.split('/').pop())}</span>`); finish(r); return r })
  for (const [k, ic, l, t] of [['search-web', ICONS.mag, 'Searched the web', ' <span class="q">liquid glass css</span>'], ['run-command', ICONS.term, 'Ran', ' <span class="tgt">npm test</span>']]) { const r = stepRow(k, ic, l, t); finish(r); rows.push(r) }
  collapse(chat, rows, [{ kind: 'read-file' }, { kind: 'read-file' }, { kind: 'search-web' }, { kind: 'run-command', target: 'npm test' }])
  chat.append(h(`<div class="reply">${esc(REPLY)}</div>`))
  setCtx(el.querySelector('.ctxhost'), 'haven', 'src/app/globals.css', false)
  show('', 'idle')
}

async function play(_, tok) {
  const chat = document.getElementById('r-chat'), input = el.querySelector('.cinput'), ctx = el.querySelector('.ctxhost')
  chat.replaceChildren()
  setCtx(ctx, 'haven', 'src/app/globals.css', false)
  input.textContent = 'Ask Steward…'
  show('ask', 'listening')
  await wait(500, tok)
  input.textContent = ''
  for (const ch of ASK) { input.textContent += ch; await wait(S.rm ? 8 : 26, tok) }
  await wait(350, tok)
  input.textContent = 'Ask Steward…'
  chat.append(h(`<div class="msg user">${esc(ASK)}</div>`))
  await wait(400, tok)
  show('think', 'thinking', 'sweep')
  const th = await ACT.thinking(chat, tok, 1800)
  await leave([th], tok)
  const rows = [], steps = []
  show('read', 'thinking', 'step')
  for (const p of ['src/app/page.tsx', 'src/app/globals.css']) {
    setCtx(ctx, 'haven', p, true)
    rows.push(await ACT.readFile(chat, tok, p, 1300)); steps.push({ kind: 'read-file' })
  }
  show('search', 'thinking', 'search')
  setCtx(ctx, 'haven', 'web: liquid glass css', true)
  rows.push(await ACT.searchWeb(chat, tok, 'liquid glass css', SITES.slice(0, 3), 2400)); steps.push({ kind: 'search-web' })
  show('run', 'thinking', 'sweep')
  setCtx(ctx, 'haven', '$ npm test', true)
  rows.push(await ACT.runCommand(chat, tok, 'npm test', true)); steps.push({ kind: 'run-command', target: 'npm test' })
  await wait(700, tok)
  await leave(rows, tok)
  collapse(chat, rows, steps)
  setCtx(ctx, 'haven', 'src/app/globals.css', false)
  show('reply', 'talking')
  await stream(chat, tok, REPLY, 55)
  show('done', 'done')
  await wait(2200, tok)
  show('', 'idle')
}
