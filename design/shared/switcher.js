// The ⌘K project switcher's list. Shared by glass-lab.html and showcase.html, and ranked like the app's
// (src/renderer/src/switcher.ts), which is the one with tests.
import { esc } from './activity.js'

export const PROJECTS = [
  { name: 'haven', path: '~/code/haven', c: '#2f8fe8' }, { name: 'tally', path: '~/code/tally', c: '#239a5b' },
  { name: 'bite', path: '~/code/bite', c: '#e0583a' }, { name: 'Portfolio', path: '~/Documents/portfolio', c: '#7c5ce6' },
  { name: 'steward', path: '~/Documents/companion', c: '#11928f' }, { name: 'imperium', path: '~/code/imperium', c: '#c9446f' },
]

/** "my-app" or "myApp": does a word of the name start at i? */
function wordStartsAt(name, i) {
  if (i === 0) return true
  const before = name[i - 1]
  return /[^a-z0-9]/i.test(before) || (/[a-z]/.test(before) && /[A-Z]/.test(name[i]))
}
/** Where the query's letters appear in order in the name ("hvn" in "haven"), merged into runs, or null. */
function lettersInOrder(name, query) {
  const hits = []
  let from = 0
  for (const ch of query) {
    const at = name.indexOf(ch, from)
    if (at < 0) return null
    const last = hits.at(-1)
    if (last && last[1] === at) last[1] = at + 1
    else hits.push([at, at + 1])
    from = at + 1
  }
  return hits
}

/**
 * Best first: the name starts with the query, then a word in the name does, then the name has it anywhere, then a
 * folder on the path starts with it, then the name has its letters in order (three letters or more). Returns
 * [{ p, hits }] where hits are [start, end) runs to underline.
 */
export function filterProjects(query, projects = PROJECTS) {
  const q = query.trim().toLowerCase()
  if (!q) return projects.map((p) => ({ p, hits: [] }))
  const scored = []
  for (const p of projects) {
    const name = p.name.toLowerCase()
    let score = 0, hits = []
    const at = name.indexOf(q)
    if (at === 0) score = 5
    else if (at > 0) {
      let word = -1
      for (let i = at; i >= 0 && word < 0; i = name.indexOf(q, i + 1)) if (wordStartsAt(p.name, i)) word = i
      score = word >= 0 ? 4 : 3
      hits = [[word >= 0 ? word : at, (word >= 0 ? word : at) + q.length]]
    } else if (q.length > 1 && p.path.toLowerCase().split('/').some((f) => f.startsWith(q))) score = 2
    else if (q.length > 2) {
      const letters = lettersInOrder(name, q)
      if (letters) { score = 1; hits = letters }
    }
    if (at === 0) hits = [[0, q.length]]
    if (score) scored.push({ match: { p, hits }, score })
  }
  return scored.sort((a, b) => b.score - a.score).map((s) => s.match)
}

/** The name with its matching runs marked. */
function marked(name, hits) {
  let out = '', from = 0
  for (const [a, b] of hits) { out += esc(name.slice(from, a)) + '<mark>' + esc(name.slice(a, b)) + '</mark>'; from = b }
  return out + esc(name.slice(from))
}

/** The list's rows: the matches, "no match" if none, then "Add project…". sel is the highlighted row. */
export function switcherRows(items, sel, current, q) {
  const rows = items.map(({ p, hits }, i) =>
    `<li role="option" data-i="${i}" aria-selected="${i === sel}"><span class="pi" style="background:${p.c}">${esc(p.name[0].toUpperCase())}</span><span class="pn">${marked(p.name, hits)}</span><span class="pp">${esc(p.path)}${p.name === current ? ' · current' : ''}</span></li>`)
  if (!items.length) rows.push(`<li class="none">No projects match “${esc(q)}”</li>`)
  rows.push(`<li role="option" class="add" data-i="${items.length}" aria-selected="${sel === items.length}"><span class="pi">+</span><span class="pn">Add project…</span><span class="pp">opens the folder picker</span></li>`)
  return rows.join('')
}
