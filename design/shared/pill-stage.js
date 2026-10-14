// Groups of Pill views that share one eyes state, stepped by one frame loop. Shared by moods.html and
// showcase.html, so both pace the character the same way: a main group draws every frame, every other group 30
// times a second and only while on screen, resting 10 times a second, and nothing at all in a hidden tab.
// The character itself is design/pill/eyes.js (the expression model) and design/pill/render.js (the views).
import { createEyes, setMood, setStyle, stepEyes, pressKey } from '../pill/eyes.js'
import { makeView } from '../pill/render.js'

/**
 * reduced(): whether reduced motion is on. before(t, dt): runs at the start of every frame (stories use it).
 * awake: keep running in a hidden tab (for screenshots).
 */
export function createStage({ reduced = () => false, before, awake = false } = {}) {
  let groups = []
  let paused = false, simT = 0, last = 0
  const clock = () => performance.now() / 1000
  const now = () => simT || clock()
  const seen = new IntersectionObserver((list) => {
    for (const e of list) for (const g of groups) if (g.anchor === e.target) g.seen = e.isIntersecting
  }, { rootMargin: '40px' })
  let pointer = null
  addEventListener('pointermove', (e) => { pointer = { x: e.clientX, y: e.clientY } }, { passive: true })

  /** The cursor relative to the nearest view in a group, in units of that view's size. */
  function pointerFor(g) {
    if (!pointer) return null
    const els = g.main || !g.anchor ? g.views.map((v) => v.el) : [g.anchor]
    let best = null
    for (const el of els) {
      const r = el.getBoundingClientRect()
      const p = { x: (pointer.x - (r.left + r.width / 2)) / Math.max(90, r.width), y: (pointer.y - (r.top + r.height / 2)) / Math.max(70, r.height) }
      if (!best || Math.hypot(p.x, p.y) < Math.hypot(best.x, best.y)) best = p
    }
    return best
  }
  /** Keystrokes while listening: short bursts with pauses, faster during a Type burst. */
  function autoType(g, t) {
    if (!g.nextKey || t > g.nextKey + 5) g.nextKey = g.nextKey === 0 ? t : t + 0.3
    if (t < g.nextKey) return
    pressKey(g.st)
    if (g.burst > 0) { g.burst--; g.nextKey = t + 0.07 + Math.random() * 0.06 }
    else g.nextKey = t + (Math.random() < 0.18 ? 0.9 + Math.random() * 1.2 : 0.12 + Math.random() * 0.2)
  }

  const stage = {
    now,
    groups: () => groups,
    /** A simulated run draws off-screen groups too. */
    drawAll: false,
    /**
     * A group of views sharing one eyes state. anchor: the element watched for being on screen (no anchor: always
     * drawn). main: drawn every frame instead of 30 times a second. owner: a tag, so a section can clear() just its own groups. follow(): a mood to copy
     * every frame, as [mood, glint]. look(): where the eyes look instead of the real cursor (null: the real cursor), in
     * the same units as the cursor's.
     */
    group({ seed = 1, anchor = null, mood, glint, think = 'dots', mouth = true, main = false, owner = null, follow = null, look = null } = {}) {
      // With an anchor, a group (even a main one) only draws while it's on screen.
      const g = { st: createEyes(seed), views: [], anchor, main, owner, follow, look, acc: 0, seen: !anchor, nextKey: 0, burst: 0 }
      setStyle(g.st, { think, mouth })
      g.st.t = now() // start the mood now, so its intro (a pop, the first bursts) plays
      if (mood) setMood(g.st, mood, glint)
      groups.push(g)
      if (anchor) seen.observe(anchor)
      return g
    },
    /** Add a view of kind ('glass' | 'flat' | 'blocky') at W x H to a group, inside host. look: render.js options. */
    view(g, kind, host, W, H, look) {
      const v = makeView(kind, W, H, look)
      host.append(v.el)
      g.views.push(v)
      return v
    },
    /** Remove every group (or just owner's). Also drops lenses left by views already gone from the page. */
    clear(owner) {
      groups = groups.filter((g) => {
        if (owner !== undefined && g.owner !== owner) return true
        if (g.anchor) seen.unobserve(g.anchor)
        return false
      })
      sweepLenses()
    },
    sweep: sweepLenses,
    /** A burst of keystrokes for every listening group. */
    type() { for (const g of groups) if (g.st.mood === 'listening') { g.burst = 10; g.nextKey = 0 } },
    tick(t, dt) {
      const rm = reduced()
      before?.(t, dt)
      for (const g of groups) {
        if (g.follow) { const [m, gl] = g.follow(); if (m) setMood(g.st, m, gl) }
        if (!rm && g.st.mood === 'listening') autoType(g, t)
        g.acc += dt
        if (!g.seen && !stage.drawAll) continue // off-screen groups wait
        const resting = g.st.mood === 'resting' && !rm
        const every = resting ? 0.099 : g.main ? 0 : 1 / 30
        if (g.acc < every) continue
        stepEyes(g.st, t, g.acc, g.look?.() ?? pointerFor(g), rm)
        g.acc = 0
        for (const v of g.views) { v.standby(resting); v.update(g.st) }
      }
    },
    /** Draw every group once, as they are. */
    redraw() { for (const g of groups) for (const v of g.views) v.update(g.st) },
    pause(v) { paused = v },
    /** Run simulated frames: seconds of time at fps frames a second. Pauses the real loop. */
    run(seconds, fps = 60) {
      paused = true; stage.drawAll = true
      if (!simT) simT = clock()
      const n = Math.round(seconds * fps)
      for (let i = 0; i < n; i++) { simT += 1 / fps; stage.tick(simT, 1 / fps) }
      return simT
    },
    start() {
      last = clock()
      const frame = () => {
        requestAnimationFrame(frame)
        const t = clock(), dt = Math.min(0.1, t - last)
        last = t
        if ((document.hidden && !awake) || paused) return
        stage.tick(t, dt)
      }
      requestAnimationFrame(frame)
    },
  }
  return stage
}

/** Glass Pills put their lens filters in one shared SVG; drop the ones whose view is gone. */
function sweepLenses() {
  const host = document.getElementById('pill-filters')
  if (!host) return
  const used = new Set()
  for (const el of document.querySelectorAll('.pv [style*="url(#"]')) for (const m of el.getAttribute('style').matchAll(/url\(#([\w-]+)\)/g)) used.add(m[1])
  for (const f of [...host.children]) if (!used.has(f.id)) f.remove()
}
