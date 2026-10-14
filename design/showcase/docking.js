// 6. Docking: the tab at the screen edge, sliding out into the panel and back, on the right and the left; and the
// planned notch dock, where the character flows into the MacBook notch like a drop of liquid.
import { setMood } from '../pill/eyes.js'
import { wait, demo } from '../shared/activity.js'
import { S, onChange, stage, pill, card, look } from './state.js'
import { headHTML } from './mock.js'

const edgeDesk = (side) => `<figure class="edgefig"><div class="edgedesk gx ${side}" data-side="${side}"><div class="wall"></div><div class="ewin"></div><div class="ewin two"></div>
  <div class="etab solid"><span class="eslot"></span></div>
  <aside class="epanel glass">${headHTML()}<div class="elines"><i></i><i></i><i></i></div></aside></div>
  <figcaption>${side === 'right' ? 'Right edge (the default)' : 'Left edge'}</figcaption></figure>`

export function render(host) {
  host.insertAdjacentHTML('beforeend', `<div class="grid">
    ${card({ id: 'd-edge', section: 6, title: 'The edge peek, right and left', status: 'app', from: ['glass-lab.html', 'src/renderer/src/App.tsx'], cls: 'wide',
      desc: 'Tucked away, Steward is a small tab at the screen edge, resting. It slides out into the panel and tucks back in, always moving away from the edge it sits on. Settings picks the edge.',
      tools: '<button class="btn" id="d-edge-replay">↻ Replay</button>',
      body: `<div class="edges">${edgeDesk('right')}${edgeDesk('left')}</div>` })}
    ${card({ id: 'd-notch', section: 6, title: 'The notch dock', status: 'planned', from: null, cls: 'wide',
      desc: 'A third place to dock on MacBooks with a notch, reached by dragging the tab to the top middle. The character stretches like a drop of liquid, flows along the top of the screen into the notch, the notch bulges as it merges, and it settles with just its eyes showing below. Then back to the edge. Only shown on screens that have a notch.',
      tools: '<button class="btn" id="d-notch-replay">↻ Replay</button>',
      body: `<div class="notchwrap"><div class="notchdesk gx" id="d-notch"><div class="wall"></div><div class="nbar"><b>Code</b><span>File</span><span>Edit</span><span class="grow"></span><span>9:41</span></div>
        <div class="notch"></div><div class="chin"><span class="chinslot"></span></div>
        <div class="ntab solid"><span class="ntslot"></span></div><div class="drop"></div></div></div>
        <p class="nstep" id="d-nstep"></p>` })}
  </div>`)
  const edge = host.querySelector('#f-d-edge')
  const edgeRun = demo(edge, edge, playEdge, { clear: false, gap: 400 })
  host.querySelector('#d-edge-replay').onclick = () => edgeRun.replay()
  const notch = host.querySelector('#f-d-notch')
  const notchRun = demo(notch, notch, playNotch, { clear: false, gap: 600 })
  host.querySelector('#d-notch-replay').onclick = () => notchRun.replay()
  build()
  onChange(['color', 'version', 'dark', 'mouth', 'think'], build)
}

const tabs = [], heads = []
let chinGroup, notchTab
function build() {
  stage.clear('d')
  tabs.length = 0; heads.length = 0
  document.querySelectorAll('.edgedesk').forEach((d, i) => {
    const slot = d.querySelector('.eslot'), hs = d.querySelector('.hslot')
    slot.replaceChildren(); hs.replaceChildren()
    tabs.push(pill(slot, 50, 44, { owner: 'd', seed: 40 + i, mood: 'resting', anchor: d }))
    heads.push(pill(hs, 64, 54, { owner: 'd', seed: 50 + i, mood: 'idle', anchor: d }))
  })
  const desk = document.getElementById('d-notch')
  const cs = desk.querySelector('.chinslot'), ts = desk.querySelector('.ntslot')
  cs.replaceChildren(); ts.replaceChildren()
  // In the notch only the eyes show: a near-black Pill on the black notch.
  chinGroup = stage.group({ seed: 61, anchor: desk, mood: 'idle', think: S.think, mouth: S.mouth, owner: 'd' })
  stage.view(chinGroup, 'flat', cs, 50, 44, look({ color: '#050505', light: false }))
  notchTab = pill(ts, 50, 44, { owner: 'd', seed: 62, mood: 'resting', anchor: desk })
  desk.style.setProperty('--pillc', S.color)
}

/** Tucked, then out into the panel, then tucked back in, on both edges at once. */
async function playEdge(_, tok) {
  const desks = [...document.querySelectorAll('.edgedesk')]
  const state = (s) => desks.forEach((d) => { d.dataset.state = s })
  state('tucked')
  tabs.forEach((g) => setMood(g.st, 'resting'))
  await wait(2000, tok)
  tabs.forEach((g) => setMood(g.st, 'idle'))
  await wait(500, tok)
  state('open')
  heads.forEach((g) => setMood(g.st, 'idle'))
  await wait(3000, tok)
  state('tucked')
  await wait(1200, tok)
}

/** From the edge into the notch and back. Reduced motion fades between the two instead. */
async function playNotch(_, tok) {
  const desk = document.getElementById('d-notch'), say = (t) => { document.getElementById('d-nstep').textContent = t }
  const to = (s) => { desk.dataset.state = s }
  to('edge'); say('Docked at the right edge, resting.')
  setMood(notchTab.st, 'resting'); setMood(chinGroup.st, 'idle')
  await wait(1800, tok)
  setMood(notchTab.st, 'idle')
  say('You drag the tab toward the top middle of the screen.')
  await wait(700, tok)
  to('lift'); say('It stretches like a drop of liquid…')
  await wait(450, tok)
  to('flow'); say('…flows along the top of the screen into the notch…')
  await wait(S.rm ? 400 : 1100, tok)
  to('merge'); say('…the notch bulges as it merges…')
  await wait(650, tok)
  to('notch'); say('…and it settles, just its eyes showing below the notch.')
  setMood(chinGroup.st, 'done')
  await wait(1400, tok)
  setMood(chinGroup.st, 'idle')
  await wait(2200, tok)
  to('back'); say('Dragged back to the edge, it flows out the same way.')
  await wait(S.rm ? 400 : 1300, tok)
  to('edge')
  await wait(900, tok)
}
