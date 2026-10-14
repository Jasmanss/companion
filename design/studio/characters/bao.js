// Bao: a squat, round soft toy, wider at the base like a steamed bun, with a little pinched twist on top. Calm and
// friendly: slow, jelly-like sway, soft springy arms. Part of the toy family (see _toy.js and _arms.js).
import * as THREE from 'three'
import { buildToy } from './_toy.js'

const SHAPE = { R: 0.92, yc: -0.12, hT: 0.78, hB: 0.6, mT: 2.1, mB: 3.0, n: 2, ZS: 0.92, taper: 0.08 }
const FRAME = { height: 2.35, y: 0.02, header: { height: 2.2, y: 0.0 }, peek: { height: 2.2, y: -0.02 } }

/** The pinched twist: a short cone whose pleats spiral to the tip. */
function twistGeometry() {
  const pts = []
  for (let i = 0; i <= 14; i++) { const t = i / 14; pts.push(new THREE.Vector2(Math.max(0.004, 0.17 * (1 - t) ** 0.85), t * 0.17)) }
  const g = new THREE.LatheGeometry(pts, 48)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), th = Math.atan2(z, x), r = Math.hypot(x, z)
    const k = 1 + 0.16 * Math.cos(7 * th + y * 22) * Math.min(1, y * 14)
    p.setXYZ(i, Math.cos(th) * r * k, y, Math.sin(th) * r * k)
  }
  g.computeVertexNormals()
  return g
}

export default {
  id: 'bao',
  name: 'Bao',
  vibe: 'A squat, round soft toy with a pinched twist on top. Calm and friendly: it sways like jelly and juggles while it thinks.',
  eyes: ['pills', 'dots', 'arcs'],
  accessories: true,
  style: 'solid',
  family: 'toy',
  frame: FRAME,
  create(ctx) {
    return buildToy(ctx, {
      shape: SHAPE,
      frame: FRAME,
      face: { region: { x0: -0.66, x1: 0.66, y0: -0.42, y1: 0.4 }, ex: 0.3, ey: 0.05, ew: 0.078, eh: 0.135, mw: 0.085, my: -0.17, cheekX: 0.5, cheekY: -0.12, cheekW: 0.13, cheekH: 0.075 },
      arms: { y: -0.13, angle: 1.12, sink: 0.05, len: 0.34, rad: 0.095, hand: 0.12, rest: 0.42, k: 70, zeta: 0.7, chin: -0.25, toss: 1.05 },
      hat: { y: 0.6, scale: 0.95 },
      motion: { rate: 5, sway: 0.03, bob: 0, jelly: 1 },
      extras({ shape, content, G, bodyMat }) {
        const twist = new THREE.Mesh(G(twistGeometry()), bodyMat)
        twist.position.y = shape.top - 0.06
        twist.scale.setScalar(1.35)
        content.add(twist)
        return {
          setLook(l, { hat }) { twist.visible = !hat },
          update(f) {
            // The twist wobbles a beat behind the body.
            twist.rotation.z = f.rm ? 0 : Math.sin(f.clock * 2.3 - 0.6) * 0.06 * f.wob
          },
        }
      },
    })
  },
}
