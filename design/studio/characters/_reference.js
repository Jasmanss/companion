// Reference character for the studio contract: a glass capsule with eyes of light. Not shown by default (?ref).
import * as THREE from 'three'

export default {
  id: '_reference',
  name: 'Reference',
  vibe: 'The smallest character that follows the studio contract.',
  eyes: ['pills'],
  frame: { height: 2.6, y: 0 },
  create({ kit, look }) {
    const object = new THREE.Group()
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.7, 0.5, 16, 48), kit.glass(look))
    const rim = new THREE.Mesh(body.geometry, kit.rim('#ffffff', { intensity: 0.7 }))
    const eyeGeo = new THREE.CapsuleGeometry(0.09, 0.16, 8, 16)
    const eyeMat = kit.light(look.tint.glow, 1.8)
    const eyes = [-1, 1].map((s) => { const e = new THREE.Mesh(eyeGeo, eyeMat); e.position.set(s * 0.26, 0.1, 0.45); return e })
    const glow = kit.glowSprite(look.tint.glow, 1.6, 0.5)
    glow.position.z = 0.1
    object.add(glow, body, rim, ...eyes)
    return {
      object,
      update(f) {
        object.position.y = f.bounce + Math.sin(f.clock * 1.4) * 0.03
        for (const [i, e] of eyes.entries()) {
          e.scale.y = Math.max(0.15, f.open * f.blink)
          e.position.x = (i ? 1 : -1) * 0.26 + f.lookX * 0.08
          e.position.y = 0.1 - f.lookY * 0.06
        }
      },
      setLook(l) { kit.updateGlass(body.material, l); eyeMat.color.copy(l.tint.glow).multiplyScalar(1.8); glow.material.color.copy(l.tint.glow) },
      dispose() { body.geometry.dispose(); body.material.dispose(); eyeGeo.dispose(); eyeMat.dispose() },
    }
  },
}
