// 1. Character and moods: every mood in Glass, Flat and Blocky, big and at the real header and peek sizes, with
// moods.html's controls (play a task, Type, Mouth, Thinking style) and its Hide names test.
import { MOODS, STORIES, setMood, setStyle } from '../pill/eyes.js'
import { S, set, onChange, stage, look, card, everyFrame, VERSIONS, FEATURES, STATUS } from './state.js'
import { esc } from '../shared/activity.js'
import { load, save } from '../shared/store.js'

const NAMES = Object.fromEntries(VERSIONS)
const KINDS = VERSIONS.map(([v]) => v)
/** Every mood is in the app except Confused, which was designed but has nothing to trigger it yet. */
const moodStatus = (id) => (id === 'confused' ? 'picked' : 'app')
const local = load('steward-showcase-moods', { mood: 'idle', anon: false, size: 'real' })
const keep = () => save('steward-showcase-moods', local)

let main, story = null, storyStep = 0, storyAt = 0, shuffled = MOODS.map((_, i) => i)
const reshuffle = () => { shuffled = MOODS.map((_, i) => i).sort(() => Math.random() - 0.5) }

export function render(host) {
  host.insertAdjacentHTML('beforeend', `<div class="grid">
    ${card({ id: 'moods', section: 1, title: 'Moods', status: 'app', from: ['moods.html', 'src/renderer/src/pill/eyes.ts'], cls: 'wide',
      desc: 'The eyes react to what Steward is doing. Pick a mood, play a short task, or press Type while it listens. Each version is shown big, in the 64×54 panel header and in the 50×44 peek tab. The Character control at the top picks the version the rest of the page uses; it is marked Selected here.',
      body: `<div class="stages" id="c-stages"></div>
        <div class="now"><b id="c-m"></b><span class="step" id="c-step"></span><span id="c-w"></span></div>
        <div class="ctl"><span class="lbl">Moods</span><span class="btns" id="c-moods"></span></div>
        <div class="ctl"><span class="lbl">Play a task</span><span class="btns" id="c-stories"></span></div>
        <div class="ctl"><button class="btn" id="c-type" title="A burst of keystrokes while it listens">Type</button><span class="sep"></span><span class="lbl">Mouth</span><span class="seg" id="c-mouth"></span><span class="sep"></span><span class="lbl">Thinking</span><span class="seg" id="c-think"></span></div>` })}
    ${card({ id: 'sheet', section: 1, title: 'Every mood at real size', status: 'app', from: 'moods.html', cls: 'wide',
      desc: 'All twelve moods side by side, each in all three versions. Hide the names to test whether every mood reads without its label: the tiles get shuffled and numbered. Click a tile to show it big above.',
      body: `<div class="ctl"><span class="lbl">Names</span><span class="seg" id="c-anon"></span><span class="sep"></span><span class="lbl">Size</span><span class="seg" id="c-size"></span><button class="btn" id="c-reshuffle" hidden>Reshuffle</button></div><div class="sheet" id="c-sheet"></div>` })}
    ${card({ id: 'thinking-bar', section: 1, title: 'Thinking as one bar', status: 'earlier', from: 'moods.html',
      desc: 'The other thinking style: the eyes join into one thick bar with a shimmer inside. Dots won and are in the app. Switch Thinking to Bar above to see it on every Pill.',
      body: '<div class="pair-row" id="c-bar"></div>' })}
    ${card({ id: 'hats', section: 1, title: 'Hats and glasses', status: 'planned', from: 'pill.html',
      desc: 'Things on top of the Pill (an antenna, a top hat) were explored on the Pill page. Nothing is picked or built yet.',
      body: '<div class="placeholder">Not designed for the app yet</div>' })}
  </div>`)
  // Confused has no card of its own, so list it here: it is in the grid above, but not in the app.
  FEATURES.push({ id: 'sheet', title: 'The Confused mood', status: STATUS.picked[0], section: 1, from: 'moods.html' })
  main = stage.group({ seed: 1, main: true, anchor: host.querySelector('#c-stages'), owner: 'c-main', think: S.think, mouth: S.mouth })
  setMood(main.st, local.mood)
  everyFrame(stepStory)
  host.addEventListener('click', onClick)
  build()
  onChange(['color', 'version', 'dark', 'mouth', 'think'], build)
}

function seg(id, key, items, cur) {
  document.getElementById(id).innerHTML = items.map(([v, l]) => `<button data-${key}="${v}" aria-pressed="${String(v) === String(cur)}">${l}</button>`).join('')
}

function build() {
  stage.clear('c')
  setStyle(main.st, { think: S.think, mouth: S.mouth })
  main.views = []
  seg('c-mouth', 'mouth', [[true, 'On'], [false, 'Off']], S.mouth)
  seg('c-think', 'think', [['dots', 'Dots'], ['bar', 'Bar']], S.think)
  seg('c-anon', 'anon', [[false, 'Show'], [true, 'Hide']], local.anon)
  seg('c-size', 'size', [['real', 'Header and peek'], ['big', 'Big']], local.size)
  document.getElementById('c-reshuffle').hidden = !local.anon
  document.getElementById('c-moods').innerHTML = MOODS.map((m) => `<button class="btn" data-mood="${m.id}">${m.label}</button>`).join('')
  document.getElementById('c-stories').innerHTML = STORIES.map((s) => `<button class="btn" data-story="${s.id}">${s.label}</button>`).join('')

  // The big stages, each with its real-size peek tab and panel header.
  const stages = document.getElementById('c-stages')
  stages.replaceChildren()
  for (const kind of KINDS) {
    const col = document.createElement('div')
    col.className = 'col'
    col.innerHTML = `<div class="vl">${NAMES[kind]}${kind === S.version ? '<span class="sel">Selected</span>' : ''}</div>
      <div class="bigstage gx"><div class="wall"></div><div class="lines"></div></div>
      <div class="reals">
        <figure><div class="minidesk gx"><div class="wall"></div><div class="mwin"></div><div class="mtab solid"></div></div><figcaption>Peek 50×44</figcaption></figure>
        <figure class="grow"><div class="headbox gx"><div class="wall"></div><div class="hglass glass"></div><div class="hrow"><span class="hslot"></span><span><b>Steward</b><small data-now></small></span></div></div><figcaption>Header 64×54</figcaption></figure>
      </div>`
    stages.append(col)
    const W = Math.min(260, Math.max(180, Math.floor(stages.clientWidth / 3) - 40))
    stage.view(main, kind, col.querySelector('.bigstage'), W, Math.round(W * 0.64), look())
    stage.view(main, kind, col.querySelector('.mtab'), 50, 44, look())
    stage.view(main, kind, col.querySelector('.hslot'), 64, 54, look())
  }

  // Both thinking styles' bar, in each version.
  const bar = document.getElementById('c-bar')
  bar.replaceChildren()
  for (const kind of KINDS) {
    const fig = document.createElement('figure')
    fig.innerHTML = `<div class="cellbg gx"></div><figcaption>${NAMES[kind]}</figcaption>`
    bar.append(fig)
    const g = stage.group({ seed: 30 + KINDS.indexOf(kind), anchor: fig, mood: 'thinking', think: 'bar', mouth: S.mouth, owner: 'c' })
    stage.view(g, kind, fig.firstElementChild, 64, 54, look())
  }

  // The sheet: one tile per mood, each with its own eyes.
  const sheet = document.getElementById('c-sheet')
  sheet.replaceChildren()
  sheet.classList.toggle('anon', local.anon)
  sheet.classList.toggle('big', local.size === 'big')
  const order = local.anon ? shuffled : MOODS.map((_, i) => i)
  order.forEach((i, n) => {
    const m = MOODS[i], st = moodStatus(m.id)
    const tile = document.createElement('div')
    tile.className = 'tile'
    tile.dataset.mood = m.id
    tile.innerHTML = `<div class="tviews"></div><div class="tnum">#${n + 1}</div><div class="tlabel">${esc(m.label)} <span class="tag ${st}">${st === 'app' ? 'In the app' : 'Picked but not built'}</span></div><div class="twhen">${esc(m.when)}</div>`
    sheet.append(tile)
    const g = stage.group({ seed: i + 7, anchor: tile, mood: m.id, think: S.think, mouth: S.mouth, owner: 'c' })
    for (const kind of KINDS) {
      const c = document.createElement('div')
      c.className = 'tcol'
      if (local.size === 'big') {
        c.innerHTML = '<div class="cellbg big gx"></div>'
        stage.view(g, kind, c.firstElementChild, 112, 72, look())
      } else {
        c.innerHTML = '<div class="cellbg gx"></div><div class="tabbg solid"></div>'
        stage.view(g, kind, c.firstElementChild, 64, 54, look())
        stage.view(g, kind, c.lastElementChild, 50, 44, look())
      }
      tile.querySelector('.tviews').append(c)
    }
  })
  caption()
}

function caption() {
  const m = MOODS.find((x) => x.id === main.st.mood) ?? MOODS[0]
  const step = story ? story.steps[storyStep][2] : ''
  document.getElementById('c-m').textContent = m.label
  document.getElementById('c-w').textContent = m.when
  document.getElementById('c-step').textContent = step
  document.querySelectorAll('#c-stages [data-now]').forEach((n) => (n.textContent = step || m.label))
  document.querySelectorAll('#c-moods button').forEach((b) => b.setAttribute('aria-pressed', String(!story && b.dataset.mood === main.st.mood)))
  document.querySelectorAll('#c-stories button').forEach((b) => b.setAttribute('aria-pressed', String(story?.id === b.dataset.story)))
}
function pick(mood) { story = null; local.mood = mood; keep(); setMood(main.st, mood); caption() }
function play(id) { story = STORIES.find((s) => s.id === id); storyStep = 0; storyAt = stage.now(); const [m, , , gl] = story.steps[0]; setMood(main.st, m, gl); caption() }
function stepStory(t) {
  if (!story || t - storyAt <= story.steps[storyStep][1]) return
  storyStep++
  storyAt = t
  if (storyStep >= story.steps.length) { story = null; setMood(main.st, 'idle') }
  else { const [m, , , gl] = story.steps[storyStep]; setMood(main.st, m, gl) }
  caption()
}

function onClick(e) {
  const b = e.target.closest('button'), tile = e.target.closest('.tile')
  if (b?.dataset.mood) return pick(b.dataset.mood)
  if (b?.dataset.story) return play(b.dataset.story)
  if (b?.id === 'c-type') return stage.type()
  if (b?.id === 'c-reshuffle') { reshuffle(); return build() }
  if (b?.dataset.mouth) return set({ mouth: b.dataset.mouth === 'true' })
  if (b?.dataset.think) return set({ think: b.dataset.think })
  if (b?.dataset.anon) { local.anon = b.dataset.anon === 'true'; if (local.anon) reshuffle(); keep(); return build() }
  if (b?.dataset.size) { local.size = b.dataset.size; keep(); return build() }
  if (tile && !b) { pick(tile.dataset.mood); document.getElementById('c-stages').scrollIntoView({ behavior: S.rm ? 'auto' : 'smooth', block: 'center' }) }
}
