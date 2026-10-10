// Cloche: the butler as a silver-service cloche. A tinted enamel-on-silver dome is the head (the face sits on its
// front), a faceted crystal knob is its tiny hat (the one glass detail), and it sits on a polished platter. The lid
// is the expression: it stays shut when resting, lifts a crack to listen, chatters while talking (light flashes from
// underneath like a mouth), tips up with a flourish when done, tilts up over a glowing approval card when it needs
// you, rattles with amber light when worried and pops when celebrating. Steam curls from the knob while thinking.
//
// Layers:
// - lid (dome, rolled lip, inner glow shell, knob, face, glasses, hat) hinges at the back of the rim; the platter,
//   card, light pool and point light stay put.
// - the inner shell is self-lit: dim when shut, glowing when the lid opens, so any gap reads as light from beneath.
// - poses are a pure function of the face (mood, prevMood, moodAge, t, level), blended over 0.45 s, so the mood
//   sheet stills match the live views.
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

const R = 0.9 // dome radius at the rim
const H = 1.1 // dome height
const N = 2.35 // superellipse exponent: a little shouldered, like a real cloche
const Y0 = -0.79 // dome base (platter well)
const HINGE = R * 0.96 // the lid hinges at the back of the rim
const EYE_Y = 0.5, EYE_PHI = 0.29
const MOUTH_Y = 0.27
const AMBER = new THREE.Color('#ffa24a')
const WHITE = new THREE.Color(1, 1, 1)
const GOLDISH = new THREE.Color('#e8c27a')

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x) }
const mix = (a, b, k) => a + (b - a) * k

/** Radius of the dome at height y (0..H). */
const domeR = (y) => R * Math.pow(Math.max(0, 1 - Math.pow(clamp(y / H), N)), 1 / N)
/** Point on the dome surface (lid space) at angle phi from the front and height y, pushed out along the normal. */
function domePoint(phi, y, out, p, n) {
  const r = domeR(y)
  const gr = Math.pow(r / R, N - 1) / R, gy = Math.pow(clamp(y / H), N - 1) / H
  n.set(gr * Math.sin(phi), gy, gr * Math.cos(phi)).normalize()
  p.set(r * Math.sin(phi), y, r * Math.cos(phi)).addScaledVector(n, out)
  return p
}

function domeProfile(scale = 1, steps = 40) {
  const pts = []
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI / 2
    pts.push(new THREE.Vector2(R * scale * Math.pow(Math.cos(a), 2 / N), H * scale * Math.pow(Math.sin(a), 2 / N)))
  }
  pts[steps].x = 0
  return pts
}

function canvasTex(w, h, paint) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  paint(c.getContext('2d'), w, h)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/* ---------------- poses ---------------- */
// lift/tilt/roll: the lid (world units / radians, tilt lifts the front). lean/nod: the whole cloche. glow: light under
// the lid; warm: amber; card: the approval note; steam; zz; knob: the crystal lights up; glint; eye: 'open' | 'up'
// (happy, closed) | 'down' (resting, closed); mouth: 'smile' | 'o' | 'talk' | 'frown' | 'none'; smile: size; slant.
const KEYS = ['browY', 'browL', 'browR', 'lift', 'tilt', 'roll', 'lean', 'nod', 'squash', 'glow', 'warm', 'card', 'steam', 'zz', 'knob', 'glint', 'smile', 'slant', 'oSize']
function pose(o, mood, f, age) {
  const t = f.rm ? 1.3 : f.t, A = f.rm ? 0 : f.P, lv = f.level
  for (const k of KEYS) o[k] = 0
  o.eye = 'open'
  o.mouth = 'smile'
  o.smile = 0.7
  o.oSize = 1
  const breathe = Math.sin(t * 1.1) * A
  switch (mood) {
    case 'resting':
      o.browY = -0.02; o.eye = 'down'; o.mouth = 'none'; o.squash = 0.035 + breathe * 0.006
      break
    case 'idle':
      o.roll = Math.sin(t * 0.7) * 0.012 * A
      o.lift = 0.004 + breathe * 0.004
      break
    case 'listening':
      // leans in, lid lifted a crack: a sliver of light, peeking
      o.lift = 0.07 + Math.sin(t * 2.2) * 0.008 * A; o.tilt = 0.12; o.lean = 0.1; o.glow = 0.55; o.browY = 0.05
      o.mouth = 'o'; o.oSize = 0.55
      break
    case 'thinking':
      o.roll = -0.035; o.lean = -0.03; o.steam = 1; o.browR = 0.1; o.browL = -0.015; o.knob = 0.65 + Math.sin(t * 3) * 0.25
      o.mouth = 'o'; o.oSize = 0.5
      break
    case 'talking':
      o.lift = 0.015 + lv * 0.085; o.tilt = lv * 0.13; o.glow = 0.2 + lv * 0.75
      o.roll = Math.sin(t * 1.3) * 0.02 * A
      o.mouth = 'talk'
      break
    case 'done': {
      // the flourish: up with a little twist, then settle into a held, proud lift
      const k = f.rm ? 1 : smooth(age / 0.35), s = f.rm ? 1 : smooth((age - 0.45) / 0.9)
      o.lift = mix(0.3 * k, 0.1, s); o.tilt = mix(0.42 * k, 0.2, s); o.roll = mix(0.14 * k, 0.03, s)
      o.glow = 0.8; o.glint = s; o.eye = 'up'; o.smile = 1; o.browY = 0.03
      break
    }
    case 'needs-you': {
      const pulse = 0.5 + 0.5 * Math.sin(t * 4.2)
      o.lift = 0.17 + pulse * 0.02 * A; o.tilt = 0.3 + pulse * 0.03 * A; o.roll = 0.04
      o.glow = 1; o.card = f.rm ? 1 : smooth(age / 0.5); o.knob = 0.7 + pulse * 0.3; o.browY = 0.07
      o.mouth = 'o'; o.oSize = 0.8
      break
    }
    case 'worried': {
      // rattling in bursts, amber light leaking out
      const burst = f.rm ? 0 : smooth((Math.sin(t * 2.3) - 0.1) * 2.5)
      o.lift = 0.07 + Math.abs(Math.sin(t * 29)) * 0.035 * burst
      o.roll = Math.sin(t * 41) * 0.035 * burst; o.tilt = 0.1
      o.glow = 0.85 + 0.15 * burst * Math.abs(Math.sin(t * 17)); o.warm = 1; o.browY = 0.02; o.knob = 0.9
      o.slant = 1; o.mouth = 'frown'
      break
    }
    case 'celebrating': {
      const pop = Math.abs(Math.sin(t * 6.5 - 0.7))
      o.lift = 0.12 + pop * (0.1 + 0.08 * A); o.tilt = 0.14 + pop * 0.12; o.roll = Math.sin(t * 3.25) * 0.08 * A
      o.glow = 1; o.eye = 'up'; o.smile = 1.15; o.browY = 0.06
      break
    }
    case 'sleepy':
      o.lean = 0.11 + Math.sin(t * 0.45) * 0.03 * A; o.nod = 0.07 + Math.sin(t * 0.45) * 0.03 * A
      o.squash = 0.02; o.zz = 1; o.browY = -0.035; o.mouth = 'o'; o.oSize = 0.45
      break
  }
  return o
}

export default {
  id: 'cloche',
  name: 'Cloche',
  vibe: 'Dinner is served: a silver-service cloche whose lid does the talking, lifting, rattling and tipping by mood.',
  style: 'solid',
  eyes: ['pills', 'dots'],
  accessories: true,
  frame: { height: 2.6, y: -0.02, header: { height: 2.15, y: 0.06 }, peek: { height: 2.08, y: 0.1 } },
  create({ kit, look, size }) {
    const small = size === 'peek' ? 1.25 : size === 'header' ? 1.12 : 1
    const seg = size === 'big' ? 1 : 0.6
    const own = []
    const keep = (x) => (own.push(x), x)

    const object = new THREE.Group()
    const rig = new THREE.Group() // lean and nod (platter included)
    object.add(rig)

    /* platter */
    const platterPts = [[0, -0.8], [0.88, -0.8], [1.0, -0.78], [1.12, -0.73], [1.18, -0.71], [1.205, -0.73], [1.19, -0.765],
      [1.1, -0.805], [0.9, -0.845], [0.6, -0.86], [0.56, -0.94], [0, -0.94]].map(([x, y]) => new THREE.Vector2(x, y)).reverse()
    const platterGeo = keep(new THREE.LatheGeometry(platterPts, Math.round(72 * seg)))
    const platterMat = keep(new THREE.MeshPhysicalMaterial({ metalness: 0.9, roughness: 0.22, clearcoat: 0.5, clearcoatRoughness: 0.2 }))
    const platter = new THREE.Mesh(platterGeo, platterMat)
    rig.add(platter)
    // gadrooned edge: a beaded silver rim, the classic salver detail
    const gadGeo = keep(new THREE.TorusGeometry(1.19, 0.034, 10, Math.round(220 * seg)))
    {
      const pos = gadGeo.attributes.position, v = new THREE.Vector3(), c = new THREE.Vector3()
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i)
        const u = Math.atan2(v.y, v.x)
        c.set(Math.cos(u) * 1.19, Math.sin(u) * 1.19, 0)
        v.sub(c).multiplyScalar(0.75 + 0.45 * Math.abs(Math.sin(u * 30))).add(c)
        pos.setXYZ(i, v.x, v.y, v.z)
      }
      gadGeo.computeVertexNormals()
    }
    const gadroon = new THREE.Mesh(gadGeo, platterMat)
    gadroon.rotation.x = Math.PI / 2
    gadroon.position.y = -0.725
    rig.add(gadroon)

    // contact shadow: a soft ring where the rim meets the plate
    const shadowTex = keep(canvasTex(128, 128, (g) => {
      const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64)
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.68, 'rgba(0,0,0,0)'); gr.addColorStop(0.76, 'rgba(0,0,0,.75)')
      gr.addColorStop(0.84, 'rgba(0,0,0,.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)')
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128)
    }))
    const shadowMat = keep(new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, color: 0x101218 }))
    const shadow = new THREE.Mesh(keep(new THREE.PlaneGeometry(R * 2.5, R * 2.5)), shadowMat)
    shadow.rotation.x = -Math.PI / 2
    shadow.position.y = -0.797
    rig.add(shadow)

    // pool of light on the plate, and a bloom in the gap
    const pool = kit.glowSprite(look.tint.glow, 1.9, 0)
    pool.position.set(0, Y0 + 0.12, 0.25)
    rig.add(pool)
    own.push(pool.material)
    const under = new THREE.PointLight(0xffffff, 0, 3, 2)
    under.position.set(0, Y0 + 0.3, 0.35)
    rig.add(under)

    // the approval card, revealed under the lid
    const cardTex = keep(canvasTex(128, 168, (g, w, h) => {
      g.fillStyle = '#fbf8f1'; g.beginPath(); g.roundRect(4, 4, w - 8, h - 8, 14); g.fill()
      g.fillStyle = 'rgba(40,46,60,.22)'
      for (const [y, ww] of [[96, 78], [116, 92], [136, 60]]) { g.beginPath(); g.roundRect((w - ww) / 2, y, ww, 9, 4.5); g.fill() }
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(w / 2, 50, 30, 0, Math.PI * 2); g.fill()
    }))
    const cardMat = keep(new THREE.MeshPhysicalMaterial({ map: cardTex, roughness: 0.6, sheen: 0.4 }))
    const cardGeo = keep(new THREE.BoxGeometry(0.42, 0.55, 0.02))
    const card = new THREE.Mesh(cardGeo, cardMat)
    rig.add(card)
    const sealMat = keep(kit.light(look.tint.glow, 1.4))
    const seal = new THREE.Mesh(keep(new THREE.CircleGeometry(0.075, 24)), sealMat)
    seal.position.set(0, 0.11, 0.0115)
    card.add(seal)

    /* lid */
    const lidPivot = new THREE.Group()
    lidPivot.position.set(0, Y0, -HINGE)
    rig.add(lidPivot)
    const lid = new THREE.Group()
    lid.position.z = HINGE
    lidPivot.add(lid)

    const bodyColor = new THREE.Color()
    const domeGeo = keep(new THREE.LatheGeometry(domeProfile(), Math.round(80 * seg)))
    const domeMat = keep(kit.solid('#ffffff', look, { metalness: 0.12, sheen: 0.25 }))
    const dome = new THREE.Mesh(domeGeo, domeMat)
    lid.add(dome)
    const rimMat = keep(kit.rim('#ffffff', { power: 2.6, intensity: 0.5 }))
    const domeRim = new THREE.Mesh(domeGeo, rimMat)
    domeRim.scale.setScalar(1.004)
    lid.add(domeRim)
    const innerMat = keep(new THREE.MeshBasicMaterial({ side: THREE.BackSide, toneMapped: false }))
    const inner = new THREE.Mesh(keep(new THREE.LatheGeometry(domeProfile(0.975), Math.round(48 * seg))), innerMat)
    lid.add(inner)
    const lipMat = keep(new THREE.MeshPhysicalMaterial({ metalness: 0.9, roughness: 0.2, clearcoat: 0.6 }))
    const lip = new THREE.Mesh(keep(new THREE.TorusGeometry(R + 0.012, 0.042, 12, Math.round(80 * seg))), lipMat)
    lip.rotation.x = Math.PI / 2
    lip.position.y = 0.02
    lid.add(lip)

    // knob: a silver collar holding a faceted crystal
    const collarPts = [[0, 0.17], [0.085, 0.17], [0.095, 0.15], [0.055, 0.125], [0.05, 0.075], [0.1, 0.035], [0.17, 0.005], [0.18, -0.03], [0, -0.03]]
      .map(([x, y]) => new THREE.Vector2(x, y)).reverse()
    const collar = new THREE.Mesh(keep(new THREE.LatheGeometry(collarPts, 32)), lipMat)
    collar.position.y = H - 0.01
    lid.add(collar)
    const knobMat = keep(kit.glass(look, { thickness: 0.35, roughness: 0.05, attenuationDistance: 0.6 }))
    knobMat.flatShading = true
    // a cut-crystal stopper: an onion profile turned with 10 flat facets
    const stopperPts = [[0, -0.13], [0.06, -0.12], [0.13, -0.06], [0.165, 0.01], [0.15, 0.08], [0.1, 0.14], [0.04, 0.18], [0, 0.19]].map(([x, y]) => new THREE.Vector2(x, y))
    const knob = new THREE.Mesh(keep(new THREE.LatheGeometry(stopperPts, 10)), knobMat)
    knob.position.y = H + 0.29
    knob.rotation.y = 0.16
    lid.add(knob)
    const knobGlow = kit.glowSprite(look.tint.glow, 0.7, 0)
    knobGlow.position.copy(knob.position)
    lid.add(knobGlow)
    own.push(knobGlow.material)

    /* face */
    const P = new THREE.Vector3(), Nn = new THREE.Vector3(), T = new THREE.Vector3()
    const eyeMat = keep(kit.solid('#16181e', look, { roughness: 0.3, clearcoat: 0.5, sheen: 0 }))
    const eyeLightMat = keep(kit.light('#f2f6ff', 1.25))
    const pillGeo = keep(new THREE.CapsuleGeometry(0.078, 0.17, 6, 16))
    const dotGeo = keep(new THREE.SphereGeometry(0.11, 20, 14))
    const arcGeo = keep(new THREE.TorusGeometry(0.1, 0.034, 8, 24, Math.PI * 0.8))
    const eyes = [-1, 1].map((s) => {
      const g = new THREE.Group()
      const open = new THREE.Mesh(pillGeo, eyeMat)
      const arc = new THREE.Mesh(arcGeo, eyeMat)
      const tilt = new THREE.Group() // slant
      tilt.add(open, arc)
      g.add(tilt)
      g.scale.setScalar(small)
      lid.add(g)
      return { s, g, tilt, open, arc }
    })
    const mouth = new THREE.Group()
    const mouthO = new THREE.Mesh(keep(new THREE.SphereGeometry(0.06, 16, 12)), eyeMat)
    const mouthArc = new THREE.Mesh(keep(new THREE.TorusGeometry(0.075, 0.022, 8, 20, Math.PI * 0.7)), eyeMat)
    mouth.add(mouthO, mouthArc)
    const browGeo = keep(new THREE.CapsuleGeometry(0.026, 0.13, 4, 10).rotateZ(Math.PI / 2))
    const brows = [-1, 1].map((s) => { const g = new THREE.Group(); const m = new THREE.Mesh(browGeo, eyeMat); m.scale.z = 0.5; g.add(m); g.scale.setScalar(small); lid.add(g); return { s, g, m } })
    // an engraved silver band above the rim, the way a real cloche is finished
    const band = new THREE.Mesh(keep(new THREE.TorusGeometry(domeR(0.13) + 0.004, 0.014, 6, Math.round(80 * seg))), lipMat)
    band.rotation.x = Math.PI / 2
    band.position.y = 0.13
    lid.add(band)
    mouth.scale.setScalar(small)
    lid.add(mouth)
    function place(obj, phi, y, out) {
      domePoint(phi, y, out, P, Nn)
      obj.position.copy(P)
      T.copy(P).add(Nn)
      obj.lookAt(T) // in lid space: lid has no rotation of its own, so lookAt in parent space is fine
    }

    /* steam, zz, confetti, glint */
    const puffMat = keep(kit.solid('#ffffff', look, { roughness: 0.7, clearcoat: 0 }))
    const puffGeo = keep(new THREE.SphereGeometry(0.13, 16, 12))
    const puffs = [0, 1, 2].map(() => { const m = new THREE.Mesh(puffGeo, puffMat); lid.add(m); return m })
    const zTex = keep(canvasTex(64, 64, (g) => {
      g.strokeStyle = '#fff'; g.lineWidth = 9; g.lineCap = g.lineJoin = 'round'
      g.beginPath(); g.moveTo(16, 16); g.lineTo(48, 16); g.lineTo(16, 48); g.lineTo(48, 48); g.stroke()
    }))
    const zMat = keep(new THREE.SpriteMaterial({ map: zTex, transparent: true, depthWrite: false }))
    const zz = new THREE.Sprite(zMat)
    rig.add(zz)
    const starTex = keep(canvasTex(64, 64, (g) => {
      g.fillStyle = '#fff'; g.beginPath()
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2, r = i % 2 ? 7 : 30; g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r) }
      g.fill()
    }))
    const CONF = 28
    const confPos = new Float32Array(CONF * 3), confCol = new Float32Array(CONF * 3)
    const confGeo = keep(new THREE.BufferGeometry())
    confGeo.setAttribute('position', new THREE.BufferAttribute(confPos, 3))
    confGeo.setAttribute('color', new THREE.BufferAttribute(confCol, 3))
    const confMat = keep(new THREE.PointsMaterial({ map: starTex, size: 0.2 * small, vertexColors: true, transparent: true, depthWrite: false, alphaTest: 0.05 }))
    const confetti = new THREE.Points(confGeo, confMat)
    confetti.frustumCulled = false
    rig.add(confetti)
    const seeds = Array.from({ length: CONF }, (_, i) => { const h = (k) => { const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x) }; return [h(1), h(2), h(3), h(4)] })
    const glintMat = keep(new THREE.SpriteMaterial({ map: starTex, transparent: true, depthWrite: false, color: 0xffffff }))
    const glint = new THREE.Sprite(glintMat)
    lid.add(glint)

    /* accessories */
    const hatMat = keep(kit.solid('#202229', look, { roughness: 0.45 }))
    const bandMat = keep(kit.solid('#ffffff', look, { roughness: 0.4 }))
    const hatBody = new THREE.Mesh(undefined, hatMat)
    const hatBand = new THREE.Mesh(undefined, bandMat)
    const hat = new THREE.Group()
    hat.add(hatBody, hatBand)
    hat.position.set(0.04, H - 0.03, 0)
    hat.rotation.z = -0.14
    lid.add(hat)
    const frameMat = keep(new THREE.MeshPhysicalMaterial({ color: GOLDISH, metalness: 1, roughness: 0.25 }))
    const frames = new THREE.Mesh(undefined, frameMat)
    lid.add(frames)
    const tmpObj = new THREE.Object3D()
    function onDome(geo, phi, y, out, rz = 0) {
      place(tmpObj, phi, y, out)
      tmpObj.rotateZ(rz)
      tmpObj.updateMatrix()
      return geo.applyMatrix4(tmpObj.matrix)
    }
    let accKey = ''
    function buildAccessories(l) {
      const key = l.hat + '|' + l.glasses
      if (key === accKey) return
      accKey = key
      hatBody.geometry?.dispose(); hatBand.geometry?.dispose(); frames.geometry?.dispose()
      hatBody.geometry = hatBand.geometry = frames.geometry = undefined
      if (l.hat === 'bowler') {
        const crown = new THREE.SphereGeometry(0.27, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.95, 1).translate(0, 0.06, 0)
        const base = new THREE.CylinderGeometry(0.27, 0.27, 0.06, 32).translate(0, 0.03, 0)
        const brim = new THREE.CylinderGeometry(0.4, 0.4, 0.025, 40).translate(0, 0.0, 0)
        hatBody.geometry = mergeGeometries([crown, base, brim].map((g) => g.toNonIndexed()))
        hatBand.geometry = new THREE.CylinderGeometry(0.275, 0.275, 0.06, 32, 1, true).translate(0, 0.045, 0)
      } else if (l.hat === 'top') {
        const crown = new THREE.CylinderGeometry(0.22, 0.2, 0.44, 32).translate(0, 0.23, 0)
        const brim = new THREE.CylinderGeometry(0.36, 0.36, 0.025, 40)
        hatBody.geometry = mergeGeometries([crown, brim].map((g) => g.toNonIndexed()))
        hatBand.geometry = new THREE.CylinderGeometry(0.205, 0.203, 0.08, 32, 1, true).translate(0, 0.06, 0)
      }
      hat.visible = l.hat === 'bowler' || l.hat === 'top'
      knob.visible = collar.visible = !hat.visible
      const parts = []
      const ring = (r, arc = Math.PI * 2, start = 0) => new THREE.TorusGeometry(r, 0.016, 8, 40, arc).rotateZ(start)
      const ey = EYE_Y
      if (l.glasses === 'round') {
        for (const s of [-1, 1]) parts.push(onDome(ring(0.15), s * EYE_PHI, ey, 0.05))
        const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
        domePoint(-EYE_PHI + 0.15, ey + 0.03, 0.06, a, Nn); domePoint(0, ey + 0.05, 0.07, b, Nn); domePoint(EYE_PHI - 0.15, ey + 0.03, 0.06, c, Nn)
        parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([a, b, c]), 12, 0.014, 6, false))
      } else if (l.glasses === 'half-moon') {
        for (const s of [-1, 1]) {
          parts.push(onDome(ring(0.14, Math.PI, Math.PI), s * EYE_PHI, ey - 0.06, 0.05))
          parts.push(onDome(new THREE.CylinderGeometry(0.014, 0.014, 0.28, 6).rotateZ(Math.PI / 2), s * EYE_PHI, ey - 0.06, 0.05))
        }
        const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
        domePoint(-EYE_PHI + 0.15, ey - 0.06, 0.06, a, Nn); domePoint(0, ey - 0.02, 0.07, b, Nn); domePoint(EYE_PHI - 0.15, ey - 0.06, 0.06, c, Nn)
        parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([a, b, c]), 12, 0.014, 6, false))
      } else if (l.glasses === 'monocle') {
        parts.push(onDome(ring(0.16).scale(1, 1, 1.6), -EYE_PHI, ey, 0.05))
        const pts = []
        for (let i = 0; i <= 10; i++) {
          const k = i / 10
          pts.push(domePoint(-EYE_PHI - 0.12 - k * 0.35, ey - 0.14 - k * 0.3 + Math.sin(k * Math.PI) * -0.06, 0.03, new THREE.Vector3(), Nn))
        }
        parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.007, 5, false))
      }
      frames.visible = parts.length > 0
      if (parts.length) frames.geometry = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))
      for (const g of parts) g.dispose()
    }

    /* look */
    const knobBase = new THREE.Color(), knobAtt = new THREE.Color(), glowCol = new THREE.Color(), interior = new THREE.Color(), eyeIsLight = { v: false }
    function setLook(l) {
      const tn = l.tint
      if (tn.key === 'graphite') bodyColor.copy(tn.ink).lerp(tn.glass, 0.07)
      else bodyColor.copy(tn.glow).lerp(tn.ink, 0.2)
      domeMat.color.copy(bodyColor)
      kit.updateSolid(domeMat, l)
      domeMat.metalness = 0.12
      domeMat.envMapIntensity *= 0.7
      platterMat.color.set('#c3c8d2').lerp(tn.glass, 0.2)
      lipMat.color.set('#dfe3ea').lerp(tn.glass, 0.35)
      interior.copy(bodyColor).multiplyScalar(0.35)
      glowCol.copy(tn.glow).lerp(WHITE, 0.35)
      eyeIsLight.v = tn.key === 'graphite'
      eyeMat.color.set(eyeIsLight.v ? '#f1f4fb' : '#16181e')
      kit.updateSolid(eyeMat, l, { roughness: 0.4, clearcoat: 0.35 })
      eyeMat.sheen = 0
      eyeMat.envMapIntensity = 0.08
      eyeMat.emissive.set(eyeIsLight.v ? '#cfd8ea' : '#000000')
      kit.updateGlass(knobMat, l, { roughness: 0.05, attenuationDistance: 0.6 })
      knobBase.copy(knobMat.color); knobAtt.copy(knobMat.attenuationColor)
      puffMat.color.copy(tn.soft).lerp(WHITE, l.dark ? 0.6 : 0.15)
      kit.updateSolid(puffMat, l, { roughness: 0.7, clearcoat: 0 })
      hatMat.color.set(tn.key === 'graphite' ? '#121318' : '#24262d')
      kit.updateSolid(hatMat, l, { roughness: 0.45 })
      bandMat.color.copy(tn.glow).lerp(tn.ink, 0.35)
      kit.updateSolid(bandMat, l, { roughness: 0.4 })
      zMat.color.copy(l.dark ? tn.soft : tn.ink)
      knobGlow.material.color.copy(tn.glow)
      sealMat.color.copy(tn.glow).multiplyScalar(1.4)
      for (let i = 0; i < CONF; i++) {
        const c = [tn.glow, GOLDISH, WHITE, tn.soft, AMBER][i % 5]
        confCol[i * 3] = c.r; confCol[i * 3 + 1] = c.g; confCol[i * 3 + 2] = c.b
      }
      confGeo.attributes.color.needsUpdate = true
      for (const e of eyes) { e.open.geometry = l.eyes === 'dots' ? dotGeo : pillGeo }
      rimMat.uniforms.intensity.value = l.dark ? 0.55 : 0.35
      buildAccessories(l)
    }
    setLook(look)

    /* update */
    const A = {}, B = {}, cur = {}
    const lightCol = new THREE.Color()
    return {
      object,
      update(f, lk = look) {
        const age = f.moodAge
        pose(A, f.mood, f, age)
        const k = f.rm ? 1 : smooth(age / 0.45)
        if (k < 1) pose(B, f.prevMood, f, age + 10)
        for (const key of KEYS) cur[key] = k < 1 ? mix(B[key], A[key], k) : A[key]
        cur.eye = k > 0.5 || k >= 1 ? A.eye : B.eye
        cur.mouth = k > 0.5 || k >= 1 ? A.mouth : B.mouth
        const t = f.rm ? 1.3 : f.t

        object.position.y = f.bounce
        rig.rotation.z = cur.lean
        rig.rotation.x = cur.nod
        lidPivot.position.y = Y0 + Math.max(0, cur.lift)
        lidPivot.rotation.set(-cur.tilt, 0, cur.roll)
        lid.scale.set(1 + cur.squash * 0.5, 1 - cur.squash, 1 + cur.squash * 0.5)

        // light from beneath
        const open = clamp(cur.lift * 6 + cur.tilt * 2.2)
        const g = cur.glow * (0.35 + 0.65 * open)
        lightCol.copy(glowCol).lerp(AMBER, cur.warm)
        innerMat.color.copy(interior).lerp(lightCol, clamp(g * 1.1)).multiplyScalar(1 + g * 0.6)
        under.color.copy(lightCol)
        under.intensity = g * 3.2
        pool.material.color.copy(lightCol)
        pool.material.opacity = g * 0.9
        pool.scale.setScalar(1.3 + open * 0.8)
        shadow.material.opacity = 1 - open * 0.7
        knobGlow.material.opacity = cur.knob * 0.85
        knobGlow.material.color.copy(lightCol)
        // the crystal takes on the mood light: tint while thinking or waiting on you, amber when worried
        knobMat.color.copy(knobBase).lerp(lightCol, cur.knob * 0.75)
        knobMat.attenuationColor.copy(knobAtt).lerp(lightCol, cur.knob)

        // card
        card.visible = cur.card > 0.01
        card.position.set(0, Y0 + 0.02 + cur.card * 0.27, 0.28)
        card.rotation.set(-0.18, 0, 0.06)
        card.scale.setScalar(0.6 + 0.4 * cur.card)

        // eyes
        const lx = f.lookX * 0.07, ly = -f.lookY * 0.05
        for (const e of eyes) {
          place(e.g, e.s * EYE_PHI + lx, EYE_Y + ly, 0.012)
          const closed = cur.eye !== 'open'
          e.open.visible = !closed
          e.arc.visible = closed
          if (closed) {
            e.arc.rotation.z = cur.eye === 'up' ? Math.PI * 0.1 : Math.PI * 1.1
            e.arc.position.y = cur.eye === 'up' ? -0.04 : 0.03
            e.arc.scale.set(1, 1, 0.6)
          } else {
            const op = Math.max(0.12, f.open * f.blink)
            const dots = lk.eyes === 'dots'
            e.open.scale.set(1, dots ? Math.min(1.1, op) : op, 0.45)
          }
          e.tilt.rotation.z = e.s * cur.slant * 0.14
        }

        // brows: a butler's eyebrow does a lot of the work
        for (const b of brows) {
          const own1 = b.s > 0 ? cur.browR : cur.browL
          place(b.g, b.s * (EYE_PHI + 0.02) + lx * 0.8, EYE_Y + 0.19 + cur.browY + own1 + ly * 0.5, 0.01)
          b.g.rotateZ(b.s * (-cur.slant * 0.42 - own1 * 2.5) + (cur.eye === 'up' ? b.s * -0.12 : 0))
        }

        // mouth
        place(mouth, lx * 0.6, MOUTH_Y + ly * 0.6, 0.008)
        mouthO.visible = cur.mouth === 'o' || cur.mouth === 'talk'
        mouthArc.visible = cur.mouth === 'smile' || cur.mouth === 'frown'
        if (cur.mouth === 'talk') mouthO.scale.set(1.3, 0.3 + f.level * 1.25, 0.4)
        else if (cur.mouth === 'o') mouthO.scale.set(0.8 * cur.oSize, 0.95 * cur.oSize, 0.4)
        if (cur.mouth === 'smile') { mouthArc.rotation.z = Math.PI * 1.15; mouthArc.position.y = 0.03; mouthArc.scale.set(cur.smile, cur.smile, 0.6) }
        else if (cur.mouth === 'frown') { mouthArc.rotation.z = Math.PI * 0.15; mouthArc.position.y = -0.04; mouthArc.scale.set(0.8, 0.6, 0.6) }

        // steam: three puffs rising from the knob, drifting right
        for (const [i, m] of puffs.entries()) {
          const p = ((t * 0.42 + i / 3) % 1 + 1) % 1
          m.visible = cur.steam > 0.02
          m.position.set(0.16 + p * 0.4 + Math.sin(p * 6.5 + i) * 0.07, H + 0.32 + p * 0.5, 0.05)
          m.scale.setScalar(Math.sin(p * Math.PI) * (0.65 + p * 0.7) * cur.steam * small)
        }

        // zz
        const zp = ((t * 0.22) % 1 + 1) % 1
        zz.visible = cur.zz > 0.02
        zz.position.set(0.55 + zp * 0.3, 0.45 + zp * 0.55, 0.3)
        zz.scale.setScalar((0.16 + zp * 0.14) * small)
        zMat.opacity = Math.sin(zp * Math.PI) * cur.zz

        // glint on the knob when done
        glint.visible = cur.glint > 0.02 && knob.visible
        glint.position.set(0.11, H + 0.36, 0.1)
        glint.scale.setScalar(0.22 * cur.glint * (0.75 + 0.25 * Math.sin(t * 5)) * small)
        glintMat.rotation = t * 0.6

        // confetti: launched from under the lid
        const sp = f.spark
        confetti.visible = sp > 0.02
        if (confetti.visible) {
          for (let i = 0; i < CONF; i++) {
            const [a, b, c, d] = seeds[i]
            const p = ((t * (0.55 + a * 0.25) + d) % 1 + 1) % 1
            const ang = (b - 0.5) * 2.8
            const v = 1.6 + c * 0.9
            confPos[i * 3] = Math.sin(ang) * v * p * 0.9
            confPos[i * 3 + 1] = Y0 + 0.25 + Math.cos(ang) * v * p * 1.25 - p * p * 1.6
            confPos[i * 3 + 2] = 0.95 + (c - 0.5) * 0.5
          }
          confGeo.attributes.position.needsUpdate = true
          confMat.opacity = sp
        }
      },
      setLook,
      dispose() {
        for (const x of own) x.dispose?.()
        hatBody.geometry?.dispose(); hatBand.geometry?.dispose(); frames.geometry?.dispose()
      },
    }
  },
}
