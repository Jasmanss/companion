// Lumen: a teardrop of thick optical glass. Its surface is subtly alive (vertex wobble, traveling ripple rings),
// a soft frosted core of light sits inside it, and two eyes of light float just under the front surface.
//
// How the layers work with three.js transmission:
// - body: one transmissive MeshPhysicalMaterial, deformed in its vertex shader (wobble, ripples, mood rings).
// - core: a plane drawn ONLY in the transmission pass (opaque list, premultiplied blending), so the glass refracts
//   it and the frost slider blurs it. It carries the core glow, the eye halos, the thinking swirl and talking rings.
// - face: a plane drawn after the glass with SDF eyes and mouth, so they stay crisp at 50x44 at any frost.
//   It also draws the needs-you beacon, celebrating sparkles and the contact shadow (one draw call).
// - rim: a thin iridescent fresnel edge sharing the body's deformation.
import * as THREE from 'three'

const B = 1.15 // half height of the drop
const WARM = new THREE.Color('#ffb870')
const WARM_INK = new THREE.Color('#a9500f')
const WHITE = new THREE.Color(1, 1, 1)

/* ---------------- shared GLSL: the living surface ---------------- */
const DEFORM = /* glsl */ `
uniform float uClock;
uniform float uWob;
uniform float uRip;
uniform float uSwirl;
uniform float uRing;
uniform float uRingA;
float lmField(vec3 p) {
  float rad = length(p.xz);
  float a = atan(p.x, p.z + 1e-5);
  float y = p.y;
  float t = uClock;
  float sa = a + uSwirl * (y * 1.6 - t * 1.4);
  float w = sin(2.0 * sa + t * 1.3 + y * 1.9) * 0.55 + sin(3.0 * sa - t * 0.95 + y * 3.1) * 0.3;
  w *= smoothstep(0.0, 0.3, rad);
  w += sin(y * 4.3 - t * 1.6) * 0.35;
  float body = smoothstep(1.12, 0.45, y);
  float D = w * uWob * 0.019 * body * (0.55 + 0.45 * smoothstep(-1.15, -0.6, y));
  vec3 dir = normalize(p - vec3(0.0, -0.3, 0.0) + vec3(0.0, 0.0, 1e-4));
  float d = acos(clamp(dot(dir, vec3(0.0, -0.33, 0.944)), -1.0, 1.0));
  D += sin(d * 13.0 - t * 7.5) * smoothstep(0.08, 0.32, d) * exp(-d * 0.7) * uRip * 0.016 * body;
  D += exp(-pow((d - uRing) * 6.0, 2.0)) * uRingA * 0.035 * body;
  return D;
}
void lmDeform(inout vec3 p, inout vec3 n) {
  vec3 t1 = normalize(cross(n, abs(n.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 t2 = cross(n, t1);
  float e = 0.015;
  float d0 = lmField(p);
  float d1 = lmField(p + t1 * e);
  float d2 = lmField(p + t2 * e);
  vec3 g = t1 * (d1 - d0) / e + t2 * (d2 - d0) / e;
  p += n * d0;
  n = normalize(n - g);
}
`

/* ---------------- rim: thin iridescent edge ---------------- */
const RIM_VERT = /* glsl */ `
${DEFORM}
varying vec3 vN;
varying vec3 vV;
varying float vY;
void main() {
  vec3 p = position;
  vec3 n = normal;
  lmDeform(p, n);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vN = normalize(normalMatrix * n);
  vV = normalize(-mv.xyz);
  vY = p.y;
  gl_Position = projectionMatrix * mv;
}
`
const RIM_FRAG = /* glsl */ `
uniform vec3 uCol;
uniform float uI;
uniform float uDark;
uniform float uT;
uniform float uPulse;
varying vec3 vN;
varying vec3 vV;
varying float vY;
void main() {
  vec3 n = normalize(vN);
  vec3 v = normalize(vV);
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float f = pow(1.0 - ndv, 3.2);
  vec2 L = normalize(vec2(-0.55, 0.83));
  vec2 nx = n.xy / max(length(n.xy), 1e-4);
  float key = pow(max(dot(nx, L), 0.0), 1.6);
  float back = pow(max(dot(nx, -L), 0.0), 2.0);
  float k = f * (0.22 + 0.95 * key + 0.4 * back) * (uI + uPulse);
  vec3 irid = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + ndv * 1.6 + vY * 0.22 + uT * 0.03));
  vec3 col = mix(uCol, irid, 0.42);
  // dark: additive light. light: a soft colored edge (over), plus a little light.
  float a = clamp(k, 0.0, 1.0) * smoothstep(0.0, fwidth(ndv) * 1.6 + 0.004, ndv);
  vec3 rgb = col * a * (uDark > 0.5 ? 1.0 : 0.85);
  float alpha = uDark > 0.5 ? a * 0.25 : a * 0.6;
  gl_FragColor = vec4(rgb, alpha);
}
`

/* ---------------- core: light inside the glass (transmission pass only) ---------------- */
const PLANE_VERT = /* glsl */ `
varying vec2 vP;
void main() {
  vP = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`
const CORE_FRAG = /* glsl */ `
uniform vec3 uCoreCol;
uniform vec3 uEyeGlowCol;
uniform vec3 uBeaconCol;
uniform float uCore;
uniform float uSwirl;
uniform float uClock;
uniform float uRip;
uniform float uLevel;
uniform float uBeacon;
uniform float uEyeGlow;
uniform float uDark;
uniform vec2 uEyeL;
uniform vec2 uEyeR;
uniform vec2 uTip;
uniform vec2 uCoreC;
uniform float uCaustic;
uniform float uCoreFall;
uniform vec3 uLightCol;
varying vec2 vP;
uniform float uOn;
void main() {
  if (uOn < 0.5) discard;
  vec2 c = vP - uCoreC;
  float r = length(c * vec2(1.0, 0.9));
  float core = exp(-r * r * uCoreFall);
  float ang = atan(c.y, c.x);
  float arms = 0.5 + 0.5 * sin(2.0 * ang - r * 7.5 + uClock * 2.8);
  arms = pow(arms, 3.0) * smoothstep(0.95, 0.3, r) * smoothstep(0.03, 0.22, r);
  float rings = pow(0.5 + 0.5 * sin(r * 19.0 - uClock * 8.0), 3.0) * exp(-r * 2.0) * uRip * (0.3 + 0.7 * uLevel);
  vec2 dl = vP - uEyeL;
  vec2 dr = vP - uEyeR;
  float eyes = exp(-dot(dl * vec2(1.3, 0.85), dl * vec2(1.3, 0.85)) * 34.0) + exp(-dot(dr * vec2(1.3, 0.85), dr * vec2(1.3, 0.85)) * 34.0);
  vec2 bt = (vP - uTip) * vec2(1.0, 0.8);
  float beacon = exp(-dot(bt, bt) * 22.0) * uBeacon;
  // caustic: light focused into the bottom of the drop, a crescent hugging the lower inside edge
  vec2 cq = vP - vec2(0.06, -0.42);
  float cr = length(cq * vec2(0.92, 1.0));
  float caustic = exp(-pow((cr - 0.6) / 0.11, 2.0)) * smoothstep(-0.05, -0.55, cq.y) * (0.75 + 0.25 * sin(uClock * 0.9));
  float I = core * uCore + arms * uSwirl * 1.25 + rings + caustic * uCaustic;
  vec3 add = uCoreCol * I + uEyeGlowCol * eyes * uEyeGlow + uBeaconCol * beacon * 1.6;
  if (uDark > 0.5) {
    gl_FragColor = vec4(add, 0.0);
  } else {
    // light theme: the core is pale light (it lifts the glass toward white), the eye halos tint it
    float a2 = clamp(eyes * uEyeGlow * 0.32, 0.0, 0.6);
    float a3 = clamp(beacon * 0.85, 0.0, 0.85);
    vec3 rgb = uEyeGlowCol * a2;
    rgb = uBeaconCol * a3 + rgb * (1.0 - a3);
    float a = 1.0 - (1.0 - a2) * (1.0 - a3);
    gl_FragColor = vec4(rgb + uLightCol * I * 0.5, a);
  }
}
`

/* ---------------- face: crisp eyes, mouth, beacon, sparkles, shadow ---------------- */
const FACE_FRAG = /* glsl */ `
uniform vec3 uEyeCol;
uniform vec3 uEyeEdge;
uniform vec3 uHaloCol;
uniform float uHaloA;
uniform float uHaloK;
uniform float uDark;
uniform vec2 uFace;
uniform float uSep;
uniform vec2 uEye;
uniform float uOpen;
uniform float uStyle;
uniform float uHappy;
uniform float uClosed;
uniform float uLid;
uniform float uSquint;
uniform float uSad;
uniform float uTilt;
uniform float uRot;
uniform float uSoft;
uniform float uStroke;
uniform vec2 uMouth;
uniform float uMW;
uniform float uM[6];
uniform float uSmile;
uniform float uLevel;
uniform float uBeacon;
uniform float uBeat;
uniform vec3 uBeaconCol;
uniform vec2 uTip;
uniform float uDotK;
uniform float uSpark;
uniform float uT;
uniform vec4 uSpk[7];
uniform vec3 uSparkCol;
uniform float uThink;
uniform float uOrbit;
uniform vec3 uCometCol;
uniform float uShadow;
uniform float uShadowY;
uniform vec3 uShadowCol;
uniform vec3 uCausticCol;
varying vec2 vP;

float sdRoundBox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
float sdEll(vec2 p, vec2 ab) { return (length(p / ab) - 1.0) * min(ab.x, ab.y); }
float sdArc(vec2 p, float ap, float ra, float rb) {
  vec2 sc = vec2(sin(ap), cos(ap));
  p.x = abs(p.x);
  return ((sc.y * p.x > sc.x * p.y) ? length(p - sc * ra) : abs(length(p) - ra)) - rb;
}
float sdSeg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
float cov(float d) { float aa = fwidth(d) * 0.8 + uSoft; return 1.0 - smoothstep(-aa, aa, d); }
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }

float eyeSD(vec2 q, float side) {
  float w = uEye.x, h = uEye.y, o = uOpen;
  q = rot(uRot * side) * q;
  float d, ext;
  if (uStyle < 0.5) {
    float hh = max(w * 0.3, h * o);
    d = sdRoundBox(q, vec2(w * 0.5, hh * 0.5), min(w, hh) * 0.5);
    ext = hh * 0.5;
  } else if (uStyle < 1.5) {
    float r = w * 0.68;
    float ry = max(r * 0.2, r * o * 0.92);
    d = sdEll(q, vec2(r * clamp(o, 1.0, 1.12), ry));
    ext = ry;
  } else {
    float r = w * 0.8, ah = max(r * 0.22, r * min(1.15, o) * 1.1);
    vec2 c = q - vec2(0.0, -0.45 * ah);
    float dome = max(sdEll(c, vec2(r, ah)), -c.y);
    // worried flips the dome into a bowl (flat top, round bottom): the lid tilt then reads as raised brows
    vec2 cb = q - vec2(0.0, 0.45 * ah);
    float bowl = max(sdEll(cb, vec2(r, ah)), cb.y);
    d = mix(dome, bowl, uSad);
    ext = mix(0.55, 0.45, uSad) * ah;
  }
  // lids: a straight edge from above; tilt > 0 raises the inner corners (worried), < 0 droops the outer ones
  float lidY = ext - (uLid + uSquint * step(side, 0.0)) * 2.0 * ext + uTilt * (-side) * q.x;
  d = max(d, q.y - lidY);
  float sw = w * 0.16 * uStroke;
  float dH = sdArc(q - vec2(0.0, -0.42 * w), 1.12, 0.7 * w, sw);
  float dC = sdArc(vec2(q.x, -(q.y - 0.36 * w)), 1.0, 0.64 * w, sw * 0.9);
  d = mix(d, dH, uHappy);
  d = mix(d, dC, uClosed);
  return d;
}

float mouthA(vec2 p) {
  vec2 q = p - uMouth;
  float mw = uMW;
  float st = 0.075 * mw * uStroke;
  float R = 0.5 * mw * uSmile;
  float dS = sdArc(vec2(q.x, -(q.y - R * 0.72)), 0.95, R, st);
  float dD = max(length(q - vec2(0.0, 0.1 * mw)) - 0.44 * mw, q.y - 0.1 * mw);
  float dO = sdEll(q, vec2((0.24 + 0.08 * uLevel) * mw, (0.12 + uLevel * 0.3) * mw));
  float dN = sdEll(q, vec2(0.15 * mw, 0.19 * mw));
  float xw = clamp(q.x, -0.4 * mw, 0.4 * mw);
  float wy = 0.065 * mw * sin(xw / mw * 15.0);
  float dW = length(vec2(q.x - xw, (q.y - wy) * 0.8)) - st * 0.95;
  float dF = sdSeg(q, vec2(0.02 * mw, 0.0), vec2(0.36 * mw, -0.035 * mw)) - st;
  float a = uM[0] * cov(dS) + uM[1] * cov(dD) + uM[2] * cov(dO) + uM[3] * cov(dN) + uM[4] * cov(dW) + uM[5] * cov(dF);
  return clamp(a, 0.0, 1.0);
}

float star(vec2 q, float s) {
  if (s <= 0.0001) return 0.0;
  q = abs(q) / s;
  float f = sqrt(q.x) + sqrt(q.y);
  float aa = fwidth(f) * 1.2 + 0.02;
  return 1.0 - smoothstep(1.0 - aa, 1.0 + aa, f);
}

void over(inout vec4 acc, vec3 c, float a) { acc.rgb = c * a + acc.rgb * (1.0 - a); acc.a = a + acc.a * (1.0 - a); }
void glow(inout vec4 acc, vec3 c, float k) {
  // additive light in the dark theme, a soft colored veil in the light one
  if (uDark > 0.5) { acc.rgb += c * k; acc.a += k * 0.35 * (1.0 - acc.a); }
  else over(acc, c, clamp(k * 0.55, 0.0, 1.0));
}

void main() {
  vec2 p = vP;
  vec4 acc = vec4(0.0);

  // contact shadow + caustic (light focused through the drop)
  if (uShadow > 0.001) {
    vec2 s = vec2(p.x / 0.62, (p.y - uShadowY) / 0.075);
    float sh = exp(-dot(s, s) * 1.4) * uShadow;
    over(acc, uShadowCol, sh * (uDark > 0.5 ? 0.42 : 0.2));
    vec2 cs = vec2((p.x - 0.1) / 0.26, (p.y - uShadowY - 0.012) / 0.035);
    glow(acc, uCausticCol, exp(-dot(cs, cs) * 1.6) * uShadow * 0.45);
  }

  // celebrating sparkles
  if (uSpark > 0.001) {
    for (int i = 0; i < 7; i++) {
      vec4 sp = uSpk[i];
      float tw = 0.5 + 0.5 * sin(uT * (2.6 + float(i) * 0.37) + sp.w);
      float sz = sp.z * uSpark * (0.35 + 0.65 * tw * tw);
      vec2 q = p - sp.xy - vec2(0.0, 0.05 * sin(uT * 1.3 + sp.w));
      q = rot(0.3 * sin(sp.w)) * q;
      float st = star(q, sz);
      over(acc, uSparkCol, st * 0.95);
      glow(acc, uSparkCol, exp(-dot(q, q) / (sz * sz * 0.35 + 1e-4)) * 0.35 * uSpark);
    }
  }

  // needs-you beacon: a light in the tip and a ring that keeps going out
  if (uBeacon > 0.001) {
    vec2 b = p - uTip;
    float rr = 0.1 + uBeat * 0.42;
    float ring = exp(-pow((length(b) - rr) / (0.018 * uStroke), 2.0)) * (1.0 - uBeat) * (1.0 - uBeat);
    glow(acc, uBeaconCol, ring * uBeacon * 0.85);
    float dot0 = cov(length(b) - 0.075 * uDotK * (1.0 + 0.1 * sin(uBeat * 6.2831)));
    glow(acc, uBeaconCol, exp(-dot(b, b) * 60.0) * uBeacon * 0.8);
    over(acc, uDark > 0.5 ? mix(uBeaconCol, vec3(1.0), 0.55) : uBeaconCol, dot0 * uBeacon);
  }

  // thinking: a comet of light orbiting inside the upper drop, dimmer while it passes behind
  if (uThink > 0.001) {
    vec2 oc = vec2(0.0, 0.32);
    vec2 orad = vec2(0.45, 0.13);
    vec2 q = rot(0.22) * (p - oc);
    float rr = length(q / orad);
    // true distance to the ellipse (not radial), so the trail keeps one width all the way round
    vec2 gq = q / (orad * orad) / max(rr, 1e-3);
    float dist = (rr - 1.0) / max(length(gq), 1e-3);
    float ang = atan(q.y / orad.y, q.x / orad.x);
    float dA = mod(uOrbit - ang, 6.2831);
    float tail = exp(-dA * 0.8) * step(dA, 5.2);
    // the far side of the orbit dims (it passes behind the face); on pale glass it must stay legible
    float bMin = uDark > 0.5 ? 0.3 : 0.6;
    float back = bMin + (1.0 - bMin) * smoothstep(0.7, -0.7, sin(ang));
    float wdt = (uDark > 0.5 ? 0.017 : 0.021) * uStroke * (0.35 + 0.65 * tail);
    float line = exp(-pow(dist / wdt, 2.0)) * tail * back;
    vec2 hq = vec2(cos(uOrbit), sin(uOrbit)) * orad;
    vec2 hp = oc + rot(-0.22) * hq;
    vec2 hd = p - hp;
    float headBack = bMin + (1.0 - bMin) * smoothstep(0.7, -0.7, sin(uOrbit));
    float hs = 0.05 * uStroke * (0.7 + 0.3 * headBack);
    float head = cov(length(hd) - hs) * headBack;
    float heart = cov(length(hd) - hs * 0.45) * headBack;
    glow(acc, uHaloCol, (line * 0.7 + exp(-dot(hd, hd) / (hs * hs * 3.0)) * 0.8 * headBack) * uThink);
    over(acc, uCometCol, max(head, line * (uDark > 0.5 ? 0.9 : 1.0)) * uThink);
    over(acc, vec3(1.0), heart * uThink * (uDark > 0.5 ? 0.9 : 0.5));
  }

  // eyes and mouth
  vec2 fq = (p - uFace - vec2(0.0, -0.18)) * vec2(0.85, 1.0);
  if (dot(fq, fq) > 0.62) { gl_FragColor = acc; return; }
  vec2 el = p - (uFace + vec2(-uSep * 0.5, 0.0));
  vec2 er = p - (uFace + vec2(uSep * 0.5, 0.0));
  float d = min(eyeSD(el, -1.0), eyeSD(er, 1.0));
  float eyeA = cov(d);
  float m = mouthA(p);
  float faceA = max(eyeA, m);
  glow(acc, uHaloCol, exp(-max(d, 0.0) * uHaloK) * uHaloA * (1.0 - faceA));
  // eyes of light: a brighter heart, a deeper edge
  float heart = smoothstep(0.0, uEye.x * 0.34, -d);
  vec3 ec = mix(uEyeEdge, uEyeCol, heart);
  ec = mix(ec, mix(uEyeEdge, uEyeCol, 0.4), step(eyeA, m - 0.001));
  over(acc, ec, faceA);

  gl_FragColor = acc;
}
`

/* ---------------- moods ---------------- */
// mouth weights: [smile, open smile, talking oval, small o, wavy, flat]
const MOOD = {
  resting: { happy: 0, closed: 1, lid: 0, tilt: 0, rot: 0, core: 0.4, halo: 0.55, beacon: 0, smile: 0.8, m: [0, 0, 0, 0, 0, 0], squash: -0.035, lean: 0, pitch: 0.05, sleep: 0 },
  idle: { happy: 0, closed: 0, lid: 0, tilt: 0, rot: 0, core: 0.62, halo: 0.75, beacon: 0, smile: 0.75, m: [1, 0, 0, 0, 0, 0], squash: 0, lean: 0, pitch: 0, sleep: 0 },
  listening: { happy: 0, closed: 0, lid: 0, tilt: 0, rot: 0, core: 0.8, halo: 0.9, beacon: 0, smile: 0.6, m: [0, 0, 0, 0, 0, 0], squash: 0.025, lean: -0.1, pitch: 0.1, sleep: 0 },
  thinking: { squint: 0.22, happy: 0, closed: 0, lid: 0, tilt: 0, rot: 0, core: 0.55, halo: 0.8, beacon: 0, smile: 0.7, m: [0, 0, 0, 0, 0, 1], squash: 0.01, lean: -0.05, pitch: -0.04, sleep: 0 },
  talking: { happy: 0, closed: 0, lid: 0, tilt: 0, rot: 0, core: 0.72, halo: 0.85, beacon: 0, smile: 0.7, m: [0, 0, 1, 0, 0, 0], squash: 0, lean: 0, pitch: 0, sleep: 0 },
  done: { happy: 1, closed: 0, lid: 0, tilt: 0, rot: 0, core: 0.85, halo: 0.9, beacon: 0, smile: 1.1, m: [1, 0, 0, 0, 0, 0], squash: 0, lean: 0.03, pitch: 0, sleep: 0 },
  'needs-you': { happy: 0, closed: 0, lid: 0, tilt: 0, rot: 0, core: 0.85, halo: 1, beacon: 1, smile: 0.7, m: [0, 0, 0, 1, 0, 0], squash: 0.04, lean: 0, pitch: 0.04, sleep: 0 },
  worried: { sad: 1, happy: 0, closed: 0, lid: 0.2, tilt: 0.55, rot: 0.12, core: 0.6, halo: 0.8, beacon: 0, smile: 0.7, m: [0, 0, 0, 0, 1, 0], squash: -0.02, lean: 0, pitch: 0, sleep: 0 },
  celebrating: { happy: 1, closed: 0, lid: 0, tilt: 0, rot: 0, core: 1, halo: 1, beacon: 0, smile: 1, m: [0, 1, 0, 0, 0, 0], squash: 0, lean: 0, pitch: 0, sleep: 0 },
  sleepy: { happy: 0, closed: 0, lid: 0, tilt: 0.1, rot: 0, core: 0.32, halo: 0.5, beacon: 0, smile: 0.7, m: [0, 0, 0, 0, 0, 0], squash: -0.03, lean: 0.1, pitch: 0.06, sleep: 1 },
}
const KEYS = ['squint', 'sad', 'happy', 'closed', 'lid', 'tilt', 'rot', 'core', 'halo', 'beacon', 'smile', 'squash', 'lean', 'pitch', 'sleep']

// sparkle positions around the drop: x, y, size, phase (content space, body centered at 0)
const SPARKS = [
  [-1.1, 0.6, 0.2, 0.0], [1.02, 0.84, 0.15, 1.7], [1.18, -0.12, 0.2, 3.1], [-1.2, -0.36, 0.12, 4.4],
  [-0.6, 1.12, 0.12, 2.3], [0.84, -0.84, 0.1, 5.2], [0.46, 1.2, 0.1, 0.9],
]

function dropProfile(n) {
  // r(t) = a sin t * sqrt(sin^2(t/2) + c^2): the 2D Droplet's curve, with a softened tip. Bottom to top.
  const a = 1.2, c = 0.2, pts = []
  for (let i = 0; i <= n; i++) {
    const t = Math.PI * (1 - i / n)
    const s = Math.sin(t / 2)
    const r = i === 0 || i === n ? 0 : a * Math.sin(t) * Math.sqrt(s * s + c * c) / Math.sqrt(1 + c * c)
    pts.push(new THREE.Vector2(r, B * Math.cos(t)))
  }
  return pts
}

const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
const ease = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt))

export default {
  id: 'lumen',
  name: 'Lumen',
  vibe: 'A teardrop of thick optical glass with a soft core of light and two eyes suspended inside. Its surface breathes, ripples and swirls with its mood.',
  eyes: ['pills', 'dots', 'arcs'],
  frame: { height: 2.66, y: 0.04, peek: { height: 2.4, y: 0.02 }, header: { height: 2.56, y: 0.03 } },
  create({ kit, look, size }) {
    const small = size === 'peek'
    const object = new THREE.Group()
    const pose = new THREE.Group() // pivots at the bottom of the drop: squash, lean and pitch happen from there
    pose.position.y = -B
    const content = new THREE.Group()
    content.position.y = B
    pose.add(content)
    object.add(pose)

    const GU = { uEdgeCol: { value: new THREE.Color() }, uEdgeK: { value: 0.6 }, uLift: { value: 0.1 }, uSoftTone: { value: 0 }, uFaceSpec: { value: 0.3 }, uTopK: { value: 0.3 } }
    const U = { uClock: { value: 0 }, uWob: { value: 0 }, uRip: { value: 0 }, uSwirl: { value: 0 }, uRing: { value: 0 }, uRingA: { value: 0 } }

    // body
    const geo = new THREE.LatheGeometry(dropProfile(small ? 56 : 96), small ? 44 : 72)
    const glassExtra = { thickness: 1.05, ior: 1.42, dispersion: small ? 0 : 0.35 }
    const glass = kit.glass(look, glassExtra)
    glass.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U)
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\n' + DEFORM)
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(normal);\nvec3 lmP = vec3(position);\nlmDeform(lmP, objectNormal);')
        .replace('#include <begin_vertex>', 'vec3 transformed = lmP;')
      Object.assign(sh.uniforms, GU)
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uEdgeCol;\nuniform float uEdgeK;\nuniform float uLift;\nuniform float uSoftTone;\nuniform float uFaceSpec;\nuniform float uTopK;\nvec3 lmShoulder(vec3 x) { vec3 k = 0.72 + 0.28 * (1.0 - exp(-(x - 0.72) / 0.28)); return mix(x, k, step(0.72, x)); }')
        .replace('#include <opaque_fragment>', '#include <opaque_fragment>\n  { float lmN = abs(dot(normalize(normal), normalize(vViewPosition))); gl_FragColor.a *= smoothstep(0.0, fwidth(lmN) * 1.6 + 0.004, lmN); }')
        .replace('#include <tonemapping_fragment>', '#if defined( TONE_MAPPING )\n  gl_FragColor.rgb = uSoftTone > 0.5 ? lmShoulder(gl_FragColor.rgb) : toneMapping(gl_FragColor.rgb);\n#endif')
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
  {
    // keep reflections on the shoulders and edges, not across the face (they read as extra eyes when small)
    float lmF = clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0);
    float lmMask = mix(1.0, uFaceSpec, smoothstep(0.72, 0.95, lmF));
    reflectedLight.directSpecular *= 0.22 * lmMask;
    reflectedLight.indirectSpecular *= lmMask;
    #ifdef USE_CLEARCOAT
    clearcoatSpecularDirect *= 0.22 * lmMask;
    clearcoatSpecularIndirect *= lmMask;
    #endif
  }`)
        .replace('#include <transmission_fragment>', `#include <transmission_fragment>
  {
    float lmNdv = clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0);
    float lmEdge = pow(1.0 - lmNdv, 1.8);
    // a lens shows the world upside down: the dome takes the deeper tint, the belly gathers light
    float lmTop = smoothstep(-0.15, 0.9, normalize(normal).y);
    totalDiffuse *= mix(vec3(1.0), uEdgeCol, clamp(lmEdge * uEdgeK + lmTop * uTopK, 0.0, 1.0)) * (1.0 + uLift * lmNdv * lmNdv);
  }`)
    }
    const body = new THREE.Mesh(geo, glass)
    body.scale.z = 0.86
    body.onBeforeRender = (r, scene) => {
      if (glass.envMap || !scene.environment) return
      glass.envMap = scene.environment
      glass.envMapRotation.set(0.3, 0.6, 0)
      glass.needsUpdate = true
    }
    const baseColor = new THREE.Color(), baseAtt = new THREE.Color(), baseEdge = new THREE.Color(), baseLight = new THREE.Color()
    const warmGlassL = WARM.clone().lerp(WHITE, 0.5), warmGlassD = WARM.clone().multiplyScalar(0.66), warmAttD = new THREE.Color('#ffcf94')
    const warmEdge = WARM.clone().multiply(WARM).lerp(new THREE.Color('#ff8a3c'), 0.4), warmLight = WARM.clone().lerp(WHITE, 0.45)

    // rim
    const rimMat = new THREE.ShaderMaterial({
      uniforms: { ...U, uCol: { value: new THREE.Color() }, uI: { value: 0.9 }, uDark: { value: 0 }, uT: { value: 0 }, uPulse: { value: 0 } },
      vertexShader: RIM_VERT, fragmentShader: RIM_FRAG, transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    })
    const rim = new THREE.Mesh(geo, rimMat)
    rim.scale.set(1.004, 1.002, 0.864)
    rim.renderOrder = 4

    // core (transmission pass only)
    const coreMat = new THREE.ShaderMaterial({
      uniforms: {
        uCoreCol: { value: new THREE.Color() }, uEyeGlowCol: { value: new THREE.Color() }, uBeaconCol: { value: new THREE.Color() },
        uCore: { value: 0.6 }, uSwirl: { value: 0 }, uClock: { value: 0 }, uRip: { value: 0 }, uLevel: { value: 0 }, uBeacon: { value: 0 },
        uEyeGlow: { value: 1 }, uDark: { value: 0 }, uEyeL: { value: new THREE.Vector2() }, uEyeR: { value: new THREE.Vector2() },
        uTip: { value: new THREE.Vector2(0, 0.56) }, uCoreC: { value: new THREE.Vector2(0, -0.36) }, uOn: { value: 0 }, uCaustic: { value: 0.6 }, uCoreFall: { value: 4.5 }, uLightCol: { value: new THREE.Color() },
      },
      vertexShader: PLANE_VERT, fragmentShader: CORE_FRAG, depthWrite: false, toneMapped: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    })
    const core = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 2.3), coreMat)
    core.position.set(0, 0, 0.05)
    core.renderOrder = 1
    core.onBeforeRender = (r) => {
      const on = r.getRenderTarget() !== null
      coreMat.colorWrite = on
      coreMat.uniforms.uOn.value = on ? 1 : 0
    }

    // face overlay (after the glass)
    const eyeK = small ? 1.22 : size === 'header' ? 1.1 : 1
    // small sizes: a lower hop (the frame is tight), bigger sparkles pulled a little inward so they survive 50x44
    const hopK = small ? 0.45 : size === 'header' ? 0.7 : 1
    const sparkK = small ? 1.7 : size === 'header' ? 1.3 : 1
    const sparkPos = small ? 0.94 : 1
    const fu = {
      uEyeCol: { value: new THREE.Color() }, uEyeEdge: { value: new THREE.Color() }, uHaloCol: { value: new THREE.Color() }, uHaloA: { value: 0.8 }, uHaloK: { value: 11 }, uDark: { value: 0 },
      uFace: { value: new THREE.Vector2(0, -0.24) }, uSep: { value: 0.62 * (small ? 1.06 : 1) }, uEye: { value: new THREE.Vector2(0.19 * eyeK, 0.36 * eyeK) },
      uOpen: { value: 1 }, uStyle: { value: 0 }, uHappy: { value: 0 }, uClosed: { value: 0 }, uLid: { value: 0 }, uSquint: { value: 0 }, uSad: { value: 0 }, uTilt: { value: 0 }, uRot: { value: 0 },
      uSoft: { value: 0 }, uStroke: { value: small ? 1.35 : 1 },
      uMouth: { value: new THREE.Vector2(0, -0.62) }, uMW: { value: 0.25 * (small ? 1.3 : eyeK) }, uM: { value: [0, 0, 0, 0, 0, 0] },
      uSmile: { value: 0.8 }, uLevel: { value: 0 },
      uBeacon: { value: 0 }, uBeat: { value: 0 }, uBeaconCol: { value: new THREE.Color() }, uTip: { value: new THREE.Vector2(0, 0.56) }, uDotK: { value: small ? 1.6 : size === 'header' ? 1.25 : 1 },
      uSpark: { value: 0 }, uT: { value: 0 }, uSpk: { value: SPARKS.map(([x, y, z, w]) => new THREE.Vector4(x * sparkPos, y * sparkPos, z * sparkK, w)) }, uSparkCol: { value: new THREE.Color() },
      uThink: { value: 0 }, uOrbit: { value: 0 }, uCometCol: { value: new THREE.Color() },
      uShadow: { value: 1 }, uShadowY: { value: -B - 0.04 }, uShadowCol: { value: new THREE.Color() }, uCausticCol: { value: new THREE.Color() },
    }
    const faceMat = new THREE.ShaderMaterial({
      uniforms: fu, vertexShader: PLANE_VERT, fragmentShader: FACE_FRAG, transparent: true, depthWrite: false, depthTest: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    })
    const face = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 3.0), faceMat)
    face.position.z = 0.0
    face.renderOrder = 6

    content.add(core, body, rim, face)

    // live state, eased toward the mood's targets (snapped on the first update so mood-sheet stills are exact)
    const S = Object.fromEntries(KEYS.map((k) => [k, 0]))
    const M = new Float32Array(6)
    let inited = false
    let L = look

    // colors
    const C = {
      eye: new THREE.Color(), eyeEdge: new THREE.Color(), eyeWarm: new THREE.Color(), eyeWarmEdge: new THREE.Color(), halo: new THREE.Color(), core: new THREE.Color(), beacon: new THREE.Color(),
      spark: new THREE.Color(), rim: new THREE.Color(), shadow: new THREE.Color(), caustic: new THREE.Color(),
    }
    const tmp = new THREE.Color()
    const srgb = (dst, src) => dst.copy(src).convertLinearToSRGB()

    function setLook(l) {
      L = l
      const tn = l.tint
      kit.updateGlass(glass, l, glassExtra)
      baseColor.copy(glass.color)
      baseAtt.copy(glass.attenuationColor)
      if (l.dark) {
        C.eye.copy(WHITE).lerp(tn.glow, 0.14)
        C.eyeEdge.copy(WHITE).lerp(tn.glow, 0.5)
        C.eyeWarm.copy(WHITE).lerp(WARM, 0.6)
        C.eyeWarmEdge.copy(WARM).lerp(WHITE, 0.15)
        C.halo.copy(tn.glow)
        C.spark.copy(WHITE).lerp(tn.glow, 0.45)
        C.beacon.copy(tn.glow).lerp(WHITE, 0.25)
        C.shadow.set('#000000')
        C.caustic.copy(tn.glow)
      } else {
        // deep enough to read on the pale glass: darken toward ink until it clears a contrast target
        const target = lum(tn.glass) * 0.21
        let k = 0.55
        while (k < 0.92 && lum(C.eye.copy(tn.glow).lerp(tn.ink, k)) > target) k += 0.04
        C.eyeEdge.copy(tn.glow).lerp(tn.ink, Math.min(1, k + 0.08))
        C.eyeWarm.copy(WARM_INK).lerp(WARM, 0.25)
        C.eyeWarmEdge.copy(WARM_INK).lerp(new THREE.Color('#5a2408'), 0.3)
        C.halo.copy(tn.glow)
        C.spark.copy(tn.glow).lerp(tn.ink, 0.3)
        C.beacon.copy(tn.glow).lerp(tn.ink, 0.45)
        C.shadow.copy(tn.ink).lerp(new THREE.Color(0.02, 0.03, 0.06), 0.4)
        C.caustic.copy(tn.glow)
      }
      C.core.copy(tn.glow)
      C.rim.copy(l.dark ? tn.soft : tn.glow).lerp(WHITE, l.dark ? 0.35 : 0)
      srgb(fu.uSparkCol.value, C.spark)
      // the comet is light: white-hot in the dark, a saturated spark of the tint on pale glass
      srgb(fu.uCometCol.value, tmp.copy(l.dark ? WHITE : tn.glow).lerp(l.dark ? tn.glow : tn.ink, l.dark ? 0.35 : 0.18))
      srgb(fu.uBeaconCol.value, C.beacon)
      srgb(fu.uShadowCol.value, C.shadow)
      srgb(fu.uCausticCol.value, C.caustic)
      coreMat.uniforms.uBeaconCol.value.copy(C.beacon)
      fu.uDark.value = coreMat.uniforms.uDark.value = rimMat.uniforms.uDark.value = l.dark ? 1 : 0
      fu.uStyle.value = l.eyes === 'dots' ? 1 : l.eyes === 'arcs' ? 2 : 0
      fu.uSoft.value = (small ? 0.004 : 0.002) + l.frost * 0.008
      rimMat.uniforms.uI.value = l.dark ? 0.95 : 0.75
      fu.uShadow.value = small ? 0 : 1
      GU.uSoftTone.value = l.dark ? 0 : 1
      GU.uFaceSpec.value = 0.1
      GU.uTopK.value = l.dark ? 0.3 : 0.75
      glass.envMapIntensity = l.dark ? 0.5 : 1.1
      GU.uEdgeCol.value.copy(tn.glass).multiply(tn.glass).lerp(tn.glow, 0.25)
      baseEdge.copy(GU.uEdgeCol.value)
      GU.uEdgeK.value = l.dark ? 0.5 : 0.7
      GU.uLift.value = l.dark ? 0.05 : 0.12
      coreMat.uniforms.uCaustic.value = l.dark ? 0.55 : 1.1
      coreMat.uniforms.uCoreFall.value = 4.5
      coreMat.uniforms.uLightCol.value.copy(tn.glow).lerp(WHITE, 0.6)
      baseLight.copy(coreMat.uniforms.uLightCol.value)
      glass.attenuationDistance = l.dark ? 1.5 - l.frost * 0.5 : 2.6 - l.frost * 0.8
      if (l.dark) glass.color.multiplyScalar(0.7)
      baseColor.copy(glass.color)
      baseAtt.copy(glass.attenuationColor)
    }
    setLook(look)

    return {
      object,
      update(f, look) {
        if (look !== L && look) L = look
        const dt = inited ? Math.min(0.1, f.dt || 1 / 30) : 1
        const tg = MOOD[f.mood] || MOOD.idle
        const rate = inited ? 9 : 1e3
        for (const k of KEYS) S[k] = ease(S[k], tg[k] ?? 0, rate, dt)
        for (let i = 0; i < 6; i++) M[i] = ease(M[i], tg.m[i], inited ? 14 : 1e3, dt)
        inited = true
        const rm = f.rm
        const P = f.P
        const tt = rm ? 0 : f.clock
        const amp = 0.45 + 0.55 * P

        // surface
        U.uClock.value = tt
        U.uWob.value = f.wob
        U.uRip.value = f.rip
        U.uSwirl.value = f.swirl
        const ringOn = f.mood === 'done' && !rm
        U.uRing.value = f.moodAge * 1.3
        U.uRingA.value = ringOn ? Math.max(0, 1 - f.moodAge / 2.2) : 0

        // pose: breathing, squash, lean, celebrating hop
        const breathe = rm ? 0 : Math.sin(tt * 1.25) * 0.012 * amp
        let sy = 1 + S.squash + breathe
        const bnc = -f.bounce
        const hop = bnc * hopK
        if (f.mood === 'celebrating' && !rm) {
          const hmax = P > 1 ? 0.16 : 0.09
          const h = Math.min(1, bnc / hmax)
          sy += h * 0.05 - Math.pow(1 - h, 6) * 0.06
        }
        const sx = 1 / Math.sqrt(Math.max(0.5, sy))
        pose.scale.set(sx, sy, sx)
        object.position.y = hop
        const sway = rm ? 0 : f.mood === 'sleepy' ? Math.sin(f.t * 0.7) * 0.03 : Math.sin(tt * 0.6) * 0.008 * amp
        const shiver = rm ? 0 : f.warm * Math.sin(f.t * 33) * 0.006 * amp
        pose.rotation.z = S.lean + sway - f.lookX * 0.025
        pose.rotation.x = S.pitch + f.lookY * 0.05
        pose.rotation.y = f.lookX * 0.16
        object.position.x = shiver

        // glass tint: warm when worried, more iridescent when celebrating
        glass.color.copy(baseColor).lerp(L.dark ? warmGlassD : warmGlassL, f.warm)
        glass.attenuationColor.copy(baseAtt).lerp(L.dark ? warmAttD : WARM, f.warm)
        GU.uEdgeCol.value.copy(baseEdge).lerp(warmEdge, f.warm)
        coreMat.uniforms.uLightCol.value.copy(baseLight).lerp(warmLight, f.warm)
        glass.iridescence = 0.25 + f.spark * 0.55

        // face
        const lx = f.lookX * 0.11, ly = -f.lookY * 0.09
        fu.uFace.value.set(lx, -0.24 + ly)
        fu.uMouth.value.set(lx * 0.8, -0.62 + ly * 0.8)
        const openShape = (f.open + (1 - f.open) * S.sleep) * f.blink
        fu.uOpen.value = openShape
        fu.uLid.value = S.lid + S.sleep * Math.max(0, 1 - f.open) * 0.82
        fu.uTilt.value = S.tilt
        fu.uSad.value = S.sad
        fu.uSquint.value = S.squint
        fu.uRot.value = S.rot
        fu.uHappy.value = S.happy
        fu.uClosed.value = S.closed
        fu.uSmile.value = S.smile
        fu.uLevel.value = f.level
        for (let i = 0; i < 6; i++) fu.uM.value[i] = M[i]
        fu.uHaloA.value = S.halo * (L.dark ? 0.3 : 0.22)
        fu.uBeacon.value = S.beacon
        fu.uBeat.value = rm ? 0.35 : (f.t * 0.85) % 1
        fu.uSpark.value = f.spark
        fu.uThink.value = f.swirl
        fu.uOrbit.value = rm ? -0.5 : f.t * 2.4 - 1.6 // still pose: the comet in front, toward where the eyes look
        fu.uT.value = rm ? 0.7 : f.t
        fu.uShadowY.value = -B - 0.04 - hop / Math.max(0.5, sy)
        fu.uShadow.value = small ? 0 : Math.max(0, 1 - hop * 3)

        // colors (warm when worried)
        tmp.copy(C.eye).lerp(C.eyeWarm, f.warm)
        srgb(fu.uEyeCol.value, tmp)
        tmp.copy(C.eyeEdge).lerp(C.eyeWarmEdge, f.warm)
        srgb(fu.uEyeEdge.value, tmp)
        tmp.copy(C.halo).lerp(WARM, f.warm)
        srgb(fu.uHaloCol.value, tmp)
        rimMat.uniforms.uCol.value.copy(C.rim).lerp(WARM, f.warm * 0.7).convertLinearToSRGB()
        rimMat.uniforms.uT.value = tt
        rimMat.uniforms.uPulse.value = S.beacon * (rm ? 0.3 : 0.35 * Math.pow(Math.max(0, Math.sin(f.t * 0.85 * Math.PI * 2)), 4))

        // core light
        const cu = coreMat.uniforms
        cu.uCoreCol.value.copy(C.core).lerp(WARM, f.warm)
        cu.uEyeGlowCol.value.copy(C.halo).lerp(WARM, f.warm)
        cu.uCore.value = S.core * (1 + f.level * 0.45) * (L.dark ? 0.5 * (1 + f.warm * 0.8) : 1)
        cu.uSwirl.value = f.swirl
        cu.uClock.value = tt
        cu.uRip.value = f.rip
        cu.uLevel.value = f.level
        cu.uBeacon.value = S.beacon * (rm ? 0.8 : 0.65 + 0.35 * Math.sin(f.t * 0.85 * Math.PI * 2))
        cu.uEyeGlow.value = S.halo * (1 - S.closed * 0.75) * (1 - S.happy * 0.55) * Math.min(1, 0.35 + 0.65 * fu.uOpen.value) * (1 - S.sleep * 0.5) * (L.dark ? 0.38 : 1)
        cu.uEyeL.value.set(lx - fu.uSep.value / 2, -0.24 + ly)
        cu.uEyeR.value.set(lx + fu.uSep.value / 2, -0.24 + ly)
      },
      setLook,
      dispose() {
        geo.dispose()
        glass.dispose()
        rimMat.dispose()
        core.geometry.dispose()
        coreMat.dispose()
        face.geometry.dispose()
        faceMat.dispose()
      },
    }
  },
}
