// Steward's reactions (docs/briefs/steward-reactions.md): nine moods added on top of the twelve in eyes.js, the rule for
// which mood wins when chats disagree, and the idle loop's scheduler. Plain data and pure functions, so the page, the
// tests and the app can share the rules. Importing this file registers the moods (addMoods in eyes.js).
import { addMoods, confetti } from './eyes.js'

const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x))
const bell = (u) => (u <= 0 || u >= 1 ? 0 : Math.sin(Math.PI * u))

/* ---------------- the new moods ---------------- */
// V is each mood's still pose (reduced motion shows only this). The hooks add the motion.
const FROWN = 5.6 // frustrated repeats its roll, sigh and shake every 5.6 seconds
const yawnA = (age) => (age < 0.7 ? ease(age / 0.7) : age < 1.7 ? 1 : age < 2.5 ? 1 - ease((age - 1.7) / 0.8) : 0)
const ponderF = (age) => ease((age - 0.2) / 0.4) * (1 - ease((age - 1.9) / 0.4))
const juggleP = (st) => ((st.ext?.n ?? 2) >= 3 ? 1.0 : 1.5)

addMoods([
  { // one chat is working: narrowed eyes read along a line, lean in a little, blink rarely
    id: 'focused', V: { sx: 0.98, sy: 0.8, lid: 0.2, tilt: 0.1, gap: 0.96 }, blink: 6.5, px: ['short', 'short'], still: [0, 0.25],
    look: (st, t, age) => { const T = 1.7, u = (age % T) / T; return [-0.6 + 1.2 * u ** 0.85, 0.22 + 0.07 * (Math.floor(age / T) % 3)] },
    body: (B) => { B.sc += 0.022; B.ty += 0.012 },
  },
  { // two or more chats: the eyes follow a ball that goes over to the other hand; faster with three
    id: 'juggling', V: { sx: 1.02, sy: 1.14 }, blink: 0, px: ['normal', 'normal'], still: [0, -0.2],
    look: (st, t) => { const f = (2 * Math.PI * t) / juggleP(st); return [0.85 * Math.sin(f), 0.2 - 0.75 * Math.cos(f) ** 2] },
    body: (B, st, t) => { B.ty -= 0.012 * Math.abs(Math.sin((2 * Math.PI * t) / juggleP(st))) },
  },
  { // a chat is struggling: lids angled (softer than mad), then an eye roll, a sigh and a small head shake, over and over
    id: 'frustrated', V: { sx: 1.05, sy: 0.84, lid: 0.24, tilt: 0.5, squint: 0.1 }, blink: 5, px: ['heavy', 'heavy'], still: [0, 0.15],
    look: (st, t, age) => {
      const p = age % FROWN
      if (p < 1.3) { const a = (2 * Math.PI * p) / 1.3; return [0.65 * Math.sin(a), 0.15 - 0.65 * Math.cos(a)] }
      return p < 2.3 ? [0, 0.45] : [0, 0.15]
    },
    tweak: (tg, side, st, t, age) => {
      const p = age % FROWN
      if (p < 1.3) { tg.lid = Math.max(0, tg.lid - 0.12); tg.tilt *= 0.4 } else if (p < 2.3) { tg.sy *= 0.8; tg.lid = 0.42 }
    },
    body: (B, st, t, age) => {
      const p = age % FROWN
      if (p >= 1.3 && p < 2.3) { B.sc *= 0.97; B.ty += 0.02 }
      if (p >= 2.3 && p < 3.5) { const u = (p - 2.3) / 1.2; B.rot = 4.5 * Math.sin(u * Math.PI * 6) * (1 - u) }
    },
  },
  { // a short turn ended: one small nod, soft happy eyes
    id: 'nod', V: { sx: 1.2, sy: 1.05, happy: 0.6 }, blink: 0, px: ['happy', 'happy'], still: [0, 0],
    look: (st, t, age) => [0, -0.05 + 0.5 * bell(age / 0.9)],
    body: (B, st, t, age) => { B.ty += 0.03 * bell(age / 0.9) },
  },
  { // a long turn ended: two hops, chest out, one small burst of confetti that fades
    id: 'proud', V: { sx: 1.4, sy: 1.2, happy: 1 }, blink: 0, px: ['happy', 'happy'], still: [0, -0.1],
    look: () => [0, -0.12],
    body: (B, st, t, age) => {
      const hop = (a) => (age > a && age < a + 0.5 ? Math.abs(Math.sin(Math.PI * ((age - a) / 0.5))) : 0)
      B.ty -= 0.08 * (hop(0.2) + hop(0.8))
      B.sc += 0.05 * ease(age / 0.4) * (1 - ease((age - 3) / 1))
    },
    marks: (out, st, o, age, rm) => { out.confetti = confetti(Math.min(age, 1.25), rm, o.cls === 'peek').map((c) => ({ ...c, a: c.a * (rm ? 1 : Math.max(0, 1 - (age - 4) / 2)) })) },
  },
  { // you are back at the Mac: eyes pop wide, then settle into a smile, one hop
    id: 'hello', V: { sx: 1.3, sy: 1.15, happy: 0.75 }, blink: 0, px: ['big', 'big'], still: [0, 0],
    tweak: (tg, side, st, t, age) => { if (age < 0.55) { tg.sx = 1.38; tg.sy = 1.28; tg.happy = 0 } },
    look: () => [0, 0],
    body: (B, st, t, age) => { B.ty -= 0.09 * bell((age - 0.1) / 0.45) },
  },
  { // idle action: a real yawn, with a mouth (the island's eyes only close)
    id: 'yawn', V: { closed: 1, talk: 1, oy: -0.3, sy: 0.94 }, blink: 0, px: ['closed', 'closed'], still: [0, 0],
    tweak: (tg, side, st, t, age) => { const a = yawnA(age); tg.closed = a; tg.talk = a; tg.oy = -0.3 * a; tg.sy = 1 - 0.06 * a },
    say: (t, age) => ({ open: 0.95 * yawnA(age), round: 0.55, stress: 0 }),
    body: (B, st, t, age) => { const a = yawnA(age); B.sc += 0.05 * a; B.ty -= 0.03 * a },
  },
  { // idle action: grows tall with a happy squeeze, then relaxes
    id: 'stretch', V: { sy: 1.3, gap: 1.1, squint: 0.3 }, blink: 0, px: ['tall', 'tall'], still: [0, 0],
    tweak: (tg, side, st, t, age) => { const s = Math.min(1.15, bell(age / 1.8) * (1 + 0.12 * Math.sin(age * 9))); tg.sy = 1 + 0.3 * s; tg.gap = 1 + 0.12 * s; tg.sx = 1 - 0.1 * s; tg.squint = 0.3 * s },
    body: (B, st, t, age) => { const s = bell(age / 1.8); B.ty -= 0.05 * s; B.sc += 0.03 * s },
  },
  { // idle action at the notch: the yawn's small version, one slow long blink and a little sink
    id: 'slowblink', V: {}, blink: 0, px: ['normal', 'normal'], still: [0, 0.1],
    tweak: (tg, side, st, t, age) => { tg.lid = 0.94 * bell(age / 1.5) },
    body: (B, st, t, age) => { B.ty += 0.02 * bell(age / 1.5) },
  },
  { // idle action: looks slowly to one side, then the other, then back (unlike a quick random glance)
    id: 'lookaround', V: {}, blink: 4, px: ['normal', 'normal'], still: [0, 0],
    look: (st, t, age) => {
      const to = (a, b, t0, t1) => a + (b - a) * ease((age - t0) / (t1 - t0))
      if (age < 0.4) return [to(0, -0.8, 0, 0.4), 0.05]
      if (age < 1.1) return [-0.8, 0.05]
      if (age < 1.6) return [to(-0.8, 0.8, 1.1, 1.6), 0.05]
      if (age < 2.1) return [0.8, 0.05]
      return [to(0.8, 0, 2.1, 2.4), 0.05]
    },
  },
  { // idle action: a small contented smile
    id: 'smile', V: { happy: 0.55, sx: 1.1 }, blink: 0, px: ['happy', 'happy'], still: [0, -0.05],
    look: () => [0, -0.05],
    body: (B, st, t, age) => { B.ty -= 0.01 * bell(age / 1.6) },
  },
  { // idle action: looks up and to the side as if thinking of something, head tilted
    id: 'ponder', V: { lid: 0.12 }, blink: 4, px: ['normal', 'normal'], still: [-0.4, -0.5],
    look: (st, t, age) => { const f = ponderF(age); return [-0.55 * f, -0.7 * f] },
    body: (B, st, t, age) => { B.rot = 5 * ponderF(age) },
  },
])

/* ---------------- which reaction, from which signal ---------------- */
/** Seconds a turn must last for each finish: under 15 is a nod, 15 s to 5 min the usual Happy, over 5 min proud. */
export const TURN = { nod: 15, proud: 300 }
/** A chat counts as struggling after this many tool failures in this many seconds (needs the new hook). */
export const STRUGGLE = { failures: 3, withinS: 120 }
/** Without the new hook: a chat stopping this many times in this many minutes, or running this long, is only a mild signal. */
export const WEAK = { stops: 3, withinMin: 10, runningMin: 15 }

export const turnTier = (s) => (s == null ? 'done' : s < TURN.nod ? 'nod' : s >= TURN.proud ? 'proud' : 'done')

/**
 * What each reaction is, where it comes from, and what that signal can and cannot tell. status: 'new' (added here),
 * 'reused' (in the app today), 'designed' (drawn on moods.html, in no build yet), 'action' (an idle action).
 */
export const REACTIONS = [
  { id: 'focused', mood: 'focused', name: 'Focusing', status: 'new', hold: 'While a chat works',
    signal: 'A turn started (UserPromptSubmit) and has not stopped (no Stop yet). The session shows as working.',
    tells: 'A turn is running right now, and for how long.',
    cant: 'What Claude is doing, or whether it is thinking, running a long command or stuck. A long quiet turn looks the same as a busy one.' },
  { id: 'juggling', mood: 'juggling', name: 'Juggling', status: 'new', hold: 'While 2 or more chats work',
    signal: 'Two or more sessions in the working state. Faster at three or more.',
    tells: 'How many chats are running at once.',
    cant: 'Whether they are in the same project, or which one needs attention first.' },
  { id: 'nod', mood: 'nod', name: 'Quick nod', status: 'new', hold: '2.5 seconds',
    signal: `Stop, after a turn under ${TURN.nod} seconds (turn start to Stop).`,
    tells: 'Claude stopped replying, quickly.',
    cant: 'Whether it worked. Stop means Claude stopped, not that the task succeeded. Without the turn-start hook the length is unknown and the usual Happy plays.' },
  { id: 'done', mood: 'done', name: 'All done (Happy)', status: 'reused', hold: '5 seconds',
    signal: `Stop, after a turn of ${TURN.nod} seconds to ${TURN.proud / 60} minutes.`,
    tells: 'Claude stopped replying.',
    cant: 'Whether it worked, or whether it stopped to ask you something (that case is Confused).' },
  { id: 'proud', mood: 'proud', name: 'Proud', status: 'new', hold: '7 seconds',
    signal: `Stop, after a turn of ${TURN.proud / 60} minutes or more, with no tool-failure streak if that hook is installed.`,
    tells: 'A long turn ended.',
    cant: 'That it went well. Length is not value. With the failure hook, a turn full of failures plays the plain Happy instead, so it never cheers a mess.' },
  { id: 'confused', mood: 'confused', name: 'Confused', status: 'designed', hold: 'While the chat waits for you; 10 seconds after a question',
    signal: 'Notification saying Claude waits for input (needs-input), or a Stop whose last message ends in a question (the same test as the "Claude says" note).',
    tells: 'The chat wants something from you other than an approval.',
    cant: 'Whether Claude is actually confused. The look means "it is asking you". A question detected from the text can be wrong either way.' },
  { id: 'needs-you', mood: 'needs-you', name: 'Needs you (approval)', status: 'reused', hold: 'Until you answer',
    signal: 'PermissionRequest. After 2 minutes waiting the "!" pulses faster and the eyes look toward the panel.',
    tells: 'A chat is blocked on your OK, and for how long.',
    cant: 'How risky the command is. Steward does not judge it.' },
  { id: 'worried', mood: 'worried', name: 'Worried', status: 'reused', hold: '30 minutes, or until good news',
    signal: 'Deploy or CI trouble (today\'s rule). Not used for approvals: those are Needs you.',
    tells: 'Something outside the chats looks off.',
    cant: 'Which chat caused it.' },
  { id: 'frustrated', mood: 'frustrated', name: 'Frustrated', status: 'new', hold: 'While it keeps happening, plus 6 seconds',
    signal: `Best: ${STRUGGLE.failures} or more tool failures in ${STRUGGLE.withinS / 60} minutes in one turn (the PostToolUseFailure hook, new). Without it: the same chat stopping ${WEAK.stops} times in ${WEAK.withinMin} minutes, or one turn running ${WEAK.runningMin} minutes, which only earns a milder, shorter version.`,
    tells: 'With the hook: Claude is hitting errors repeatedly. Without it: little. Fast back and forth and a long run are often fine.',
    cant: 'Whether the errors matter. A test that fails three times while Claude fixes it is normal. It is a mood, not a verdict, and the alert text never says "failing".' },
  { id: 'hello', mood: 'hello', name: 'Welcome back', status: 'new', hold: '3 seconds',
    signal: 'The Mac goes from idle to active (powerMonitor) after 10 minutes or more away.',
    tells: 'You are back.',
    cant: 'Anything about the chats.' },
  { id: 'celebrating', mood: 'celebrating', name: 'Celebrating', status: 'reused', hold: '12 seconds',
    signal: 'A deploy went live or a PR merged (today\'s rule). Kept for those so a finished chat never gets the full confetti.',
    tells: 'Good news from outside the chats.', cant: '' },
  { id: 'mad', mood: 'mad', name: 'Mad', status: 'reused', hold: '6 seconds',
    signal: 'A deploy failed (today\'s rule). It then becomes Worried.', tells: 'Bad news from outside the chats.', cant: '' },
]

/* ---------------- what wins ---------------- */
/**
 * The one mood for the whole Steward, from everything going on. Higher on the list wins; a one-shot that has run out
 * its hold is gone, and one that lost to something above it waits only until its hold would have ended.
 * ctx: { sessions: [{ state: 'working'|'needs-approval'|'needs-input'|'finished'|'idle', workingForS, approvalWaitS,
 *   failures (in the last 2 min, 0 without the hook), stops10m, endedAgoS, turnS, asked }],
 *   deployEvent: null|'failed'|'ready', deployAgoS, trouble (sticky worry), backAgoS, idleForS }
 */
export function pickMood(ctx) {
  const ss = ctx.sessions ?? []
  const has = (f) => ss.some(f)
  if (ctx.deployEvent === 'failed' && ctx.deployAgoS < 6) return { mood: 'mad', why: 'A deploy just failed (6 seconds, then Worried)' }
  const waiting = ss.filter((s) => s.state === 'needs-approval')
  if (waiting.length) { const long = waiting.some((s) => s.approvalWaitS >= 120); return { mood: 'needs-you', impatient: long, why: long ? 'An approval has waited over 2 minutes: the pulse speeds up' : 'A chat waits for your OK' } }
  if (has((s) => s.state === 'needs-input')) return { mood: 'confused', why: 'A chat waits for your input' }
  const asked = ss.filter((s) => s.state === 'finished' && s.asked && s.endedAgoS < 10)
  if (asked.length) return { mood: 'confused', why: 'A chat stopped with a question (10 seconds)' }
  if (ctx.deployEvent === 'ready' && ctx.deployAgoS < 12) return { mood: 'celebrating', why: 'A deploy went live (12 seconds)' }
  const ended = ss.filter((s) => s.state === 'finished' && s.endedAgoS != null)
  const tiers = ended.map((s) => ({ tier: turnTier(s.turnS), ago: s.endedAgoS, struggled: (s.failures ?? 0) >= STRUGGLE.failures }))
    .map((e) => ({ ...e, tier: e.tier === 'proud' && e.struggled ? 'done' : e.tier }))
  const HOLD = { proud: 7, done: 5, nod: 2.5 }
  for (const t of ['proud', 'done', 'nod']) if (tiers.some((e) => e.tier === t && e.ago < HOLD[t])) return { mood: t, why: t === 'proud' ? 'A long turn ended' : t === 'done' ? 'A turn ended' : 'A short turn ended' }
  if (ctx.backAgoS != null && ctx.backAgoS < 3) return { mood: 'hello', why: 'You are back at the Mac (3 seconds)' }
  if (has((s) => s.state === 'working' && ((s.failures ?? 0) >= STRUGGLE.failures))) return { mood: 'frustrated', why: 'A chat has hit several tool errors', full: true }
  if (has((s) => s.state !== 'idle' && (s.stops10m ?? 0) >= WEAK.stops) || has((s) => s.state === 'working' && s.workingForS >= WEAK.runningMin * 60)) return { mood: 'frustrated', why: 'Weak signal (many stops, or a very long run): the milder version', full: false }
  if (ctx.trouble) return { mood: 'worried', why: 'Deploy or CI trouble is still open' }
  const working = ss.filter((s) => s.state === 'working').length
  if (working >= 2) return { mood: 'juggling', n: working, why: `${working} chats are working` }
  if (working === 1) return { mood: 'focused', why: 'One chat is working' }
  const away = ctx.idleForS ?? 0
  if (away >= 600) return { mood: 'sleepy', why: 'Nothing for 10 minutes: asleep' }
  if (away >= 300) return { mood: 'resting', why: 'Nothing for 5 minutes: heavy lids' }
  return { mood: 'idle', why: 'Nothing going on: the idle loop' }
}

/* ---------------- the idle loop ---------------- */
/**
 * Built in already (eyes.js, not scheduled): blinks every 3 to 4 seconds (one in five is a double), a glance every 2 to
 * 5.5 seconds, and the eyes following the cursor. The scheduler adds the bigger actions below, rarely.
 * weight: how likely; big: needs a long quiet and is limited to one every 4 minutes; dur: seconds; where: which
 * spots may show it ('peek' is the notch at rest, 'panel' the Pill in the panel header).
 */
export const IDLE_ACTIONS = [
  { id: 'lookaround', label: 'Look around', weight: 4, dur: 2.4, big: false, where: ['peek', 'panel'], note: 'A slow look to one side, then the other. Eyes only, fine at every size.' },
  { id: 'smile', label: 'Small smile', weight: 3, dur: 1.6, big: false, where: ['peek', 'panel'], note: 'Soft happy eyes for a moment. Eyes only, fine at every size.' },
  { id: 'ponder', label: 'Ponder', weight: 4, dur: 2.4, big: false, where: ['peek', 'panel'], note: 'Looks up and aside, head tilted. Fine at every size.' },
  { id: 'yawn', label: 'Yawn', weight: 2, dur: 2.6, big: true, where: ['panel'], peekAs: 'slowblink', note: 'Needs a mouth and room, so only the panel Pill. The notch gets one slow long blink instead.' },
  { id: 'stretch', label: 'Stretch', weight: 2, dur: 1.8, big: true, where: ['peek', 'panel'], note: 'Eyes grow tall and relax. At the notch only the eyes and a 3 px lift show; the body is mostly hidden.' },
]
export const LIVELINESS = {
  calm: { label: 'Calm (default)', gapS: [10, 25], actions: true },
  quiet: { label: 'Quiet: blinks and glances only', gapS: [0, 0], actions: false },
  off: { label: 'Off: it only reacts', gapS: [0, 0], actions: false },
}
export const BIG_EVERY_S = 240 // at most one big action every 4 minutes
export const FIRST_QUIET_S = 20 // nothing scheduled in the 20 seconds after anything happened
export const BIG_AFTER_S = 120 // yawn and stretch only after 2 quiet minutes

/**
 * What the scheduler does at a moment. state: { lastAction, lastBigAt, nextAt, idleForS }, now in seconds, rand a
 * function giving 0 to 1, opts: { level: 'calm'|'quiet'|'off', spot: 'peek'|'panel', dim, rm, mood } .
 * Returns { action } (an id or null) and the new state. It never acts while dimmed, with reduced motion, in any mood
 * but idle, or in the first 20 quiet seconds; it never repeats the same action twice in a row.
 */
export function idleStep(state, now, rand, opts) {
  const L = LIVELINESS[opts.level ?? 'calm']
  const next = { ...state }
  if (!L.actions || opts.dim || opts.rm || opts.mood !== 'idle' || state.idleForS < FIRST_QUIET_S) { next.nextAt = Math.max(state.nextAt ?? 0, now + 1); return { action: null, state: next } }
  if (now < (state.nextAt ?? 0)) return { action: null, state: next }
  const pool = IDLE_ACTIONS.filter((a) => a.id !== state.lastAction && (!a.big || (state.idleForS >= BIG_AFTER_S && now - (state.lastBigAt ?? -1e9) >= BIG_EVERY_S)))
  if (!pool.length) { next.nextAt = now + 3; return { action: null, state: next } }
  let r = rand() * pool.reduce((s, a) => s + a.weight, 0), pick = pool[0]
  for (const a of pool) { r -= a.weight; if (r <= 0) { pick = a; break } }
  const [lo, hi] = L.gapS
  next.lastAction = pick.id
  if (pick.big) next.lastBigAt = now
  next.nextAt = now + pick.dur + lo + rand() * (hi - lo)
  // At the notch's rest size the big actions turn into their small versions (the page and the app both do this).
  const shown = opts.spot === 'peek' && !pick.where.includes('peek') ? { id: pick.id, as: pick.peekAs } : { id: pick.id }
  return { action: shown, state: next }
}
