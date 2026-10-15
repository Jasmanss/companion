// 6b. Quiet mode (planned): how Steward could blend into the screen, next to how it sits today. The edge tab and the
// notch, each shown "Today" (always there) and "Quiet" (hidden at rest, out for the cursor or an alert, away in a
// full-screen app). One timeline drives all four so the difference is easy to see. Brief: docs/briefs/quiet-mode.md.
import { setMood } from '../pill/eyes.js'
import { wait, demo } from '../shared/activity.js'
import { createNotch, crop } from '../notch/notch.js'
import { S, onChange, stage, pill, card } from './state.js'

const STEPS = [
  { id: 'rest', name: 'At rest', ms: 2400, say: 'Nothing is happening. Today the tab and the black lip stay put, over the scrollbar and the top of the window. Quiet shows nothing but the real notch.' },
  { id: 'edge', name: 'Cursor at the edge', ms: 2200, say: 'The cursor pushes against the edge, or rests on the notch. Quiet mode wakes up and comes out. Today looks the same as before.' },
  { id: 'alert', name: 'Something needs you', ms: 3000, say: 'An alert you chose comes out with a line of text. Quiet tucks away again afterwards.' },
  { id: 'full', name: 'Full-screen app', ms: 2600, say: 'A movie, a game or a presentation. Today still sits on top of it. Quiet steps aside.' },
]
// What each step looks like in the notch: Today never changes shape, Quiet grows only when asked.
const NOTCH_STATE = { today: { rest: 'rest', edge: 'rest', alert: 'nudge', full: 'rest' }, quiet: { rest: 'away', edge: 'hover', alert: 'nudge', full: 'away' } }
const MOOD = { rest: 'resting', edge: 'idle', alert: 'needs-you', full: 'resting' }

const CSS = `
.qgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
@media (max-width:760px){.qgrid{grid-template-columns:minmax(0,1fr)}}
.qfig{margin:0;display:flex;flex-direction:column;gap:6px;min-width:0}
.qfig figcaption{font:600 13px/1.3 -apple-system,system-ui,sans-serif;color:var(--muted,#6b7280)}
.qfig figcaption b{color:var(--ink,#111);font-weight:700}
.qdesk{position:relative;height:290px;border-radius:14px;overflow:hidden;font:500 13px -apple-system,system-ui,sans-serif}
.qapp{position:absolute;left:12%;right:0;top:9%;bottom:9%;border-radius:10px 0 0 10px;background:var(--win,#fff);box-shadow:0 12px 30px rgba(0,0,0,.25);overflow:hidden}
.qbar{display:flex;gap:5px;padding:8px 10px}
.qbar i{width:8px;height:8px;border-radius:50%;background:rgba(0,0,0,.18)}
.qlines{display:flex;flex-direction:column;gap:9px;padding:6px 26px 0 14px}
.qlines i{height:8px;border-radius:4px;background:rgba(0,0,0,.09)}
.qlines i:nth-child(3n){width:62%}.qlines i:nth-child(3n+1){width:88%}.qlines i:nth-child(3n+2){width:76%}
.qscroll{position:absolute;right:3px;top:34px;bottom:12px;width:8px;border-radius:4px;background:rgba(0,0,0,.06)}
.qscroll i{position:absolute;left:0;right:0;top:34%;height:68px;border-radius:4px;background:rgba(0,0,0,.34)}
.qfull{position:absolute;inset:0;z-index:2;opacity:0;transition:opacity .35s var(--spring,ease);background:radial-gradient(ellipse 60% 70% at 50% 45%,#2b3350,#07080d 70%);display:grid;place-items:center}
.qfull b{width:0;height:0;border-left:26px solid rgba(255,255,255,.75);border-top:16px solid transparent;border-bottom:16px solid transparent;margin-left:8px}
.qdesk[data-s=full] .qfull{opacity:1}
.qdesk .etab{z-index:3;transition:transform .35s var(--spring,ease),opacity .3s}
.qdesk[data-mode=quiet] .etab{transform:translateX(110%);opacity:0}
.qdesk[data-mode=quiet][data-s=edge] .etab,.qdesk[data-mode=quiet][data-s=alert] .etab{transform:none;opacity:1}
.qslot{display:block;width:50px;height:44px}
.qnudge{position:absolute;z-index:4;right:66px;top:calc(50% - 30px);padding:9px 13px;border-radius:14px;display:flex;flex-direction:column;gap:2px;font-weight:600;transform:translateX(18px);opacity:0;transition:transform .35s var(--spring,ease),opacity .3s}
.qnudge small{font-weight:500;opacity:.7}
.qdesk[data-s=alert] .qnudge{transform:none;opacity:1}
.qcur{position:absolute;z-index:5;left:0;top:0;width:18px;height:18px;transition:transform .6s var(--spring,ease);pointer-events:none;filter:drop-shadow(0 1px 2px rgba(0,0,0,.4))}
.qflag{position:absolute;z-index:6;left:10px;bottom:10px;padding:5px 10px;border-radius:999px;background:#d9342b;color:#fff;font:700 12px/1 -apple-system,system-ui,sans-serif;opacity:0;transform:translateY(6px);transition:transform .3s,opacity .25s}
.qdesk[data-mode=today][data-s=rest] .qflag.a,.qdesk[data-mode=today][data-s=edge] .qflag.a,.qdesk[data-mode=today][data-s=full] .qflag.b{opacity:1;transform:none}
.qnotch{position:relative;border-radius:10px;overflow:hidden}
.qnotch .qflag{left:auto;right:8px;bottom:8px}
.qnotch[data-mode=today][data-s=rest] .qflag,.qnotch[data-mode=today][data-s=edge] .qflag{opacity:1;transform:none}
.qsteps{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.qsay{margin:10px 2px 0;font:500 14px/1.45 -apple-system,system-ui,sans-serif;min-height:3em}
:root[data-rm] .qdesk .etab,:root[data-rm] .qnudge{transform:none!important;transition:opacity .25s}
:root[data-rm] .qcur{transition:none}
`

const cursorSVG = '<svg viewBox="0 0 18 18" width="18" height="18"><path d="M2 1.5l12.5 7.2-5.4 1.3-2.2 5.2z" fill="#fff" stroke="#111" stroke-width="1.2" stroke-linejoin="round"/></svg>'
const deskHTML = (mode) => `<figure class="qfig"><div class="qdesk gx" data-mode="${mode}" data-s="rest"><div class="wall"></div>
  <div class="qapp"><div class="qbar"><i></i><i></i><i></i></div><div class="qlines">${'<i></i>'.repeat(9)}</div><div class="qscroll"><i></i></div></div>
  <div class="qfull"><b></b></div>
  <div class="etab solid"><span class="qslot"></span></div>
  <div class="qnudge solid"><span><b>haven</b> needs your OK</span><small>npm test</small></div>
  <div class="qcur">${cursorSVG}</div>
  <span class="qflag a">covers the scrollbar</span><span class="qflag b">still on top of the app</span></div>
  <figcaption><b>${mode === 'today' ? 'Today' : 'Quiet'}</b> · the edge tab</figcaption></figure>`
const notchHTML = (mode) => `<figure class="qfig"><div class="qnotch" data-mode="${mode}" data-s="rest"><div class="qn"></div><span class="qflag">covers the top of the window</span></div>
  <figcaption><b>${mode === 'today' ? 'Today' : 'Quiet'}</b> · the notch</figcaption></figure>`

let tabs = [], notches = [], current = 'rest', run = null

export function render(host) {
  if (!document.getElementById('quiet-css')) document.head.insertAdjacentHTML('beforeend', `<style id="quiet-css">${CSS}</style>`)
  host.insertAdjacentHTML('beforeend', `<div class="grid">${card({ id: 'd-quiet', section: 6, title: 'Quiet mode: blending into the screen', status: 'planned', from: null, cls: 'wide',
    desc: 'A friend who tried Steward said the always-visible tab and the black lip under the notch would bother him. Quiet mode keeps both out of the way: nothing but the real notch at rest, out when the cursor pushes the edge or an alert you chose arrives, away in full-screen apps. Watch Today and Quiet side by side, or step through it.',
    tools: '<button class="btn" id="d-quiet-replay">↻ Replay</button>',
    body: `<div class="qsteps" id="q-steps" role="group" aria-label="Step">${STEPS.map((s, i) => `<button class="btn" data-step="${s.id}" aria-pressed="${i === 0}">${i + 1} · ${s.name}</button>`).join('')}</div>
      <div class="qgrid">${deskHTML('today')}${deskHTML('quiet')}</div>
      <div class="qgrid">${notchHTML('today')}${notchHTML('quiet')}</div>
      <p class="qsay" id="q-say" aria-live="polite">${STEPS[0].say}</p>` })}</div>`)
  const el = host.querySelector('#f-d-quiet')
  run = demo(el, el, playAll, { clear: false, gap: 900 })
  host.querySelector('#d-quiet-replay').onclick = () => run.replay()
  host.querySelector('#q-steps').addEventListener('click', (e) => {
    const b = e.target.closest('[data-step]')
    if (!b) return
    run.cancel() // stop the loop where it is; Replay starts it again
    apply(b.dataset.step, false)
  })
  build()
  onChange(['color', 'version', 'dark', 'mouth', 'think'], build)
}

function build() {
  stage.clear('q')
  tabs = []; notches = []
  document.querySelectorAll('.qdesk').forEach((d, i) => {
    const slot = d.querySelector('.qslot')
    slot.replaceChildren()
    tabs.push({ g: pill(slot, 50, 44, { owner: 'q', seed: 70 + i, mood: 'resting', anchor: d }), d })
  })
  document.querySelectorAll('.qnotch').forEach((n, i) => {
    const host = n.querySelector('.qn')
    host.replaceChildren()
    const { screen } = crop(host, { cw: 400, ch: 118, wall: S.dark ? 'dark' : 'light', maxed: true })
    const mode = n.dataset.mode
    const inst = createNotch(screen, { layout: 'chin', kind: S.version, color: S.color, stage, owner: 'q', seed: 80 + i, anchor: n, mouth: S.mouth, think: S.think, rm: () => S.rm, state: NOTCH_STATE[mode][current] })
    inst.say('<b>haven</b> needs your OK')
    notches.push({ inst, mode, n })
  })
  apply(current, true)
}

function apply(id, instant) {
  current = id
  const step = STEPS.find((s) => s.id === id)
  document.querySelectorAll('.qdesk, .qnotch').forEach((d) => { d.dataset.s = id })
  document.querySelectorAll('#q-steps [data-step]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.step === id)))
  const say = document.getElementById('q-say')
  if (say) say.textContent = step.say
  for (const { g } of tabs) setMood(g.st, MOOD[id])
  // The cursor: parked low in the middle, then at the edge next to the tab (only the Quiet desk reacts to it).
  document.querySelectorAll('.qdesk').forEach((d) => {
    const cur = d.querySelector('.qcur'), w = d.clientWidth, h = d.clientHeight
    const at = id === 'edge' ? [w - 22, h / 2 + 20] : [w * 0.5, h * 0.82]
    cur.style.transition = instant || S.rm ? 'none' : ''
    cur.style.transform = `translate(${at[0]}px,${at[1]}px)`
  })
  for (const { inst, mode } of notches) {
    inst.go(NOTCH_STATE[mode][id])
    inst.mood(id === 'alert' ? 'needs-you' : id === 'edge' ? 'idle' : 'resting')
  }
}

/** The four steps in turn, on all four pictures at once. */
async function playAll(_, tok) {
  for (const s of STEPS) {
    apply(s.id, false)
    await wait(s.ms, tok)
  }
}
