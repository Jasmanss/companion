// Mercury: a clear glass sphere holding a drop of liquid metal. The drop IS the character: it settles low when
// resting, rises when it needs you, flows (wob), ripples while talking, swirls while thinking, warms to amber when
// worried, and throws sparkles when celebrating. Two eyes of light ride its surface and follow every wave.
//
// How the layers work with three.js transmission:
// - shell: the one transmissive material. Thin (low thickness, mild ior) so the drop inside is not magnified, and
//   its roughness is capped so the frost slider softens the glass without blurring the face away.
// - drop: an opaque chrome MeshPhysicalMaterial on a unit sphere, displaced in its vertex shader by mDisp(). The same
//   field runs in JS (mDisp below) so the eyes and mouth sit exactly on the moving surface.
// - eyes, mouth, thinking ring: opaque self-lit meshes inside the glass, so they are refracted like the drop.
// - badge, sparkles: in front of the glass (not refracted), so the needs-you and celebrating signals stay crisp.
import * as THREE from 'three'

const SHELL_R = 1.0
const DROP_R = 0.75
const WARM = new THREE.Color('#ffae5c')
const WARM_EYE = new THREE.Color('#fff0dc')
const WORRY_METAL = new THREE.Color('#b49a80') // a dulled, desaturated amber, so worried reads on every tint (peach too)
const WHITE = new THREE.Color(1, 1, 1)

/* ---------------- the living surface (GLSL and its JS twin must match) ---------------- */
const FIELD = /* glsl */ `
uniform float uT;
uniform float uWob;
uniform float uRip;
uniform float uSwirl;
uniform float uLvl;
uniform float uIn;
float mDisp(vec3 n) {
  float t = uT;
  float d = uWob * (0.036 * sin(2.7 * n.x + 1.7 * t + 1.0) * sin(2.3 * n.y + 1.3 * t)
    + 0.026 * sin(3.1 * n.z + 3.3 * n.y + 2.1 * t)
    + 0.014 * sin(5.0 * n.x - 4.0 * n.y + 2.9 * t));
  float a = acos(clamp(n.z, -1.0, 1.0));
  float front = smoothstep(1.75, 0.2, a);
  d += uRip * (0.008 + 0.03 * uLvl) * sin(a * 14.0 - t * 11.0) * front;
  d += uIn * 0.009 * sin(a * 12.0 + t * 6.0) * front;
  vec3 sn = n - vec3(0.42, 0.5, 0.0);
  float sa = length(sn.xy);
  d += uSwirl * 0.016 * sin(3.0 * atan(sn.y, sn.x) + 14.0 * sa - t * 4.0) * smoothstep(0.75, 0.15, sa) * smoothstep(0.02, 0.12, sa) * step(0.0, n.z);
  return d;
}
`
function mDisp(x, y, z, u) {
  const t = u.uT.value
  let d = u.uWob.value * (0.036 * Math.sin(2.7 * x + 1.7 * t + 1) * Math.sin(2.3 * y + 1.3 * t)
    + 0.026 * Math.sin(3.1 * z + 3.3 * y + 2.1 * t)
    + 0.014 * Math.sin(5 * x - 4 * y + 2.9 * t))
  const a = Math.acos(Math.max(-1, Math.min(1, z)))
  const front = smooth(1.75, 0.2, a)
  d += u.uRip.value * (0.008 + 0.03 * u.uLvl.value) * Math.sin(a * 14 - t * 11) * front
  d += u.uIn.value * 0.009 * Math.sin(a * 12 + t * 6) * front
  const sx = x - 0.42, sy = y - 0.5, sa = Math.hypot(sx, sy)
  if (z >= 0) d += u.uSwirl.value * 0.016 * Math.sin(3 * Math.atan2(sy, sx) + 14 * sa - t * 4) * smooth(0.75, 0.15, sa) * smooth(0.02, 0.12, sa)
  return d
}
function smooth(e0, e1, x) {
  const k = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)))
  return k * k * (3 - 2 * k)
}

function deformMaterial(mat, uniforms) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms)
    sh.vertexShader = FIELD + sh.vertexShader
      .replace('#include <beginnormal_vertex>', /* glsl */ `
        vec3 mN0 = normalize(position);
        vec3 mTA = normalize(cross(mN0, abs(mN0.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
        vec3 mTB = cross(mN0, mTA);
        vec3 mNA = normalize(mN0 + mTA * 0.012);
        vec3 mNB = normalize(mN0 + mTB * 0.012);
        vec3 mP0 = mN0 * (1.0 + mDisp(mN0));
        vec3 mPA = mNA * (1.0 + mDisp(mNA));
        vec3 mPB = mNB * (1.0 + mDisp(mNB));
        vec3 objectNormal = normalize(cross(mPA - mP0, mPB - mP0));
        if (dot(objectNormal, mN0) < 0.0) objectNormal = -objectNormal;`)
      .replace('#include <begin_vertex>', 'vec3 transformed = mP0;')
    // The engine's key and fill lights make pinpoint glints on a mirror, which read as extra eyes at 50x44.
    // The studio environment already lights the chrome, so direct light is mostly turned down.
    sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n reflectedLight.directSpecular *= 0.15;')
  }
  mat.customProgramCacheKey = () => 'mercury-drop'
}

/* ---------------- procedural sparkle texture (shared) ---------------- */
let starTex = null
function sparkleTexture() {
  if (starTex) return starTex
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  const rg = g.createRadialGradient(32, 32, 0, 32, 32, 31)
  rg.addColorStop(0, 'rgba(255,255,255,1)')
  rg.addColorStop(0.3, 'rgba(255,255,255,1)')
  rg.addColorStop(0.7, 'rgba(255,255,255,.55)')
  rg.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = rg
  g.beginPath()
  // Four-point star: concave diamond.
  g.moveTo(32, 1)
  g.quadraticCurveTo(35, 29, 63, 32)
  g.quadraticCurveTo(35, 35, 32, 63)
  g.quadraticCurveTo(29, 35, 1, 32)
  g.quadraticCurveTo(29, 29, 32, 1)
  g.fill()
  starTex = new THREE.CanvasTexture(c)
  starTex.colorSpace = THREE.SRGBColorSpace
  return starTex
}

/* ---------------- studio environment for the chrome (shared per renderer) ---------------- */
// The engine's RoomEnvironment is full of small box lights, which read as a busy pattern of white squares on a
// mirror ball (and as extra "eyes" at 50x44). Chrome is only as good as what it reflects, so the drop gets its own
// product-shot studio: a dark front (the face stays deep so the eyes glow), a big soft key up-left, a thin strip
// light on the right for a clean edge, and a soft floor bounce.
// The glass gets a bright variant of the same studio: a clear sphere mirroring a dark room turns into a gray
// plastic-looking ring at its edges, especially on light panels.
const envCache = new WeakMap()
function studioEnv(renderer, bright = false) {
  let cache = envCache.get(renderer)
  if (!cache) envCache.set(renderer, (cache = {}))
  const key = bright ? 'bright' : 'deep'
  if (cache[key]) return cache[key]
  let tex
  const scene = new THREE.Scene()
  // Every light is a soft analytic shape in one shader: hard-edged panels show up as little squares on a mirror.
  const sky = new THREE.Mesh(new THREE.SphereGeometry(10, 64, 32), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vP;
    uniform float uBright;
    float blob(vec3 d, vec3 l, float a, float b) { return smoothstep(a, b, dot(d, normalize(l))); }
    void main(){
      vec3 d = normalize(vP);
      vec3 c = vec3(mix(0.09, 0.36, smoothstep(-0.7, 0.7, d.y)));
      c *= mix(1.0, 0.72, smoothstep(0.2, 0.9, d.z));                      // the front (what the face mirrors) stays deeper
      c = mix(c, vec3(0.42) + c, uBright);
      c += 3.2 * blob(d, vec3(-0.5, 0.82, 0.1), 0.86, 0.97);               // key: soft round box up-left
      c += 0.5 * blob(d, vec3(-0.5, 0.82, 0.1), 0.6, 0.9);                 // its falloff
      float strip = smoothstep(0.93, 0.985, dot(normalize(d.xz), normalize(vec2(1.0, -0.55)))) * smoothstep(0.75, 0.1, abs(d.y - 0.1));
      c += 2.2 * strip;                                                    // right strip: a clean edge highlight
      float kick = smoothstep(0.94, 0.99, dot(normalize(d.xz), normalize(vec2(-1.0, -0.7)))) * smoothstep(0.6, 0.0, abs(d.y + 0.1));
      c += 0.9 * kick;                                                     // left kicker
      c += 0.35 * smoothstep(0.55, 0.95, -d.y) * smoothstep(0.6, -0.4, d.z); // floor bounce from behind
      gl_FragColor = vec4(c, 1.0); }`,
    uniforms: { uBright: { value: bright ? 1 : 0 } },
  }))
  scene.add(sky)
  const pmrem = new THREE.PMREMGenerator(renderer)
  tex = pmrem.fromScene(scene, 0.02).texture
  pmrem.dispose()
  scene.traverse((o) => { o.geometry?.dispose(); o.material?.dispose() })
  cache[key] = tex
  return tex
}

/* ---------------- per-mood pose of the drop ---------------- */
// y: rest height, sx/sy/sz: drop proportions, z: forward lean, roll: head tilt. Eased per instance.
const POSE = {
  resting: { y: -0.2, sx: 1.1, sy: 0.84, sz: 1.04 },
  idle: { y: -0.03, sx: 1, sy: 1, sz: 1 },
  listening: { y: 0.05, sx: 0.97, sy: 1.06, sz: 1.04, z: 0.08, roll: 0.08 },
  thinking: { y: 0.02, sx: 0.98, sy: 1.02, sz: 1, x: 0.03, roll: -0.1 },
  talking: { y: -0.02, sx: 1.01, sy: 0.99, sz: 1.02, z: 0.04 },
  done: { y: -0.05, sx: 1.04, sy: 0.96, sz: 1 },
  'needs-you': { y: 0.06, sx: 0.95, sy: 1.08, sz: 1.04, z: 0.06 },
  worried: { y: -0.06, sx: 0.98, sy: 0.97, sz: 0.98 },
  celebrating: { y: 0.0, sx: 1, sy: 1, sz: 1.02 },
  sleepy: { y: -0.12, x: -0.09, sx: 1.05, sy: 0.92, sz: 1.02, roll: 0.42 },
}

export default {
  id: 'mercury',
  name: 'Mercury',
  vibe: 'A drop of liquid metal held in clear glass: calm, polished, a little mysterious.',
  eyes: ['pills', 'dots'],
  frame: { height: 2.6, y: 0.04, peek: { height: 2.3, y: 0.02 }, header: { height: 2.36, y: 0.03 } },
  create({ kit, look, size }) {
    const small = size !== 'big'
    const eyeK = size === 'peek' ? 1.45 : size === 'header' ? 1.3 : 1.18
    const object = new THREE.Group()
    const rig = new THREE.Group() // hops when celebrating
    const liquid = new THREE.Group() // the drop and its face; tilts like a head
    object.add(rig)
    rig.add(liquid)

    /* shell */
    const shellExtra = () => ({ thickness: 0.2, ior: 1.2, roughness: 0.02 + 0.14 * look.frost, attenuationDistance: 6 })
    const shellMat = kit.glass(look, { ...shellExtra(), iridescence: 0.2, clearcoat: 0.6, clearcoatRoughness: 0.12 })
    const shellGeo = new THREE.SphereGeometry(SHELL_R, small ? 48 : 72, small ? 32 : 48)
    const shell = new THREE.Mesh(shellGeo, shellMat)
    // The glass reflects the same soft studio as the drop (the room's box lights read as squares between the eyes).
    shell.onBeforeRender = (renderer) => {
      if (!shellMat.envMap) { shellMat.envMap = studioEnv(renderer, true); shellMat.needsUpdate = true }
    }
    shellMat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n reflectedLight.directSpecular *= 0.3;\n#ifdef USE_CLEARCOAT\n clearcoatSpecularDirect *= 0.3;\n#endif')
    }
    shellMat.customProgramCacheKey = () => 'mercury-shell'
    // Edge of the glass (normal blending, not the kit's additive rim): a bright hairline up-left where the key light
    // catches it and a faint ink line down-right, so clear glass keeps its edge on a light panel. `accent` (0..1)
    // floods the whole rim with a signal color: tint for needs-you and listening, amber for worried.
    const rimMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { ink: { value: new THREE.Color() }, hi: { value: 0.6 }, lo: { value: 0.2 }, accentCol: { value: new THREE.Color() }, accent: { value: 0 }, winA: { value: 0.6 }, causCol: { value: new THREE.Color() }, causA: { value: 0.35 } },
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
      fragmentShader: `uniform vec3 ink; uniform float hi; uniform float lo; uniform vec3 accentCol; uniform float accent; uniform float winA; uniform vec3 causCol; uniform float causA; varying vec3 vN; varying vec3 vV;
        void main(){
          vec3 n = normalize(vN);
          float f = 1. - max(dot(n, normalize(vV)), 0.);
          float side = smoothstep(-0.6, 0.6, dot(normalize(n.xy + 1e-4), vec2(-0.707, 0.707)));
          float thin = pow(f, 7.);
          vec3 col = mix(ink, vec3(1.), side);
          float a = thin * mix(lo, hi, side);
          // Glass-marble cues for the gap between drop and shell (the engine's backdrop is nearly flat, so refraction
          // alone cannot sell "clear glass"): a crescent window highlight up-left and a focused caustic at the bottom.
          vec2 dir = normalize(n.xy + 1e-4);
          float band = smoothstep(0.36, 0.42, f) * (1. - smoothstep(0.5, 0.58, f));
          float win = band * smoothstep(0.55, 0.9, dot(dir, vec2(-0.6, 0.8)));
          float caus = band * smoothstep(0.55, 0.95, dot(dir, vec2(0.15, -0.99)));
          col = mix(col, vec3(1.), win / max(a + win, 1e-3));
          a += win * winA;
          col = mix(col, causCol, caus * causA / max(a + caus * causA, 1e-3));
          a += caus * causA;
          float g = pow(f, 3.) * accent;
          col = mix(col, accentCol, clamp(g / max(a + g, 1e-3), 0., 1.));
          gl_FragColor = vec4(col, clamp(a + g, 0., 1.));
        }`,
    })
    const rim = new THREE.Mesh(shellGeo, rimMat)
    rim.scale.setScalar(1.004)

    /* drop */
    const U = { uT: { value: 0 }, uWob: { value: 0.5 }, uRip: { value: 0 }, uSwirl: { value: 0 }, uLvl: { value: 0 }, uIn: { value: 0 } }
    const dropMat = new THREE.MeshPhysicalMaterial({ metalness: 1, roughness: 0.16, envMapIntensity: 1, iridescence: 0.12, iridescenceIOR: 1.4 })
    deformMaterial(dropMat, U)
    const dropGeo = new THREE.SphereGeometry(1, small ? 64 : 112, small ? 44 : 80)
    const drop = new THREE.Mesh(dropGeo, dropMat)
    drop.onBeforeRender = (renderer) => {
      if (!dropMat.envMap) { dropMat.envMap = studioEnv(renderer); dropMat.needsUpdate = true }
    }

    /* eyes: a pill (open) and an arc (closed/happy) per side, only one shows */
    // Eyes are lit from within: white-hot where they face you, melting into the tint at their edges. Opaque (no
    // blending), so the glass refracts them together with the drop they sit on.
    const eyeMat = new THREE.ShaderMaterial({
      toneMapped: false,
      uniforms: { core: { value: new THREE.Color() }, edge: { value: new THREE.Color() } },
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
      fragmentShader: 'uniform vec3 core; uniform vec3 edge; varying vec3 vN; varying vec3 vV; void main(){ float k = smoothstep(0.45, 0.97, max(dot(normalize(vN), normalize(vV)), 0.)); gl_FragColor = vec4(mix(edge, core, k), 1.); }',
    })
    const pillGeo = new THREE.CapsuleGeometry(0.068 * eyeK, 0.12 * eyeK, 8, 16)
    const dotGeo = new THREE.SphereGeometry(0.078 * eyeK, 16, 12)
    const arcGeo = new THREE.TorusGeometry((small ? 0.082 : 0.075) * eyeK, (small ? 0.044 : 0.03) * eyeK, 10, 24, Math.PI * 0.86)
    const eyes = [-1, 1].map((side) => {
      const pill = new THREE.Mesh(pillGeo, eyeMat)
      const arc = new THREE.Mesh(arcGeo, eyeMat)
      liquid.add(pill, arc)
      return { side, pill, arc }
    })
    // A soft glow around each eye, drawn over the glass (sprites are not refracted, so no depth test).
    const glowMat = new THREE.SpriteMaterial({ map: kit.glowTex, transparent: true, depthWrite: false, depthTest: false, opacity: 0.5 })
    const glows = eyes.map(() => { const g = new THREE.Sprite(glowMat); g.renderOrder = 5; liquid.add(g); return g })
    const mouthGeo = new THREE.CapsuleGeometry(0.04 * eyeK, 0.1 * eyeK, 5, 12)
    const mouth = new THREE.Mesh(mouthGeo, eyeMat)

    /* thinking: a comet of light orbiting the drop like a ring around a planet. Its front arc passes below the eyes,
       its back arc goes behind the drop (opaque, so the drop hides it and the glass refracts it). The tube tapers
       from a bright head to a thin tail, in the vertex shader. */
    const ringGeo = new THREE.TorusGeometry(0.89, small ? 0.07 : 0.048, 8, 64, Math.PI * 1.15)
    const ringMat = new THREE.ShaderMaterial({
      toneMapped: false,
      uniforms: { head: { value: new THREE.Color() }, tail: { value: new THREE.Color() } },
      vertexShader: `varying float vU; void main(){
        vU = uv.x;
        vec3 c = vec3(normalize(position.xy) * 0.89, 0.);
        vec3 p = c + (position - c) * mix(0.2, 1., uv.x * uv.x);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.); }`,
      fragmentShader: 'uniform vec3 head; uniform vec3 tail; varying float vU; void main(){ gl_FragColor = vec4(mix(tail, head, vU * vU), 1.); }',
    })
    const ring = new THREE.Mesh(ringGeo, ringMat)
    const ringTilt = new THREE.Group()
    ringTilt.rotation.order = 'ZYX' // tip the ring plane first, then lean it in screen space
    ringTilt.rotation.set(-Math.PI / 2 + 0.32, 0, 0.5) // seen from a little above, rising steeply to the right
    ringTilt.add(ring)
    rig.add(ringTilt)

    /* needs-you: a bright badge in front of the glass, upper right */
    const badgeMat = kit.light('#ffffff', 1.4)
    const badge = new THREE.Mesh(new THREE.SphereGeometry(small ? 0.17 : 0.09, 20, 14), badgeMat)
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: kit.glowTex, transparent: true, depthWrite: false, opacity: 0 }))
    rig.add(halo, badge)

    /* celebrating: sparkles around the sphere */
    const sparkMat = []
    const sparks = [[-1.08, 0.62, 0.55], [1.12, 0.3, 0.42], [0.66, 1.0, 0.5], [-0.9, -0.66, 0.38]].map(([x, y, s], i) => {
      const m = new THREE.SpriteMaterial({ map: sparkleTexture(), transparent: true, depthWrite: false, opacity: 0 })
      sparkMat.push(m)
      const sp = new THREE.Sprite(m)
      sp.position.set(x * (small ? 0.9 : 1), y * (small ? 0.9 : 1), 0.4)
      sp.userData = { x, y, s: s * (small ? 1.5 : 1), ph: i * 1.7 }
      rig.add(sp)
      return sp
    })

    liquid.add(drop, mouth)
    rig.add(shell, rim)

    /* colors */
    const dropBase = new THREE.Color()
    const eyeBase = new THREE.Color()
    const haloBase = new THREE.Color()
    const sparkCol = new THREE.Color()
    function setLook(l) {
      look = l
      kit.updateGlass(shellMat, l, shellExtra())
      shellMat.color.lerp(WHITE, 0.6) // clear, barely tinted glass: the tint lives in the metal
      shellMat.envMapIntensity = l.dark ? 0.7 : 0.4 // reflections stay at the edge; the panel shows through the middle
      // Chrome tinted by the theme, a little deeper than the glass so the eyes glow against it.
      dropBase.copy(l.tint.glow).lerp(WHITE, 0.3).lerp(l.tint.ink, l.dark ? 0 : 0.28) // a touch deeper on light panels, so the eyes still glow
      eyeBase.copy(WHITE).lerp(l.tint.soft, 0.25)
      haloBase.copy(l.tint.glow)
      glowMat.color.copy(l.tint.glow).lerp(WHITE, 0.2)
      glowMat.blending = l.dark ? THREE.AdditiveBlending : THREE.NormalBlending
      glowMat.needsUpdate = true
      ringMat.uniforms.head.value.copy(WHITE).multiplyScalar(1.6)
      ringMat.uniforms.tail.value.copy(l.tint.glow).lerp(l.tint.ink, l.dark ? 0 : 0.35)
      sparkCol.copy(l.dark ? l.tint.soft : l.tint.glow).lerp(l.tint.ink, l.dark ? 0 : 0.35)
      for (const m of sparkMat) { m.color.copy(sparkCol); m.blending = l.dark ? THREE.AdditiveBlending : THREE.NormalBlending; m.needsUpdate = true }
      halo.material.color.copy(l.tint.glow)
      halo.material.blending = l.dark ? THREE.AdditiveBlending : THREE.NormalBlending
      halo.material.needsUpdate = true
      badgeMat.color.copy(l.tint.glow).lerp(WHITE, 0.25).multiplyScalar(1.5)
      rimMat.uniforms.ink.value.copy(l.dark ? WHITE : l.tint.ink)
      rimMat.uniforms.hi.value = l.dark ? 0.55 : 0.75
      rimMat.uniforms.lo.value = l.dark ? 0.12 : 0.22
      rimMat.uniforms.winA.value = l.dark ? 0.45 : 0.75
      rimMat.uniforms.causCol.value.copy(l.tint.glow).lerp(WHITE, l.dark ? 0.3 : 0.1)
      rimMat.uniforms.causA.value = l.dark ? 0.35 : 0.4
    }
    setLook(look)

    /* per-frame state (no allocations below) */
    const pose = { y: 0, x: 0, z: 0, sx: 1, sy: 1, sz: 1, roll: 0 } // eased mood pose
    const cur = { y: 0, x: 0, z: 0, sx: 1, sy: 1, sz: 1 } // this frame's drop (pose + hop squash + breath)
    const n = new THREE.Vector3()
    const qDir = new THREE.Quaternion()
    const qRoll = new THREE.Quaternion()
    const Z = new THREE.Vector3(0, 0, 1)
    const ZA = new THREE.Vector3(0, 0, 1)
    let lastT = null
    let listenK = 0

    // Put a mesh on the drop's surface at unit direction (x, y, z), lifted by `lift`, facing outward, rolled by `roll`.
    function onSurface(m, x, y, z, lift, roll) {
      n.set(x, y, z).normalize()
      const r = 1 + mDisp(n.x, n.y, n.z, U)
      m.position.set(cur.x + n.x * r * DROP_R * cur.sx, cur.y + n.y * r * DROP_R * cur.sy, cur.z + n.z * r * DROP_R * cur.sz)
      m.position.addScaledVector(n, lift)
      qDir.setFromUnitVectors(Z, n)
      qRoll.setFromAxisAngle(ZA, roll)
      m.quaternion.copy(qDir).multiply(qRoll)
    }

    return {
      object,
      setLook,
      update(f) {
        const dt = lastT === null ? 1 : Math.min(0.1, Math.max(0, f.t - lastT))
        lastT = f.t
        const k = f.rm ? 1 : 1 - Math.exp(-4 * dt)
        const P = POSE[f.mood] ?? POSE.idle
        pose.y += (P.y - pose.y) * k
        pose.x += ((P.x || 0) - pose.x) * k
        pose.z += ((P.z || 0) - pose.z) * k
        pose.sx += (P.sx - pose.sx) * k
        pose.sy += (P.sy - pose.sy) * k
        pose.sz += (P.sz - pose.sz) * k
        pose.roll += ((P.roll || 0) - pose.roll) * k * 0.6
        // Sleepy nods slowly; worried has a small uneasy sway.
        liquid.rotation.z = pose.roll + (f.rm ? 0 : f.mood === 'sleepy' ? Math.sin(f.t * 0.9) * 0.05 : f.mood === 'worried' ? Math.sin(f.t * 2.3) * 0.04 * f.warm : 0)

        // Celebrating: the whole sphere hops, the drop stretches in the air and squashes on landing.
        const hop = -f.bounce
        rig.position.y = hop * 0.9
        const air = Math.min(1, hop / 0.12)
        const land = f.mood === 'celebrating' && !f.rm ? Math.max(0, 1 - hop / 0.03) : 0
        const sy = pose.sy * (1 + 0.07 * air - 0.08 * land), sxz = 1 - 0.035 * air + 0.05 * land
        // Breathing: a slow, tiny drift of the drop inside the glass (none with reduced motion).
        const breath = f.rm ? 0 : Math.sin(f.clock * 1.3) * 0.012 * (0.5 + f.P)

        U.uT.value = f.clock
        U.uWob.value = f.rm ? 0.35 : 0.3 + Math.min(1, f.wob) * 0.7
        U.uRip.value = f.rip
        U.uSwirl.value = f.swirl
        U.uLvl.value = f.level
        // Listening: faint rings travel inward, as if the drop were taking in what you type.
        listenK += ((f.mood === 'listening' && !f.rm ? 1 : 0) - listenK) * (1 - Math.exp(-5 * dt))
        U.uIn.value = listenK
        cur.x = pose.x; cur.y = pose.y + breath; cur.z = pose.z
        cur.sx = pose.sx * sxz; cur.sy = sy; cur.sz = pose.sz * sxz
        drop.position.set(cur.x, cur.y, cur.z)
        drop.scale.set(DROP_R * cur.sx, DROP_R * cur.sy, DROP_R * cur.sz)

        // Warmth: the metal turns amber when worried.
        dropMat.color.copy(dropBase).lerp(WORRY_METAL, f.warm * 0.8)
        dropMat.roughness = 0.16 + f.warm * 0.04
        dropMat.envMapIntensity = 1 + f.spark * 0.35
        const dim = f.mood === 'resting' ? 0.75 : f.mood === 'sleepy' ? 0.78 + (f.rm ? 0 : 0.14 * Math.sin(f.t * 1.1)) : 1
        eyeMat.uniforms.core.value.copy(eyeBase).lerp(WARM_EYE, f.warm).multiplyScalar(dim * 1.8)
        eyeMat.uniforms.edge.value.copy(haloBase).lerp(WARM, f.warm).multiplyScalar(dim * 1.35)

        // Eyes.
        const mood = f.mood
        const closedHappy = mood === 'done' || mood === 'celebrating'
        const closedRest = mood === 'resting'
        const dots = look.eyes === 'dots'
        const lx = f.lookX * 0.27, ly = -f.lookY * 0.24
        for (const e of eyes) {
          const ex = e.side * 0.36 + lx, ey = 0.1 + ly
          const arcOn = closedHappy || closedRest
          e.pill.visible = !arcOn
          e.arc.visible = arcOn
          if (arcOn) {
            // TorusGeometry arcs start at +x and run CCW; center the gap up (rest: a soft smile-down) or down (happy).
            const roll = closedHappy ? (Math.PI - Math.PI * 0.86) / 2 : Math.PI + (Math.PI - Math.PI * 0.86) / 2
            onSurface(e.arc, ex, ey + (closedHappy ? -0.04 : 0.05), 1, 0.012, roll)
            e.arc.scale.set(1, closedHappy ? 1 : 0.8, 0.6)
          } else {
            const open = Math.max(0.12, f.open * f.blink)
            const tilt = mood === 'worried' ? -e.side * 0.32 : 0
            onSurface(e.pill, ex, ey, 1, 0.008, tilt)
            e.pill.geometry = dots ? dotGeo : pillGeo
            e.pill.scale.set(1 + listenK * 0.1, Math.max(dots ? 0.3 : 0.2, Math.min(1.15, open) * (1 + listenK * 0.15)), 0.5)
            if (mood === 'sleepy') e.pill.scale.y = Math.max(dots ? 0.4 : 0.3, open * 0.85)
          }
        }

        for (const [i, g] of glows.entries()) {
          const src = eyes[i].pill.visible ? eyes[i].pill : eyes[i].arc
          g.position.copy(src.position)
          g.scale.setScalar(0.42 * eyeK * (eyes[i].pill.visible ? 0.7 + 0.3 * Math.min(1, eyes[i].pill.scale.y) : 0.8))
        }
        glowMat.opacity = (look.dark ? 0.5 : 0.28) * dim

        // Mouth: a pulse of light that opens with the voice, only while talking.
        const talk = f.rm ? (f.mood === 'talking' ? 1 : 0) : Math.max(0, Math.min(1, f.rip)) // rip is 0 with reduced motion
        mouth.visible = talk > 0.05
        if (mouth.visible) {
          onSurface(mouth, lx * 0.6, -0.2 + ly * 0.8, 1, 0.006, Math.PI / 2)
          mouth.scale.set(0.3 + f.level * 1.3, 0.6 + f.level * 0.3, 0.45)
          mouth.scale.multiplyScalar(talk)
        }

        // Thinking: the comet ring spins; it grows in from nothing as the swirl rises.
        const sw = f.swirl
        ring.visible = sw > 0.04
        if (ring.visible) {
          ring.rotation.z = f.rm ? 0.6 : f.t * 2.2
          ringTilt.scale.setScalar(0.75 + 0.25 * sw)
          ring.scale.set(1, 1, sw)
        }

        // Needs you: a pulsing badge, upper left (thinking and sparkles own the upper right), and the rim pulses.
        const need = mood === 'needs-you' ? 1 : 0
        badge.userData.k = (badge.userData.k ?? 0) + (need - (badge.userData.k ?? 0)) * (f.rm ? 1 : 1 - Math.exp(-8 * dt))
        const nk = badge.userData.k
        const pulse = f.rm ? 0.6 : 0.5 + 0.5 * Math.sin(f.t * 5.2)
        badge.visible = nk > 0.02
        badge.position.set(-0.7, 0.72, 0.42)
        badge.scale.setScalar(nk * (0.92 + 0.12 * pulse))
        halo.position.copy(badge.position)
        halo.scale.setScalar((small ? 0.85 : 0.45) * (0.8 + 0.5 * pulse))
        halo.material.opacity = nk * (look.dark ? 0.7 : 0.55) * (0.5 + 0.5 * pulse)
        halo.visible = nk > 0.02

        // Celebrating: sparkles twinkle around the glass.
        for (const sp of sparks) {
          const d = sp.userData
          const tw = f.rm ? 0.8 : Math.max(0, Math.sin(f.t * 3.1 + d.ph))
          sp.material.opacity = f.spark * (0.25 + 0.75 * tw)
          sp.visible = f.spark > 0.02
          sp.scale.setScalar(d.s * (0.55 + 0.5 * tw) * f.spark)
          sp.material.rotation = f.rm ? 0 : f.t * 0.6 + d.ph
        }
        // Rim accent: the strongest signal wins (needs-you pulses, worried glows amber, listening is a faint hold).
        const ru = rimMat.uniforms
        if (f.warm > nk) { ru.accentCol.value.copy(WARM); ru.accent.value = f.warm * 0.8 }
        else { ru.accentCol.value.copy(look.tint.glow); ru.accent.value = Math.max(nk * (0.55 + 0.45 * pulse), listenK * 0.3) }
      },
      dispose() {
        for (const g of [shellGeo, dropGeo, pillGeo, dotGeo, arcGeo, mouthGeo, ringGeo, badge.geometry]) g.dispose()
        for (const m of [shellMat, rimMat, dropMat, eyeMat, glowMat, ringMat, badgeMat, halo.material, ...sparkMat]) m.dispose()
      },
    }
  },
}
