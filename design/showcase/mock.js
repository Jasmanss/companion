// Pieces of the panel, drawn like the app's (src/renderer/src/App.tsx, ContextPill.tsx), for sections 3, 5 and 6.
import { ICONS } from '../shared/icons.js'
import { esc } from '../shared/activity.js'

/** The header's buttons, as in the app: new chat, keep open, settings, hide, tuck away. */
export const headActs = () => [['newchat', 'New chat'], ['pin', 'Keep the panel open'], ['gear', 'Settings'], ['hide', 'Hide from the screen edge'], ['tuck', 'Tuck away']]
  .map(([k, l]) => `<button class="ib" aria-label="${l}" title="${l}">${ICONS[k]}</button>`).join('')

/** What the context pill says after the project: a file (folders give way first), a command, or a site. */
export function touchHTML(target) {
  if (!target) return ''
  if (target.startsWith('$ ')) return `<span class="touch t-command"><span class="tname">${esc(target.slice(2))}</span></span>`
  const i = target.lastIndexOf('/')
  return `<span class="touch"><span class="tdir">${esc(target.slice(0, i + 1))}</span><span class="tname">${esc(target.slice(i + 1))}</span></span>`
}
/** "haven › src/app/page.tsx", with a live dot while the agent works. */
export const ctxHTML = (project = 'haven', target = 'src/app/page.tsx', live = false) =>
  `<button class="ctx${live ? ' live' : ''}" title="Switch project (⌘K)"><span class="dot"></span><span class="proj">${esc(project)}</span>${target ? `<span class="sep">›</span>${touchHTML(target)}` : ''}<kbd>⌘K</kbd></button>`
export function setCtx(host, project, target, live) { host.innerHTML = ctxHTML(project, target, live) }

/** The panel's header: the character slot, the name, the buttons and the context pill. */
export const headHTML = ({ name = 'Steward', ctx = ctxHTML(), slot = '' } = {}) =>
  `<header class="phead"><span class="hslot"${slot ? ` id="${slot}"` : ''}></span><div class="htext"><div class="htop"><b class="hname">${esc(name)}</b><span class="hacts">${headActs()}</span></div><span class="ctxhost">${ctx}</span></div></header>`

export const composerHTML = (text = 'Ask Steward…') => `<div class="composer"><div class="cinput">${esc(text)}</div><button class="send" aria-label="Send">↑</button></div>`
