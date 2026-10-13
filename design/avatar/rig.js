// The shared motion rig for the toy family: two stubby arms on shoulder pivots, the body's pose per mood, and the
// juggling cascade. Everything runs through slightly underdamped springs behind a short lag (longer on the
// screen-right arm), so arms overlap and settle instead of snapping. Characters only pick sizes and stiffness.
//
// 2D arm pose: ang (radians from hanging straight down; + swings away from the body, PI/2 is level, PI is straight up,
// negative crosses in front of the body), len (1 full length; shorter reads as reaching toward you), front (0 drawn
// behind the body, 1 in front), wave (hand tilt), grip (a small squeeze of the mitten).
// The thinking loops run on face.think, the same THINK_PERIOD phase the eye scan uses.
const TAU = Math.PI * 2
export const L = -1, R = 1 // screen-left, screen-right

function armTarget(o, s, f, rest, a, think, spec) {
  const t = f.t, age = f.moodAge, lvl = f.level
  o.ang = rest; o.len = 1; o.front = 0; o.wave = 0; o.grip = 0
  switch (f.mood) {
    case 'resting': o.ang = rest * 0.55 + a * 0.03 * Math.sin(f.clock * 0.6 + s); break
    case 'sleepy': o.ang = rest * 0.35 + a * 0.04 * Math.sin(t * 0.8); break // droops with the nodding
    case 'idle': o.ang = rest + a * 0.07 * Math.sin(f.clock * 0.8 + s * 1.3); break
    case 'listening':
      // The screen-right hand cups the ear; the other hangs relaxed.
      if (s === R) { o.ang = 2.55; o.len = 0.86; o.front = 1; o.wave = -0.5 } else o.ang = rest + 0.12
      break
    case 'thinking': {
      const ph = f.think * TAU
      if (think === 'chin') {
        // A hand to the chin, tapping; the other arm folded across the tummy to prop the elbow.
        if (s === R) { o.ang = -2.3 + (spec.chin || 0) - a * 0.07 * Math.max(0, Math.sin(ph * 4)); o.len = 0.82; o.front = 1; o.wave = 0.3 }
        else { o.ang = -1.25; o.len = 0.8; o.front = 1; o.wave = 0.2 }
      } else if (think === 'twirl') {
        // Rolling hands in front of the chest, around each other twice a loop.
        const p = ph * 2 + (s === R ? Math.PI : 0)
        o.ang = -1.45 + a * 0.32 * Math.cos(p); o.len = 0.74 + a * 0.12 * Math.sin(p); o.front = 1
      } else {
        // Juggling: hands out at shoulder height scooping in small circles; each hand throws three times a loop.
        const p = ph * 3 + (s === R ? Math.PI : 0)
        o.ang = 1.5 + a * 0.2 * Math.sin(p); o.len = 0.92 + a * 0.08 * Math.cos(p); o.grip = 1
      }
      break
    }
    case 'talking': {
      // Small gestures that follow the voice, one arm then the other.
      const turn = Math.floor(t / 1.7 + f.seed * 3) % 2 === 0 ? L : R
      if (s === turn) { o.ang = rest + 0.6 + 0.4 * lvl * a; o.wave = 0.25 * lvl * a * Math.sin(t * 3) } else o.ang = rest + 0.1
      break
    }
    case 'done':
      // A fist-pump on the screen-right arm: wind up, pump, hold the "yes", then settle contented.
      if (s === R) {
        if (!a) { o.ang = 2.65 }
        else if (age < 0.22) o.ang = 1.2
        else if (age < 2.6) { o.ang = 2.7 + 0.24 * Math.max(0, Math.sin((age - 0.22) * 9)) * (age < 1.4 ? 1 : 0); o.grip = 1 }
        else o.ang = rest + 0.3
      } else o.ang = rest + 0.3
      break
    case 'needs-you':
      // The screen-left arm up and waving for attention.
      if (s === L) { o.ang = 2.75 + a * 0.3 * Math.sin(t * 7.2); o.wave = a * 0.5 * Math.sin(t * 7.2 + 0.9) } else o.ang = rest + 0.15
      break
    case 'worried':
      // Pulled in close in front of the tummy, with a slight tremble.
      o.ang = -0.5 + a * 0.035 * Math.sin(t * 37 + s); o.len = 0.82; o.front = 1; o.wave = 0.3; break
    case 'celebrating': {
      // Both arms up, flapping with the hop.
      const hop = Math.min(1, -f.bounce / 0.1)
      o.ang = 2.55 + a * (0.22 * hop + 0.12 * Math.sin(t * 13 + s)); o.wave = a * 0.35 * Math.sin(t * 13 + s); break
    }
  }
  return o
}

/** Body pose per mood: tilt (+ leans the top to screen-right), sink (down, in body heights), tall (stretch). */
function bodyTarget(o, f, think) {
  o.tilt = 0; o.sink = 0; o.tall = 1
  const A = f.rm ? 0 : 1, age = f.moodAge
  switch (f.mood) {
    case 'resting': o.sink = 0.05; o.tall = 0.94; o.tilt = 0.06; break // settled, leaning on the screen edge
    case 'listening': o.tall = 1.03; o.tilt = 0.1; break // into the cupped hand
    case 'thinking': o.tall = 1.01; o.tilt = think === 'chin' ? 0.07 : -0.03; break
    case 'done': o.tall = 1 + A * 0.06 * Math.sin(Math.PI * Math.min(1, age / 0.5)); break // a little pop
    case 'needs-you': o.tall = 1.07; o.tilt = -0.06; break // stretched up toward the waving arm
    case 'worried': o.tall = 0.93; break // shrinking in
    case 'celebrating': o.tall = 1.02; break
    case 'sleepy': o.sink = 0.07; o.tall = 0.92; o.tilt = 0.08 + A * 0.05 * Math.sin(f.t * 0.55); break
  }
  return o
}

const ch = () => ({ x: 0, v: 0, lag: 0 })
/** spec: { rest, k, zeta, chin, toss } · motion: { rate, sway, bob, jelly } (the character's personality) */
export function makeRig(spec, motion) {
  const arms = [L, R].map((s) => ({ s, ch: { ang: ch(), len: ch(), front: ch(), wave: ch(), grip: ch() }, tgt: {}, hand: [0, 0], root: [0, 0] }))
  const body = { tilt: 0, sink: 0, tall: 1, tgt: {} }
  const balls = [0, 1, 2].map(() => ({ x: 0, y: 0, on: 0 }))
  const K = spec.k ?? 90, Z = spec.zeta ?? 0.62
  let lastT = null, jw = 0

  function step(c, target, k, z, dt, lagT) {
    c.lag += (target - c.lag) * (1 - Math.exp(-dt / lagT))
    const n = Math.ceil(dt / (1 / 240)), h = dt / n, cc = 2 * z * Math.sqrt(k)
    for (let j = 0; j < n; j++) { c.v += (k * (c.lag - c.x) - cc * c.v) * h; c.x += c.v * h }
  }

  /**
   * Advance one frame. Returns the body transform; then call place(shoulders, armLen) with the shoulder points
   * (after the body transform) to get the hands and the juggling balls.
   */
  function update(f, look) {
    const snap = lastT === null || f.rm || Math.abs(f.t - f.dt - lastT) > 0.25
    lastT = f.t
    const dt = Math.min(0.1, f.dt || 1 / 60)
    const a = f.rm ? 0 : Math.min(1.6, 0.55 + f.P * 0.5)
    const think = look.think || 'juggle'
    bodyTarget(body.tgt, f, think)
    for (const k of ['tilt', 'sink', 'tall']) body[k] = snap ? body.tgt[k] : body[k] + (body.tgt[k] - body[k]) * (1 - Math.exp(-motion.rate * dt))
    for (const arm of arms) {
      armTarget(arm.tgt, arm.s, f, spec.rest, a, think, spec)
      const lagT = arm.s === R ? 0.07 : 0.04
      for (const [k, c] of Object.entries(arm.ch)) {
        if (snap) { c.x = c.lag = arm.tgt[k]; c.v = 0; continue }
        step(c, arm.tgt[k], K * (k === 'wave' ? 1.6 : k === 'front' ? 2.5 : 1), k === 'front' ? 1 : Z, dt, lagT)
      }
    }
    jw += ((f.mood === 'thinking' && think === 'juggle' ? 1 : 0) - jw) * (snap ? 1 : 1 - Math.exp(-8 * dt))
    return { snap, dt }
  }

  /** shoulders: [[x, y], [x, y]] in body space (y down); armLen in the same units. */
  function place(f, shoulders, armLen, top) {
    for (const [i, arm] of arms.entries()) {
      const { ang, len } = arm.ch
      const l = armLen * Math.max(0.5, len.x)
      arm.root = shoulders[i]
      arm.hand = [shoulders[i][0] + arm.s * Math.sin(ang.x) * l, shoulders[i][1] + Math.cos(ang.x) * l]
    }
    // Juggling: a three-ball cascade, a throw every sixth of a loop, alternating hands, arcing over the head.
    const D = 1 / 6
    for (const [i, b] of balls.entries()) {
      b.on = jw
      if (jw < 0.02) continue
      const time = f.think + (f.rm ? i * 0.11 : 0)
      const local = (((time - i * D) % (3 * D)) + 3 * D) % (3 * D)
      const n = Math.floor(((((time - i * D) % 1) + 1) % 1) / (3 * D))
      const from = (i + n) % 2 === 0 ? 0 : 1, to = 1 - from
      const A = arms[from].hand, B = arms[to].hand
      if (local < 2 * D) {
        const u = local / (2 * D)
        const apex = top - (spec.toss ?? 0.3) // the top of the arc, above the head
        b.x = A[0] + (B[0] - A[0]) * u
        b.y = A[1] + (B[1] - A[1]) * u + 4 * (apex - (A[1] + B[1]) / 2) * u * (1 - u)
      } else { b.x = B[0]; b.y = B[1] - 0.06 }
    }
  }

  return { arms, body, balls, update, place }
}
