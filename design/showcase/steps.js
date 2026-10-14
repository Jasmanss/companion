// 2. Activity animations: every kind of step on its own with a Replay button, the earlier takes on searching the
// web, and the summary line. All of it is shared/activity.js, the same code glass-lab.html and search-web.html run.
import { DEMOS, SEARCH_TAKES, demo } from '../shared/activity.js'
import { card } from './state.js'

const from = (id) => (id === 'search-web' ? ['search-web.html', 'glass-lab.html'] : 'glass-lab.html')
const box = (h = 190) => `<div class="demo gx" style="height:${h}px"><div class="wall"></div><div class="glass stepbox"></div></div>`
const replay = '<button class="btn replay">↻ Replay</button>'
/** Taller boxes for the steps that grow. */
const HEIGHT = { 'search-web': 210, 'run-command': 230, 'search-photos': 200, 'read-file': 200, summary: 270, reply: 170, screenshot: 220, 'read-logs': 190 }

export function render(host) {
  const main = DEMOS.map((d) => card({ id: `a-${d.id}`, section: 2, title: d.title, status: 'app', from: from(d.id), desc: d.desc, body: box(HEIGHT[d.id]), tools: replay }))
  const earlier = SEARCH_TAKES.filter((t) => t.id !== 'deck').map((t) => card({ id: `a-take-${t.id}`, section: 2, title: t.name, status: 'earlier', from: 'search-web.html', desc: t.desc, body: box(220), tools: replay }))
  host.insertAdjacentHTML('beforeend', `<div class="grid">${main.join('')}</div>
    <h3 class="sub">Earlier takes on searching the web</h3>
    <p class="lead">What came before the deck. "Before" is what the app first had; A to C were tried on the search page and lost to the deck.</p>
    <div class="grid">${earlier.join('')}</div>`)
  const plays = [...DEMOS, ...SEARCH_TAKES.filter((t) => t.id !== 'deck')]
  host.querySelectorAll('.feat').forEach((el, i) => {
    const d = plays[i]
    const run = demo(el, el.querySelector('.stepbox'), d.play, { gap: d.gap ?? 1800 })
    el.querySelector('.replay').onclick = () => run.replay()
  })
}
