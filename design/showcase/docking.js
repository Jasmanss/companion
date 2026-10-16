// 6. Docking: the tab at the screen edge, sliding out into the panel and back, on the right and the left; and the
// planned notch dock, being designed on notch.html: here its three layouts at rest, at real size.
import { setMood } from '../pill/eyes.js'
import { wait, demo } from '../shared/activity.js'
import { createNotch, crop, LAYOUTS } from '../notch/notch.js'
import { S, onChange, stage, pill, card } from './state.js'
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
    ${card({ id: 'd-notch', section: 6, title: 'The notch dock', status: 'planned', from: 'notch.html', cls: 'wide',
      desc: 'A third place to dock on MacBooks with a notch. Steward lives in the notch as one black shape with the real notch: the Pill\'s body becomes the black and its color becomes the light of its eyes. Three layouts are being compared on notch.html, with every mood, the states, the move in from the screen edge and the panel opening out of the notch. Here they are at rest, at real size, over the measured 185 × 32 point notch.',
      tools: '<a class="btn" href="notch.html">Open notch.html</a>',
      body: `<div class="nlayouts">${LAYOUTS.map((l) => `<figure data-l="${l.id}"><div class="ncrop"></div><figcaption>${l.key} · ${l.name}</figcaption></figure>`).join('')}</div>` })}
  </div>`)
  const edge = host.querySelector('#f-d-edge')
  const edgeRun = demo(edge, edge, playEdge, { clear: false, gap: 400 })
  host.querySelector('#d-edge-replay').onclick = () => edgeRun.replay()
  build()
  onChange(['color', 'version', 'dark', 'mouth', 'think'], build)
}

const tabs = [], heads = []
function build() {
  stage.clear('d')
  tabs.length = 0; heads.length = 0
  document.querySelectorAll('.edgedesk').forEach((d, i) => {
    const slot = d.querySelector('.eslot'), hs = d.querySelector('.hslot')
    slot.replaceChildren(); hs.replaceChildren()
    tabs.push(pill(slot, 50, 44, { owner: 'd', seed: 40 + i, mood: 'resting', anchor: d }))
    heads.push(pill(hs, 64, 54, { owner: 'd', seed: 50 + i, mood: 'idle', anchor: d }))
  })
  // The notch layouts, drawn by notch.js with the page's version and color.
  document.querySelectorAll('.nlayouts figure').forEach((fig, i) => {
    const host = fig.querySelector('.ncrop')
    host.replaceChildren()
    const { screen } = crop(host, { cw: 300, ch: 64, wall: S.dark ? 'dark' : 'light' })
    createNotch(screen, { layout: fig.dataset.l, kind: S.version, color: S.color, stage, owner: 'd', seed: 61 + i, anchor: fig, mouth: S.mouth, think: S.think, rm: () => S.rm })
  })
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
