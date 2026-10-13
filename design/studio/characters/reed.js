// Reed: a tall, narrow soft toy with two small ear nubs and a bow tie. Alert and a little formal: it stands still,
// moves crisply, and its ears perk up when you need it. Part of the toy family (see _toy.js and _arms.js).
import * as THREE from 'three'
import { buildToy, bowGeometry } from './_toy.js'

const SHAPE = { R: 0.56, yc: 0, hT: 1.0, hB: 0.92, mT: 2.3, mB: 2.6, n: 2.15, ZS: 0.88, taper: 0.06 }
const FRAME = { height: 2.85, y: 0.22, header: { height: 2.0, y: 0.34 }, peek: { height: 2.0, y: 0.32 } }

// Ear lift by mood: up and forward when alert, back when drowsy or worried.
const EAR = { listening: 0.35, 'needs-you': 0.45, celebrating: 0.3, done: 0.15, thinking: 0.1, talking: 0.08, idle: 0, worried: -0.45, resting: -0.3, sleepy: -0.55 }

export default {
  id: 'reed',
  name: 'Reed',
  vibe: 'A tall, narrow soft toy with ear nubs and a bow tie. Alert and a little formal: crisp moves, ears up when it needs you.',
  eyes: ['pills', 'dots', 'arcs'],
  accessories: true,
  style: 'solid',
  family: 'toy',
  frame: FRAME,
  create(ctx) {
    return buildToy(ctx, {
      shape: SHAPE,
      frame: FRAME,
      face: { region: { x0: -0.48, x1: 0.48, y0: 0.1, y1: 0.74 }, ex: 0.2, ey: 0.46, ew: 0.062, eh: 0.112, mw: 0.07, my: 0.25, cheekX: 0.34, cheekY: 0.3, cheekW: 0.095, cheekH: 0.058 },
      arms: { y: -0.02, angle: 1.25, sink: 0.04, len: 0.36, rad: 0.08, hand: 0.104, rest: 0.3, k: 125, zeta: 0.6, chin: 0.05, fold: -0.2, toss: 1.32 },
      hat: { y: 0.86, scale: 0.8 },
      motion: { rate: 9, sway: 0.008, bob: 0 },
      extras({ kit, look, size, shape, content, G, M, bodyMat }) {
        const mat = bodyMat
        const earGeo = G(new THREE.CapsuleGeometry(0.08, 0.1, 8, 16))
        earGeo.translate(0, 0.05, 0)
        const ears = [-1, 1].map((s) => {
          const pivot = new THREE.Group()
          const y = 0.74, n = new THREE.Vector3(), { th } = shape.front(0, y)
          const p = shape.point(th, s * 1.35)
          shape.normal(th, s * 1.35, n)
          pivot.position.copy(p.addScaledVector(n, -0.03))
          const m = new THREE.Mesh(earGeo, mat)
          pivot.add(m)
          content.add(pivot)
          return { s, pivot, lift: 0 }
        })
        const bowMat = M(kit.solid(look.accent, look, { sheen: 0.45, sheenRoughness: 0.4, roughness: 0.55 }))
        const bow = new THREE.Mesh(G(bowGeometry()), bowMat)
        const by = 0.06
        shape.onFront(0, by, 0.03, bow.position)
        bow.scale.setScalar(size === 'big' ? 1.25 : 1.5)
        content.add(bow)
        let twitchAt = 3
        return {
          setLook(l, { accent }) {
            bowMat.color.copy(accent); kit.updateSolid(bowMat, l, { roughness: 0.55 }); bowMat.envMapIntensity *= 0.6
          },
          update(f, { dt, snap }) {
            // An idle ear twitch now and then.
            if (f.t > twitchAt || twitchAt - f.t > 10) twitchAt = f.t + 2.5 + ((f.seed * 9.1 + f.t * 0.31) % 1) * 4
            const twitch = !f.rm && f.mood === 'idle' && twitchAt - f.t > 0 && twitchAt - f.t < 0.25 ? 0.25 : 0
            for (const e of ears) {
              const target = (EAR[f.mood] ?? 0) + (e.s > 0 ? twitch : 0) + (f.mood === 'listening' && e.s > 0 ? 0.15 : 0)
              e.lift = snap ? target : e.lift + (target - e.lift) * (1 - Math.exp(-14 * dt))
              // Ears point up and out; lift turns them upright and a touch forward.
              e.pivot.rotation.set(-0.12 - e.lift * 0.35, 0, e.s * (-0.62 + e.lift * 0.5))
            }
          },
        }
      },
    })
  },
}
