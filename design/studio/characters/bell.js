// Bell: the butler's service bell as a character. A soft-touch enamel dome (the head and body) sits on a polished brass
// plinth; the plunger on top wears a glass bead that lights up as the attention signal. The face is pad-printed on
// the dome under its glaze, like a designer vinyl toy, so lids, brows and mouth can change shape per mood.
//
// The bell acts out the moods: needs-you rings (the plunger dips, the dome shivers, sound arcs ripple out),
// celebrating double-rings and throws confetti, thinking turns the plunger like a dial, sleepy slumps onto the base,
// worried rattles with an amber bead. The quiet moods differ by posture and the bead light: resting sits low and
// dark with closed eyes, idle is upright with a faint bead, listening leans in and cocks the dome with the bead lit
// steady, talking pulses the dome and opens a large mouth.
//
// Meshes (about 19): shadow, base, dome, rim, face, bow tie, collar, stem, cup, bead, core, 4 ripples, confetti
// (one instanced mesh), zz, glasses (up to 4). One transmissive material: the bead.
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

const R = 0.92, H = 1.06 // dome radii (it is a half-ellipsoid)
const LIP = 0.11 // the rolled lip: the ellipsoid starts this high above the dome's bottom
const BASE_TOP = -0.64
const TOP = LIP + H // dome top, in dome space
const PIVOT = BASE_TOP - 0.27 // bottom of the plinth
const BEAD_R = 0.185, BEAD_Y = TOP + 0.29
// Face patch (a slice of the ellipsoid, printed with a canvas): angles from the front (phi) and from the top (theta).
const PHI_W = 1.8, TH0 = 0.42, TH1 = 1.56
const EYE_TH = 0.97, EYE_PHI = 0.31, MOUTH_TH = 1.28
const FW = 512, FH = 384
const U = (phi) => (0.5 + phi / PHI_W) * FW
const V = (th) => ((th - TH0) / (TH1 - TH0)) * FH
const EX = U(EYE_PHI) - FW / 2, EY = V(EYE_TH), MY = V(MOUTH_TH)
const AMBER = new THREE.Color('#ffa63d')
const BRASS = '#d9b879'

// Posture and face per mood. sq: dome squash, tilt: sideways (rad), lean: forward (rad), glow: bead light,
// browY: brow height (px, - is up), browIn/browOut: raise of the inner/outer brow ends, browR: extra raise of the
// right brow, lid: upper lid cover (0..1), slant: lid droop toward the outer corners.
const POSE = {
  resting: { sq: 0.93, tilt: -0.04, lean: 0.11, glow: 0, browY: 16, browIn: 0, browOut: -4, browR: 0, lid: 0, slant: 0 },
  idle: { sq: 1, tilt: 0, lean: 0, glow: 0.16, browY: 0, browIn: 0, browOut: 0, browR: 0, lid: 0, slant: 0 },
  listening: { sq: 1.02, tilt: 0.14, lean: 0.1, glow: 0.65, browY: -14, browIn: 4, browOut: 4, browR: 10, lid: 0, slant: 0 },
  thinking: { sq: 1, tilt: -0.1, lean: -0.08, glow: 0.55, browY: -4, browIn: -3, browOut: 0, browR: 18, lid: 0.22, slant: 0 },
  talking: { sq: 1, tilt: 0, lean: 0.03, glow: 0.3, browY: -8, browIn: 0, browOut: 0, browR: 0, lid: 0.1, slant: 0 },
  done: { sq: 1, tilt: 0.05, lean: 0.05, glow: 0.35, browY: -8, browIn: 0, browOut: 0, browR: 0, lid: 0, slant: 0 },
  'needs-you': { sq: 1.03, tilt: 0, lean: 0.05, glow: 1, browY: -24, browIn: 2, browOut: 6, browR: 0, lid: 0, slant: 0 },
  worried: { sq: 0.97, tilt: 0, lean: -0.02, glow: 0.85, browY: -4, browIn: 15, browOut: -7, browR: 0, lid: 0.16, slant: 0.7 },
  celebrating: { sq: 1, tilt: 0, lean: 0, glow: 0.9, browY: -20, browIn: 0, browOut: 0, browR: 0, lid: 0, slant: 0 },
  sleepy: { sq: 0.9, tilt: 0.13, lean: 0.1, glow: 0, browY: 12, browIn: -4, browOut: -9, browR: 0, lid: 0.56, slant: 0.25 },
}
const KEYS = Object.keys(POSE.idle)
const MOOD_IDS = Object.keys(POSE)
const frac = (x) => x - Math.floor(x)
const hk = (k, x) => (k * 31 + Math.round(x * 60)) | 0
const clamp01 = (x) => Math.max(0, Math.min(1, x))

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d'), w, h)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export default {
  id: 'bell',
  name: 'Bell',
  vibe: 'The service bell itself: an enamel dome on a brass plinth that rings when it needs you.',
  eyes: ['pills', 'dots', 'arcs'],
  accessories: true,
  style: 'solid',
  frame: { height: 2.6, y: 0.04, peek: { height: 2.36, y: -0.02 }, header: { height: 2.3, y: 0 } },
  create({ kit, look, size }) {
    const small = size === 'peek' ? 1.3 : size === 'header' ? 1.15 : 1
    const object = new THREE.Group()
    const hop = new THREE.Group() // celebrating hop
    object.add(hop)
    const geos = [], mats = [], texs = []
    const own = (x, list) => (list.push(x), x)

    /* materials */
    const bodyMat = own(kit.solid('#ffffff', look), mats)
    const brass = own(new THREE.MeshPhysicalMaterial({ color: BRASS, metalness: 1, roughness: 0.2, clearcoat: 0.4, clearcoatRoughness: 0.1 }), mats)
    const BEAD_GLASS = { thickness: 0.25, roughness: 0.03, flatShading: true, iridescence: 0, attenuationDistance: 2.2 }
    const beadMat = own(kit.glass(look, BEAD_GLASS), mats)
    const coreMat = own(kit.light('#ffffff', 1.6), mats)
    const rimMat = own(kit.rim('#ffffff', { power: 2.6, intensity: 0.5 }), mats)

    /* shadow */
    const shadowTex = own(canvasTexture(128, 128, (g) => {
      const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64)
      gr.addColorStop(0, 'rgba(0,0,0,.5)'); gr.addColorStop(0.55, 'rgba(0,0,0,.22)'); gr.addColorStop(1, 'rgba(0,0,0,0)')
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128)
    }), texs)
    const shadowMat = own(new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }), mats)
    const shadow = new THREE.Mesh(own(new THREE.PlaneGeometry(2.9, 0.62), geos), shadowMat)
    shadow.position.set(0, BASE_TOP - 0.28, 0.05)
    shadow.rotation.x = -Math.PI / 2 + 0.25
    object.add(shadow)

    /* brass plinth (bottom to top so the lathe faces outward) */
    const bp = [[0, -0.27], [R + 0.14, -0.27], [R + 0.2, -0.262], [R + 0.235, -0.235], [R + 0.235, -0.2], [R + 0.21, -0.17], [R + 0.13, -0.145],
      [R + 0.1, -0.12], [R + 0.12, -0.085], [R + 0.135, -0.05], [R + 0.12, -0.018], [R + 0.07, 0], [0, 0]].map(([x, y]) => new THREE.Vector2(x, y))
    const base = new THREE.Mesh(own(new THREE.LatheGeometry(bp, 72), geos), brass)
    base.position.y = BASE_TOP
    hop.add(base)

    /* dome: pivots on the plinth so it can lean, tilt and slump */
    const domeG = new THREE.Group()
    domeG.position.y = BASE_TOP
    hop.add(domeG)
    const dp = [[0, 0.004], [R - 0.05, 0.004], [R + 0.03, 0.016], [R + 0.055, 0.05], [R + 0.04, 0.088], [R + 0.004, LIP]]
    for (let i = 1; i <= 40; i++) { const th = Math.PI / 2 - (i / 40) * (Math.PI / 2); dp.push([R * Math.sin(th), LIP + H * Math.cos(th)]) }
    const domeGeo = own(new THREE.LatheGeometry(dp.map(([x, y]) => new THREE.Vector2(Math.max(0, x), y)), 72), geos)
    const dome = new THREE.Mesh(domeGeo, bodyMat)
    const rim = new THREE.Mesh(domeGeo, rimMat)
    rim.scale.setScalar(1.006)
    rim.position.y = -0.002
    domeG.add(dome, rim)

    /* printed face */
    const fc = document.createElement('canvas')
    fc.width = FW; fc.height = FH
    const g = fc.getContext('2d')
    const faceTex = own(new THREE.CanvasTexture(fc), texs)
    faceTex.colorSpace = THREE.SRGBColorSpace
    faceTex.anisotropy = 4
    const faceMat = own(new THREE.MeshPhysicalMaterial({ map: faceTex, transparent: true, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), mats)
    const face = new THREE.Mesh(own(new THREE.SphereGeometry(1, 48, 32, Math.PI / 2 - PHI_W / 2, PHI_W, TH0, TH1 - TH0), geos), faceMat)
    face.scale.set(R * 1.002, H * 1.002, R * 1.002)
    face.position.y = LIP
    domeG.add(face)

    /* a small satin bow tie on the lip, front and center */
    const bowParts = []
    for (const s of [-1, 1]) {
      // one wing: pinched at the knot, flaring to a soft rounded edge
      const sh = new THREE.Shape()
      sh.moveTo(0, -0.03)
      sh.quadraticCurveTo(s * 0.1, -0.045, s * 0.185, -0.088)
      sh.quadraticCurveTo(s * 0.235, 0, s * 0.185, 0.088)
      sh.quadraticCurveTo(s * 0.1, 0.045, 0, 0.03)
      sh.closePath()
      const wing = new THREE.ExtrudeGeometry(sh, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.022, bevelSize: 0.018, bevelSegments: 4, curveSegments: 12 })
      wing.translate(0, 0, -0.0175)
      if (s < 0) { const idx = wing.index; if (idx) for (let i = 0; i < idx.count; i += 3) { const a = idx.getX(i); idx.setX(i, idx.getX(i + 1)); idx.setX(i + 1, a) } }
      wing.computeVertexNormals()
      bowParts.push(wing.index ? wing.toNonIndexed() : wing)
    }
    const knotGeo = new THREE.SphereGeometry(0.05, 16, 12).toNonIndexed()
    knotGeo.scale(0.95, 1.1, 0.8)
    knotGeo.translate(0, 0, 0.03)
    bowParts.push(knotGeo)
    for (const x of bowParts) { for (const k of Object.keys(x.attributes)) if (k !== 'position' && k !== 'normal') x.deleteAttribute(k) }
    const bowGeo = own(mergeGeometries(bowParts), geos)
    bowParts.forEach((x) => x.dispose())
    const bowMat = own(new THREE.MeshPhysicalMaterial({ color: '#1a1c23', roughness: 0.38, sheen: 1, sheenRoughness: 0.35, sheenColor: new THREE.Color('#8890a8'), clearcoat: 0.3 }), mats)
    const bow = new THREE.Mesh(bowGeo, bowMat)
    bow.position.set(0, LIP + 0.03, R + 0.06)
    bow.rotation.x = -0.12
    bow.scale.setScalar(0.88)
    domeG.add(bow)

    /* plunger: collar on the dome, then a turning stem with a brass cup and the glass bead */
    const collar = new THREE.Mesh(own(new THREE.CylinderGeometry(0.11, 0.17, 0.07, 40), geos), brass)
    collar.position.y = TOP - 0.005
    const plunger = new THREE.Group()
    plunger.position.y = TOP
    const stem = new THREE.Mesh(own(new THREE.CylinderGeometry(0.05, 0.05, 0.26, 20), geos), brass)
    stem.position.y = 0.08
    const cup = new THREE.Mesh(own(new THREE.CylinderGeometry(0.115, 0.065, 0.075, 32), geos), brass)
    cup.position.y = BEAD_Y - TOP - BEAD_R * 0.86
    const bead = new THREE.Mesh(own(new THREE.IcosahedronGeometry(BEAD_R, 1), geos), beadMat)
    bead.position.y = BEAD_Y - TOP
    const core = new THREE.Mesh(own(new THREE.SphereGeometry(0.06, 16, 12), geos), coreMat)
    core.position.y = bead.position.y
    plunger.add(stem, cup, core, bead)
    domeG.add(collar, plunger)

    /* sound arcs: two pairs ")(" that expand from the bead */
    const arcLen = 1.05
    const arcGeo = own(new THREE.TorusGeometry(1, 0.045 * Math.min(1.35, small), 6, 28, arcLen), geos)
    const ripMats = [0, 1].map(() => own(new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, opacity: 0 }), mats))
    const ripples = []
    for (let k = 0; k < 2; k++) for (const s of [-1, 1]) {
      const m = new THREE.Mesh(arcGeo, ripMats[k])
      m.rotation.z = s > 0 ? -arcLen / 2 : Math.PI - arcLen / 2
      m.position.y = BEAD_Y - 0.06
      m.visible = false
      m.userData.k = k
      m.userData.s = s
      ripples.push(m)
      domeG.add(m)
    }

    /* confetti: one instanced mesh */
    const NC = 30
    const confetti = new THREE.InstancedMesh(own(new THREE.PlaneGeometry(0.1, 0.16), geos), own(new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }), mats), NC)
    confetti.frustumCulled = false
    confetti.visible = false
    const cseed = Array.from({ length: NC }, (_, i) => ({ a: 0.35 + ((i * 0.618) % 1) * 2.45, v: 0.75 + ((i * 0.377) % 1) * 0.6, off: (i * 0.4142) % 1, spin: 4 + ((i * 0.7) % 1) * 7 }))
    const dummy = new THREE.Object3D()
    hop.add(confetti)

    /* zz for sleepy */
    const zTex = own(canvasTexture(128, 128, (zg) => {
      zg.fillStyle = '#fff'; zg.font = '800 64px Nunito, ui-rounded, system-ui, sans-serif'; zg.textBaseline = 'middle'
      zg.fillText('z', 18, 82); zg.font = '800 44px Nunito, ui-rounded, system-ui, sans-serif'; zg.fillText('z', 72, 40)
    }), texs)
    const zz = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: zTex, transparent: true, depthWrite: false, opacity: 0 }), mats))
    zz.scale.setScalar(0.62 * Math.min(1.15, small))
    zz.visible = false
    hop.add(zz)

    /* glasses (rebuilt when the look changes) */
    const specs = new THREE.Group()
    domeG.add(specs)
    const lensMat = own(new THREE.MeshPhysicalMaterial({ color: '#ffffff', metalness: 0, roughness: 0.04, transparent: true, opacity: 0.16, clearcoat: 1, depthWrite: false }), mats)
    let specKind = null
    const onDome = (th, phi, out = 0) => {
      const n = new THREE.Vector3(Math.sin(phi) * Math.sin(th) / R, Math.cos(th) / H, Math.cos(phi) * Math.sin(th) / R).normalize()
      const p = new THREE.Vector3(R * Math.sin(phi) * Math.sin(th), LIP + H * Math.cos(th), R * Math.cos(phi) * Math.sin(th)).addScaledVector(n, out)
      return { p, q: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n) }
    }
    function buildSpecs(kind) {
      for (const c of specs.children) c.geometry.dispose()
      specs.clear()
      if (kind === 'none') return
      const T = 0.016 * Math.min(1.3, small)
      const add = (geo, th, phi, out, mat = brass) => { const { p, q } = onDome(th, phi, out); const m = new THREE.Mesh(geo, mat); m.position.copy(p); m.quaternion.copy(q); specs.add(m); return m }
      if (kind === 'monocle') {
        const r = 0.19
        add(new THREE.TorusGeometry(r, T * 1.2, 10, 40), EYE_TH, -EYE_PHI, 0.06)
        add(new THREE.CircleGeometry(r, 32), EYE_TH, -EYE_PHI, 0.055, lensMat)
        // chain: from the rim down the dome to the lip
        const pts = []
        for (let i = 0; i <= 12; i++) { const k = i / 12; const th = EYE_TH + 0.2 + k * (Math.PI / 2 - EYE_TH - 0.12); const phi = -EYE_PHI - 0.13 - k * 0.42; pts.push(onDome(th, phi, 0.012 + 0.04 * (1 - k)).p) }
        add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, T * 0.42, 5, false), 0, 0, 0).position.set(0, 0, 0)
        specs.children[specs.children.length - 1].quaternion.identity()
      } else if (kind === 'round') {
        for (const s of [-1, 1]) add(new THREE.TorusGeometry(0.17, T, 10, 40), EYE_TH, s * EYE_PHI, 0.05)
        add(new THREE.TorusGeometry(0.07, T * 0.85, 8, 16, Math.PI), EYE_TH - 0.02, 0, 0.06).rotation.z = 0
      } else if (kind === 'half-moon') {
        for (const s of [-1, 1]) {
          const m = add(new THREE.TorusGeometry(0.17, T, 10, 30, Math.PI), EYE_TH + 0.1, s * EYE_PHI, 0.05)
          m.rotateZ(Math.PI)
        }
        add(new THREE.TorusGeometry(0.06, T * 0.85, 8, 16, Math.PI), EYE_TH + 0.06, 0, 0.055)
      }
    }

    /* look */
    const body = new THREE.Color(), ink = new THREE.Color(), sig = new THREE.Color(), tmp = new THREE.Color()
    let inkCss = '#000', hiCss = 'rgba(255,255,255,.85)', dark = false, eyeStyle = 'pills', graphite = false
    const PALETTE = ['#ffffff', BRASS, '#ff8a7a', '#7fd9b4', '#8fb8ff', '#ffd36e']
    function setLook(l) {
      const tn = l.tint
      dark = l.dark
      graphite = tn.key === 'graphite'
      // The studio lights are bright (env + key + fill), so the albedo sits about a stop under the color we want to see.
      if (graphite) body.copy(tn.glass).lerp(tn.ink, 0.8).multiplyScalar(0.36)
      else body.copy(tn.glass).lerp(tn.glow, 0.95).lerp(tn.ink, 0.08).multiplyScalar(0.52)
      bodyMat.color.copy(body)
      bodyMat.sheen = 0.3
      bodyMat.sheenColor.copy(tn.soft)
      kit.updateSolid(bodyMat, l, { clearcoat: 0.25 + 0.55 * (1 - l.frost) }) // always a little enamel glaze
      if (graphite) { bodyMat.sheen = 0.35; bodyMat.sheenColor.set('#9aa6bc') }
      kit.updateGlass(beadMat, l, BEAD_GLASS)
      ink.copy(graphite ? new THREE.Color('#f3eee4') : tn.ink.clone().lerp(new THREE.Color(0, 0, 0), 0.38))
      inkCss = '#' + ink.getHexString()
      hiCss = graphite ? 'rgba(255,255,255,0)' : 'rgba(255,255,255,.8)'
      // Signal light (ripples, bead): bright in the dark, deeper on light panels so it still reads.
      if (graphite) sig.set(dark ? '#cfe0ff' : '#5f86c8')
      else sig.copy(tn.glow).lerp(dark ? new THREE.Color(1, 1, 1) : tn.ink, dark ? 0.12 : 0.18)
      rimMat.uniforms.color.value.copy(dark ? tn.glow : new THREE.Color(1, 1, 1)).lerp(new THREE.Color(1, 1, 1), dark ? 0.35 : 0)
      rimMat.uniforms.intensity.value = dark ? 0.75 : 0.42
      shadowMat.opacity = dark ? 0.95 : 0.8
      zz.material.color.copy(dark ? tn.soft : tn.ink)
      for (let i = 0; i < NC; i++) confetti.setColorAt(i, tmp.set(i % 7 === 6 ? '#' + tn.glow.getHexString() : PALETTE[i % PALETTE.length]))
      confetti.instanceColor.needsUpdate = true
      bowMat.color.set(graphite ? '#5c1f2c' : '#1a1c23')
      bowMat.sheenColor.set(graphite ? '#c07a88' : '#8890a8')
      eyeStyle = l.eyes || 'pills'
      if (specKind !== (l.glasses || 'none')) { specKind = l.glasses || 'none'; buildSpecs(specKind) }
      faceKey = NaN
    }

    /* face drawing */
    let faceKey = NaN
    const cur = { ...POSE.idle }
    function eyeShape(x, y, s, o, lid, slant) {
      // the open eye, clipped by an upper lid that can slant toward the outer corner
      const ew = (eyeStyle === 'dots' ? 62 : eyeStyle === 'arcs' ? 78 : 50) * s
      const eh = (eyeStyle === 'dots' ? 62 : eyeStyle === 'arcs' ? 52 : 96) * s * Math.max(0.12, Math.min(1.15, o))
      g.save()
      if (lid > 0.01) {
        const top = y - eh / 2 + eh * lid, d = slant * eh * 0.32
        g.beginPath(); g.moveTo(x - 80, top - d * (x < FW / 2 ? -1 : 1)); g.lineTo(x + 80, top + d * (x < FW / 2 ? -1 : 1)); g.lineTo(x + 80, y + 200); g.lineTo(x - 80, y + 200); g.closePath(); g.clip()
      }
      g.beginPath()
      if (eyeStyle === 'dots') g.ellipse(x, y, ew / 2, eh / 2, 0, 0, Math.PI * 2)
      else if (eyeStyle === 'arcs') { g.moveTo(x - ew / 2, y + eh * 0.45); g.ellipse(x, y + eh * 0.45, ew / 2, eh, 0, Math.PI, Math.PI * 2); g.closePath() }
      else g.roundRect(x - ew / 2, y - eh / 2, ew, eh, Math.min(ew, eh) / 2)
      g.fillStyle = inkCss
      g.fill()
      if (o > 0.45) { g.fillStyle = hiCss; g.beginPath(); g.ellipse(x - ew * 0.16, y - eh * 0.2, 7 * s, 9 * s, -0.3, 0, Math.PI * 2); g.fill() }
      g.restore()
      if (lid > 0.3 || slant > 0.5) {
        // the lid line (heavy lids only: on light lids it reads as a scowl)
        const top = y - eh / 2 + eh * lid, d = slant * eh * 0.32, sd = x < FW / 2 ? -1 : 1
        g.beginPath(); g.moveTo(x - ew * 0.68, top - d * sd - 2); g.lineTo(x + ew * 0.68, top + d * sd - 2)
        g.lineWidth = 9 * s; g.stroke()
      }
    }
    function drawFace(f, mood, lod) {
      const s = lod * 1.14
      const lx = f.lookX * 26, ly = f.lookY * 22
      g.clearRect(0, 0, FW, FH)
      g.lineCap = g.lineJoin = 'round'
      g.strokeStyle = g.fillStyle = inkCss
      const o = f.open * f.blink
      for (const side of [-1, 1]) {
        const x = FW / 2 + side * EX * (s > 1 ? 1.04 : 1) + lx, y = EY + ly
        // brows
        const bw = 38 * s, inner = x - side * bw, outer = x + side * bw
        const by = y - 66 * s + cur.browY - (side > 0 ? cur.browR : 0)
        g.lineWidth = 12 * s
        g.beginPath(); g.moveTo(inner, by - cur.browIn); g.quadraticCurveTo(x, by - 10 * s - (cur.browIn + cur.browOut) / 2 - (side > 0 ? cur.browR * 0.3 : 0), outer, by - cur.browOut); g.stroke()
        // eyes
        g.lineWidth = 12 * s
        if (mood === 'resting') { g.beginPath(); g.arc(x, y - 14 * s, 27 * s, Math.PI * 0.16, Math.PI * 0.84); g.stroke() }
        else if (mood === 'done' || mood === 'celebrating') { g.beginPath(); g.arc(x, y + 18 * s, 30 * s, Math.PI * 1.14, Math.PI * 1.86); g.stroke() }
        else eyeShape(x, y, s, o, cur.lid, cur.slant)
      }
      // mouth
      const mx = FW / 2 + lx * 0.7, my = MY + ly * 0.8 - (s > 1 ? 4 : 0)
      g.lineWidth = 10 * s
      g.beginPath()
      switch (mood) {
        case 'talking': { const w = 36 * s, h = Math.max(10 * s, (0.25 + f.level * 0.75) * 46 * s); g.moveTo(mx - w, my - 4 * s); g.lineTo(mx + w, my - 4 * s); g.quadraticCurveTo(mx + w, my + h, mx, my + h); g.quadraticCurveTo(mx - w, my + h, mx - w, my - 4 * s); g.fill(); break } // an open "D"
        case 'done': g.moveTo(mx - 34 * s, my - 8 * s); g.quadraticCurveTo(mx, my + 28 * s, mx + 34 * s, my - 8 * s); g.stroke(); break
        case 'celebrating': g.moveTo(mx - 34 * s, my - 10 * s); g.quadraticCurveTo(mx, my + 52 * s, mx + 34 * s, my - 10 * s); g.closePath(); g.fill(); break
        case 'needs-you': g.ellipse(mx, my + 2, 12 * s, 15 * s, 0, 0, Math.PI * 2); g.fill(); break
        case 'worried': { const x0 = mx - 30 * s, step = 15 * s; g.moveTo(x0, my); for (let i = 1; i <= 4; i++) g.quadraticCurveTo(x0 + (i - 0.5) * step, my + (i % 2 ? -9 : 9) * s, x0 + i * step, my); g.stroke(); break }
        case 'thinking': g.moveTo(mx + 6 * s, my + 2); g.lineTo(mx + 30 * s, my - 4 * s); g.stroke(); break
        case 'sleepy': g.ellipse(mx, my + 2, 8 * s, 10 * s, 0, 0, Math.PI * 2); g.fill(); break
        case 'resting': g.moveTo(mx - 16 * s, my); g.quadraticCurveTo(mx, my + 9 * s, mx + 16 * s, my); g.stroke(); break
        case 'listening': g.moveTo(mx - 14 * s, my + 2); g.lineTo(mx + 14 * s, my + 2); g.stroke(); break
        default: g.moveTo(mx - 24 * s, my + 1); g.quadraticCurveTo(mx + 2 * s, my + 13 * s, mx + 26 * s, my - 8 * s); g.stroke() // a composed half-smile
      }
      faceTex.needsUpdate = true
    }

    setLook(look)
    let lastT = -1, inited = false
    const dummyPos = new THREE.Vector3()
    return {
      object,
      update(f) {
        const P = POSE[f.mood] || POSE.idle
        const snap = !inited || f.t <= lastT || f.t - lastT > 0.5
        inited = true
        lastT = f.t
        const k = snap ? 1 : 1 - Math.exp(-7 * f.dt)
        for (const key of KEYS) cur[key] += (P[key] - cur[key]) * k
        const t = f.rm ? 0.35 : f.t
        const A = 0.78 + 0.28 * (f.P - 0.55) // personality: calm .78, lively 1
        const mood = f.mood
        const still = f.rm

        // ring cycle: needs-you rings every 1.5 s, celebrating double-rings every 1.2 s
        let dip = 0, shiver = 0, ripAmt = 0, period = 1.5
        if (mood === 'needs-you' || mood === 'celebrating') {
          period = mood === 'celebrating' ? 1.2 : 1.5
          const ph = frac(t / period) * period
          const strike = (x) => (x >= 0 && x < 0.16 ? Math.sin((x / 0.16) * Math.PI) : 0)
          dip = strike(ph) + (mood === 'celebrating' ? strike(ph - 0.26) : 0)
          const sh = (x) => (x >= 0 ? Math.exp(-x * 7) : 0)
          shiver = (sh(ph) + (mood === 'celebrating' ? sh(ph - 0.26) : 0)) * Math.sin(t * 70)
          ripAmt = mood === 'needs-you' ? 1 : 0 // celebrating keeps the double ring but no arcs, so the two never look alike
        }
        if (still) { dip = 0; shiver = 0 }

        // posture
        let tilt = cur.tilt, lean = cur.lean, sq = cur.sq
        if (mood === 'worried' && !still) tilt += (Math.sin(t * 41) * 0.012 + Math.sin(t * 27) * 0.008) * A
        if (mood === 'sleepy' && !still) { tilt += Math.sin(t * 0.8) * 0.03; sq += Math.sin(t * 0.9) * 0.012 }
        if (mood === 'celebrating' && !still) tilt += Math.sin(t * 6.5) * 0.06 * A
        if (mood === 'done' && f.moodAge < 1 && !still) lean += Math.sin(clamp01(f.moodAge / 0.7) * Math.PI) * 0.12
        if (mood === 'talking') sq += f.level * 0.035
        if ((mood === 'resting' || mood === 'idle') && !still) sq += Math.sin(t * (mood === 'resting' ? 0.9 : 1.4)) * 0.006
        tilt += shiver * 0.035 * A
        // The whole bell leans and tilts (a dome tilting alone would lift off or sink into the plinth); only the shiver is the dome's.
        hop.rotation.set(lean * 0.8, 0, tilt - shiver * 0.035 * A)
        domeG.rotation.set(0, f.lookX * (mood === 'listening' ? 0.06 : 0.14) * (still ? 0.5 : 1), shiver * 0.035 * A)
        domeG.scale.set(1 + (1 - sq) * 0.45, sq, 1 + (1 - sq) * 0.45)
        // pivot on the bottom of the plinth, so the bell rocks on its base instead of swinging around its middle
        const pz = hop.rotation.z, px = hop.rotation.x
        hop.position.set(PIVOT * Math.sin(pz), PIVOT * (1 - Math.cos(pz) * Math.cos(px)) - f.bounce * 0.95, -PIVOT * Math.sin(px))

        // plunger: dips when it rings, turns like a dial while thinking
        plunger.position.y = TOP - dip * 0.075
        plunger.rotation.y = mood === 'thinking' ? (still ? 0.9 : t * 1.6) : plunger.rotation.y * (snap ? 0 : 1 - k)

        // bead light
        let glowAmt = cur.glow
        if (mood === 'needs-you' && !still) glowAmt *= 0.75 + 0.25 * Math.sin(t * 7)
        if (mood === 'talking') glowAmt = 0.25 + f.level * 0.55
        if (mood === 'celebrating' && !still) glowAmt *= 0.8 + 0.2 * Math.sin(t * 13)
        glowAmt = Math.max(glowAmt, dip * 1.1)
        tmp.copy(sig).lerp(AMBER, f.warm)
        coreMat.color.copy(tmp).multiplyScalar(0.6 + glowAmt * 1.6)
        core.scale.setScalar(0.25 + glowAmt * 0.95)
        core.visible = glowAmt > 0.04
        if (mood === 'thinking') core.position.set(Math.cos(t * 3) * 0.07, bead.position.y + 0.02, Math.sin(t * 3) * 0.07)
        else core.position.set(0, bead.position.y, 0)
        beadMat.emissive.copy(tmp).multiplyScalar(glowAmt * 0.55)
        // the rim warms when worried
        if (f.warm > 0.02) rimMat.uniforms.color.value.copy(dark ? look.tint.glow : tmp.set(1, 1, 1)).lerp(AMBER, f.warm * 0.85)

        // sound arcs
        const ding = mood === 'done' && f.moodAge < 1.2 && !still
        for (const m of ripples) {
          const kk = m.userData.k
          let p, a
          if (mood === 'worried') {
            // nervous shake marks hugging the dome sides
            m.visible = true
            m.scale.setScalar(0.42 + kk * 0.14)
            m.position.set(m.userData.s * (0.6 - kk * 0.02), LIP + 0.62, 0)
            m.material.color.copy(AMBER)
            m.material.opacity = still ? 0.85 - kk * 0.3 : (0.55 + 0.45 * Math.abs(Math.sin(t * 9 + kk))) * (0.9 - kk * 0.3)
            continue
          }
          if (ding) { if (kk) { m.visible = false; continue } p = f.moodAge / 1.2; a = 0.8 }
          else if (ripAmt > 0) { p = still ? 0.3 + kk * 0.35 : frac(t / period * (mood === 'celebrating' ? 1 : 0.85) + kk * 0.5); a = ripAmt }
          else { m.visible = false; continue }
          m.visible = true
          const sc = (0.3 + p * (size === 'peek' ? 0.42 : 0.6))
          m.scale.setScalar(sc)
          m.material.color.copy(sig).lerp(AMBER, f.warm)
          m.material.opacity = Math.sin(Math.min(1, p) * Math.PI) ** 0.7 * a
          m.position.set(0, BEAD_Y - 0.08 - dip * 0.05, 0)
        }

        // confetti
        confetti.visible = f.spark > 0.05
        if (confetti.visible) {
          const by = BASE_TOP + BEAD_Y
          for (let i = 0; i < NC; i++) {
            const c = cseed[i]
            const p = still ? (0.25 + c.off * 0.6) : frac(t / 1.7 + c.off)
            const tt = p * 1.7
            dummyPos.set(Math.cos(c.a) * c.v * tt * 0.95, by + Math.sin(c.a) * 0.3 + Math.sin(c.a) * c.v * 1.5 * tt - 1.55 * tt * tt, 0.25 + Math.sin(i) * 0.3)
            dummyPos.y = Math.max(dummyPos.y, BASE_TOP - 0.25)
            dummy.position.copy(dummyPos)
            dummy.rotation.set(tt * c.spin, tt * c.spin * 0.7, c.a * 3)
            dummy.scale.setScalar(f.spark * Math.min(1, (1 - p) * 4) * Math.min(1, p * 12 + 0.2) * (size === 'peek' ? 1.2 : 1))
            dummy.updateMatrix()
            confetti.setMatrixAt(i, dummy.matrix)
          }
          confetti.instanceMatrix.needsUpdate = true
        }

        // zz
        const zOn = mood === 'sleepy'
        zz.visible = zOn
        if (zOn) {
          const p = still ? 0.45 : frac(t / 2.6)
          zz.position.set(0.72 + p * 0.22, BASE_TOP + TOP + 0.05 + p * 0.38, 0.3)
          zz.material.opacity = Math.sin(p * Math.PI) * 0.95
        }

        // face (redrawn only when it changes)
        const lod = small
        let key = MOOD_IDS.indexOf(f.mood)
        key = hk(hk(hk(hk(hk(hk(hk(hk(hk(key, f.open * f.blink), f.lookX), f.lookY), f.level), cur.browY / 30), cur.lid), cur.browIn / 30), cur.browR / 30), cur.slant)
        if (key !== faceKey) { faceKey = key; drawFace(f, f.mood, lod) }
      },
      setLook(l) { look = l; setLook(l) },
      dispose() {
        for (const c of specs.children) c.geometry.dispose()
        for (const x of geos) x.dispose()
        for (const x of mats) x.dispose()
        for (const x of texs) x.dispose()
      },
    }
  },
}
