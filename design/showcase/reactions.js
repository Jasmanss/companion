// 9. Steward's reactions (docs/briefs/steward-reactions.md): a reaction for each thing a chat can do, which signal causes it
// and what that signal can and cannot tell, every size from the notch at rest to the panel's Pill, what wins when chats
// disagree, and the calm idle loop. The moods are in design/pill/reactions.js (it adds them to eyes.js).
import { REACTIONS, pickMood, IDLE_ACTIONS, LIVELINESS, idleStep, TURN, STRUGGLE, WEAK, FIRST_QUIET_S, BIG_EVERY_S, BIG_AFTER_S } from '../pill/reactions.js'
import { crop } from '../notch/notch.js'
import { S, onChange, stage, card, look } from './state.js'
import { createPeeking } from './peeking.js'
import { esc } from '../shared/activity.js'

const SITUATIONS = [
  ['start', 'A chat starts working', 'focused', null, {}],
  ['two', 'Two chats working', 'juggling', null, { n: 2 }],
  ['three', 'Three chats working', 'juggling', null, { n: 3 }],
  ['quick', 'A quick turn ends', 'nod', 2.5, {}],
  ['normal', 'A normal turn ends', 'done', 5, {}],
  ['long', 'A long turn ends', 'proud', 7, {}],
  ['ask', 'A chat asks you something', 'confused', null, {}],
  ['approve', 'A chat needs your OK', 'needs-you', null, {}],
  ['fail', 'A chat keeps hitting errors', 'frustrated', null, {}],
  ['back', 'You are back at the Mac', 'hello', 3, {}],
  ['live', 'A deploy goes live', 'celebrating', 12, {}],
  ['broke', 'A deploy fails', 'mad', 6, {}],
  ['none', 'Nothing going on', 'idle', null, {}],
]
const SIZE_TABLE = [
  ['Rest: peeking at the notch', 'Steward\'s body peeks from behind the notch\'s left edge, about half visible (50 by 43 pt).', 'The eyes do everything: lids, tilt, squint, happy arches, looks, rolls, blinks. Body lean and a small lift show. Marks (?, !, sweat drop) draw like the 50 by 44 peek tab. Confetti drops to 4 pieces, sprayed inward.', 'No mouth: a yawn becomes one slow long blink. A hop is a 3 px lift. Stretch is the eyes growing tall.'],
  ['Compact island (324 by 32)', 'Steward has stepped into the left side as lit eyes on the black (the body is gone). 14 pt eyes, no room above or below.', 'Everything that is eyes: focusing reads along the line, juggling follows the ball, frustrated rolls and droops, nod dips, proud and hello pop wide with happy arches.', 'No body motion (no hop, shake, lean), no corner marks, no mouth, no confetti. A mark moves to the right side as a glyph: ? for a question, ! in amber for an approval, a small spark that pops once for proud. The spinner and the time stay.'],
  ['Note, approval, review islands', 'Steward is lit eyes in the avatar spot at the island\'s left, about 22 pt tall, with the message beside it.', 'Same as compact, with a little more room: the ? and ! can sit as a badge on the avatar\'s corner. The eyes face the content (toward the buttons for an approval).', 'Still no body motion, mouth or confetti. The island itself carries the news, so the face never competes with the words.'],
  ['The panel header Pill (64 by 54)', 'The whole Pill: body, eyes and the room around them. This is where the full set plays.', 'Every reaction, in full: body hops, shake, lean, yawn with a mouth, stretch, confetti, marks. Blocky and glass do the same with their own drawing (the blocky yawn is closed eyes only, no mouth).', 'Nothing dropped. Reduced Motion still holds each reaction\'s still pose.'],
]
const MOOD_TABLE = [
  ['idle', 'Reused', 'Nothing going on (the idle loop)', 'Until something happens', 14],
  ['focused', 'New', 'One chat is working', 'While it works', 12],
  ['juggling', 'New', 'Two or more chats are working', 'While they work', 11],
  ['worried', 'Reused', 'Deploy or CI trouble is open', '30 min or until good news', 10],
  ['frustrated', 'New', 'A chat keeps hitting errors', 'While it happens, plus 6 s', 9],
  ['hello', 'New', 'You are back at the Mac', '3 s', 8],
  ['nod', 'New', 'A short turn ended', '2.5 s', 7],
  ['done', 'Reused', 'A normal turn ended', '5 s', 6],
  ['proud', 'New', 'A long turn ended', '7 s', 5],
  ['celebrating', 'Reused', 'A deploy went live, a PR merged', '12 s', 4],
  ['confused', 'Designed, not in the app yet', 'A chat asks you something', 'Until it resumes; 10 s after a question', 3],
  ['needs-you', 'Reused', 'A chat needs your OK', 'Until you answer', 2],
  ['mad', 'Reused', 'A deploy failed', '6 s, then Worried', 1],
  ['ponder, look around, small smile, yawn, stretch, slow blink', 'New', 'Idle actions, picked by the scheduler', '1.6 to 2.6 s', ''],
  ['resting, sleepy', 'Reused', 'Nothing for 5 minutes, then 10', 'Until something happens', 13],
]
const A_STATES = [['idle', 'No chat'], ['working', 'Working'], ['needs-approval', 'Needs approval'], ['needs-input', 'Waiting for input'], ['finished', 'Just finished']]
const label = (m) => REACTIONS.find((r) => r.mood === m)?.name ?? m

export function render(host) {
  host.insertAdjacentHTML('beforeend', `<div class="grid">
    ${card({ id: 'rx-try', section: 9, title: 'Try a reaction', status: 'planned', from: 'docs/briefs/steward-reactions.md', cls: 'wide',
      desc: 'Steward watches your chats, so its face should say what they are doing. Pick what is happening: the same Steward reacts at every size at once, from the notch at rest to the panel header. One-shot reactions hold for a few seconds and then go back to idle; the rest stay while the situation lasts.',
      body: `<div class="rx-sit" id="rx-sit">${SITUATIONS.map(([id, l]) => `<button class="btn" data-sit="${id}">${esc(l)}</button>`).join('')}</div>
        <div class="rx-now"><b id="rx-name"></b><span id="rx-hold"></span><span class="rx-bar"><i id="rx-fill"></i></span></div>
        <p class="rx-sig" id="rx-sig"></p>
        <div class="rx-screens" id="rx-screens"></div>
        <div class="rx-real"><figure><div class="rx-big gx" id="rx-big"></div><figcaption>Panel Pill, 2×</figcaption></figure><figure><div class="rx-hdr gx" id="rx-hdr"></div><figcaption>Header 64×54</figcaption></figure><figure><div class="rx-pk gx" id="rx-pk"></div><figcaption>Peek tab 50×44</figcaption></figure></div>` })}
    ${card({ id: 'rx-signals', section: 9, title: 'Which signal causes which reaction', status: 'planned', from: 'docs/briefs/steward-reactions.md', cls: 'wide',
      desc: 'Steward only hears what Claude Code tells it: a turn started (UserPromptSubmit), a stop (Stop, with the last message), a notification, and a permission request. It does not hear tool errors today. Each row says what the signal can tell and, just as important, what it cannot. Click a row to play it.',
      body: `<div class="rx-tw"><table class="itable rx-t"><thead><tr><th>Reaction</th><th>Signal</th><th>What it can tell</th><th>What it cannot tell</th><th>Holds</th></tr></thead><tbody>${REACTIONS.map((r) => `<tr data-r="${r.mood}" tabindex="0"><td><b>${esc(r.name)}</b><br><span class="rx-st ${r.status}">${{ new: 'New', reused: 'In the app', designed: 'Designed, not built' }[r.status]}</span></td><td>${esc(r.signal)}</td><td>${esc(r.tells)}</td><td>${esc(r.cant)}</td><td>${esc(r.hold)}</td></tr>`).join('')}</tbody></table></div>
        <p class="inote"><b>The one new hook.</b> Frustrated is only honest with <b>PostToolUseFailure</b>, which Claude Code sends when a tool call fails (to confirm against Claude Code's docs in the phase's first task: that it arrives from both the terminal and the desktop app, and what the payload holds). Steward would keep only the time and the tool name, never the error text, which can hold paths and secrets. It reaches the user through Settings → Connections, the same update button as Visual Review's hook, which the user clicks themselves; nothing is installed behind their back. Without it everything else works and frustrated is a milder, shorter version. A success hook (PostToolUse) is not needed: a Stop clears the count.</p>
        <p class="inote"><b>Stop is not success.</b> As far as I remember Claude Code's docs, a turn the user interrupts sends no Stop (to confirm when it is built), and a Stop does not say it worked. So "all done" really means "Claude stopped and it is your turn", the face never claims the work is right, and Proud steps down to the plain Happy when a failure streak was seen.</p>` })}
    ${card({ id: 'rx-sizes', section: 9, title: 'Every size', status: 'planned', from: 'docs/briefs/steward-reactions.md', cls: 'wide',
      desc: 'The notch island is 32 pt tall and Steward is only lit eyes in it, so some of the animation has to change. This is what each size shows, what it drops, and what it does instead. The live pictures above use the real sizes.',
      body: `<div class="rx-tw"><table class="itable rx-t"><thead><tr><th>Size</th><th>What Steward is there</th><th>What plays</th><th>What it drops, and instead</th></tr></thead><tbody>${SIZE_TABLE.map((r) => `<tr>${r.map((c, i) => `<td>${i === 0 ? `<b>${esc(c)}</b>` : esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` })}
    ${card({ id: 'rx-wins', section: 9, title: 'What wins when chats disagree', status: 'planned', from: 'docs/briefs/steward-reactions.md', cls: 'wide',
      desc: 'Steward has one face but many chats. Set what two chats and the deploys are doing and see which mood wins and why. The rule: things that need you outrank things that just happened, which outrank things that are only going on. The list at the right is the order.',
      body: `<div class="rx-tester"><div class="rx-form" id="rx-form"></div><div class="rx-out"><div class="rx-win"><div class="rx-wpill gx" id="rx-wpill"></div><div><b id="rx-wname"></b><span id="rx-wwhy"></span></div></div><ol class="rx-ladder" id="rx-ladder"></ol></div></div>` })}
    ${card({ id: 'rx-idle', section: 9, title: 'The idle loop', status: 'planned', from: 'docs/briefs/steward-reactions.md', cls: 'wide',
      desc: 'When nothing is going on, Steward stays alive with small calm actions: blinking, glancing around, following the cursor, a thoughtful look, a yawn, a stretch, then dozing. The blinks, glances and cursor following already exist. The new part is a scheduler that adds one action every 10 to 25 seconds, and only when it is not distracting. Fast forward to watch minutes in seconds.',
      body: `<div class="rx-idlebar"><span class="lbl">Liveliness</span><span class="seg" id="rx-live">${Object.entries(LIVELINESS).map(([k, v]) => `<button data-v="${k}" aria-pressed="${k === 'calm'}">${v.label}</button>`).join('')}</span><span class="lbl">Speed</span><span class="seg" id="rx-speed"><button data-v="1" aria-pressed="true">Real time</button><button data-v="12" aria-pressed="false">12× faster</button></span><span class="lbl">Dim when idle</span><span class="seg" id="rx-dim"><button data-v="false" aria-pressed="true">Off</button><button data-v="true" aria-pressed="false">On</button></span><button class="btn" id="rx-poke">Something happens</button></div>
        <div class="rx-idlerow"><figure><div class="rx-idlebig gx" id="rx-idlebig"></div><figcaption>Panel Pill</figcaption></figure><figure><div class="rx-idlescr" id="rx-idlescr"></div><figcaption>Peeking at the notch</figcaption></figure><div class="rx-log" id="rx-log" aria-live="polite"></div></div>
        <div class="rx-tw"><table class="itable rx-t"><thead><tr><th>Action</th><th>How often</th><th>Where</th><th>Rule</th></tr></thead><tbody>
          <tr><td><b>Blink, double blink</b></td><td>Every 3 to 4 s (built in)</td><td>Everywhere</td><td>Already in the app. Never blocks anything.</td></tr>
          <tr><td><b>Glance, follow the cursor</b></td><td>Every 2 to 5.5 s (built in)</td><td>Everywhere</td><td>Already in the app. Reduce Motion turns these off.</td></tr>
          ${IDLE_ACTIONS.map((a) => `<tr><td><b>${esc(a.label)}</b></td><td>${a.big ? `Rarely: after ${BIG_AFTER_S / 60} quiet minutes, at most one big action every ${BIG_EVERY_S / 60} minutes` : 'One of the calm actions, every 10 to 25 s'}</td><td>${a.where.includes('peek') ? 'Notch and panel' : 'Panel only (the notch gets a slow blink)'}</td><td>${esc(a.note)}</td></tr>`).join('')}
          <tr><td><b>Doze</b></td><td>After 5 minutes nothing: heavy lids (Resting). After 10: asleep (Sleepy)</td><td>Everywhere</td><td>Existing moods. Any event wakes it with a blink.</td></tr>
        </tbody></table></div>
        <p class="inote"><b>Never distracting.</b> Nothing is scheduled in the 20 seconds after anything happened. No action repeats back to back. Nothing runs while a chat works, a reaction plays or Steward is dimmed (Dim when idle), and Reduce Motion turns the whole loop off. The panel and the island never move for an idle action; only Steward's face does. While no action is playing, the notch window redraws about 10 times a second, so idling costs almost nothing. "Quiet" keeps only blinks and glances; "Off" keeps Steward still until something happens.</p>` })}
    ${card({ id: 'rx-moods', section: 9, title: 'The moods table', status: 'planned', from: 'docs/briefs/steward-reactions.md', cls: 'wide',
      desc: 'Every mood Steward can wear, which are new, how long each holds, and its rank (a higher number loses to a lower one when they disagree). Twelve moods are new (six reactions and six small idle actions), one existing mood (Confused) finally gets something to trigger it, and nothing existing is redrawn.',
      body: `<div class="rx-tw"><table class="itable rx-t"><thead><tr><th>Mood</th><th>Status</th><th>Used for</th><th>Holds</th><th>Rank (1 wins)</th></tr></thead><tbody>${MOOD_TABLE.map((r) => `<tr>${r.map((c, i) => `<td>${i === 0 ? `<b>${esc(c)}</b>` : esc(String(c))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
        <p class="inote">Thinking, Listening and Talking stay for Steward's own agent (when you chat with it); the reactions here are for the chats it watches. Hats, glasses and a new look are not part of this.</p>` })}
  </div>`)
  const $ = (s) => host.querySelector(s)

  /* ---------------- the pictures and the situation buttons ---------------- */
  let groups = [], peeks = [], cur = { mood: 'idle', n: 2 }, until = 0, holdS = 0, timer = 0
  const mapFor = (g) => () => [g.alt?.() ?? cur.mood]
  const set = (mood, n, hold, why) => {
    clearTimeout(timer)
    cur = { mood, n: n ?? 2 }
    for (const g of groups) g.st.ext = { n: cur.n }
    const r = REACTIONS.find((x) => x.mood === mood)
    $('#rx-name').textContent = label(mood)
    $('#rx-sig').innerHTML = r ? `<b>Signal:</b> ${esc(r.signal)}<br><b>Cannot tell:</b> ${esc(r.cant || 'Nothing more.')}` : esc(why ?? '')
    holdS = hold ?? 0
    until = hold ? performance.now() + hold * 1000 : 0
    $('#rx-hold').textContent = hold ? `holds ${hold} s, then back to idle` : mood === 'idle' ? '' : 'stays while it lasts'
    $('#rx-fill').style.width = hold ? '100%' : '0%'
    if (hold) timer = setTimeout(() => set('idle', 2, 0), hold * 1000)
  }
  setInterval(() => {
    if (!until) return
    $('#rx-fill').style.width = `${Math.max(0, (until - performance.now()) / (holdS * 1000)) * 100}%`
  }, 100)
  function build() {
    stage.clear('rx'); peeks.forEach((p) => p.remove()); peeks = []; groups = []
    const wrap = $('#rx-screens'); wrap.replaceChildren()
    const zoom = Math.max(0.5, Math.min(0.85, (wrap.clientWidth || 900) / 3 / 520 - 0.02))
    for (const [st, cap] of [['rest', 'At rest: peeking'], ['working', 'Compact island'], ['needs', 'Big island']]) {
      const fig = document.createElement('figure')
      const cell = document.createElement('div')
      fig.append(cell); fig.insertAdjacentHTML('beforeend', `<figcaption>${cap}</figcaption>`); wrap.append(fig)
      const { screen } = crop(cell, { cw: 520, ch: 214, zoom, wall: S.dark ? 'dark' : 'light', busy: false })
      const p = createPeeking(screen, { kind: S.version, color: S.color, owner: 'rx', seed: 301 + peeks.length, anchor: cell, mouth: S.mouth, think: S.think, rm: () => S.rm, dark: S.dark, state: st, rightMode: 'smart', autoSettle: false })
      p.group.follow = mapFor(p.group)
      peeks.push(p); groups.push(p.group)
    }
    const mk = (id, W, H, scale = 1) => {
      const el = $(id); el.replaceChildren()
      const g = stage.group({ seed: 311 + groups.length, anchor: el, mood: 'idle', think: S.think, mouth: S.mouth, owner: 'rx', main: false })
      g.follow = mapFor(g)
      stage.view(g, S.version, el, W, H, look())
      if (scale !== 1) el.firstChild.style.cssText += `;transform:scale(${scale});transform-origin:0 0`
      groups.push(g)
      return g
    }
    mk('#rx-big', 64, 54, 2); mk('#rx-hdr', 64, 54); mk('#rx-pk', 50, 44)
    for (const g of groups) g.st.ext = { n: cur.n }
    buildWins(); buildIdle()
  }
  $('#rx-sit').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-sit]'); if (!b) return
    const [, , mood, hold, extra] = SITUATIONS.find((s) => s[0] === b.dataset.sit)
    set(mood, extra.n, hold)
  })
  host.addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-r]'); if (!tr) return
    const s = SITUATIONS.find((x) => x[2] === tr.dataset.r)
    set(tr.dataset.r, s?.[4].n, s?.[3] ?? 0)
    $('#rx-name').scrollIntoView({ block: 'center', behavior: S.rm ? 'auto' : 'smooth' })
  })
  host.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('tr[data-r]')) e.target.click() })

  /* ---------------- what wins ---------------- */
  const LADDER = ['mad', 'needs-you', 'confused', 'celebrating', 'proud', 'done', 'nod', 'hello', 'frustrated', 'worried', 'juggling', 'focused', 'resting', 'idle']
  const LADDER_WHY = {
    mad: 'A deploy just failed', 'needs-you': 'A chat waits for your OK', confused: 'A chat waits for input, or just asked a question', celebrating: 'A deploy went live',
    proud: 'A long turn just ended', done: 'A normal turn just ended', nod: 'A quick turn just ended', hello: 'You just came back', frustrated: 'A chat keeps hitting errors',
    worried: 'Deploy or CI trouble is open', juggling: 'Two or more chats are working', focused: 'One chat is working', resting: 'Quiet for a while', idle: 'Nothing going on',
  }
  let ctl = { a: 'working', b: 'working', len: 'normal', fail: false, wait: false, deploy: 'none', trouble: false, back: false }
  function buildWins() {
    const sel = (k, items) => `<select data-k="${k}">${items.map(([v, l]) => `<option value="${v}"${ctl[k] === v ? ' selected' : ''}>${l}</option>`).join('')}</select>`
    const chk = (k, l) => `<label><input type="checkbox" data-k="${k}"${ctl[k] ? ' checked' : ''}> ${l}</label>`
    $('#rx-form').innerHTML = `<label>Chat A ${sel('a', A_STATES)}</label><label>Chat B ${sel('b', A_STATES)}</label>
      <label>A finished turn was ${sel('len', [['quick', 'quick (under 15 s)'], ['normal', 'normal'], ['long', 'long (5 min or more)']])}</label>
      ${chk('fail', 'Chat A hit 3 tool errors (needs the new hook)')}${chk('wait', 'An approval has waited over 2 minutes')}
      <label>Deploy ${sel('deploy', [['none', 'Nothing'], ['failed', 'Just failed'], ['ready', 'Just went live']])}</label>${chk('trouble', 'Deploy or CI trouble is still open')}${chk('back', 'You just came back')}`
    $('#rx-ladder').innerHTML = LADDER.map((m) => `<li data-m="${m}"><b>${esc(label(m))}</b> <span>${esc(LADDER_WHY[m])}</span></li>`).join('')
    $('#rx-wpill').replaceChildren()
    const g = stage.group({ seed: 331, anchor: $('#rx-wpill'), mood: 'idle', think: S.think, mouth: S.mouth, owner: 'rx' })
    g.follow = () => [winner.mood]
    stage.view(g, S.version, $('#rx-wpill'), 64, 54, look())
    groups.push(g); winnerG = g
    decide()
  }
  let winner = { mood: 'idle' }, winnerG = null
  function decide() {
    const mk = (state) => ({ state, workingForS: 60, approvalWaitS: ctl.wait ? 150 : 30, failures: 0, stops10m: 0, endedAgoS: 1, turnS: ctl.len === 'quick' ? 5 : ctl.len === 'long' ? 600 : 60, asked: false })
    const sessions = []
    for (const k of ['a', 'b']) { const st = ctl[k]; if (st === 'idle') continue; const s = mk(st); if (k === 'a' && ctl.fail) s.failures = 3; sessions.push(s) }
    winner = pickMood({ sessions, deployEvent: ctl.deploy === 'none' ? null : ctl.deploy, deployAgoS: 2, trouble: ctl.trouble, backAgoS: ctl.back ? 1 : null, idleForS: 0 })
    if (winnerG) winnerG.st.ext = { n: winner.n ?? 2 }
    $('#rx-wname').textContent = label(winner.mood)
    $('#rx-wwhy').textContent = winner.why + (winner.full === false ? '' : '')
    host.querySelectorAll('#rx-ladder li').forEach((li) => li.classList.toggle('win', li.dataset.m === winner.mood))
  }
  $('#rx-form').addEventListener('input', (e) => {
    const k = e.target.dataset.k; if (!k) return
    ctl[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    decide()
  })

  /* ---------------- the idle loop ---------------- */
  let idle = { level: 'calm', speed: 1, dim: false }
  let sim = 0, lastEvent = 0, ist = { lastAction: null, lastBigAt: -1e9, nextAt: 0, idleForS: 0 }, action = null, actionUntil = 0, idleG = null, idlePeekG = null, logEl = null, tick = 0
  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  const log = (t, cls = '') => { logEl.insertAdjacentHTML('afterbegin', `<div class="${cls}"><time>${fmt(sim)}</time> ${t}</div>`); while (logEl.children.length > 8) logEl.lastChild.remove() }
  function buildIdle() {
    clearInterval(tick)
    logEl = $('#rx-log'); logEl.innerHTML = ''
    sim = 0; lastEvent = 0; ist = { lastAction: null, lastBigAt: -1e9, nextAt: 0, idleForS: 0 }; action = null
    const big = $('#rx-idlebig'); big.replaceChildren()
    idleG = stage.group({ seed: 341, anchor: big, mood: 'idle', think: S.think, mouth: S.mouth, owner: 'rx' })
    stage.view(idleG, S.version, big, 64, 54, look()); big.firstChild.style.cssText += ';transform:scale(2);transform-origin:0 0'
    idleG.follow = () => [moodNow(false)]
    groups.push(idleG)
    const scr = $('#rx-idlescr'); scr.replaceChildren()
    const { screen } = crop(scr, { cw: 520, ch: 214, zoom: 0.5, wall: S.dark ? 'dark' : 'light', busy: false })
    const p = createPeeking(screen, { kind: S.version, color: S.color, owner: 'rx', seed: 351, anchor: scr, mouth: S.mouth, think: S.think, rm: () => S.rm, dark: S.dark, state: 'rest', autoSettle: false })
    p.group.follow = () => [moodNow(true)]
    peeks.push(p); groups.push(p.group); idlePeekG = p.group
    log('Idle loop started', 'dim')
    tick = setInterval(step, 250)
  }
  const baseMood = () => pickMood({ sessions: [], idleForS: sim - lastEvent }).mood
  const moodNow = (peek) => {
    if (action && sim < actionUntil) return peek && action.as ? action.as : action.id
    return baseMood()
  }
  let lastStep = 0
  function step() {
    const now = performance.now(), dtReal = lastStep ? Math.min(2, (now - lastStep) / 1000) : 0.25
    lastStep = now
    if (document.hidden) return
    sim += dtReal * idle.speed
    const idleFor = sim - lastEvent
    const dim = idle.dim && idleFor > 90
    ist.idleForS = idleFor
    if (action && sim >= actionUntil) action = null
    if (action) return
    const r = idleStep(ist, sim, Math.random, { level: idle.level, spot: 'panel', dim, rm: S.rm, mood: baseMood() })
    ist = r.state
    if (r.action) {
      const a = IDLE_ACTIONS.find((x) => x.id === r.action.id)
      action = { id: a.id, as: a.peekAs }
      actionUntil = sim + a.dur
      log(`${esc(a.label)}${a.peekAs ? ` <i>(at the notch: ${a.peekAs === 'slowblink' ? 'a slow long blink' : a.peekAs})</i>` : ''}`)
    }
    const m = baseMood()
    if (m !== idle.last) { idle.last = m; if (m !== 'idle') log(`${label(m)} (nothing for ${Math.round(idleFor / 60)} min)`, 'dim') }
  }
  const segs = (id, fn) => $(id).addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]'); if (!b) return
    $(id).querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)))
    fn(b.dataset.v)
  })
  segs('#rx-live', (v) => { idle.level = v; log(`Liveliness: ${LIVELINESS[v].label}`, 'dim') })
  segs('#rx-speed', (v) => { idle.speed = Number(v) })
  segs('#rx-dim', (v) => { idle.dim = v === 'true'; log(idle.dim ? 'Dim when idle on: no actions once dimmed (after 90 s here)' : 'Dim when idle off', 'dim') })
  $('#rx-poke').addEventListener('click', () => { lastEvent = sim; ist.idleForS = 0; action = null; log('Something happened: the quiet clock restarts', 'dim') })

  build()
  set('idle', 2, 0)
  let rt = 0
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(build, 250) })
  onChange(['color', 'version', 'dark', 'mouth', 'think'], build)
  void [TURN, STRUGGLE, WEAK, FIRST_QUIET_S, idlePeekG]
}
