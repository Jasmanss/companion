// 4. Liquid glass: the panel's glass on a busy desktop, with a tint and a frost control, the material taken apart
// layer by layer, and Light, Dark and Reduce Transparency side by side. The material is shared/glass.css.
import { TINTS, tintFrom, applyTint, desktopHTML, fitScene } from '../shared/glass.js'
import { ICONS } from '../shared/icons.js'
import { esc } from '../shared/activity.js'
import { onChange, stage, pill, card, PILL_COLORS } from './state.js'
import { load, save } from '../shared/store.js'
import { headHTML, composerHTML } from './mock.js'

const local = load('steward-showcase-glass', { tint: 'ice', frost: 52 })
const keep = () => save('steward-showcase-glass', local)
const ALL = { ...TINTS, ...Object.fromEntries(PILL_COLORS.map((c) => [`c-${c.name.toLowerCase()}`, tintFrom(c.name, c.hex)])) }
if (!ALL[local.tint]) local.tint = 'ice'
let section

const LAYERS = [
  ['l1', '1. Blur behind', 'macOS vibrancy blurs the desktop. Here backdrop-filter fakes it.'],
  ['l2', '2. Frost fill', 'A see-through fill. The frost control sets how milky it is.'],
  ['l3', '3. Tint', 'The tint, a little stronger at the top.'],
  ['l4', '4. Top edge and rim', 'A bright line on top and a fine rim all round.'],
  ['l5', '5. Inner glow', 'A soft glow of the tint inside the edge, and the shadow under it.'],
]
const CHAT = `<div class="rchat"><div class="msg user">Make the hero feel more like Liquid Glass.</div><button class="summary" aria-expanded="false"><span class="chev">›</span><span>Read 2 files · Searched the web · Ran npm test</span></button><div class="reply">The hero now sits on a frosted panel with a bright top edge and a soft inner glow.</div></div>`

export function render(host) {
  section = host
  const tintBtn = ([k, T]) => `<button class="tint" data-tint="${k}" aria-pressed="false" title="${esc(T.name)}" aria-label="${esc(T.name)}" style="background:rgb(${T.glass})"></button>`
  host.insertAdjacentHTML('beforeend', `<div class="ctl glassctl">
      <span class="lbl">Tint</span><span class="tints">${Object.entries(TINTS).map(tintBtn).join('')}</span><span class="tintname" id="g-tname"></span>
      <span class="sep"></span><span class="lbl">Pill colors</span><span class="tints">${Object.entries(ALL).filter(([k]) => k.startsWith('c-')).map(tintBtn).join('')}</span>
      <span class="sep"></span><label class="frost"><span class="lbl">Frost</span><small>clear</small><input type="range" id="g-frost" min="0" max="100" aria-label="Frost"><small>frosted</small></label>
    </div>
    <p class="note">These two only change this section. Light or Dark and Reduce Transparency come from the top bar.</p>
    <div class="grid">
    ${card({ id: 'glass-panel', section: 4, title: 'The panel in glass', status: 'app', from: ['glass-lab.html', 'src/renderer/src/styles.css'], cls: 'wide',
      desc: 'The panel, the ⌘K switcher (a thick, mostly solid fill, so glass never stacks on glass) and a small toast, on a busy desktop. The app ships the Ice tint; the other tints are not in Settings yet.',
      body: '<div class="scenewrap" id="g-wrap"><div class="scene gx" id="g-scene"></div></div>' })}
    ${card({ id: 'glass-layers', section: 4, title: 'Glass, layer by layer', status: 'app', from: 'src/renderer/src/styles.css', cls: 'wide',
      desc: 'The same material built up one layer at a time, so you can see what each part adds.',
      body: `<div class="layers">${LAYERS.map(([k, t, d], i) => `<figure><div class="ltile gx"><div class="wall"></div><div class="lsample ${LAYERS.slice(0, i + 1).map((x) => x[0]).join(' ')}"><b>Aa</b></div></div><figcaption><b>${t}</b>${d}</figcaption></figure>`).join('')}</div>` })}
    ${card({ id: 'glass-compare', section: 4, title: 'Light, Dark and Reduce Transparency', status: 'app', from: ['glass-lab.html', 'src/renderer/src/styles.css'], cls: 'wide',
      desc: 'All four at once, whatever the top bar says. With Reduce Transparency on, the glass turns solid and nothing behind it shows.',
      body: `<div class="compare">${[['light', '', 'Light'], ['dark', '', 'Dark'], ['light', 'rt', 'Reduce Transparency, light'], ['dark', 'rt', 'Reduce Transparency, dark']].map(([th, rt, l]) => `<figure><div class="ctile gx ${th} ${rt || 'see'}"><div class="wall"></div><div class="cpanel glass"><div class="cline"><b>Steward</b></div><div class="cmsg">Read 2 files · Ran npm test</div><div class="cmsg2">Tests pass. Want a screenshot?</div></div></div><figcaption>${l}</figcaption></figure>`).join('')}</div>` })}
    </div>`)
  const scene = host.querySelector('#g-scene')
  scene.innerHTML = desktopHTML() + `
    <aside class="gpanel glass">${headHTML({ slot: 'g-pill' })}<div class="gtray"><i></i><i></i><i></i><i></i><span>4 images</span></div>${CHAT}${composerHTML()}</aside>
    <div class="gswitch glass thick" role="presentation"><div class="swin">hav<span class="caretx"></span></div><ul class="swl"><li aria-selected="true"><span class="pi" style="background:#2f8fe8">H</span><span class="pn"><mark>hav</mark>en</span><span class="pp">~/code/haven · current</span></li><li><span class="pi">+</span><span class="pn">Add project…</span><span class="pp">opens the folder picker</span></li></ul></div>
    <div class="gtoast glass sm">${ICONS.image} Saved 4 images to public/hero</div>`
  fitScene(host.querySelector('#g-wrap'), scene, 1080, 700)
  host.querySelector('#g-frost').value = local.frost
  host.addEventListener('click', (e) => { const b = e.target.closest('[data-tint]'); if (b) { local.tint = b.dataset.tint; keep(); apply() } })
  host.querySelector('#g-frost').addEventListener('input', (e) => { local.frost = +e.target.value; keep(); apply() })
  apply()
  build()
  onChange(['color', 'version', 'dark', 'mouth', 'think'], build)
}

function apply() {
  applyTint(section, ALL[local.tint], local.frost / 100)
  section.querySelectorAll('[data-tint]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tint === local.tint)))
  section.querySelector('#g-tname').textContent = ALL[local.tint].name + (local.tint === 'ice' ? ' (in the app)' : '')
}

function build() {
  stage.clear('g')
  const slot = document.getElementById('g-pill')
  slot.replaceChildren()
  pill(slot, 64, 54, { owner: 'g', seed: 9 })
}
