// Visor Pro: a premium evolution of the Visor bot. A frosted glass helmet with an anodized aluminum bezel and
// ear discs, a deep glossy smoked visor, and a face made of a dot-matrix of small LEDs (Nothing Glyph /
// Teenage Engineering) that form the eyes and a small mouth glyph per mood. A tiny status LED sits on the bezel.
//
// Build notes
// - One transmissive mesh (the shell). The visor module, bezel and ear discs are opaque, so the shell refracts the
//   module's dark back end like the inside of a transparent gadget.
// - The face is two InstancedMeshes: LED dots (opaque, unlit) and their additive halos. Every frame each dot's
//   brightness comes from a small signed-distance field (eyes + mouth glyph), so shapes slide smoothly across the
//   grid. The grid is coarser with bigger dots at peek and header sizes, so the shapes stay legible at 50x44.
// - Mood blends come from face.moodAge (prev mood -> mood), not internal state, so mood-sheet stills are exact.
import * as THREE from 'three'

const TAU = Math.PI * 2
const WARM = new THREE.Color('#ffae5c')
const WHITE = new THREE.Color(1, 1, 1)
const DONE_GREEN = new THREE.Color('#5ee0a6')
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v)
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t) }

/* ---------------- dimensions (world units) ---------------- */
const SHELL = { a: 1.13, b: 1.0, c: 0.76, n: 3.4, m: 2.6, taper: 0.06 }
const VIS = { w: 1.66, h: 0.9, r: 0.38, y: -0.08, zFront: 0.83, depth: 0.22 }
const BEZ = { m: 0.075 } // bezel margin around the visor
const MAT_HH = 0.33 // half-height of the LED field on the visor (world)
// grid per size: rows, dot radius as a fraction of the pitch, eye scale (features grow at small sizes)
const GRID = { big: { rows: 13, dot: 0.34, k: 1 }, header: { rows: 9, dot: 0.4, k: 1.12 }, peek: { rows: 7, dot: 0.44, k: 1.22 } }

// Rounded rectangle as explicit points (no duplicated start/end point, which leaves a notch in extrusions).
function roundRect(shape, w, h, r, seg = 10) {
  const pts = []
  const cs = [[w / 2 - r, h / 2 - r, 0], [-w / 2 + r, h / 2 - r, 0.5], [-w / 2 + r, -h / 2 + r, 1], [w / 2 - r, -h / 2 + r, 1.5]]
  for (const [cx, cy, a0] of cs) for (let i = 0; i <= seg; i++) { const a = (a0 + (i / seg) * 0.5) * Math.PI; pts.push(new THREE.Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r)) }
  shape.setFromPoints(pts)
  return shape
}

// Helmet shell: a superellipsoid, (|x/a|^n + |y/b|^n)^(m/n) + |z/c|^m = 1, with analytic normals so the glass
// refracts smoothly (a rounded box's flat-to-curve facets show up as blocky bands through transmission).
function helmetGeometry({ a, b, c, n, m, taper }, ws, hs) {
  const g = new THREE.SphereGeometry(1, ws, hs)
  const pos = g.attributes.position, nor = g.attributes.normal
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    const dx = pos.getX(i), dy = pos.getY(i), dz = pos.getZ(i)
    const F = Math.pow(Math.pow(Math.abs(dx) / a, n) + Math.pow(Math.abs(dy) / b, n), m / n) + Math.pow(Math.abs(dz) / c, m)
    const r = Math.pow(F, -1 / m)
    const x = dx * r, y = dy * r, z = dz * r
    const px = Math.abs(x) / a, py = Math.abs(y) / b, pz = Math.abs(z) / c
    const sum = Math.pow(px, n) + Math.pow(py, n)
    const k = sum > 1e-9 ? Math.pow(sum, m / n - 1) : 0
    v.set(k * Math.pow(px, n - 1) * Math.sign(x) / a, k * Math.pow(py, n - 1) * Math.sign(y) / b, Math.pow(pz, m - 1) * Math.sign(z) / c).normalize()
    // narrower at the crown
    const yy = Math.max(0, y / b)
    pos.setXYZ(i, x * (1 - taper * yy * yy), y, z)
    nor.setXYZ(i, v.x, v.y, v.z)
  }
  g.computeBoundingSphere()
  return g
}

/* ---------------- signed distances in face space (y up, LED field half-height = 1) ---------------- */
function sdRoundRect(x, y, hw, hh, r) {
  const qx = Math.abs(x) - hw + r, qy = Math.abs(y) - hh + r
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
}
// ring segment centered at (cx, cy) with radius R, half-thickness th, spanning angles a0..a1 (radians, CCW)
function sdArc(x, y, cx, cy, R, th, a0, a1) {
  const dx = x - cx, dy = y - cy
  let a = Math.atan2(dy, dx)
  if (a < a0) a += TAU
  if (a >= a0 && a <= a1) return Math.abs(Math.hypot(dx, dy) - R) - th
  const e0x = cx + Math.cos(a0) * R, e0y = cy + Math.sin(a0) * R, e1x = cx + Math.cos(a1) * R, e1y = cy + Math.sin(a1) * R
  return Math.min(Math.hypot(x - e0x, y - e0y), Math.hypot(x - e1x, y - e1y)) - th
}

function starTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  const rg = g.createRadialGradient(32, 32, 0, 32, 32, 12)
  rg.addColorStop(0, 'rgba(255,255,255,1)')
  rg.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = rg
  g.fillRect(0, 0, 64, 64)
  g.fillStyle = '#fff'
  for (const rot of [0, Math.PI / 2]) {
    g.save(); g.translate(32, 32); g.rotate(rot)
    g.beginPath(); g.moveTo(-30, 0); g.quadraticCurveTo(0, 2.2, 30, 0); g.quadraticCurveTo(0, -2.2, -30, 0); g.fill()
    g.restore()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

// subtle glossy reflection streak across the top of the visor
function glossTexture() {
  const c = document.createElement('canvas')
  c.width = 4
  c.height = 64
  const g = c.getContext('2d')
  const lg = g.createLinearGradient(0, 0, 0, 64)
  lg.addColorStop(0, 'rgba(255,255,255,0.55)')
  lg.addColorStop(0.18, 'rgba(255,255,255,0.16)')
  lg.addColorStop(0.42, 'rgba(255,255,255,0)')
  lg.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = lg
  g.fillRect(0, 0, 4, 64)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

const SPARKS = 7

export default {
  id: 'visor-pro',
  name: 'Visor Pro',
  vibe: 'A frosted glass helmet with an anodized band and a smoked visor; its eyes are a dot-matrix of warm LEDs.',
  eyes: ['pills', 'dots', 'arcs'],
  frame: { height: 2.6, y: 0.02, header: { height: 2.35, y: 0.02 }, peek: { height: 2.2, y: 0.02 } },
  create({ kit, look, size }) {
    const G = GRID[size] || GRID.big
    const object = new THREE.Group()
    const head = new THREE.Group()
    object.add(head)
    const disposables = []
    const keep = (x) => (disposables.push(x), x)
    // Opaque parts stay out of the shell's transmission pass, so the frosted glass refracts only the panel
    // behind it (a dark visor seen through thick glass turns the whole shell navy).
    const outOfGlass = (mesh) => {
      mesh.onBeforeRender = (r) => { const inT = r.getRenderTarget() !== null; mesh.material.colorWrite = !inT; mesh.material.depthWrite = !inT }
      return mesh
    }

    /* ---- shell: frosted glass, slightly narrower at the crown ---- */
    const shellGeo = keep(helmetGeometry(SHELL, size === 'big' ? 96 : 56, size === 'big' ? 64 : 40))
    const shellMat = keep(kit.glass(look, { thickness: 0.55, iridescence: 0.18 }))
    const shell = new THREE.Mesh(shellGeo, shellMat)
    const rimMat = keep(kit.rim('#ffffff', { power: 2.2, intensity: 0.6 }))
    const rim = new THREE.Mesh(shellGeo, rimMat)
    rim.scale.setScalar(1.004)
    head.add(shell, rim)

    /* ---- visor module: deep smoked glossy glass (opaque, so the shell refracts it) ---- */
    const visorGeo = keep(new THREE.ExtrudeGeometry(roundRect(new THREE.Shape(), VIS.w, VIS.h, VIS.r), { depth: VIS.depth, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.02, bevelSegments: 3 }))
    visorGeo.translate(0, 0, VIS.zFront - VIS.depth - 0.025)
    const visorMat = keep(new THREE.MeshPhysicalMaterial({ color: '#07090d', roughness: 0.16, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.3 }))
    const visor = new THREE.Mesh(visorGeo, visorMat)
    const faceGrp = new THREE.Group()
    faceGrp.position.y = VIS.y
    head.add(faceGrp)
    faceGrp.add(outOfGlass(visor))

    /* ---- anodized aluminum bezel around the visor ---- */
    const bw = VIS.w + BEZ.m * 2, bh = VIS.h + BEZ.m * 2
    const bShape = roundRect(new THREE.Shape(), bw, bh, VIS.r + BEZ.m)
    bShape.holes.push(roundRect(new THREE.Path(), VIS.w + 0.01, VIS.h + 0.01, VIS.r))
    const bezelGeo = keep(new THREE.ExtrudeGeometry(bShape, { depth: 0.42, bevelEnabled: true, bevelThickness: 0.028, bevelSize: 0.024, bevelSegments: 3 }))
    bezelGeo.translate(0, 0, VIS.zFront - 0.42 + 0.012)
    const metalMat = keep(new THREE.MeshPhysicalMaterial({ metalness: 1, roughness: 0.34, clearcoat: 0.3, clearcoatRoughness: 0.3 }))
    const bezel = new THREE.Mesh(bezelGeo, metalMat)
    faceGrp.add(outOfGlass(bezel))

    /* ---- Glyph strip: a light line set into the bezel. Off, it reads as a fine seam. ---- */
    const [gi, go] = size === 'peek' ? [0.016, 0.07] : size === 'header' ? [0.024, 0.062] : [0.033, 0.052] // inner/outer offset from the visor edge
    const gShape = roundRect(new THREE.Shape(), VIS.w + go * 2, VIS.h + go * 2, VIS.r + go)
    gShape.holes.push(roundRect(new THREE.Path(), VIS.w + gi * 2, VIS.h + gi * 2, VIS.r + gi))
    const glyphGeo = keep(new THREE.ShapeGeometry(gShape, 24))
    const glyphMat = keep(new THREE.ShaderMaterial({
      uniforms: { seam: { value: new THREE.Color() }, col: { value: new THREE.Color() }, base: { value: 0 }, seg: { value: 0 }, head: { value: 0 }, len: { value: 0.3 }, count: { value: 1 }, rainbow: { value: 0 } },
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
      fragmentShader: `uniform vec3 seam; uniform vec3 col; uniform float base, seg, head, len, count, rainbow; varying vec2 vP;
        vec3 hue(float h){ return clamp(abs(mod(h * 6. + vec3(0., 4., 2.), 6.) - 3.) - 1., 0., 1.); }
        void main(){
          float s = fract(atan(vP.y, vP.x * 0.55) / 6.2831853 + 1.);
          float d = fract((head - s) * count);
          float b = base + seg * pow(max(0., 1. - d / len), 1.7);
          vec3 c = mix(col, mix(col, hue(s * 2. - head * 0.5), 0.75), rainbow);
          gl_FragColor = vec4(mix(seam, c * 1.5, min(b, 1.)) + c * max(b - 1., 0.), 1.);
          #include <colorspace_fragment>
        }`,
    }))
    const glyph = new THREE.Mesh(glyphGeo, glyphMat)
    glyph.position.z = VIS.zFront + 0.042
    faceGrp.add(outOfGlass(glyph))

    /* ---- ear discs: aluminum with a light ring ---- */
    const earGeo = keep(new THREE.CylinderGeometry(0.34, 0.34, 0.16, 40, 1))
    earGeo.rotateZ(Math.PI / 2)
    const earCapGeo = keep(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 28, 1))
    earCapGeo.rotateZ(Math.PI / 2)
    const earLightMat = keep(kit.light(look.tint.glow, 1))
    const ears = [-1, 1].map((s) => {
      const g = new THREE.Group()
      const disc = new THREE.Mesh(earGeo, metalMat)
      const cap = new THREE.Mesh(earCapGeo, earLightMat)
      cap.position.x = s * 0.08
      g.add(outOfGlass(disc), outOfGlass(cap))
      g.position.set(s * (SHELL.a - 0.03), -0.04, -0.04)
      head.add(g)
      return g
    })

    /* ---- status LED on the bezel's top edge ---- */
    const ledGeo = keep(new THREE.SphereGeometry(0.03, 12, 8))
    const ledMat = keep(kit.light('#ffffff', 1))
    const led = new THREE.Mesh(ledGeo, ledMat)
    const ledPos = new THREE.Vector3(0.5, VIS.h / 2 + BEZ.m + 0.1, 0.72)
    led.position.copy(ledPos)
    const ledGlow = kit.glowSprite('#ffffff', 0.3, 0.8)
    keep(ledGlow.material)
    ledGlow.position.copy(ledPos).z += 0.02
    faceGrp.add(outOfGlass(led), ledGlow)

    /* ---- LED matrix ---- */
    const rows = G.rows
    const pitchN = 2 / (rows - 1) // pitch in face units (field half-height = 1)
    const S = MAT_HH // world per face unit
    const fieldHW = (VIS.w / 2 - 0.1) / S // field half-width in face units
    const cols = Math.floor((fieldHW * 2) / pitchN) + 1
    const dots = []
    const maskHW = (VIS.w / 2 - 0.06) / S, maskHH = (VIS.h / 2 - 0.06) / S, maskR = (VIS.r - 0.05) / S
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const x = (i - (cols - 1) / 2) * pitchN, y = (j - (rows - 1) / 2) * pitchN
        if (sdRoundRect(x, y, maskHW, maskHH, maskR) < -pitchN * 0.45) dots.push(x, y)
      }
    }
    const N = dots.length / 2
    const dotR = G.dot * pitchN * S
    const dotGeo = keep(new THREE.CircleGeometry(dotR, size === 'big' ? 14 : 8))
    const dotMat = keep(new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }))
    const ledDots = new THREE.InstancedMesh(dotGeo, dotMat, N)
    const haloGeo = keep(new THREE.PlaneGeometry(1, 1))
    const haloMat = keep(new THREE.MeshBasicMaterial({ map: kit.glowTex, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
    const halos = new THREE.InstancedMesh(haloGeo, haloMat, N)
    const m4 = new THREE.Matrix4()
    const hs = pitchN * S * (size === 'peek' ? 2.6 : 3.0)
    const zLed = VIS.zFront + 0.006
    for (let k = 0; k < N; k++) {
      const wx = dots[2 * k] * S, wy = dots[2 * k + 1] * S
      m4.makeTranslation(wx, wy, zLed)
      ledDots.setMatrixAt(k, m4)
      m4.makeScale(hs, hs, 1).setPosition(wx, wy, zLed + 0.004)
      halos.setMatrixAt(k, m4)
    }
    const black = new THREE.Color(0, 0, 0)
    for (let k = 0; k < N; k++) { ledDots.setColorAt(k, black); halos.setColorAt(k, black) }
    halos.renderOrder = 2
    faceGrp.add(outOfGlass(ledDots), halos)

    // glossy reflection over the visor, in front of the LEDs
    const glossTex = keep(glossTexture())
    const glossGeo = keep(new THREE.ShapeGeometry(roundRect(new THREE.Shape(), VIS.w - 0.03, VIS.h - 0.03, VIS.r - 0.015), 10))
    {
      // map uv from the shape's xy bounds
      const p = glossGeo.attributes.position, uv = glossGeo.attributes.uv
      for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + VIS.w / 2) / VIS.w, (p.getY(i) + VIS.h / 2) / VIS.h)
    }
    glossTex.flipY = true
    const glossMat = keep(new THREE.MeshBasicMaterial({ map: glossTex, transparent: true, depthWrite: false, opacity: 0.5 }))
    const gloss = new THREE.Mesh(glossGeo, glossMat)
    gloss.position.z = VIS.zFront + 0.014
    gloss.renderOrder = 3
    faceGrp.add(gloss)

    /* ---- celebration sparkles ---- */
    const sparkTex = keep(starTexture())
    const sparkMat = keep(new THREE.MeshBasicMaterial({ map: sparkTex, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
    const sparks = new THREE.InstancedMesh(haloGeo, sparkMat, SPARKS)
    const sparkSeeds = Array.from({ length: SPARKS }, (_, i) => ({ a: (i / SPARKS) * TAU + 0.35 * Math.sin(i * 7.1), r: 1.28 + 0.12 * ((i * 0.618) % 1), ph: (i * 0.383) % 1, s: 0.22 + 0.12 * ((i * 0.71) % 1) }))
    sparks.renderOrder = 4
    sparks.frustumCulled = false
    object.add(sparks)

    /* ---- look ---- */
    const eyeCol = new THREE.Color(), eyeHot = new THREE.Color(), offCol = new THREE.Color(), tmp = new THREE.Color(), haloCol = new THREE.Color()
    const glassBase = new THREE.Color(), glassAtt = new THREE.Color()
    let L = look
    function applyLook(l) {
      L = l
      kit.updateGlass(shellMat, l)
      glassBase.copy(shellMat.color)
      // anodized: silver nudged toward the tint; graphite is a dark gunmetal
      if (l.tint.key === 'graphite') metalMat.color.set('#6b717c')
      else metalMat.color.set('#e4e7ec').lerp(l.tint.glow, 0.16)
      // warm tints read as skin in milky glass: pull them toward clear
      shellMat.color.lerp(WHITE, l.tint.key === 'peach' ? 0.55 : l.tint.key === 'mint' ? 0.2 : 0)
      shellMat.attenuationColor.lerp(WHITE, l.tint.key === 'peach' ? 0.5 : 0)
      glassBase.copy(shellMat.color)
      glassAtt.copy(shellMat.attenuationColor)
      metalMat.roughness = 0.3 + 0.08 * l.frost
      visorMat.color.set('#05070a').lerp(l.tint.ink, 0.08)
      rimMat.uniforms.intensity.value = l.dark ? 0.45 : 0.75
      glossMat.opacity = l.dark ? 0.32 : 0.5
      sparkMat.blending = l.dark ? THREE.AdditiveBlending : THREE.NormalBlending
      sparkMat.needsUpdate = true
      glyphMat.uniforms.seam.value.copy(metalMat.color).multiplyScalar(l.tint.key === 'graphite' ? 0.35 : 0.42)
    }
    applyLook(look)

    /* ---- per-mood face fields ---- */
    let fk = 1 // feature scale for this size
    fk = G.k
    const EX = 0.62 * Math.min(fk, 1.1), EY = 0.16
    // eye: returns signed distance for a dot at (x, y) given the mood and the eye's side
    function eyeSD(mood, x, y, s, f, P) {
      const ex = s * EX + f.lookX * 0.42, ey = EY - f.lookY * 0.3
      const open = Math.max(0.05, f.open * f.blink)
      const style = L.eyes
      const k = fk
      switch (mood) {
        case 'resting': return sdArc(x, y, ex, ey + 0.2 * k, 0.32 * k, 0.07 * k + pitchN * 0.12, Math.PI * 1.15, Math.PI * 1.85)
        case 'done': case 'celebrating': {
          const lift = mood === 'celebrating' ? 0.08 : 0
          return sdArc(x, y, ex, ey - 0.2 * k + lift, 0.34 * k, 0.085 * k + pitchN * 0.12, Math.PI * 0.12, Math.PI * 0.88)
        }
        case 'sleepy': {
          // heavy lids: a wide low slit, flat on top, sagging outward
          const hh = 0.2 * k * clamp(open / 0.32, 0.3, 1.2)
          const d = sdRoundRect(x - ex, y - (ey - 0.12), 0.25 * k, hh, Math.min(0.25 * k, hh))
          const lid = y - (ey - 0.12 + hh * 0.2 - (x - ex) * s * 0.18)
          return Math.max(d, lid)
        }
        case 'needs-you': {
          const r = 0.36 * k * (1 + 0.06 * Math.sin(f.t * 7) * (f.rm ? 0 : 1))
          return Math.hypot(x - ex, (y - ey) / Math.max(0.15, Math.min(1, open))) - r
        }
        case 'worried': {
          const hw = 0.17 * k, hh = Math.max(0.06, 0.36 * k * open)
          const d = sdRoundRect(x - ex, y - ey + 0.04, hw, hh, hw)
          // inner corners raised: a lid line slanting down toward the outside
          const lid = y - (ey + 0.2 * k + (x - ex) * -s * 0.75)
          return Math.max(d, lid)
        }
        default: {
          if (style === 'dots') {
            const r = 0.27 * k
            return Math.hypot(x - ex, (y - ey) / Math.max(0.2, Math.min(1.15, open))) - r
          }
          if (style === 'arcs') {
            const r = 0.34 * k, ah = Math.max(0.08, r * Math.min(1.15, open))
            const base = ey - ah * 0.45
            return Math.max(Math.hypot((x - ex) / r, (y - base) / ah) * Math.min(r, ah) - Math.min(r, ah), base - y)
          }
          const hw = 0.2 * k * (mood === 'listening' ? 1.06 : 1), hh = Math.max(0.08, 0.46 * k * open)
          return sdRoundRect(x - ex, y - ey, hw, hh, hw)
        }
      }
    }
    const MY = -0.66
    // mouth glyph: returns brightness 0..1 directly (some are patterns, not shapes)
    function mouthB(mood, x, y, f, tt) {
      const p = pitchN, k = fk
      const soft = (d) => clamp(0.5 - d / (p * 0.75))
      switch (mood) {
        case 'talking': {
          if (Math.abs(x) > 0.62 * k) return 0
          const env = 1 - Math.abs(x) / (0.7 * k)
          const w = 0.5 + 0.5 * Math.sin(x * 9 - tt * 11) * Math.sin(x * 4.3 + tt * 6.1)
          const h = 0.06 + f.level * (0.18 + 0.28 * w) * env
          return soft(Math.abs(y - MY) - h)
        }
        case 'done': return soft(sdArc(x, y, 0, MY + 0.26, 0.3 * k, 0.05 + p * 0.1, Math.PI * 1.2, Math.PI * 1.8))
        case 'celebrating': {
          const r = 0.34 * k
          const d = Math.max(Math.hypot(x, y - (MY + 0.14)) - r, y - (MY + 0.14))
          return soft(d)
        }
        case 'worried': {
          if (Math.abs(x) > 0.42 * k) return 0
          const yy = MY + 0.06 * Math.sin(x * 12 + tt * 3)
          return soft(Math.abs(y - yy) - 0.04)
        }
        case 'needs-you': return soft(Math.abs(Math.hypot(x, y - MY) - 0.13 * k) - 0.045)
        case 'listening': {
          // three dots that pulse in turn: "I'm getting this"
          let b = 0
          for (let i = -1; i <= 1; i++) {
            const a = 0.45 + 0.55 * Math.max(0, Math.sin(tt * 5 - i * 1.1))
            b = Math.max(b, a * soft(Math.hypot(x - i * 0.26 * k, y - MY) - 0.06))
          }
          return b
        }
        case 'sleepy': {
          // a tiny z drifting up in the top right corner
          const zx = fieldHW - 0.42, zy = 0.42 + ((tt * 0.25) % 1) * 0.25
          const a = Math.sin(((tt * 0.25) % 1) * Math.PI)
          const lx = x - zx, ly = y - zy, z = 0.13
          if (Math.abs(lx) > z + p * 0.5 || Math.abs(ly) > z + p * 0.5) return 0
          const d = Math.min(Math.abs(ly - z), Math.abs(ly + z), Math.abs(lx + ly) / Math.SQRT2) - 0.035
          return soft(d) * a * 0.8
        }
        default: return 0
      }
    }
    function faceB(mood, x, y, f, tt) {
      const p = pitchN
      let d = Math.min(eyeSD(mood, x, y, -1, f), eyeSD(mood, x, y, 1, f))
      let b = clamp(0.5 - d / (p * 0.75))
      b = Math.max(b, mouthB(mood, x, y, f, tt))
      if (mood === 'celebrating') {
        // twinkles: a few random dots flash
        const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
        const r = h - Math.floor(h)
        const tw = Math.sin(tt * 3 + r * 40)
        if (size !== 'peek' && r > 0.9 && tw > 0.6 && (Math.abs(y) > 0.62 || Math.abs(x) > 1.15)) b = Math.max(b, (tw - 0.6) * 2.5 * 0.7)
      }
      return b
    }
    const MOOD_GAIN = { resting: 0.5, idle: 0.92, listening: 1.05, thinking: 0.9, talking: 1, done: 1, 'needs-you': 1.15, worried: 0.95, celebrating: 1.12, sleepy: 0.55 }

    let lastMood = null
    const sv = new THREE.Vector3()
    return {
      object,
      update(f, l) {
        if (l && l !== L && (l.eyes !== L.eyes)) L = l
        const P = f.P, rm = f.rm
        const t = f.t
        const tt = rm ? 0.6 : t
        const mood = f.mood
        const blend = rm ? 1 : sstep(0, 0.28, f.moodAge)
        const prev = f.prevMood
        const first = lastMood === null
        lastMood = mood

        /* posture */
        let rx = f.lookY * 0.1, ry = f.lookX * 0.2, rz = 0, py = 0
        const wob = rm ? 0 : f.wob
        py += Math.sin(f.clock * 1.3) * 0.025 * wob
        rz += Math.sin(f.clock * 0.9 + 1) * 0.02 * wob
        if (mood === 'resting') { rx += 0.04; py -= 0.03 }
        if (mood === 'sleepy') { rx += 0.07; rz += 0.1 + (rm ? 0 : Math.sin(t * 0.7) * 0.03); py -= 0.04 }
        if (mood === 'thinking') rz -= 0.07
        if (mood === 'listening') rz += 0.05
        if (mood === 'worried' && !rm) rz += Math.sin(t * 17) * 0.008 * (0.5 + P)
        if (mood === 'celebrating' && !rm) rz += Math.sin(t * 6.5) * 0.06 * P
        if (mood === 'talking' && !rm) rx += -f.level * 0.03
        const e = rm ? 1 : 1 - Math.exp(-8 * Math.max(f.dt, 0.016))
        head.rotation.x += (rx - head.rotation.x) * (first ? 1 : e)
        head.rotation.y += (ry - head.rotation.y) * (first ? 1 : e)
        head.rotation.z += (rz - head.rotation.z) * (first ? 1 : e)
        object.position.y = f.bounce + py

        /* eye colors */
        eyeCol.copy(L.tint.glow).lerp(WHITE, L.tint.key === 'graphite' ? 0.35 : 0.22)
        eyeCol.lerp(WARM, clamp(f.warm))
        eyeHot.copy(eyeCol).lerp(WHITE, 0.55)
        offCol.copy(L.tint.glow).multiplyScalar(L.dark ? 0.07 : 0.055)
        let gain = MOOD_GAIN[mood] ?? 1
        if (blend < 1) gain = gain * blend + (MOOD_GAIN[prev] ?? 1) * (1 - blend)
        if (!rm) {
          if (mood === 'resting') gain *= 0.8 + 0.2 * Math.sin(t * 1.3)
          if (mood === 'needs-you') gain *= 0.85 + 0.25 * (0.5 + 0.5 * Math.sin(t * 6))
        }

        for (let k = 0; k < N; k++) {
          const x = dots[2 * k], y = dots[2 * k + 1]
          let b = faceB(mood, x, y, f, tt)
          if (blend < 1) b = b * blend + faceB(prev, x, y, f, tt) * (1 - blend)
          b *= gain
          // hot core: brightest dots go toward white
          tmp.copy(eyeCol).lerp(eyeHot, clamp(b - 0.7) * 1.5).multiplyScalar(b * 1.25)
          tmp.add(offCol)
          ledDots.setColorAt(k, tmp)
          haloCol.copy(eyeCol).multiplyScalar(b * (L.dark ? 0.32 : 0.26))
          halos.setColorAt(k, haloCol)
        }
        ledDots.instanceColor.needsUpdate = true
        halos.instanceColor.needsUpdate = true

        /* glass reacts: warm tint when worried */
        shellMat.color.copy(glassBase).lerp(WARM, 0.2 * clamp(f.warm))
        shellMat.attenuationColor.copy(glassAtt).lerp(WARM, 0.5 * clamp(f.warm))

        /* status LED and ear lights */
        let sc = eyeCol, si = 0.7, gs = 0.26
        if (mood === 'done') { sc = DONE_GREEN; si = 1 }
        else if (mood === 'needs-you') { si = 0.9 + 0.6 * (rm ? 1 : 0.5 + 0.5 * Math.sin(t * 6)); gs = 0.62 + (rm ? 0 : 0.12 * Math.sin(t * 6)) }
        else if (mood === 'resting' || mood === 'sleepy') { si = 0.18 + (rm ? 0 : 0.14 * (0.5 + 0.5 * Math.sin(t * 1.3))); gs = 0.16 }
        else if (mood === 'thinking') { si = rm ? 0.8 : 0.35 + 0.65 * (Math.sin(t * 9) > 0 ? 1 : 0.2) }
        else if (mood === 'celebrating') { tmp.setHSL((t * 0.3) % 1, 0.8, 0.65); sc = tmp; si = 1.1 }
        ledMat.color.copy(sc).multiplyScalar(si * 1.6)
        ledGlow.material.color.copy(sc).multiplyScalar(Math.min(1, si))
        ledGlow.scale.setScalar(gs)
        const earI = mood === 'needs-you' ? si : mood === 'resting' || mood === 'sleepy' ? 0.12 : 0.35
        earLightMat.color.copy(eyeCol).multiplyScalar(earI)

        /* Glyph strip */
        {
          const u = glyphMat.uniforms
          const pulse = rm ? 1 : 0.5 + 0.5 * Math.sin(t * 6)
          let base = 0.07, seg = 0
          u.count.value = 1; u.len.value = 0.38; u.rainbow.value = 0
          u.head.value = rm ? 0.15 : t * 0.7
          switch (mood) {
            case 'resting': case 'sleepy': base = 0; break
            case 'listening': base = 0.3; break
            case 'thinking': base = 0.04; seg = 1.15; break
            case 'talking': base = 0.12 + 0.55 * f.level; break
            case 'done': base = 0.42; break
            case 'needs-you': base = 0.8 + 0.5 * pulse; break
            case 'worried': base = 0.3 + (rm ? 0 : 0.14 * Math.sin(t * 2.3)); break
            case 'celebrating': base = 0.22; seg = 1; u.count.value = 3; u.len.value = 0.55; u.rainbow.value = 1; u.head.value = rm ? 0.15 : t * 0.45; break
          }
          const ge = first || rm ? 1 : 1 - Math.exp(-9 * Math.max(f.dt, 0.016))
          u.base.value += (base - u.base.value) * ge
          u.seg.value += (seg - u.seg.value) * ge
          u.col.value.copy(mood === 'done' ? tmp.copy(eyeCol).lerp(DONE_GREEN, 0.6) : eyeCol)
        }

        /* sparkles */
        const sp = clamp(f.spark)
        for (let i = 0; i < SPARKS; i++) {
          const s = sparkSeeds[i]
          const life = rm ? 0.5 : (t * 0.7 + s.ph) % 1
          const a = s.a + (rm ? 0 : t * 0.25)
          const r = s.r + life * 0.25
          const sz = sp < 0.02 ? 0 : s.s * Math.sin(life * Math.PI) * sp
          m4.makeRotationZ(life * 1.2).scale(sv.setScalar(sz || 1e-4))
          m4.setPosition(Math.cos(a) * r * 1.05, Math.sin(a) * r * 0.82 + 0.05, 0.9)
          sparks.setMatrixAt(i, m4)
          if (L.dark) haloCol.copy(eyeCol).lerp(WHITE, 0.5).multiplyScalar(0.9)
          else haloCol.copy(L.tint.glow).lerp(L.tint.ink, 0.25)
          sparks.setColorAt(i, haloCol)
        }
        sparks.instanceMatrix.needsUpdate = true
        if (sparks.instanceColor) sparks.instanceColor.needsUpdate = true
        sparks.visible = sp > 0.02
      },
      setLook(l) { applyLook(l) },
      dispose() {
        for (const d of disposables) d.dispose?.()
        ledDots.dispose(); halos.dispose(); sparks.dispose()
      },
    }
  },
}
