// Pebble: a polished glass river stone, seen a little from the side. Inside it floats a smoked lens that
// dissolves into the clear glass, and the face is light living in that lens: two soft pills and a thin halo
// ring that carries the mood (a short comet over the top while thinking, ripples while talking, a ring that
// closes when a task is done, a heartbeat and a status light when it needs you, an amber flicker when
// something broke, glints chasing round the ring when something shipped).
//
// Build notes
// - One transmissive mesh (the shell). Everything inside it is opaque, so the transmission pass refracts it.
// - Clear glass, not milky: the shell colour is near white and the tint lives in Beer-Lambert absorption, with
//   a thickness that is thin through the face and deep at the silhouette. The shell skips ACES (which greys a
//   white panel seen through glass) and rolls off its own highlights, so the clear centre matches the panel.
//   At the edge: a darker refraction band, then a bright light pipe, then a fine hairline, drawn in the shell's
//   own shader (no second shell mesh). A thin caustic crescent gathers in the lower inner edge.
// - The lens is a single opaque ShaderMaterial. Its rim samples the engine's backdrop at the same screen
//   position, so in the transmission buffer it fades seamlessly into whatever the glass would show: a smoked
//   core suspended in clear glass, not a visor with a gasket. Eyes, ring, ripples, glints are SDFs, so they
//   stay crisp at 50x44 and morph between moods.
// - Frost frosts the body and partly the face window, softens the clearcoat, widens the light's bloom and the
//   lens fade, and adds a light satin scatter to the body: clear and frosted look obviously different.
// - Mood blends are computed from face.moodAge, not internal easing, so mood-sheet stills match live views.
import * as THREE from 'three'

const WARM = new THREE.Color('#ffb870')
const WARM_DEEP = new THREE.Color('#ff9a3c')
const WARM_ATT = new THREE.Color('#ffb24a')
const WHITE = new THREE.Color(1, 1, 1)
const BLACK = new THREE.Color(0, 0, 0)

// Per-mood targets. ring: halo brightness, glow: eye light, happy/closed: eye shapes, droop/worry: lids,
// alert/talk/celeb/done/listen: ring behaviours, lean: dozing posture, aura: glow around the stone.
const MP = {
  resting: { ring: 0.05, glow: 0.5, happy: 0, closed: 1, droop: 0, worry: 0, alert: 0, talk: 0, celeb: 0, done: 0, listen: 0, lean: 1, aura: 0, dim: 0.72 },
  idle: { ring: 0.16, glow: 0.92, happy: 0, closed: 0, droop: 0, worry: 0, alert: 0, talk: 0, celeb: 0, done: 0, listen: 0, lean: 0, aura: 0, dim: 1 },
  listening: { ring: 0.2, glow: 1.06, happy: 0, closed: 0, droop: 0, worry: 0, alert: 0, talk: 0, celeb: 0, done: 0, listen: 1, lean: 0, aura: 0.12, dim: 1 },
  thinking: { ring: 0.07, glow: 0.92, happy: 0, closed: 0, droop: 0, worry: 0, alert: 0, talk: 0, celeb: 0, done: 0, listen: 0, lean: 0, aura: 0.08, dim: 1 },
  talking: { ring: 0.32, glow: 1.02, happy: 0, closed: 0, droop: 0, worry: 0, alert: 0, talk: 1, celeb: 0, done: 0, listen: 0, lean: 0, aura: 0.18, dim: 1 },
  done: { ring: 0.12, glow: 1.0, happy: 1, closed: 0, droop: 0, worry: 0, alert: 0, talk: 0, celeb: 0, done: 1, listen: 0, lean: 0, aura: 0.08, dim: 1 },
  'needs-you': { ring: 0.35, glow: 1.12, happy: 0, closed: 0, droop: 0, worry: 0, alert: 1, talk: 0, celeb: 0, done: 0, listen: 0, lean: 0, aura: 1, dim: 1 },
  worried: { ring: 0.7, glow: 0.95, happy: 0, closed: 0, droop: 0, worry: 1, alert: 0, talk: 0, celeb: 0, done: 0, listen: 0, lean: 0, aura: 0.12, dim: 1 },
  celebrating: { ring: 0.4, glow: 1.15, happy: 1, closed: 0, droop: 0, worry: 0, alert: 0, talk: 0, celeb: 1, done: 0, listen: 0, lean: 0, aura: 0.55, dim: 1 },
  sleepy: { ring: 0.04, glow: 0.62, happy: 0, closed: 0, droop: 1, worry: 0, alert: 0, talk: 0, celeb: 0, done: 0, listen: 0, lean: 0.6, aura: 0, dim: 0.8 },
}
const KEYS = Object.keys(MP.idle)
const LENS_DESAT = { ice: 0.08, lilac: 0.15, mint: 0.35, peach: 1, graphite: 0 }
// how much the eye light is pulled toward white (warm glows read as skin when saturated)
const EYE_WHITE = { ice: 0.62, lilac: 0.62, mint: 0.6, peach: 0.8, graphite: 0.62 }
const HALO_SOFTEN = { ice: 0, lilac: 0, mint: 0.1, peach: 0.4, graphite: 0 }
// Body absorption per tint: [how far the glow is pulled toward ink (negative: toward white), attenuation distance].
// Peach keeps the stone nearly clear (warm glass reads as skin) and carries its colour in the light instead.
const ATT = { ice: [0.3, 1.75], lilac: [0.3, 1.75], mint: [0.34, 1.85], peach: [-0.5, 4.2], graphite: [0.42, 2.0] }
// a saturated status light for needs-you (graphite's own glow is too pale to read as a signal)
const PIP = { graphite: '#69b4ff' }

/* ---------------- geometry: a superellipsoid lozenge with analytic normals ---------------- */
// |x/a|^n + |y/b|^n, raised to m/n, plus |z/c|^m = 1. n squares the outline, m flattens the faces.
// egg widens the bottom a touch, like a stone that settled.
function pebbleGeometry({ a, b, c, n, m, egg, ws, hs }) {
  const g = new THREE.SphereGeometry(1, ws, hs)
  const pos = g.attributes.position, nor = g.attributes.normal
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    const dx = pos.getX(i), dy = pos.getY(i), dz = pos.getZ(i)
    const F = Math.pow(Math.pow(Math.abs(dx) / a, n) + Math.pow(Math.abs(dy) / b, n), m / n) + Math.pow(Math.abs(dz) / c, m)
    const r = Math.pow(F, -1 / m)
    const x = dx * r, y = dy * r, z = dz * r
    const px = Math.abs(x) / a, py = Math.abs(y) / b, pz = Math.abs(z) / c
    const s = Math.pow(px, n) + Math.pow(py, n)
    const k = s > 1e-9 ? Math.pow(s, m / n - 1) : 0
    const gx = k * Math.pow(px, n - 1) * Math.sign(x) / a
    const gy = k * Math.pow(py, n - 1) * Math.sign(y) / b
    const gz = Math.pow(pz, m - 1) * Math.sign(z) / c
    const fx = 1 - egg * y / b
    pos.setXYZ(i, x * fx, y, z)
    // normals through the egg deformation: n' = J^-T n (scaled by fx)
    v.set(gx, (egg * x / b) * gx + fx * gy, fx * gz).normalize()
    nor.setXYZ(i, v.x, v.y, v.z)
  }
  g.deleteAttribute('uv')
  g.computeBoundingSphere()
  return g
}

/* ---------------- textures ---------------- */
function starTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  const rg = g.createRadialGradient(32, 32, 0, 32, 32, 14)
  rg.addColorStop(0, 'rgba(255,255,255,1)')
  rg.addColorStop(0.35, 'rgba(255,255,255,.45)')
  rg.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = rg
  g.fillRect(0, 0, 64, 64)
  // four-point star: two thin tapered beams
  g.fillStyle = '#fff'
  for (const rot of [0, Math.PI / 2]) {
    g.save()
    g.translate(32, 32)
    g.rotate(rot)
    g.beginPath()
    g.moveTo(-31, 0); g.quadraticCurveTo(0, -3.4, 31, 0); g.quadraticCurveTo(0, 3.4, -31, 0)
    g.fill()
    g.restore()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/* ---------------- shaders ---------------- */
const LENS_VERT = /* glsl */ `
varying vec3 vP;
varying vec3 vClip;
void main() {
  vP = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vClip = gl_Position.xyw;
}`

const LENS_FRAG = /* glsl */ `
uniform float uT, uPulse, uOpen, uStyle, uHappy, uClosed, uDroop, uWorry, uRing, uGlow, uSwirl, uRip, uLevel, uTalk;
uniform float uWarm, uSpark, uAlert, uDone, uSweep, uListen, uCeleb, uSmall, uFrost, uEgg, uN, uDim, uDark;
uniform float uRingR, uCoreR, uOpacity, uHasBg, uLid, uGap, uHead;
uniform vec2 uLook, uA, uEyePos, uEyeSize;
uniform vec3 uPip;
uniform vec4 uBgMap;
uniform sampler2D uBg;
uniform vec3 cBase, cCore, cHalo, cSoft, cWarm, cWarmEye, cBg, cPip;
varying vec3 vP;
varying vec3 vClip;
#define PI 3.14159265
#define TAU 6.2831853

float smax(float a, float b, float k) { float h = clamp(0.5 - 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) + k * h * (1.0 - h); }
float sdRoundBox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r; }
// iq's arc: aperture ap around +y, radius ra, thickness rb, round caps
float sdArc(vec2 p, float ap, float ra, float rb) {
  vec2 sc = vec2(sin(ap), cos(ap));
  p.x = abs(p.x);
  return ((sc.y * p.x > sc.x * p.y) ? length(p - sc * ra) : abs(length(p) - ra)) - rb;
}
// a point at normalised radius r and angle a on the lens squircle, in lens xy
vec2 onRing(float a, float r) {
  vec2 cs = vec2(cos(a), sin(a));
  float rn = pow(pow(abs(cs.x), uN) + pow(abs(cs.y), uN), 1.0 / uN);
  vec2 q = cs * r / rn;
  return vec2(q.x * uA.x * (1.0 - uEgg * q.y), q.y * uA.y);
}

float eye(vec2 p, float s) {
  vec2 q = p - vec2(s * uEyePos.x, uEyePos.y) - uLook;
  float w = uEyeSize.x, h = uEyeSize.y;
  float big = max(1.0, uOpen);
  float d, top, bot;
  if (uStyle < 0.5) {            // pills
    float hh = h * big;
    d = sdRoundBox(q, vec2(w, hh), w);
    top = hh; bot = -hh;
  } else if (uStyle < 1.5) {     // dots
    float r = w * 1.5 * mix(1.0, 1.1, big - 1.0);
    d = length(q) - r;
    top = r; bot = -r;
  } else {                       // arcs: a gumdrop, round on top and only gently flattened below, so it reads awake
    float r = w * 1.55 * mix(1.0, 1.08, big - 1.0);
    vec2 o = vec2(0.0, -r * 0.08);
    float cut = o.y - r * 0.78;
    d = smax(length(q - o) - r, cut - q.y, r * 0.3);
    top = o.y + r; bot = cut;
  }
  // upper lid comes down from the top
  float lid = mix(bot + w * 0.42, top + 0.02, clamp(uOpen, 0.0, 1.0));
  // sleepy: a heavy, level lid resting low; the soft round lower half stays
  lid = mix(lid, mix(bot + w * 0.3, top, uLid), uDroop);
  // worried: lids raised toward the nose (about 27 degrees), set a little lower
  lid -= s * q.x * 0.52 * uWorry + uWorry * h * 0.16;
  d = smax(d, q.y - lid, w * mix(0.32, 0.1, max(uDroop, uWorry)));
  // happy arcs (done, celebrating): an upturned curve; celebrating's are bigger and bolder
  float R = w * (2.05 + 0.3 * uCeleb);
  float dh = sdArc(q - vec2(0.0, h * (0.16 + 0.12 * uCeleb) - R), 1.0 + 0.08 * uCeleb, R, w * mix(0.5, 0.64, uSmall) * (1.0 + 0.22 * uCeleb));
  // closed arcs (resting): a gentle downturned curve
  float Rc = w * 2.05;
  float dc = sdArc(vec2(q.x, -(q.y - (Rc - h * 0.42))), 0.92, Rc, w * mix(0.36, 0.5, uSmall));
  d = mix(d, dh, uHappy);
  d = mix(d, dc, uClosed);
  return d;
}

void main() {
  vec2 p = vP.xy;
  float lb = uA.y;
  vec2 u = vec2(p.x / (1.0 - uEgg * p.y / lb) / uA.x, p.y / lb);
  float rho = pow(pow(abs(u.x), uN) + pow(abs(u.y), uN), 1.0 / uN);
  float th = atan(u.y, u.x);
  float a01 = th / TAU;

  // what the clear glass shows here: the panel behind the stone (the engine's backdrop, same screen position)
  vec3 bg = cBg;
  if (uHasBg > 0.5) bg = texture2D(uBg, (vClip.xy / vClip.z) * uBgMap.xy + uBgMap.zw).rgb;

  // ---- the smoked core: deepest in the middle, dissolving into clear glass at its edge
  float fw = 0.012 + 0.08 * uFrost * uFrost * uFrost;
  float core = 1.0 - smoothstep(uCoreR - fw, uCoreR + fw, rho);
  vec3 halo = mix(cHalo, cWarm, uWarm);
  // smoked glass: deeper at the top, a little light gathering toward the bottom, lighter toward its rim
  vec3 smoke = cBase * mix(0.85, 1.4, smoothstep(0.45, uCoreR, rho)) * (1.0 + 0.28 * smoothstep(0.1, -0.9, u.y) - 0.12 * smoothstep(0.2, 0.9, u.y));
  vec3 col = mix(bg, smoke, core * uOpacity);
  vec3 lt = halo * (0.035 + 0.04 * uListen) * uGlow * core * (1.0 - rho * 0.6);

  // ---- ripples (talking): rings of light leaving the face and spreading out through the ring
  float rip = 0.0;
  for (int i = 0; i < 2; i++) {
    float r = fract(uT * 0.55 + float(i) * 0.5);
    float dd = (rho - 0.42 - r * 0.5) * lb;
    rip += sin(r * PI) * (1.0 - r * 0.5) * exp(-dd * dd / 0.00016);
  }
  lt += halo * rip * uRip * (0.12 + 0.45 * uLevel) * core;

  // ---- the halo ring, floating inside the lens
  // thinking: one short comet (about 60 degrees with its tail) circling clockwise. Its orbit is uneven: it
  // glides across the upper right, where the eyes look, then slips round the back (bottom left), where it is
  // hidden, so it never sits under the eyes like a mouth.
  float cs = fract(a01 - uHead);
  float comet = (1.0 - exp(-cs * 90.0)) * exp(-cs * 8.0) * 3.0 * (1.0 - smoothstep(0.1, 0.165, cs));
  comet *= smoothstep(-0.25, 0.4, dot(vec2(cos(th), sin(th)), vec2(0.55, 0.835)));
  float cw = clamp(comet * uSwirl, 0.0, 2.0);
  float dr = (rho - uRingR) * lb;
  float tw = mix(0.0085, 0.016, uSmall) * (1.0 + 0.8 * uAlert + 1.0 * uLevel * uTalk + 0.35 * uCeleb + 0.3 * uListen + 0.55 * cw) * (1.0 + 0.7 * uFrost);
  tw = max(tw, fwidth(dr) * 0.9);
  float ringCore = exp(-dr * dr / (tw * tw));
  float ringGlow = exp(-abs(dr) / (mix(0.028, 0.04, uSmall) * (1.0 + 0.8 * uFrost)));
  float ringI = uRing * (0.85 + 0.15 * sin(th * 2.0 - uT * 0.7));
  ringI *= 1.0 + 1.0 * uLevel * uTalk;
  // worried: an uneasy flicker, and one small gap that drifts
  float fl = 0.5 + 0.5 * sin(uT * 9.3 + 2.0 * sin(uT * 3.7)) * sin(uT * 5.1 + 1.0 + th);
  float gd = abs(fract(a01 - uGap + 0.5) - 0.5);
  float gap = smoothstep(0.02, 0.05, gd);
  ringI *= mix(1.0, (0.4 + 0.85 * fl) * gap, uWorry);
  // needs-you: a bright heartbeat
  ringI += uAlert * (0.55 + 1.25 * uPulse);
  // listening: the whole ring lit, steady and even
  ringI += uListen * (0.55 + 0.08 * uPulse);
  ringI += cw;
  // celebrating: three bright bands chasing round
  float cb = 0.5 + 0.5 * sin(th * 3.0 - uT * 3.4);
  float cb3 = cb * cb * cb;
  ringI += uCeleb * (0.35 + 1.1 * cb3);
  vec3 ringCol = mix(halo, vec3(1.0), (0.18 + 0.45 * min(cw, 1.0) + 0.35 * uCeleb * cb3) * (1.0 - 0.8 * uWarm));
  lt += ringCol * ringI * (ringCore * 1.2 + ringGlow * 0.2);
  // the comet's light spills softly into the lens around it
  lt += halo * cw * ringGlow * 0.35;
  // done: the ring closes clockwise from the top, a bright head leading, then holds
  float ac = fract(0.25 - a01);
  float sw = uSweep;
  float drawn = (1.0 - smoothstep(sw - 0.05, sw, ac)) * smoothstep(0.0, 0.05, ac);
  drawn = mix(drawn, 1.0, smoothstep(0.93, 1.0, sw));
  float head = exp(-max(0.0, sw - ac) * 11.0) * (1.0 - smoothstep(0.9, 1.0, sw));
  lt += ringCol * uDone * drawn * (0.85 + 1.3 * head) * (ringCore * 1.25 + ringGlow * 0.1);

  // ---- celebrating: a slow wash of coloured light, and four-point glints riding the ring
  float wash = 0.5 + 0.5 * sin(p.x * 3.2 + p.y * 2.0 - uT * 2.2);
  lt += mix(halo, mix(cSoft, vec3(1.0), 0.4), wash) * uCeleb * (0.05 + 0.06 * wash) * core;
  float spk = 0.0;
  float sz = mix(1.0, 1.7, uSmall);
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    vec2 q = p - onRing(fi * 1.5708 + 0.75 - uT * 0.6, uRingR);
    float tw2 = pow(max(0.0, sin(uT * 3.1 + fi * 2.1)), 3.0);
    float st = exp(-length(q) / (0.011 * sz)) + 0.9 * exp(-abs(q.x) / (0.0045 * sz) - abs(q.y) / (0.055 * sz)) + 0.9 * exp(-abs(q.y) / (0.0045 * sz) - abs(q.x) / (0.055 * sz));
    spk += st * (0.3 + 0.7 * tw2);
  }
  lt += mix(vec3(1.0), cSoft, 0.2) * spk * uSpark * 1.15;

  // ---- eyes
  float d = min(eye(p, -1.0), eye(p, 1.0));
  float aa = fwidth(d) * 0.85 + 0.002 + uFrost * 0.007;
  float ecore = 1.0 - smoothstep(-aa, aa, d);
  float bloom = exp(-max(d, 0.0) / (mix(0.04, 0.055, uSmall) * (1.0 + 0.9 * uFrost)));
  vec3 eyeCol = mix(cCore, cWarmEye, uWarm) * (0.58 + 0.45 * uGlow);
  lt += halo * bloom * 0.3 * uGlow;
  // a hotter centre gives the light some depth
  eyeCol *= 1.0 + 0.2 * (1.0 - smoothstep(-uEyeSize.x * 0.8, 0.0, d));

  // ---- voice light (talking): a short bar that breathes with the reply, mostly in height
  vec2 mq = p - vec2(uLook.x * 0.7, uEyePos.y - uEyeSize.y * 1.85 + uLook.y * 0.6);
  float mw = mix(0.06, 0.08, uSmall) + uLevel * 0.035;
  float mh = mix(0.014, 0.022, uSmall) + uLevel * mix(0.034, 0.036, uSmall);
  float dm = sdRoundBox(mq, vec2(mw, mh), mh);
  float mcore = 1.0 - smoothstep(-aa, aa, dm);
  lt += halo * exp(-max(dm, 0.0) / 0.04) * 0.25 * uTalk * (0.4 + uLevel);

  col += lt * uDim;
  col = mix(col, eyeCol * uDim, ecore);
  col = mix(col, eyeCol * (0.75 + 0.35 * uLevel) * uDim, mcore * uTalk);

  // ---- needs-you: a status light in its own dark seat, beating with the ring
  float pd = length(p - uPip.xy);
  float paa = fwidth(pd) * 0.9 + 0.002;
  float pip = 1.0 - smoothstep(uPip.z - paa, uPip.z + paa, pd);
  float seat = smoothstep(uPip.z * 0.85, uPip.z * 1.2, pd) * (1.0 - smoothstep(uPip.z * 1.45, uPip.z * 2.0, pd));
  col *= 1.0 - 0.8 * seat * uAlert;
  col += cPip * exp(-max(pd - uPip.z * 1.6, 0.0) / (uPip.z * 1.2)) * smoothstep(uPip.z * 1.3, uPip.z * 2.0, pd) * uAlert * (0.35 + 0.9 * uPulse);
  // a saturated light with a hot white centre
  col = mix(col, mix(cPip * 1.25, vec3(1.6), smoothstep(uPip.z * 0.75, 0.0, pd)) * (1.0 + 0.45 * uPulse), pip * uAlert);

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

/* ---------------- the character ---------------- */
export default {
  id: 'pebble',
  name: 'Pebble',
  vibe: 'A polished glass river stone with a smoked lens suspended inside; its face is light living in the glass.',
  eyes: ['pills', 'dots', 'arcs'],
  frame: { height: 2.6, y: 0, peek: { height: 2.28, y: -0.02 }, header: { height: 2.3, y: -0.01 } },
  create({ kit, look, size }) {
    const small = size !== 'big'
    const tiny = size === 'peek'
    const object = new THREE.Group()
    const root = new THREE.Group()
    const tilt = new THREE.Group()
    object.add(root)
    root.add(tilt)

    // Shell: a lozenge 2.4 wide, 1.72 tall, 0.84 thick.
    const SH = { a: 1.2, b: 0.86, c: 0.45, n: 2.25, m: 2.05, egg: 0.05 }
    const seg = tiny ? [56, 38] : small ? [72, 48] : [112, 72]
    const shellGeo = pebbleGeometry({ ...SH, ws: seg[0], hs: seg[1] })
    const U = {
      uT: { value: 0 }, uWob: { value: 0 }, uRip: { value: 0 }, uSwirl: { value: 0 }, uLevel: { value: 0 },
      uWinA: { value: new THREE.Vector2(0.86 * SH.a, 0.8 * SH.b) },
      uWinRough: { value: 0.2 }, uThin: { value: 0.04 }, uThick: { value: 1.1 }, uBand: { value: 0.4 },
      uPipe: { value: new THREE.Color() }, uCaustic: { value: new THREE.Color() }, uInner: { value: new THREE.Color() },
      uHair: { value: new THREE.Color() }, uHairI: { value: 0.5 }, uVeil: { value: new THREE.Color() }, uVeilA: { value: 0 },
      uSmallS: { value: tiny ? 2 : small ? 1 : 0 }, uGain: { value: 1 }, uToe: { value: 0 }, uCMix: { value: 0 }, uEdgeRefl: { value: 1 }, uDesat: { value: 0 },
    }
    const shellMat = kit.glass(look, { thickness: 1, ior: 1.42, iridescence: 0.2, iridescenceIOR: 1.3 })
    // The panel behind a light theme is near white; ACES would grey it through the glass. Map linearly and
    // roll off only the highlights, so the thin middle of the stone matches the panel.
    shellMat.toneMapped = false
    shellMat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U)
      sh.vertexShader = 'uniform float uT, uWob, uRip, uSwirl, uLevel; uniform vec2 uWinA; varying float vWin; varying float vNear;\n' + sh.vertexShader
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
          {
            vec3 lp = position;
            float fr = smoothstep(0.05, 0.6, normal.z);
            float r = length(lp.xy * vec2(0.82, 1.05));
            vec2 radial = lp.xy / max(r, 1e-3);
            vec2 tang = vec2(-radial.y, radial.x);
            float ang = atan(lp.y, lp.x);
            float rip = uRip * (0.03 + 0.06 * uLevel) * fr * sin(r * 10.0 - uT * 7.5) * (1.0 - smoothstep(0.5, 1.15, r)) * smoothstep(0.1, 0.4, r);
            float sw = uSwirl * 0.04 * fr * smoothstep(0.25, 0.7, r) * sin(2.0 * ang + r * 4.0 - uT * 2.4);
            vec2 wob = uWob * 0.07 * vec2(sin(lp.y * 2.1 + uT * 1.05), cos(lp.x * 1.7 - uT * 0.85));
            vec2 wq = lp.xy / uWinA;
            float wr = pow(pow(abs(wq.x), 2.25) + pow(abs(wq.y), 2.25), 1.0 / 2.25);
            vWin = smoothstep(0.35, 0.75, normal.z) * (1.0 - smoothstep(0.7, 0.95, wr));
            // the liquid moves the body more than the face window, so the face never smears
            objectNormal = normalize(objectNormal + vec3((radial * rip + tang * sw + wob) * (1.0 - 0.6 * vWin), 0.0));
            vNear = (1.0 - smoothstep(0.75, 1.3, wr)) * (0.3 + 0.7 * smoothstep(-0.3, 0.6, normal.z));
          }`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          transformed += normal * uWob * 0.012 * sin(position.x * 2.2 + position.y * 1.3 + uT * 1.2);`)
      sh.fragmentShader = `uniform float uWinRough, uThin, uThick, uBand, uHairI, uVeilA, uSmallS, uGain, uToe, uCMix, uEdgeRefl, uDesat;
        uniform vec3 uPipe, uCaustic, uInner, uHair, uVeil; varying float vWin; varying float vNear;\n` + sh.fragmentShader
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor *= mix(1.0, uWinRough, vWin);`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          float pbNV = saturate(dot(normal, normalize(vViewPosition)));
          float pbFr = 1.0 - pbNV;
          vec2 pbD = normalize(normal.xy + 1e-4);
          // a thin caustic crescent: light focused by the stone into its lower inner edge
          float pbC = pow(max(0.0, dot(pbD, vec2(0.34, -0.94))), 12.0) * smoothstep(0.3, 0.55, pbFr) * (1.0 - smoothstep(0.66, 0.84, pbFr));
          totalEmissiveRadiance += uCaustic * pbC * (1.0 - uCMix);
          // the face's light scattering faintly into the glass around the lens (dark panels only)
          totalEmissiveRadiance += uInner * vNear * (1.0 - 0.6 * vWin);`)
        // on light panels the room reflected at grazing angles is a white wash that hides the deep edge of the
        // glass: reflect less there, so the tinted thickness and the dark band read (as in a studio with dark flags)
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
          {
            float er = mix(1.0, uEdgeRefl, smoothstep(0.4, 0.9, pbFr));
            reflectedLight.indirectSpecular *= er;
            #ifdef USE_CLEARCOAT
              clearcoatSpecularIndirect *= mix(1.0, er, 0.7);
            #endif
          }`)
        // Beer-Lambert: thin through the face, deep at the silhouette; then a darker refraction band inside the
        // light pipe (dark then bright at the edge is how glass reads on white)
        .replace('#include <transmission_fragment>', THREE.ShaderChunk.transmission_fragment
          .replace('material.thickness = thickness;', 'material.thickness = thickness * (uThin + uThick * pow(pbFr, 2.0));')
          .replace('material.transmissionAlpha = mix(', `transmitted.rgb = mix(transmitted.rgb, vec3(dot(transmitted.rgb, vec3(0.2126, 0.7152, 0.0722))), uDesat);
          transmitted.rgb *= uGain * (1.0 - uBand * smoothstep(0.45, 0.72, pbFr) * (1.0 - smoothstep(0.8, 0.92, pbFr)));
          material.transmissionAlpha = mix(`))
        .replace('#include <opaque_fragment>', `
          {
            // frost: a satin scatter in the body (the face window keeps most of its clarity)
            outgoingLight = mix(outgoingLight, uVeil, uVeilA * (1.0 - 0.75 * vWin) * (0.35 + 0.65 * smoothstep(0.15, 0.7, pbFr)));
            // light pipe: a bright band just inside the silhouette, strongest toward the key light and the bounce
            float key = max(0.0, dot(pbD, vec2(-0.6, 0.8)));
            float bounce = max(0.0, dot(pbD, vec2(0.6, -0.8)));
            float lo = mix(0.8, 0.74, uSmallS * 0.5);
            float pipe = smoothstep(lo, 0.93, pbFr) * (1.0 - smoothstep(0.955, 0.99, pbFr));
            outgoingLight += uPipe * pipe * (0.3 + 0.7 * max(key * key, 0.75 * bounce * bounce));
            // on light panels the caustic is a saturated crescent of the tint (adding light to white shows nothing)
            outgoingLight = mix(outgoingLight, uCaustic, saturate(pbC * uCMix));
            // a fine hairline at the very edge, anti-aliased
            float aa = fwidth(pbFr) * 1.2;
            float hair = smoothstep(0.955 - aa, 0.995, pbFr);
            outgoingLight = mix(outgoingLight, uHair, hair * uHairI);
          }
          #include <opaque_fragment>`)
        .replace('#include <tonemapping_fragment>', `
          {
            // identity below the knee, a soft shoulder above it; on dark panels a gentle toe (like ACES) keeps
            // the smoked body down near the panel
            gl_FragColor.rgb = gl_FragColor.rgb * gl_FragColor.rgb / (gl_FragColor.rgb + uToe) * (1.0 + uToe);
            vec3 k = vec3(0.82);
            vec3 over = max(gl_FragColor.rgb - k, 0.0);
            gl_FragColor.rgb = min(gl_FragColor.rgb, k) + (1.0 - k) * (1.0 - exp(-over / (1.0 - k)));
          }`)
    }
    const shell = new THREE.Mesh(shellGeo, shellMat)

    // Lens: a thin domed squircle concentric with the shell, its face just under the front surface. The visible
    // smoked core is smaller than the mesh (about 0.68 x 0.47); the rest fades into the clear glass.
    const LA = { a: 0.8, b: 0.56 }
    const lensGeo = pebbleGeometry({ a: LA.a, b: LA.b, c: 0.13, n: SH.n, m: 2.2, egg: SH.egg, ws: tiny ? 48 : 72, hs: tiny ? 32 : 48 })
    const eyeScale = tiny ? 1.3 : small ? 1.16 : 1
    const eyeW = 0.064 * eyeScale, eyeH = 0.135 * eyeScale
    const ringR = tiny ? 0.66 : small ? 0.645 : 0.62
    // a point on the halo ring at angle ang (in the lens's squircle space), plus a radius
    function pipAt(ang, rr, r) {
      const cx = Math.cos(ang), sy = Math.sin(ang)
      const rn = Math.pow(Math.pow(Math.abs(cx), SH.n) + Math.pow(Math.abs(sy), SH.n), 1 / SH.n)
      const ux = (cx * rr) / rn, uy = (sy * rr) / rn
      return new THREE.Vector3(ux * LA.a * (1 - SH.egg * uy), uy * LA.b, r)
    }
    const L = {
      uT: { value: 0 }, uPulse: { value: 0 }, uOpen: { value: 1 }, uStyle: { value: 0 }, uHappy: { value: 0 }, uClosed: { value: 0 },
      uDroop: { value: 0 }, uWorry: { value: 0 }, uRing: { value: 0.3 }, uGlow: { value: 1 }, uSwirl: { value: 0 }, uRip: { value: 0 },
      uLevel: { value: 0 }, uTalk: { value: 0 }, uWarm: { value: 0 }, uSpark: { value: 0 }, uAlert: { value: 0 }, uDone: { value: 0 },
      uSweep: { value: 1 }, uListen: { value: 0 }, uCeleb: { value: 0 }, uSmall: { value: small ? 1 : 0 }, uFrost: { value: look.frost },
      uEgg: { value: SH.egg }, uN: { value: SH.n }, uDim: { value: 1 }, uDark: { value: look.dark ? 1 : 0 },
      uRingR: { value: ringR }, uCoreR: { value: 0.84 }, uOpacity: { value: 0.95 }, uHasBg: { value: 0 }, uLid: { value: 0.4 }, uGap: { value: 0 }, uHead: { value: 0.1 },
      uLook: { value: new THREE.Vector2() }, uA: { value: new THREE.Vector2(LA.a, LA.b) },
      // upper left on the ring, clear of the shell's highlights and of the eyes
      uPip: { value: pipAt(1.98, ringR, tiny ? 0.082 : small ? 0.066 : 0.042) },
      uEyePos: { value: new THREE.Vector2(0.27 * (tiny ? 1.06 : 1), 0.04) },
      uEyeSize: { value: new THREE.Vector2(eyeW, eyeH) },
      uBgMap: { value: new THREE.Vector4(0.25, 0.3, 0.5, 0.5) }, uBg: { value: null },
      cBase: { value: new THREE.Color() }, cCore: { value: new THREE.Color() }, cHalo: { value: new THREE.Color() },
      cSoft: { value: new THREE.Color() }, cWarm: { value: WARM_DEEP.clone() }, cWarmEye: { value: new THREE.Color() },
      cBg: { value: new THREE.Color() }, cPip: { value: new THREE.Color() },
    }
    const lensMat = new THREE.ShaderMaterial({ uniforms: L, vertexShader: LENS_VERT, fragmentShader: LENS_FRAG })
    const lens = new THREE.Mesh(lensGeo, lensMat)
    lens.position.z = 0.23
    // Find the engine's backdrop (it is swapped when the look changes) and map screen position to its uv, so the
    // lens rim can show exactly what the glass would show there.
    const TAN13 = Math.tan(THREE.MathUtils.degToRad(13))
    lens.onBeforeRender = (renderer, scene, camera) => {
      let bd = null
      const ch = scene.children
      for (let i = 0; i < ch.length; i++) if (ch[i].userData && ch[i].userData.backdropKey !== undefined) { bd = ch[i]; break }
      const map = bd && bd.material && bd.material.map
      if (!map || !camera.isPerspectiveCamera) { L.uHasBg.value = 0; return }
      const tanH = camera.fov ? Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) : TAN13
      const D = camera.position.z - bd.position.z
      const w = bd.scale.x, h = bd.scale.y
      L.uBg.value = map
      L.uHasBg.value = 1
      L.uBgMap.value.set((tanH * camera.aspect * D) / w, (tanH * D) / h, 0.5 + (camera.position.x - bd.position.x) / w, 0.5 + (camera.position.y - bd.position.y) / h)
    }

    tilt.add(lens, shell)

    // Aura: soft light around the stone for attention (needs-you), talking and celebrating. Behind the shell,
    // so it only shows around the silhouette.
    const auraMat = new THREE.SpriteMaterial({ map: kit.glowTex, transparent: true, depthWrite: false, opacity: 0 })
    const aura = new THREE.Sprite(auraMat)
    aura.position.z = -0.6
    aura.scale.set(4.0, 3.2, 1)
    root.add(aura)

    // Sparkles outside the stone (celebrating only).
    const starTex = starTexture()
    // depthTest off: they float in front of the stone, and the shell's turned edge must not clip them
    const sparkMat = new THREE.SpriteMaterial({ map: starTex, transparent: true, depthWrite: false, depthTest: false, opacity: 0 })
    // Placed in the corners the lozenge leaves free, kept inside the frame (beam tips included) so none is cut off.
    const SPARKS = tiny
      ? [[-0.98, 0.64, 0.36, 0], [0.98, 0.6, 0.32, 1.7], [0.86, -0.72, 0.28, 3.1]]
      : [[-1.08, 0.74, 0.3, 0], [1.06, 0.78, 0.26, 1.3], [-1.18, -0.42, 0.2, 2.2], [1.16, -0.36, 0.22, 3.4], [0.3, 0.92, 0.17, 4.5], [-0.5, -0.94, 0.17, 5.3]]
    const SPARK_PULL = size === 'header' ? 0.95 : 1
    const sparks = SPARKS.map(([x, y, s, ph]) => {
      const m = sparkMat.clone()
      const sp = new THREE.Sprite(m)
      sp.position.set(x, y, 0.3)
      sp.userData = { x, y, s, ph }
      sp.visible = false
      object.add(sp)
      return sp
    })

    // reusable scratch
    const mp = {}
    const tmpA = new THREE.Color(), tmpB = new THREE.Color()
    const attBase = new THREE.Color(), causticBase = new THREE.Color()
    const baseRY = size === 'header' ? -0.2 : size === 'peek' ? -0.22 : -0.3
    const baseRX = 0.13
    const jitA = tiny ? 0.04 : small ? 0.028 : 0.016
    let curLook = look
    let desatBase = 0

    function setLook(l) {
      curLook = l
      const tn = l.tint
      const fr = l.frost
      kit.updateGlass(shellMat, l)
      // clear glass: colour near white; the tint lives in absorption, which deepens with thickness
      shellMat.color.copy(WHITE).lerp(tn.glass, tn.key === 'peach' ? 0 : tn.key === 'graphite' ? 0.1 : 0.05)
      const [toInk, dist] = ATT[tn.key] ?? ATT.ice
      attBase.copy(tn.glow)
      if (toInk >= 0) attBase.lerp(tn.ink, toInk)
      else attBase.lerp(WHITE, -toInk)
      shellMat.attenuationColor.copy(attBase)
      shellMat.attenuationDistance = dist * (l.dark ? 1.15 : 1)
      shellMat.thickness = 1
      // frost bites late: the default (0.55) is still clearly glass; 1 is satin
      const f2 = fr * fr, f3 = f2 * fr
      const body = (0.03 + 0.5 * f2) * (small ? 0.75 : 1)
      shellMat.roughness = body
      U.uWinRough.value = (0.02 + 0.2 * f3) / body
      shellMat.clearcoat = 1 - 0.6 * f2
      shellMat.clearcoatRoughness = 0.03 + 0.32 * f2
      // dark panels: smoked glass, so the body sits darker than the panel instead of glowing like resin
      U.uGain.value = l.dark ? 0.6 : 1
      // the dark backdrop carries the tint's own glows; smoked glass filters toward neutral (warm tints most)
      desatBase = l.dark ? (tn.key === 'peach' ? 0.85 : 0.35) : 0
      U.uDesat.value = desatBase
      shellMat.envMapIntensity = l.dark ? 0.42 : 0.85
      U.uThin.value = 0.04
      U.uThick.value = 3.5
      U.uToe.value = l.dark ? 0.06 : 0
      U.uEdgeRefl.value = l.dark ? 0.85 : 0.3
      U.uCMix.value = l.dark ? 0 : 0.85
      U.uBand.value = l.dark ? 0.2 : 0.42 * (1 - 0.4 * fr)
      // light pipe and hairline: on light panels a bright pipe then a dark hairline; on dark ones a lit edge
      if (l.dark) {
        U.uPipe.value.copy(tn.soft).lerp(WHITE, 0.5).multiplyScalar(tiny ? 0.42 : 0.34)
        U.uHair.value.copy(tn.soft).lerp(WHITE, 0.4).multiplyScalar(0.55)
        U.uHairI.value = tiny ? 0.5 : 0.35
        U.uVeil.value.copy(tn.soft).multiplyScalar(0.07)
      } else {
        U.uPipe.value.copy(WHITE).multiplyScalar(tiny ? 0.5 : 0.42)
        U.uHair.value.copy(tn.ink).lerp(BLACK, 0.35)
        U.uHairI.value = tiny ? 0.42 : small ? 0.4 : 0.32
        U.uVeil.value.copy(WHITE).lerp(tn.glass, 0.25)
      }
      U.uVeilA.value = 0.36 * Math.pow(fr, 2.5)
      if (l.dark) causticBase.copy(tn.glow).lerp(WHITE, 0.25)
      else causticBase.copy(tn.glow).lerp(tn.ink, tn.key === 'graphite' ? 0.35 : 0.12)

      // lens: a deep, smoked version of the tint. Warm inks are pulled toward neutral so the lens reads as
      // smoked glass, not as a coloured (or fleshy) surface.
      const lb = L.cBase.value.copy(tn.ink).multiplyScalar(l.dark ? 0.36 : 0.5)
      const desat = LENS_DESAT[tn.key] ?? 0.2
      const lum = 0.2126 * lb.r + 0.7152 * lb.g + 0.0722 * lb.b
      lb.lerp(tmpA.setRGB(lum, lum * 1.05, lum * 1.3), desat).multiplyScalar(1 - 0.25 * desat)
      if (tn.key === 'graphite') lb.multiplyScalar(0.85)
      L.uOpacity.value = l.dark ? 0.92 : 0.95
      // fallback for the lens rim when there is no backdrop: the engine's panel colour
      if (l.dark) L.cBg.value.set('#1a1d25').lerp(tn.glass, 0.08)
      else L.cBg.value.copy(WHITE).lerp(tn.glass, 0.35)
      L.cHalo.value.copy(tn.glow).lerp(tn.soft, HALO_SOFTEN[tn.key] ?? 0)
      L.cCore.value.copy(tn.glow).lerp(WHITE, EYE_WHITE[tn.key] ?? 0.62).multiplyScalar(1.55)
      L.cSoft.value.copy(tn.soft)
      L.cWarmEye.value.copy(WARM_DEEP).lerp(WARM, 0.4).lerp(WHITE, 0.12).multiplyScalar(1.45)
      L.cPip.value.set(PIP[tn.key] ?? '#' + tn.glow.getHexString())
      L.uFrost.value = fr
      L.uDark.value = l.dark ? 1 : 0
      L.uStyle.value = l.eyes === 'dots' ? 1 : l.eyes === 'arcs' ? 2 : 0
      auraMat.color.copy(tn.glow)
      auraMat.blending = l.dark ? THREE.AdditiveBlending : THREE.NormalBlending
      auraMat.needsUpdate = true
      for (const sp of sparks) {
        // on light panels the stars must hold their own against white: deep, saturated
        sp.material.color.copy(l.dark ? tmpA.copy(tn.glow).lerp(WHITE, 0.5) : tmpA.copy(tn.glow).lerp(tn.ink, 0.5))
        sp.material.blending = l.dark ? THREE.AdditiveBlending : THREE.NormalBlending
        sp.material.needsUpdate = true
      }
    }
    setLook(look)

    function update(f) {
      const rm = f.rm
      const w = rm ? 1 : 1 - Math.exp(-f.moodAge * 5.5)
      const a = MP[f.prevMood] || MP.idle, b = MP[f.mood] || MP.idle
      for (let i = 0; i < KEYS.length; i++) { const k = KEYS[i]; mp[k] = a[k] + (b[k] - a[k]) * w }
      const A = f.P / 0.55 // 1 calm, ~2.5 lively
      const T = rm ? 0.6 : f.clock
      const t = rm ? 0 : f.t
      const dark = curLook.dark

      // posture: float, turn toward where it looks, doze when resting/sleepy (level, no roll), cock the head
      // while listening, sway when uneasy
      const amp = rm ? 0 : 1
      root.position.y = f.bounce + amp * Math.sin(T * 1.15) * 0.022 * Math.min(A, 1.8) - mp.lean * 0.05
      tilt.rotation.y = baseRY + f.lookX * 0.13 + amp * Math.sin(T * 0.53) * 0.025 * A
      tilt.rotation.x = baseRX + f.lookY * 0.08 + amp * Math.sin(T * 0.71 + 1.0) * 0.018 * A + mp.lean * 0.06
      tilt.rotation.z = mp.listen * 0.075 + amp * mp.worry * Math.sin(t * 2.3) * 0.02 * A + (f.mood === 'celebrating' && !rm ? Math.sin(t * 6.5) * 0.04 : 0)
      const breathe = 1 + amp * Math.sin(T * (0.8 - mp.lean * 0.3)) * 0.006 * (1 + mp.lean)
      tilt.scale.set(breathe, 2 - breathe, breathe)

      const pulse = rm ? 0.6 : Math.pow(0.5 + 0.5 * Math.sin(t * 4.6), 2)
      // liquid shell
      U.uT.value = T
      U.uWob.value = f.wob * (0.6 + 0.6 * mp.lean)
      U.uDesat.value = desatBase * (1 - 0.8 * f.warm)
      U.uRip.value = f.rip
      U.uSwirl.value = f.swirl
      U.uLevel.value = f.level
      // worried: the glass itself warms to amber (absorption, not a grey wash)
      shellMat.attenuationColor.copy(attBase).lerp(WARM_ATT, f.warm * 0.8)
      // caustic: a thin crescent of the face's light in the lower inner edge
      const cI = (dark ? 0.5 : 0.7) * (0.55 + 0.45 * mp.glow * mp.dim + 0.9 * mp.alert * pulse + 0.6 * f.spark)
      U.uCaustic.value.copy(causticBase).lerp(WARM_DEEP, f.warm * 0.8).multiplyScalar(cI)
      // dark panels only: the face's light faintly scattering in the glass when it is excited
      if (dark) {
        tmpB.copy(curLook.tint.glow).multiplyScalar(0.012 * mp.glow * mp.dim + mp.alert * (0.03 + 0.09 * pulse) + f.spark * 0.04 + mp.listen * 0.012)
        tmpB.add(tmpA.copy(WARM_DEEP).multiplyScalar(f.warm * 0.05))
        U.uInner.value.copy(tmpB)
      } else U.uInner.value.setRGB(0, 0, 0)

      // lens face
      L.uT.value = T
      L.uPulse.value = pulse
      L.uOpen.value = f.open * f.blink * (1 - 0.14 * f.swirl)
      L.uHappy.value = mp.happy
      L.uClosed.value = mp.closed
      L.uDroop.value = mp.droop
      // sleepy lid: level, about 40% open, sagging slowly with the engine's lids (and still blinking)
      L.uLid.value = Math.max(0.05, (0.36 + (Math.min(f.open, 0.6) - 0.2) * 0.9) * f.blink)
      L.uWorry.value = mp.worry
      L.uRing.value = mp.ring
      L.uGlow.value = mp.glow
      L.uSwirl.value = f.swirl
      L.uRip.value = f.rip
      L.uLevel.value = f.level
      L.uTalk.value = mp.talk
      L.uWarm.value = f.warm
      L.uSpark.value = f.spark
      L.uAlert.value = mp.alert
      L.uCeleb.value = mp.celeb
      L.uListen.value = mp.listen
      L.uDone.value = mp.done
      L.uGap.value = rm ? 0.12 : 0.12 + Math.sin(T * 0.4) * 0.08
      // comet head (turns, counterclockwise from +x). Clockwise and uneven: it glides across the upper-right arc
      // (from 10 o'clock to 4 o'clock) for 88% of the cycle, then slips quickly round the back, where it is hidden.
      const ph = rm ? 0.45 : (T * 0.28) % 1
      const sw = ph < 0.88 ? (ph / 0.88) * (190 / 360) : 190 / 360 + ((ph - 0.88) / 0.12) * (170 / 360)
      const hd = 150 / 360 - sw
      L.uHead.value = hd - Math.floor(hd)
      const sweep = f.mood === 'done' && !rm ? Math.min(1, Math.max(0, (f.moodAge - 0.15) / 0.85)) : 1
      L.uSweep.value = sweep < 1 ? 1 - Math.pow(1 - sweep, 2.2) : 1
      L.uDim.value = mp.dim
      // eye shape per mood: listening rounder and lifted, needs-you wide, worried smaller, sleepy wide and low
      const ew = 1 + 0.36 * mp.listen + 0.12 * mp.alert + 0.12 * mp.worry + 0.42 * mp.droop
      const eh = 1 + 0.04 * mp.listen + 0.08 * mp.alert - 0.14 * mp.worry
      L.uEyeSize.value.set(eyeW * ew, eyeH * eh)
      L.uEyePos.value.y = 0.04 + 0.045 * mp.listen - 0.03 * mp.droop
      // worried: a small nervous jitter on top of the engine's glances
      const jit = rm ? 0 : mp.worry * jitA * (Math.sin(t * 17.3) * 0.6 + Math.sin(t * 28.7 + 1.3) * 0.4) * (0.5 + 0.5 * Math.sign(Math.sin(t * 2.9)))
      L.uLook.value.set(f.lookX * 0.18 + jit, -f.lookY * 0.13)

      // aura and sparkles
      const ap = mp.aura * (0.55 + 0.45 * (mp.alert > 0.5 ? pulse : 0.5 + 0.5 * f.level))
      auraMat.opacity = ap * (dark ? 0.55 : 0.42)
      aura.visible = auraMat.opacity > 0.01
      for (let i = 0; i < sparks.length; i++) {
        const sp = sparks[i], ud = sp.userData, x = ud.x, y = ud.y, s = ud.s, ph = ud.ph
        const cyc = rm ? 0.5 : ((t * 0.55 + ph * 0.37) % 1)
        const tw = rm ? 0.8 : 0.25 + 0.75 * Math.pow(Math.max(0, Math.sin(cyc * Math.PI)), 1.5)
        sp.material.opacity = f.spark * tw
        sp.visible = sp.material.opacity > 0.01
        const sc = s * (0.55 + 0.6 * tw) * (tiny ? 1.45 : small ? 1.2 : 1)
        sp.scale.set(sc, sc, 1)
        sp.position.set(x * SPARK_PULL * (1 + 0.03 * cyc), y * SPARK_PULL + cyc * 0.07 + f.bounce * 0.5, 0.3)
        sp.material.rotation = rm ? 0 : cyc * 0.8
      }
    }

    return {
      object,
      update,
      setLook,
      dispose() {
        shellGeo.dispose(); lensGeo.dispose()
        shellMat.dispose(); lensMat.dispose(); auraMat.dispose()
        starTex.dispose(); sparkMat.dispose()
        for (const sp of sparks) sp.material.dispose()
      },
    }
  },
}
