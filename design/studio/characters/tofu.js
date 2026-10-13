// Tofu: a soft-edged block of a toy with a springy antenna and a bobble on top. Lively and bouncy: it bobs in place,
// its arms overshoot a little, and the antenna wobbles after every move. Part of the toy family (see _toy.js, _arms.js).
import * as THREE from 'three'
import { buildToy } from './_toy.js'

const SHAPE = { R: 0.8, yc: -0.05, hT: 0.72, hB: 0.7, mT: 3.6, mB: 4.2, n: 3.6, ZS: 0.84, taper: -0.03 }
const FRAME = { height: 2.5, y: 0.1, header: { height: 2.2, y: 0.12 }, peek: { height: 2.2, y: 0.1 } }

export default {
  id: 'tofu',
  name: 'Tofu',
  vibe: 'A soft-edged block of a toy with a springy antenna. Lively and bouncy: it bobs, overshoots and wobbles after every move.',
  eyes: ['pills', 'dots', 'arcs'],
  accessories: true,
  style: 'solid',
  family: 'toy',
  frame: FRAME,
  create(ctx) {
    return buildToy(ctx, {
      shape: SHAPE,
      frame: FRAME,
      face: { region: { x0: -0.66, x1: 0.66, y0: -0.4, y1: 0.48 }, ex: 0.28, ey: 0.12, ew: 0.076, eh: 0.128, mw: 0.085, my: -0.12, cheekX: 0.48, cheekY: -0.06, cheekW: 0.12, cheekH: 0.07 },
      arms: { y: -0.2, angle: 1.2, sink: 0.05, len: 0.33, rad: 0.095, hand: 0.12, rest: 0.4, k: 150, zeta: 0.42, chin: -0.15, toss: 1.0 },
      hat: { y: 0.64, scale: 1.0 },
      motion: { rate: 11, sway: 0.012, bob: 1 },
      extras({ kit, look, size, shape, content, G, M, bodyMat }) {
        const stalkMat = bodyMat
        const bobMat = M(kit.solid(look.accent, look, { roughness: 0.3 }))
        const pivot = new THREE.Group()
        pivot.position.y = shape.top - 0.03
        const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.01, 0.12, 0), new THREE.Vector3(0.04, 0.24, 0), new THREE.Vector3(0.09, 0.32, 0)])
        const stalk = new THREE.Mesh(G(new THREE.TubeGeometry(curve, 24, size === 'big' ? 0.024 : 0.032, 10, false)), stalkMat)
        const ball = new THREE.Mesh(G(new THREE.SphereGeometry(size === 'big' ? 0.075 : 0.095, 20, 14)), bobMat)
        ball.position.set(0.1, 0.35, 0)
        pivot.add(stalk, ball)
        content.add(pivot)
        // The antenna is a damped spring kicked by how the body moves.
        const sp = { z: 0, vz: 0, x: 0, vx: 0 }
        return {
          setLook(l, { accent, hat }) {
            bobMat.color.copy(accent); kit.updateSolid(bobMat, l, { roughness: 0.3 }); bobMat.envMapIntensity *= 0.6
            pivot.visible = !hat
          },
          update(f, { dt, snap, motion }) {
            if (snap || f.rm) { sp.z = sp.x = sp.vz = sp.vx = 0 } else {
              const n = Math.ceil(dt / (1 / 240)), h = dt / n
              for (let i = 0; i < n; i++) {
                sp.vz += (-160 * sp.z - 5 * sp.vz - motion.vTilt * 9 + motion.vY * 0) * h
                sp.vx += (-160 * sp.x - 5 * sp.vx - motion.vLean * 9 - motion.vY * 6) * h
                sp.z += sp.vz * h; sp.x += sp.vx * h
              }
            }
            const droop = f.mood === 'sleepy' ? 0.5 : f.mood === 'resting' ? 0.3 : f.mood === 'worried' ? 0.2 : 0
            pivot.rotation.set(Math.max(-0.6, Math.min(0.6, sp.x)) + droop * 0.4, 0, Math.max(-0.6, Math.min(0.6, sp.z)) - droop)
          },
        }
      },
    })
  },
}
