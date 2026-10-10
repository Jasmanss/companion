// Pebble: a polished glass river stone, seen a little from the side. Inside it sits a smoked, frosted lens,
// and the face is light living in that lens: two soft pills and a halo ring that carries the mood
// (a comet that circles while thinking, ripples while talking, a ring that closes when a task is done,
// a pulse when it needs you, an amber flicker when something broke, sparkles when something shipped).
//
// Build notes
// - One transmissive mesh (the shell). Everything inside it is opaque, so the transmission pass refracts it.
// - The lens is a single opaque ShaderMaterial: eyes, ring, ripples, swirl and sparkles are drawn as SDFs,
//   so they stay crisp at 50x44 and morph smoothly between moods.
// - The shell's front window stays polished while the frost slider frosts the body (roughness is scaled per
//   fragment), so the face stays legible at any frost. Its normals carry the liquid: a slow wobble, ripples
//   while talking and a swirl while thinking bend the refraction and the highlights.
// - Mood blends are computed from face.moodAge, not from internal easing, so mood-sheet stills match live views.
import * as THREE from 'three'

const WARM = new THREE.Color('#ffb870')
const WARM_DEEP = new THREE.Color('#ff9a3c')
const WHITE = new THREE.Color(1, 1, 1)
const TAU = Math.PI * 2

// Per-mood targets. ring: halo brightness, glow: eye light, happy/closed: eye shapes, droop/worry: lids,
// alert/talk/celeb/done/listen: ring behaviors, lean: dozing posture, aura: glow around the stone.
const MP = {
  resting: { ring: 0.07, glow: 0.5, happy: 0, closed: 1, droop: 0, worry: 0, alert: 0, talk: 0, celeb: 0, done: 0, listen: 0, lean: 1, aura: 0, dim: 0.75 },
  idle: { ring: 0.26, glow: 0.92, happy: 0, closed: 0, droop: 0, worry: 0, alert: 0, talk: 0, celeb: 0, done: 0, listen: 0, lean: 0, aura: 0, dim: 1 },
  listening: { ring: 0.32, glow: 1.08, happy: 0, closed: 0, droop: 0, worry: 0, alert: 0, talk: 0, celeb: 0, done: 0, listen: 1, lean: 0, aura: 0.15, dim: 1 },
  thinking: { ring: 0.1, glow: 0.92, happy: 0, closed: 0, droop: 0, worry: 0, alert: 0, talk: 0, celeb: 0, done: 0, listen: 0, lean: 0, aura: 0.1, dim: 1 },
  talking: { ring: 0.36, glow: 1.02, happy: 0, closed: 0, droop: 0, worry: 0, alert: 0, talk: 1, celeb: 0, done: 0, listen: 0, lean: 0, aura: 0.2, dim: 1 },
  done: { ring: 0.2, glow: 1.0, happy: 1, closed: 0, droop: 0, worry: 0, alert: 0, talk: 0, celeb: 0, done: 1, listen: 0, lean: 0, aura: 0.1, dim: 1 },
  'needs-you': { ring: 0.5, glow: 1.15, happy: 0, closed: 0, droop: 0, worry: 0, alert: 1, talk: 0, celeb: 0, done: 0, listen: 0, lean: 0, aura: 1, dim: 1 },
  worried: { ring: 0.5, glow: 0.95, happy: 0, closed: 0, droop: 0, worry: 1, alert: 0, talk: 0, celeb: 0, done: 0, listen: 0, lean: 0, aura: 0.15, dim: 1 },
  celebrating: { ring: 0.45, glow: 1.15, happy: 1, closed: 0, droop: 0, worry: 0, alert: 0, talk: 0, celeb: 1, done: 0, listen: 0, lean: 0, aura: 0.55, dim: 1 },
  sleepy: { ring: 0.05, glow: 0.6, happy: 0, closed: 0, droop: 1, worry: 0, alert: 0, talk: 0, celeb: 0, done: 0, listen: 0, lean: 0.7, aura: 0, dim: 0.8 },
}
const KEYS = Object.keys(MP.idle)
const LENS_DESAT = { ice: 0.08, lilac: 0.15, mint: 0.35, peach: 1, graphite: 0 }
// how much the eye light is pulled toward white (warm glows read as skin when saturated)
const EYE_WHITE = { ice: 0.62, lilac: 0.62, mint: 0.6, peach: 0.84, graphite: 0.62 }
const HALO_SOFTEN = { ice: 0, lilac: 0, mint: 0.1, peach: 0.55, graphite: 0 }

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
    g.moveTo(-31, 0); g.quadraticCurveTo(0, -3.2, 31, 0); g.quadraticCurveTo(0, 3.2, -31, 0)
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
void main() {
  vP = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

const LENS_FRAG = /* glsl */ `
uniform float uT, uPulse, uOpen, uStyle, uHappy, uClosed, uDroop, uWorry, uRing, uGlow, uSwirl, uRip, uLevel, uTalk;
uniform float uWarm, uSpark, uAlert, uDone, uSweep, uListen, uCeleb, uSmall, uFrost, uEgg, uN, uDim, uDark;
uniform vec2 uLook, uA, uEyePos, uEyeSize;
uniform vec3 cBase, cCore, cHalo, cSoft, cWarm;
varying vec3 vP;
#define PI 3.14159265

float smax(float a, float b, float k) { float h = clamp(0.5 - 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) + k * h * (1.0 - h); }
float sdRoundBox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r; }
// iq's arc: aperture ap around +y, radius ra, thickness rb, round caps
float sdArc(vec2 p, float ap, float ra, float rb) {
  vec2 sc = vec2(sin(ap), cos(ap));
  p.x = abs(p.x);
  return ((sc.y * p.x > sc.x * p.y) ? length(p - sc * ra) : abs(length(p) - ra)) - rb;
}

float eye(vec2 p, float s) {
  vec2 q = p - vec2(s * uEyePos.x, uEyePos.y) - uLook;
  float w = uEyeSize.x * (1.0 + 0.3 * uDroop), h = uEyeSize.y;
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
  } else {                       // arcs: a soft dome
    float r = w * 1.85 * mix(1.0, 1.08, big - 1.0);
    vec2 o = vec2(0.0, -r * 0.42);
    d = max(length(q - o) - r, (o.y - q.y));
    d = max(d, -r * 2.0);
    top = r * 0.58; bot = o.y;
  }
  // upper lid: comes down from the top; slants down at the outer corner when droopy or worried
  // sleepy lids rest half way down, flat across the top
  float open = clamp(mix(uOpen, 0.3 + uOpen * 0.75, uDroop), 0.0, 1.0);
  float lid = mix(bot + w * 0.42, top + 0.02, open);
  lid -= s * q.x * (0.08 * uDroop + 0.55 * uWorry);
  d = smax(d, q.y - lid, w * 0.35);
  // happy arcs (done, celebrating): a soft upturned curve
  float R = w * 2.05;
  float dh = sdArc(q - vec2(0.0, h * 0.18 - R), 1.0, R, w * mix(0.52, 0.66, uSmall));
  // closed arcs (resting): a gentle downturned curve
  float dc = sdArc(vec2(q.x, -(q.y - (R - h * 0.42))), 0.92, R, w * mix(0.36, 0.5, uSmall));
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

  // ---- the lens: smoked frosted glass, faintly lit from within
  vec3 base = mix(cBase, cWarm * 0.04, uWarm * 0.35);
  vec3 col = base * (0.62 + 0.75 * (1.0 - rho * rho));
  vec3 halo = mix(cHalo, cWarm, uWarm);
  col += halo * (0.035 + 0.05 * uListen) * uGlow * (1.0 - rho);
  // needs-you: the lens itself breathes with light
  col += halo * uAlert * (0.1 + 0.28 * uPulse) * (1.15 - rho * 0.7);
  // a chamfer that catches light at the upper left, and a dark seat at the very edge
  float bev = smoothstep(0.88, 0.975, rho) * (1.0 - smoothstep(0.975, 1.0, rho));
  float lit = max(0.0, dot(normalize(u + 1e-4), normalize(vec2(-0.55, 0.85))));
  col += vec3(0.55) * bev * (0.12 + 0.88 * lit * lit) * mix(0.28, 0.4, uDark);
  col *= mix(1.0, 0.55, smoothstep(0.975, 1.0, rho));

  // ---- ripples (talking): rings of light that leave the eyes and spread to the edge
  float rip = 0.0;
  for (int i = 0; i < 2; i++) {
    float r = fract(uT * 0.55 + float(i) * 0.5);
    float dd = (rho - 0.48 - r * 0.36) * lb;
    rip += sin(r * 3.14159) * (1.0 - r) * exp(-dd * dd / 0.00012);
  }
  col += halo * rip * uRip * (0.1 + 0.42 * uLevel);

  // ---- the halo ring
  float dr = (rho - 0.865) * lb;
  float tw = mix(0.0105, 0.02, uSmall) * (1.0 + 0.7 * uAlert + 1.1 * uLevel * uTalk + 0.3 * uCeleb);
  tw = max(tw, fwidth(dr) * 0.9);
  float ringCore = exp(-dr * dr / (tw * tw));
  float ringGlow = exp(-abs(dr) / mix(0.03, 0.045, uSmall));
  float a01 = th / (2.0 * PI);
  float ringI = uRing * (0.78 + 0.22 * sin(th * 2.0 - uT * 0.7));
  ringI *= 1.0 + 0.9 * uLevel * uTalk;
  // worried: an uneasy, wavering signal
  // worried: an uneasy, broken signal: the ring splits into wavering segments
  float fl = 0.5 + 0.5 * sin(th * 3.0 + uT * 2.9) * sin(th * 5.0 - uT * 2.1 + 1.3);
  float seg = smoothstep(-0.25, 0.35, sin(th * 7.0 + uT * 1.7 + sin(uT * 3.3) * 0.6));
  ringI *= mix(1.0, (0.15 + 1.3 * fl) * seg, uWorry);
  // needs-you: a bright heartbeat
  ringI += uAlert * (0.55 + 1.0 * uPulse);
  // listening: light gathers along the bottom of the ring, as if it's taking in what you type
  float sb = max(0.0, -sin(th));
  ringI += uListen * (0.15 + 1.05 * sb * sb) * (0.85 + 0.15 * uPulse);
  col += halo * uListen * sb * sb * 0.1 * exp(-max(0.0, -dr) / 0.09) * step(dr, 0.0);
  // thinking: two comets circling clockwise, tails behind, soft heads (continuous, no seams)
  float cs = fract(a01 + uT * 0.33);
  float cs2 = fract(cs + 0.5);
  float comet = (1.0 - exp(-cs * 45.0)) * exp(-cs * 2.6) * 2.4 + (1.0 - exp(-cs2 * 45.0)) * exp(-cs2 * 4.0) * 1.1;
  ringI += uSwirl * comet;
  // the comet's light spills into the lens like a swirl of liquid light
  col += mix(halo, cSoft, 0.35) * uSwirl * comet * 0.3 * exp(-max(0.0, -dr) / 0.14) * step(dr, 0.0);
  // done: the ring closes clockwise from the top, then glows
  float ac = fract(0.25 - a01);
  float drawn = 1.0 - smoothstep(uSweep - 0.015, uSweep, ac);
  ringI += uDone * drawn * (0.95 + 1.0 * exp(-(uSweep - ac) * 14.0) * (1.0 - step(0.999, uSweep)));
  // celebrating: bright bands chasing around
  float cb = 0.5 + 0.5 * sin(th * 3.0 - uT * 3.2);
  ringI += uCeleb * (0.35 + 0.7 * pow(cb, 3.0));
  vec3 ringCol = mix(halo, vec3(1.0), 0.18 + 0.4 * clamp(comet * uSwirl, 0.0, 1.0) + 0.35 * uCeleb * pow(cb, 3.0));
  ringCol = mix(ringCol, mix(cSoft, vec3(1.0), 0.3), uCeleb * (1.0 - cb) * 0.6);
  col += ringCol * ringI * (ringCore * 1.25 + ringGlow * 0.22);

  // ---- celebrating: a slow wash of coloured light across the lens
  float wash = 0.5 + 0.5 * sin(p.x * 3.2 + p.y * 2.0 - uT * 2.2);
  col += mix(halo, mix(cSoft, vec3(1.0), 0.4), wash) * uCeleb * (0.07 + 0.07 * wash) * (1.1 - rho);

  // ---- sparkles inside the lens (celebrating)
  const vec2 SP[5] = vec2[5](vec2(-0.6, 0.5), vec2(0.55, 0.56), vec2(0.0, -0.62), vec2(-0.66, -0.36), vec2(0.64, -0.3));
  float spk = 0.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    vec2 q = p - SP[i] * uA;
    float tw2 = pow(max(0.0, sin(uT * 3.1 + fi * 2.1)), 4.0);
    float sz = mix(1.0, 2.0, uSmall);
    float st = exp(-length(q) / (0.012 * sz)) + 0.8 * exp(-abs(q.x) / (0.006 * sz) - abs(q.y) / (0.055 * sz)) + 0.8 * exp(-abs(q.y) / (0.006 * sz) - abs(q.x) / (0.055 * sz));
    spk += st * (0.35 + 0.65 * tw2);
  }
  col += mix(vec3(1.0), cSoft, 0.25) * spk * uSpark * 1.1;

  // ---- eyes
  float d = min(eye(p, -1.0), eye(p, 1.0));
  float aa = fwidth(d) * 0.85 + 0.0025 + uFrost * 0.006;
  float core = 1.0 - smoothstep(-aa, aa, d);
  float bloom = exp(-max(d, 0.0) / (mix(0.045, 0.06, uSmall) + 0.03 * uFrost));
  vec3 eyeCol = mix(cCore, mix(cWarm, vec3(1.0), 0.35) * 1.6, uWarm) * (0.55 + 0.5 * uGlow);
  col += halo * bloom * 0.3 * uGlow;
  // a hotter centre gives the light some depth
  eyeCol *= 1.0 + 0.22 * (1.0 - smoothstep(-uEyeSize.x * 0.8, 0.0, d));
  col = mix(col, eyeCol, core);

  // ---- voice light (talking): a small pill that breathes with the reply
  vec2 mq = p - vec2(uLook.x * 0.7, uEyePos.y - uEyeSize.y * 1.95 + uLook.y * 0.6);
  float mw = mix(0.03, 0.044, uSmall) + uLevel * mix(0.085, 0.09, uSmall);
  float mh = mix(0.02, 0.03, uSmall) + uLevel * mix(0.03, 0.032, uSmall);
  float dm = sdRoundBox(mq, vec2(mw, mh), mh);
  float mcore = 1.0 - smoothstep(-aa, aa, dm);
  col += halo * exp(-max(dm, 0.0) / 0.04) * 0.25 * uTalk * (0.4 + uLevel);
  col = mix(col, eyeCol * (0.7 + 0.4 * uLevel), mcore * uTalk);

  col *= uDim;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

const RIM_VERT = /* glsl */ `
varying vec3 vN; varying vec3 vV;
void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`
const RIM_FRAG = /* glsl */ `
uniform vec3 color; uniform float power, intensity, additive;
varying vec3 vN; varying vec3 vV;
void main() {
  float f = pow(1.0 - max(dot(normalize(vN), normalize(vV)), 0.0), power) * intensity;
  // light from the upper left reads as a highlight, the rest as the edge
  gl_FragColor = additive > 0.5 ? vec4(color * f, f) : vec4(color, clamp(f, 0.0, 1.0));
}`

/* ---------------- the character ---------------- */
export default {
  id: 'pebble',
  name: 'Pebble',
  vibe: 'A polished glass river stone with a smoked inner lens; its face is light living inside the glass.',
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
    const SH = { a: 1.2, b: 0.86, c: 0.42, n: 2.25, m: 2.3, egg: 0.05 }
    const seg = tiny ? [56, 38] : small ? [72, 48] : [112, 72]
    const shellGeo = pebbleGeometry({ ...SH, ws: seg[0], hs: seg[1] })
    const U = {
      uT: { value: 0 }, uWob: { value: 0 }, uRip: { value: 0 }, uSwirl: { value: 0 }, uLevel: { value: 0 },
      uWinRough: { value: 0.2 }, uCaustic: { value: new THREE.Color() }, uInner: { value: new THREE.Color() }, uWinA: { value: new THREE.Vector2(0.86 * SH.a, 0.8 * SH.b) },
    }
    const shellMat = kit.glass(look, { thickness: 0.5, ior: 1.42, iridescence: 0.3, iridescenceIOR: 1.3 })
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
            float sw = uSwirl * 0.035 * fr * smoothstep(0.25, 0.7, r) * sin(2.0 * ang + r * 4.0 - uT * 2.4);
            vec2 wob = uWob * 0.07 * vec2(sin(lp.y * 2.1 + uT * 1.05), cos(lp.x * 1.7 - uT * 0.85));
            vec2 wq = lp.xy / uWinA;
            float wr = pow(pow(abs(wq.x), 2.25) + pow(abs(wq.y), 2.25), 1.0 / 2.25);
            vWin = smoothstep(0.35, 0.75, normal.z) * (1.0 - smoothstep(0.82, 1.0, wr));
            // the liquid moves the body more than the face window, so the face never smears
            objectNormal = normalize(objectNormal + vec3((radial * rip + tang * sw + wob) * (1.0 - 0.6 * vWin), 0.0));
            vNear = (1.0 - smoothstep(0.8, 1.5, wr)) * (0.3 + 0.7 * smoothstep(-0.3, 0.6, normal.z));
          }`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          transformed += normal * uWob * 0.012 * sin(position.x * 2.2 + position.y * 1.3 + uT * 1.2);`)
      sh.fragmentShader = 'uniform float uWinRough; uniform vec3 uCaustic, uInner; varying float vWin; varying float vNear;\n' + sh.fragmentShader
        // thicker toward the silhouette: edges absorb more tint and bend more light, like a real lens
        .replace('#include <transmission_fragment>', THREE.ShaderChunk.transmission_fragment.replace('material.thickness = thickness;',
          'material.thickness = thickness * (0.45 + 2.2 * pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 1.6)) * (1.0 - 0.55 * vWin);'))
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor *= mix(1.0, uWinRough, vWin);`)
        // light gathering in the lower edge of the glass, the way a lens focuses light
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance += uCaustic * pow(max(0.0, dot(normal, normalize(vec3(0.3, -0.88, 0.32)))), 2.2) * (1.0 - vWin);
          // the face's light scattering into the frosted body around the lens
          totalEmissiveRadiance += uInner * vNear * (1.0 - 0.75 * vWin);`)
    }
    const shell = new THREE.Mesh(shellGeo, shellMat)

    const rimMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { color: { value: new THREE.Color() }, power: { value: 3 }, intensity: { value: 0.6 }, additive: { value: 1 } },
      vertexShader: RIM_VERT, fragmentShader: RIM_FRAG,
    })
    const rim = new THREE.Mesh(shellGeo, rimMat)
    rim.scale.setScalar(1.004)

    // Lens: a thin domed squircle concentric with the shell, its face just under the front surface.
    const LA = { a: 0.8, b: 0.56 }
    const lensGeo = pebbleGeometry({ a: LA.a, b: LA.b, c: 0.13, n: SH.n, m: 2.2, egg: SH.egg, ws: tiny ? 48 : 72, hs: tiny ? 32 : 48 })
    const eyeScale = tiny ? 1.32 : small ? 1.18 : 1
    const eyeW = 0.07 * eyeScale, eyeH = 0.15 * eyeScale
    const L = {
      uT: { value: 0 }, uPulse: { value: 0 }, uOpen: { value: 1 }, uStyle: { value: 0 }, uHappy: { value: 0 }, uClosed: { value: 0 },
      uDroop: { value: 0 }, uWorry: { value: 0 }, uRing: { value: 0.3 }, uGlow: { value: 1 }, uSwirl: { value: 0 }, uRip: { value: 0 },
      uLevel: { value: 0 }, uTalk: { value: 0 }, uWarm: { value: 0 }, uSpark: { value: 0 }, uAlert: { value: 0 }, uDone: { value: 0 },
      uSweep: { value: 1 }, uListen: { value: 0 }, uCeleb: { value: 0 }, uSmall: { value: small ? 1 : 0 }, uFrost: { value: look.frost },
      uEgg: { value: SH.egg }, uN: { value: SH.n }, uDim: { value: 1 }, uDark: { value: look.dark ? 1 : 0 },
      uLook: { value: new THREE.Vector2() }, uA: { value: new THREE.Vector2(LA.a, LA.b) },
      uEyePos: { value: new THREE.Vector2(0.3 * (tiny ? 1.04 : 1), 0.06) },
      uEyeSize: { value: new THREE.Vector2(eyeW, eyeH) },
      cBase: { value: new THREE.Color() }, cCore: { value: new THREE.Color() }, cHalo: { value: new THREE.Color() },
      cSoft: { value: new THREE.Color() }, cWarm: { value: WARM.clone() },
    }
    const lensMat = new THREE.ShaderMaterial({ uniforms: L, vertexShader: LENS_VERT, fragmentShader: LENS_FRAG })
    const lens = new THREE.Mesh(lensGeo, lensMat)
    lens.position.z = 0.23

    tilt.add(lens, shell, rim)

    // Aura: soft light around the stone for attention (needs-you), talking and celebrating. Behind the shell,
    // so it only shows around the silhouette.
    const auraMat = new THREE.SpriteMaterial({ map: kit.glowTex, transparent: true, depthWrite: false, opacity: 0 })
    const aura = new THREE.Sprite(auraMat)
    aura.position.z = -0.6
    aura.scale.set(3.3, 2.7, 1)
    root.add(aura)

    // Sparkles outside the stone (celebrating only).
    const starTex = starTexture()
    const sparkMat = new THREE.SpriteMaterial({ map: starTex, transparent: true, depthWrite: false, opacity: 0 })
    const SPARKS = tiny
      ? [[-1.0, 0.72, 0.42, 0], [1.02, 0.62, 0.36, 1.7], [0.92, -0.78, 0.3, 3.1]]
      : [[-1.18, 0.7, 0.3, 0], [1.16, 0.74, 0.26, 1.3], [-1.28, -0.35, 0.2, 2.2], [1.3, -0.2, 0.22, 3.4], [0.4, 1.08, 0.18, 4.5], [-0.55, -1.02, 0.17, 5.3]]
    const sparks = SPARKS.map(([x, y, s, ph]) => {
      const m = sparkMat.clone()
      const sp = new THREE.Sprite(m)
      sp.position.set(x, y, 0.7)
      sp.userData = { x, y, s, ph }
      sp.visible = false
      object.add(sp)
      return sp
    })

    // reusable scratch
    const mp = {}
    const tmpA = new THREE.Color(), tmpB = new THREE.Color()
    const glassBase = new THREE.Color(), attBase = new THREE.Color()
    const baseRY = size === 'header' ? -0.2 : size === 'peek' ? -0.22 : -0.3
    const baseRX = 0.13
    let curLook = look

    function setLook(l) {
      curLook = l
      const tn = l.tint
      kit.updateGlass(shellMat, l)
      const r = 0.05 + 0.5 * l.frost
      shellMat.roughness = small ? r * 0.55 : r
      shellMat.thickness = 0.5
      // a little more body colour than the kit default, so the stone reads as tinted glass, not white plastic
      shellMat.attenuationDistance = l.dark ? 1.2 : 0.62 + 0.3 * (1 - l.frost)
      // warm tints in dark mode read as skin when saturated: keep the body closer to clear glass
      if (tn.key === 'peach') shellMat.color.lerp(WHITE, l.dark ? 0.45 : 0.2)
      glassBase.copy(shellMat.color)
      attBase.copy(shellMat.attenuationColor)
      U.uWinRough.value = 0.16
      // lens: deep, inky version of the tint
      // lens: a deep, smoked version of the tint. Warm inks are pulled toward neutral so the lens reads as
      // smoked glass, not as a coloured (or fleshy) surface.
      const lb = L.cBase.value.copy(tn.ink).multiplyScalar(l.dark ? 0.34 : 0.42)
      const desat = LENS_DESAT[tn.key] ?? 0.2
      const lum = 0.2126 * lb.r + 0.7152 * lb.g + 0.0722 * lb.b
      lb.lerp(tmpA.setRGB(lum, lum * 1.05, lum * 1.3), desat).multiplyScalar(1 - 0.25 * desat)
      if (tn.key === 'graphite') lb.multiplyScalar(0.8)
      L.cHalo.value.copy(tn.glow).lerp(tn.soft, HALO_SOFTEN[tn.key] ?? 0)
      L.cCore.value.copy(tn.glow).lerp(WHITE, EYE_WHITE[tn.key] ?? 0.62).multiplyScalar(1.55)
      L.cSoft.value.copy(tn.soft)
      L.uFrost.value = l.frost
      L.uDark.value = l.dark ? 1 : 0
      L.uStyle.value = l.eyes === 'dots' ? 1 : l.eyes === 'arcs' ? 2 : 0
      // rim: a dark hairline on light panels (how real glass reads on white), a lit edge on dark ones
      if (l.dark) {
        rimMat.uniforms.color.value.copy(tn.soft).lerp(WHITE, 0.5)
        rimMat.uniforms.intensity.value = tiny ? 0.75 : 0.55
        rimMat.uniforms.power.value = 2.6
        rimMat.uniforms.additive.value = 1
        rimMat.blending = THREE.AdditiveBlending
      } else {
        rimMat.uniforms.color.value.copy(tn.ink).lerp(new THREE.Color(0, 0, 0), 0.3)
        rimMat.uniforms.intensity.value = tiny ? 0.6 : 0.42
        rimMat.uniforms.power.value = tiny ? 3 : 3.4
        rimMat.uniforms.additive.value = 0
        rimMat.blending = THREE.NormalBlending
      }
      rimMat.needsUpdate = true
      auraMat.color.copy(tn.glow)
      auraMat.blending = l.dark ? THREE.AdditiveBlending : THREE.NormalBlending
      auraMat.needsUpdate = true
      for (const sp of sparks) {
        sp.material.color.copy(l.dark ? tmpA.copy(tn.glow).lerp(WHITE, 0.55) : tmpA.copy(tn.glow).lerp(tn.ink, 0.22))
        sp.material.blending = l.dark ? THREE.AdditiveBlending : THREE.NormalBlending
        sp.material.needsUpdate = true
      }
    }
    setLook(look)

    function update(f) {
      const rm = f.rm
      const w = rm ? 1 : 1 - Math.exp(-f.moodAge * 5.5)
      const a = MP[f.prevMood] || MP.idle, b = MP[f.mood] || MP.idle
      for (const k of KEYS) mp[k] = a[k] + (b[k] - a[k]) * w
      const A = f.P / 0.55 // 1 calm, ~2.5 lively
      const T = rm ? 0.6 : f.clock
      const t = rm ? 0 : f.t

      // posture: float, turn toward where it looks, doze when resting/sleepy, sway when uneasy
      const amp = rm ? 0 : 1
      root.position.y = f.bounce + amp * Math.sin(T * 1.15) * 0.022 * Math.min(A, 1.8) - mp.lean * 0.05
      tilt.rotation.y = baseRY + f.lookX * 0.13 + amp * Math.sin(T * 0.53) * 0.025 * A
      tilt.rotation.x = baseRX + f.lookY * 0.08 + amp * Math.sin(T * 0.71 + 1.0) * 0.018 * A + mp.lean * 0.07
      tilt.rotation.z = mp.lean * -0.07 + amp * mp.worry * Math.sin(t * 2.3) * 0.025 * A + (f.mood === 'celebrating' && !rm ? Math.sin(t * 6.5) * 0.04 : 0)
      const breathe = 1 + amp * Math.sin(T * (0.8 + mp.lean * -0.3)) * 0.006 * (1 + mp.lean)
      tilt.scale.set(breathe, 2 - breathe, breathe)

      const pulse = rm ? 0.6 : Math.pow(0.5 + 0.5 * Math.sin(t * 4.6), 2)
      // liquid shell
      U.uT.value = T
      U.uWob.value = f.wob * (0.6 + 0.6 * mp.lean)
      U.uRip.value = f.rip
      U.uSwirl.value = f.swirl
      U.uLevel.value = f.level
      tmpA.copy(glassBase).lerp(WARM, f.warm * 0.14)
      shellMat.color.copy(tmpA)
      shellMat.attenuationColor.copy(attBase).lerp(WARM_DEEP, f.warm * 0.25)
      // caustic: the face's light pooling in the bottom edge of the glass
      U.uCaustic.value.copy(curLook.tint.glow).lerp(WARM, f.warm).multiplyScalar((curLook.dark ? 0.16 : 0.3) * (0.6 + 0.5 * mp.glow + 0.8 * mp.alert * pulse + 0.5 * f.spark))
      const dk = curLook.dark ? 1 : 0.8
      tmpB.copy(curLook.tint.glow).multiplyScalar(dk * (0.025 * mp.glow * mp.dim + mp.alert * (0.07 + 0.2 * pulse) + f.spark * 0.08 + mp.listen * 0.03))
      tmpB.add(tmpA.copy(WARM).multiplyScalar(f.warm * 0.09 * dk))
      U.uInner.value.copy(tmpB)

      // lens face
      L.uT.value = T
      L.uPulse.value = pulse
      L.uOpen.value = f.open * f.blink * (1 - 0.14 * f.swirl)
      L.uHappy.value = mp.happy
      L.uClosed.value = mp.closed
      L.uDroop.value = mp.droop
      L.uWorry.value = mp.worry
      L.uRing.value = mp.ring * (1 + (rm ? 0 : 0.18 * Math.sin(T * 1.3)) * mp.listen)
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
      const sweep = f.mood === 'done' && !rm ? Math.min(1, Math.max(0, (f.moodAge - 0.15) / 0.85)) : 1
      L.uSweep.value = sweep < 1 ? 1 - Math.pow(1 - sweep, 2.2) : 1
      L.uDim.value = mp.dim
      const perk = 1 + 0.08 * mp.listen + 0.05 * mp.alert
      L.uEyeSize.value.set(eyeW * perk, eyeH * perk)
      L.uLook.value.set(f.lookX * 0.18, -f.lookY * 0.13)

      // aura and sparkles
      const ap = mp.aura * (0.55 + 0.45 * (mp.alert > 0.5 ? pulse : 0.5 + 0.5 * f.level))
      auraMat.opacity = ap * (curLook.dark ? 0.55 : 0.42)
      aura.visible = auraMat.opacity > 0.01
      for (const sp of sparks) {
        const { x, y, s, ph } = sp.userData
        const cyc = rm ? 0.5 : ((t * 0.55 + ph * 0.37) % 1)
        const tw = rm ? 0.8 : 0.25 + 0.75 * Math.pow(Math.max(0, Math.sin(cyc * Math.PI)), 1.5)
        sp.material.opacity = f.spark * tw
        sp.visible = sp.material.opacity > 0.01
        const sc = s * (0.55 + 0.6 * tw) * (tiny ? 1.45 : small ? 1.2 : 1)
        sp.scale.set(sc, sc, 1)
        sp.position.set(x * (1 + 0.06 * cyc), y + cyc * 0.12 + f.bounce * 0.5, 0.7)
        sp.material.rotation = rm ? 0 : cyc * 0.8
      }
    }

    return {
      object,
      update,
      setLook,
      dispose() {
        shellGeo.dispose(); lensGeo.dispose()
        shellMat.dispose(); rimMat.dispose(); lensMat.dispose(); auraMat.dispose()
        starTex.dispose(); sparkMat.dispose()
        for (const sp of sparks) sp.material.dispose()
      },
    }
  },
}
