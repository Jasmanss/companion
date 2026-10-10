// Lumen: a teardrop of thick optical glass. Its surface is subtly alive (vertex wobble, traveling ripple rings),
// a soft core of light sits inside it, and two eyes of light float just under the front surface.
//
// How the layers work with three.js transmission:
// - body: one transmissive MeshPhysicalMaterial, deformed in its vertex shader (wobble, ripples, mood rings). Its
//   fragment shader is patched for a lens-like falloff: clear in the middle, tinted on the shoulders, a darker
//   refracted band at the edge. In the light theme the thin middle also lets the panel itself show through.
// - core: a plane drawn ONLY in the transmission pass (opaque list, premultiplied blending), so the glass refracts
//   it and frost blurs it. It carries the core glow, caustics, the thinking spiral, talking rings, the worried lamp
//   and (light theme) an inverted horizon. It never carries the eyes: refracted eye halos would misregister.
// - face: a plane drawn after the glass with SDF eyes and mouth, so they stay crisp at 50x44 at any frost.
//   It also draws the needs-you LED, the thinking comet, the worried sweat bead, celebrating sparkles and the
//   contact shadow (one draw call).
// - rim: a thin iridescent fresnel edge sharing the body's deformation; it pulses in the signal color for needs-you.
import * as THREE from 'three'

const B = 1.15 // half height of the drop
const WHITE = new THREE.Color(1, 1, 1)
// worried: a warm lamp inside clear glass (peach gets a deeper red-amber so it still reads on orange glass)
const WARM = new THREE.Color('#ffb062')
const WARM_PEACH = new THREE.Color('#ff5a2e')
const WARM_INK = new THREE.Color('#9a4210')
// needs-you: one tint-independent signal color (the 2D Droplet's badge gold), white-hot in the middle
const SIGNAL = new THREE.Color('#ffc21f')
const SIGNAL_DEEP = new THREE.Color('#f29a00')

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
  D += sin(d * 9.0 - t * 6.0) * smoothstep(0.1, 0.35, d) * exp(-d * 0.8) * uRip * 0.017 * body;
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
uniform vec3 uPulseCol;
uniform float uI;
uniform float uPow;
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
  float f = pow(1.0 - ndv, uPow);
  vec2 L = normalize(vec2(-0.55, 0.83));
  vec2 nx = n.xy / max(length(n.xy), 1e-4);
  float key = pow(max(dot(nx, L), 0.0), 1.6);
  float back = pow(max(dot(nx, -L), 0.0), 2.0);
  float k = f * (0.22 + 0.95 * key + 0.4 * back) * uI;
  vec3 irid = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + ndv * 1.6 + vY * 0.22 + uT * 0.03));
  vec3 col = mix(uCol, irid, 0.38);
  // needs-you: the whole edge breathes in the signal color
  float pk = pow(1.0 - ndv, 2.0) * uPulse;
  col = (col * k + uPulseCol * pk) / max(k + pk, 1e-4);
  k += pk;
  float a = clamp(k, 0.0, 1.0) * smoothstep(0.0, fwidth(ndv) * 1.6 + 0.004, ndv);
  vec3 rgb = col * a * (uDark > 0.5 ? 1.0 : 0.9);
  float alpha = uDark > 0.5 ? a * 0.25 : a * 0.7;
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
uniform vec3 uCausticCol;
uniform vec3 uLampCol;
uniform vec3 uInk;
uniform float uCore;
uniform float uCoreFall;
uniform float uSpiral;
uniform float uClock;
uniform float uRip;
uniform float uLevel;
uniform float uDark;
uniform float uCaustic;
uniform float uLamp;
uniform float uHorizon;
uniform vec2 uCoreC;
uniform vec2 uMouthC;
uniform float uOn;
uniform float uWin;
varying vec2 vP;
mat2 rot2(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
float sdRB(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
void main() {
  if (uOn < 0.5) discard;
  vec2 c = vP - uCoreC;
  float r = length(c * vec2(1.0, 0.9));
  float core = exp(-r * r * uCoreFall);
  // thinking: one slow, coherent spiral arm
  float ang = atan(c.y, c.x);
  float arm = 0.5 + 0.5 * sin(ang - r * 4.2 + uClock * 1.7);
  arm = pow(arm, 4.0) * smoothstep(0.85, 0.35, r) * smoothstep(0.06, 0.3, r) * uSpiral;
  // talking: a few broad rings spreading from the mouth, light on the crests and shade in the troughs
  vec2 mq = (vP - uMouthC) * vec2(1.0, 1.3);
  float mr = length(mq);
  float wave = sin(mr * 10.5 - uClock * 6.5);
  float env = exp(-mr * 2.4) * smoothstep(0.02, 0.14, mr) * uRip * (0.35 + 0.65 * uLevel);
  float ringB = pow(max(wave, 0.0), 3.0) * env;
  float ringD = pow(max(-wave, 0.0), 2.0) * env;
  // caustics: light focused into the bottom of the drop, a crescent hugging the lower inside edge and a focal spot
  vec2 cq = vP - vec2(0.06, -0.42);
  float cr = length(cq * vec2(0.92, 1.0));
  float crescent = exp(-pow((cr - 0.6) / 0.05, 2.0)) * smoothstep(-0.05, -0.55, cq.y);
  vec2 fq = (vP - vec2(0.18, -0.74)) * vec2(1.0, 1.7);
  float focal = exp(-dot(fq, fq) * 55.0);
  // the key light (upper left) seen through the lens: a small bright window, low on the opposite side
  vec2 wq = rot2(-0.75) * (vP - vec2(0.42, -0.6));
  float win = 1.0 - smoothstep(-0.008, 0.008, sdRB(wq, vec2(0.06, 0.022), 0.02));
  float caustic = (crescent + focal * 0.8) * (0.85 + 0.15 * sin(uClock * 0.9)) * uCaustic + win * uWin;
  // worried: a warm lamp low in the belly
  vec2 lq = (vP - vec2(0.0, -0.42)) * vec2(1.0, 1.15);
  float lamp = exp(-dot(lq, lq) * 4.2) * uLamp;
  if (uDark > 0.5) {
    vec3 add = uCoreCol * (core * uCore + arm * 0.7 + ringB * 1.1) + uCausticCol * caustic + uLampCol * lamp * 1.3;
    gl_FragColor = vec4(add, 0.0);
  } else {
    // pale panels: the glass needs structure more than light. The dome shows the inverted "ground" (a soft darker
    // band with a crisp-ish horizon), the belly gathers the caustics; the core is only a whisper.
    float hy = 0.1 + 0.2 * vP.x * vP.x;
    float ground = smoothstep(hy - 0.04, hy + 0.32, vP.y) * smoothstep(1.45, 0.9, vP.y) * smoothstep(1.35, 0.95, abs(vP.x)) * uHorizon;
    float dk = clamp(ground + ringD * 0.35, 0.0, 0.8);
    float la = clamp(lamp * 0.55, 0.0, 0.7);
    vec3 add = uCoreCol * (core * uCore + ringB * 0.9 + arm * 0.55) + uCausticCol * caustic * 1.7 + uLampCol * lamp * 0.6;
    gl_FragColor = vec4(uInk * dk * (1.0 - la) + uLampCol * la + add, 1.0 - (1.0 - dk) * (1.0 - la));
  }
}
`

/* ---------------- face: crisp eyes, mouth, LED, comet, sweat, sparkles, shadow ---------------- */
const FACE_FRAG = /* glsl */ `
uniform vec3 uEyeCol;
uniform vec3 uEyeEdge;
uniform vec3 uEyeLit;
uniform vec3 uEyeShCol;
uniform vec3 uHaloCol;
uniform float uHaloA;
uniform float uHaloK;
uniform float uDark;
uniform float uDepth;
uniform vec2 uFace;
uniform float uSep;
uniform vec2 uEye;
uniform float uOpen;
uniform float uStyle;
uniform float uHappy;
uniform float uClosed;
uniform float uLid;
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
uniform float uOSize;
uniform float uBeacon;
uniform float uBeat;
uniform float uGlowP;
uniform vec3 uSigCol;
uniform vec3 uSigHot;
uniform vec3 uSigInk;
uniform vec3 uSigTip;
uniform vec2 uTip;
uniform float uDotK;
uniform float uSpark;
uniform float uT;
uniform vec4 uSpk[7];
uniform vec3 uSparkCol;
uniform float uThink;
uniform float uOrbit;
uniform float uCometR;
uniform vec3 uCometCol;
uniform vec3 uCometGlow;
uniform float uShadow;
uniform float uShadowY;
uniform vec3 uShadowCol;
uniform vec3 uCausticCol;
uniform float uSweat;
uniform vec3 uSweatP;
uniform vec3 uSweatCol;
uniform vec3 uSweatEdge;
varying vec2 vP;

float sdRoundBox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
float sdEll(vec2 p, vec2 ab) { return (length(p / ab) - 1.0) * min(ab.x, ab.y); }
float sdArc(vec2 p, float ap, float ra, float rb) {
  vec2 sc = vec2(sin(ap), cos(ap));
  p.x = abs(p.x);
  return ((sc.y * p.x > sc.x * p.y) ? length(p - sc * ra) : abs(length(p) - ra)) - rb;
}
float sdSeg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
// pixel size, taken once in uniform control flow: fwidth() inside the face's early-out branch is undefined
// (quads straddling the branch edge painted stray eye-colored specks)
float gPx = 0.002;
float cov(float d) { float aa = gPx * 0.9 + uSoft; return 1.0 - smoothstep(-aa, aa, d); }
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
// half width of the drop's silhouette at height y (the lathe profile)
float dropR(float y) { float t = acos(clamp(y / 1.15, -1.0, 1.0)); float s = sin(t * 0.5); return 1.1767 * sin(t) * sqrt(s * s + 0.04); }

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
  // lids: a straight edge from above; tilt > 0 slopes it down toward the outer corner (worried brows, sleepy droop)
  float lidY = ext - uLid * 2.0 * ext + uTilt * (-side) * q.x;
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
  // talking: a soft horizontal oval at rest, opening with the voice
  float dO = sdEll(q, vec2((0.3 + 0.06 * uLevel) * mw, (0.1 + uLevel * 0.3) * mw));
  float dN = sdEll(q, vec2(0.15, 0.19) * mw * uOSize);
  float xw = clamp(q.x, -0.4 * mw, 0.4 * mw);
  float wy = 0.065 * mw * sin(xw / mw * 15.0);
  float dW = length(vec2(q.x - xw, (q.y - wy) * 0.8)) - st * 0.95;
  float dF = sdSeg(q, vec2(-0.15 * mw, 0.0), vec2(0.15 * mw, 0.0)) - st;
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
  gPx = max(fwidth(vP.x), fwidth(vP.y));
  vec4 acc = vec4(0.0);

  // contact shadow, with the light the drop focuses into it
  if (uShadow > 0.001) {
    vec2 s = vec2(p.x / 0.62, (p.y - uShadowY) / 0.075);
    float sh = exp(-dot(s, s) * 1.4) * uShadow;
    over(acc, uShadowCol, sh * (uDark > 0.5 ? 0.42 : 0.24));
    vec2 cs = vec2((p.x - 0.1) / 0.22, (p.y - uShadowY - 0.012) / 0.03);
    float ca = exp(-dot(cs, cs) * 1.6) * uShadow;
    if (uDark > 0.5) glow(acc, uCausticCol, ca * 0.45);
    else over(acc, uCausticCol, ca * 0.75);
  }

  // celebrating sparkles
  if (uSpark > 0.001) {
    for (int i = 0; i < 7; i++) {
      vec4 sp = uSpk[i];
      float tw = 0.5 + 0.5 * sin(uT * (2.6 + float(i) * 0.37) + sp.w);
      float sz = sp.z * uSpark * (0.35 + 0.65 * tw * tw);
      vec2 q = p - sp.xy - vec2(0.0, 0.04 * sin(uT * 1.3 + sp.w));
      q = rot(0.3 * sin(sp.w)) * q;
      float st = star(q, sz);
      over(acc, uSparkCol, st * 0.95);
      glow(acc, uSparkCol, exp(-dot(q, q) / (sz * sz * 0.35 + 1e-4)) * 0.35 * uSpark);
    }
  }

  // worried: a bead of sweat sliding down the temple
  if (uSweat > 0.001) {
    float sz = uSweatP.z;
    vec2 q = (p - uSweatP.xy) / sz;
    float dd = (length(vec2(q.x * (1.0 + max(q.y, 0.0) * 0.9), q.y * 0.74)) - 1.0) * sz;
    if (uDark < 0.5) over(acc, uSweatEdge, cov(dd - gPx * 1.4 * uStroke) * uSweat);
    over(acc, uSweatCol, cov(dd) * uSweat);
    over(acc, vec3(1.0), cov(length(q - vec2(-0.3, 0.12)) * sz - sz * 0.3) * uSweat * 0.95);
  }

  // needs-you: the tip of the drop lights like an LED, and a ring keeps going out from it
  if (uBeacon > 0.001) {
    vec2 b = p - uTip;
    float R = 0.085 * uDotK;
    float ins = 1.0 - smoothstep(-0.03, 0.005, abs(p.x) - dropR(p.y));
    float tipG = ins * smoothstep(uTip.y - 0.6, uTip.y, p.y) * exp(-dot(b, b) * 2.5);
    glow(acc, uSigTip, tipG * uBeacon * (0.6 + 0.4 * uGlowP) * (uDark > 0.5 ? 0.55 : 0.9));
    float rr = R * 1.3 + uBeat * 0.5;
    float ring = exp(-pow((length(b) - rr) / (0.02 * uStroke), 2.0)) * (1.0 - uBeat) * (1.0 - uBeat);
    glow(acc, uSigCol, ring * uBeacon * 1.3);
    glow(acc, uSigCol, exp(-dot(b, b) / (R * R * 3.0)) * uBeacon * (0.45 + 0.35 * uGlowP));
    float Rp = R * (1.0 + 0.07 * uGlowP);
    if (uDark < 0.5) over(acc, uSigInk, cov(length(b) - Rp - 0.022 * uStroke) * uBeacon);
    over(acc, uSigCol, cov(length(b) - Rp) * uBeacon);
    over(acc, uSigHot, cov(length(b) - Rp * 0.5) * uBeacon);
  }

  // thinking: one bead of light with a short tapered tail, orbiting the upper drop
  if (uThink > 0.001) {
    vec2 oc = vec2(0.0, 0.36);
    vec2 orad = vec2(0.44, 0.13);
    vec2 q = rot(0.22) * (p - oc);
    float rr = length(q / orad);
    vec2 gq = q / (orad * orad) / max(rr, 1e-3);
    float dist = (rr - 1.0) / max(length(gq), 1e-3);
    float ang = atan(q.y / orad.y, q.x / orad.x);
    float dA = mod(uOrbit - ang, 6.2831);
    float tl = clamp(1.0 - dA / 1.7, 0.0, 1.0);
    float back = mix(0.45, 1.0, smoothstep(0.7, -0.7, sin(ang)));
    float wdt = uCometR * 0.7 * tl;
    float line = (1.0 - smoothstep(wdt - gPx, wdt + gPx, abs(dist))) * tl * back * step(0.001, tl);
    vec2 hp = oc + rot(-0.22) * (vec2(cos(uOrbit), sin(uOrbit)) * orad);
    vec2 hd = p - hp;
    float hb = mix(0.55, 1.0, smoothstep(0.7, -0.7, sin(uOrbit)));
    float hs = uCometR * (0.8 + 0.2 * hb);
    glow(acc, uCometGlow, (exp(-dot(hd, hd) / (hs * hs * 5.0)) * 0.9 * hb + line * 0.35) * uThink);
    over(acc, uCometCol, max(cov(length(hd) - hs) * hb, line * 0.85) * uThink);
    over(acc, vec3(1.0), cov(length(hd - vec2(-0.3, 0.3) * hs) - hs * 0.38) * uThink * (uDark > 0.5 ? 0.0 : 0.9) * hb);
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
  // light theme: the eyes cast a soft shadow inside the glass, so they float behind the surface
  if (uDepth > 0.001) {
    vec2 so = vec2(0.03, -0.045);
    float ds = min(eyeSD(el - so, -1.0), eyeSD(er - so, 1.0));
    over(acc, uEyeShCol, (1.0 - smoothstep(-0.03, 0.06, ds)) * 0.2 * uDepth * (1.0 - faceA));
  }
  glow(acc, uHaloCol, exp(-max(d, 0.0) * uHaloK) * uHaloA * (1.0 - faceA));
  // eyes of light: a brighter heart, a deeper edge, a little transmitted light in the lower half
  float heart = smoothstep(0.0, uEye.x * 0.34, -d);
  vec3 ec = mix(uEyeEdge, uEyeCol, heart);
  float yy = (p.y - uFace.y) / max(uEye.y * 0.5, 1e-3);
  ec = mix(ec, uEyeLit, uDepth * 0.45 * smoothstep(0.1, -1.0, yy) * heart);
  ec = mix(ec, mix(uEyeEdge, uEyeCol, 0.4), step(eyeA, m - 0.001));
  over(acc, ec, faceA);
  // a catchlight in each open eye
  if (uDepth > 0.001) {
    float gr = 0.16 * uEye.x;
    vec2 go = vec2(-0.2 * uEye.x, 0.17 * uEye.y * min(uOpen, 1.0));
    float g = max(cov(length(el - go) - gr), cov(length(er - go) - gr)) * smoothstep(0.0, gr * 0.8, -d);
    over(acc, vec3(1.0), g * uDepth * 0.9 * (1.0 - uHappy) * (1.0 - uClosed));
  }

  gl_FragColor = acc;
}
`

/* ---------------- moods ---------------- */
// mouth weights: [smile, open smile, talking oval, small o, wavy, flat]
const BASE = { sad: 0, happy: 0, closed: 0, lid: 0, tilt: 0, rot: 0, core: 0.62, halo: 0.75, beacon: 0, smile: 0.75, squash: 0, lean: 0, pitch: 0, sleep: 0, big: 0, osz: 1, low: 0 }
const mood = (o) => ({ ...BASE, ...o })
const MOOD = {
  resting: mood({ closed: 1, core: 0.4, halo: 0.55, smile: 0.8, m: [0, 0, 0, 0, 0, 0], squash: -0.035, pitch: 0.05 }),
  idle: mood({ m: [1, 0, 0, 0, 0, 0] }),
  listening: mood({ core: 0.8, halo: 0.9, smile: 0.5, m: [1, 0, 0, 0, 0, 0], squash: 0.025, lean: -0.11, pitch: 0.1, big: 1 }),
  thinking: mood({ core: 0.55, halo: 0.8, m: [0, 0, 0, 0, 0, 1], squash: 0.01, lean: -0.05, pitch: -0.04 }),
  talking: mood({ core: 0.72, halo: 0.85, m: [0, 0, 1, 0, 0, 0] }),
  done: mood({ happy: 1, core: 0.85, halo: 0.9, smile: 1.1, m: [1, 0, 0, 0, 0, 0], lean: 0.03 }),
  'needs-you': mood({ core: 0.85, halo: 1, beacon: 1, m: [0, 0, 0, 1, 0, 0], squash: 0.04, pitch: 0.04, big: 0.5 }),
  worried: mood({ sad: 1, lid: 0.2, tilt: 0.55, rot: 0.12, core: 0.6, halo: 0.8, m: [0, 0, 0, 0, 1, 0], squash: -0.02 }),
  celebrating: mood({ happy: 1, core: 1, halo: 1, smile: 1, m: [0, 1, 0, 0, 0, 0] }),
  sleepy: mood({ tilt: 0.42, core: 0.3, halo: 0.4, m: [0, 0, 0, 1, 0, 0], osz: 0.75, squash: -0.03, lean: 0.1, pitch: 0.06, sleep: 1, low: 1 }),
}
const KEYS = Object.keys(BASE)

// sparkle positions around the drop: x, y, size, phase (content space, body centered at 0). Kept below the tip so
// the celebrating hop never carries them out of frame.
const SPARKS = [
  [-1.04, 0.52, 0.19, 0.0], [0.94, 0.74, 0.15, 1.7], [1.14, -0.16, 0.19, 3.1], [-1.16, -0.4, 0.12, 4.4],
  [-0.6, 0.98, 0.12, 2.3], [0.84, -0.84, 0.1, 5.2], [0.44, 1.02, 0.09, 0.9],
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
const dropR = (y) => { const t = Math.acos(Math.max(-1, Math.min(1, y / B))), s = Math.sin(t / 2); return 1.1767 * Math.sin(t) * Math.sqrt(s * s + 0.04) }

const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
const ease = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt))

export default {
  id: 'lumen',
  name: 'Lumen',
  vibe: 'A teardrop of thick optical glass with a soft core of light and two eyes suspended inside. Its surface breathes, ripples and swirls with its mood.',
  eyes: ['pills', 'dots', 'arcs'],
  frame: { height: 2.72, y: 0.07, peek: { height: 2.46, y: 0.04 }, header: { height: 2.62, y: 0.05 } },
  create({ kit, look, size }) {
    const small = size === 'peek'
    const object = new THREE.Group()
    const pose = new THREE.Group() // pivots at the bottom of the drop: squash, lean and pitch happen from there
    pose.position.y = -B
    const content = new THREE.Group()
    content.position.y = B
    pose.add(content)
    object.add(pose)

    const GU = {
      uEdgeCol: { value: new THREE.Color() }, uEdgeK: { value: 0.6 }, uEdgeP: { value: 1.8 }, uLift: { value: 0.1 }, uSoftTone: { value: 0 },
      uFaceSpec: { value: 0.1 }, uSpecIn: { value: 1 }, uTopK: { value: 0.3 }, uDeep: { value: new THREE.Color() }, uThick: { value: 0 },
      uClearA: { value: 1 }, uMilk: { value: 0 }, uMilkCol: { value: new THREE.Color() }, uCCEdge: { value: 1 }, uSpecEdge: { value: 1 }, uBand: { value: new THREE.Vector2(0.22, 0.55) },
    }
    const U = { uClock: { value: 0 }, uWob: { value: 0 }, uRip: { value: 0 }, uSwirl: { value: 0 }, uRing: { value: 0 }, uRingA: { value: 0 } }

    // body
    const geo = new THREE.LatheGeometry(dropProfile(small ? 56 : 96), small ? 44 : 72)
    const glassExtra = { thickness: 1.05, ior: 1.42, dispersion: small ? 0 : 0.35 }
    const glass = kit.glass(look, glassExtra)
    glass.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U, GU)
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\n' + DEFORM)
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(normal);\nvec3 lmP = vec3(position);\nlmDeform(lmP, objectNormal);')
        .replace('#include <begin_vertex>', 'vec3 transformed = lmP;')
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
uniform vec3 uEdgeCol;
uniform float uEdgeK;
uniform float uEdgeP;
uniform float uLift;
uniform float uSoftTone;
uniform float uFaceSpec;
uniform float uSpecIn;
uniform float uTopK;
uniform vec3 uDeep;
uniform float uThick;
uniform float uClearA;
uniform float uMilk;
uniform vec3 uMilkCol;
uniform float uCCEdge;
uniform float uSpecEdge;
uniform vec2 uBand;
vec3 lmShoulder(vec3 x) { vec3 k = 0.72 + 0.28 * (1.0 - exp(-(x - 0.72) / 0.28)); return mix(x, k, step(0.72, x)); }`)
        .replace('#include <opaque_fragment>', `#include <opaque_fragment>
  {
    float lmN = abs(dot(normalize(normal), normalize(vViewPosition)));
    gl_FragColor.a *= smoothstep(0.0, fwidth(lmN) * 1.6 + 0.004, lmN);
    // light theme: where the glass is thin and faces you, the panel itself shows through
    gl_FragColor.a *= mix(1.0, uClearA, smoothstep(0.5, 0.92, lmN));
  }`)
        .replace('#include <tonemapping_fragment>', '#if defined( TONE_MAPPING )\n  gl_FragColor.rgb = uSoftTone > 0.5 ? lmShoulder(gl_FragColor.rgb) : toneMapping(gl_FragColor.rgb);\n#endif')
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
  {
    // reflections stay on the shoulders and edges, not across the face: direct glints there read as specks or
    // extra eyes at 50x44, and a broad sheen reads as plastic
    float lmF = clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0);
    float lmMask = mix(1.0, uFaceSpec, smoothstep(0.72, 0.95, lmF)) * mix(1.0, uSpecIn, smoothstep(0.3, 0.75, lmF));
    float lmDirect = 0.22 * (1.0 - smoothstep(0.5, 0.8, lmF));
    // light theme: at the grazing edge the coat would mirror the bright room and wash out the refracted dark band
    float lmG = smoothstep(0.05, 0.42, lmF);
    lmMask *= mix(uSpecEdge, 1.0, lmG);
    #ifdef USE_CLEARCOAT
    material.clearcoat *= mix(uCCEdge, 1.0, lmG);
    #endif
    reflectedLight.directSpecular *= lmDirect;
    reflectedLight.indirectSpecular *= lmMask;
    #ifdef USE_CLEARCOAT
    clearcoatSpecularDirect *= lmDirect;
    clearcoatSpecularIndirect *= lmMask;
    #endif
  }`)
        .replace('#include <transmission_fragment>', `#include <transmission_fragment>
  {
    float lmNdv = clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0);
    // a refracted edge: the outer band of the lens bends darker surroundings in
    float lmEdge = uEdgeP > 0.0 ? pow(1.0 - lmNdv, uEdgeP) : pow(1.0 - smoothstep(uBand.x, uBand.y, lmNdv), 1.4);
    // a lens shows the world upside down: the dome takes a little of the deeper tint, the belly gathers light
    float lmTop = smoothstep(-0.15, 0.9, normalize(normal).y);
    // thickness: clear where you look straight through, tinted on the shoulders where the path is long
    vec3 lmThick = mix(vec3(1.0), mix(uDeep, vec3(1.0), lmNdv * lmNdv), uThick);
    totalDiffuse *= lmThick * mix(vec3(1.0), uEdgeCol, clamp(lmTop * uTopK + (uEdgeP > 0.0 ? lmEdge * uEdgeK : 0.0), 0.0, 1.0)) * (1.0 + uLift * lmNdv * lmNdv);
    // light theme: the band is an absolute tone (dark-field glass), so the grazing Fresnel loss cannot wash it out
    if (uEdgeP <= 0.0) totalDiffuse = mix(totalDiffuse, uEdgeCol, clamp(lmEdge * uEdgeK, 0.0, 1.0));
    // frost: a soft milky veil, strongest across the face
    totalDiffuse = mix(totalDiffuse, uMilkCol, uMilk * (0.35 + 0.65 * lmNdv));
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
    const baseColor = new THREE.Color(), baseAtt = new THREE.Color(), baseEdge = new THREE.Color()

    // rim
    const rimMat = new THREE.ShaderMaterial({
      uniforms: { ...U, uCol: { value: new THREE.Color() }, uPulseCol: { value: new THREE.Color() }, uI: { value: 0.9 }, uPow: { value: 3.2 }, uDark: { value: 0 }, uT: { value: 0 }, uPulse: { value: 0 } },
      vertexShader: RIM_VERT, fragmentShader: RIM_FRAG, transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    })
    const rim = new THREE.Mesh(geo, rimMat)
    rim.scale.set(1.004, 1.002, 0.864)
    rim.renderOrder = 4

    // core (transmission pass only). Larger than the drop, so refraction near the edge never samples past it.
    const coreMat = new THREE.ShaderMaterial({
      uniforms: {
        uCoreCol: { value: new THREE.Color() }, uCausticCol: { value: new THREE.Color() }, uLampCol: { value: new THREE.Color() }, uInk: { value: new THREE.Color() },
        uCore: { value: 0.6 }, uCoreFall: { value: 4.5 }, uSpiral: { value: 0 }, uClock: { value: 0 }, uRip: { value: 0 }, uLevel: { value: 0 },
        uDark: { value: 0 }, uCaustic: { value: 0.6 }, uLamp: { value: 0 }, uHorizon: { value: 0 }, uWin: { value: 0 },
        uCoreC: { value: new THREE.Vector2(0, -0.36) }, uMouthC: { value: new THREE.Vector2(0, -0.62) }, uOn: { value: 0 },
      },
      vertexShader: PLANE_VERT, fragmentShader: CORE_FRAG, depthWrite: false, toneMapped: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    })
    const core = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 3.0), coreMat)
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
    const sparkK = small ? 1.7 : size === 'header' ? 1.3 : 1
    const sparkPos = small ? 0.94 : 1
    const fu = {
      uEyeCol: { value: new THREE.Color() }, uEyeEdge: { value: new THREE.Color() }, uEyeLit: { value: new THREE.Color() }, uEyeShCol: { value: new THREE.Color() },
      uHaloCol: { value: new THREE.Color() }, uHaloA: { value: 0.8 }, uHaloK: { value: 11 }, uDark: { value: 0 }, uDepth: { value: 0 },
      uFace: { value: new THREE.Vector2(0, -0.24) }, uSep: { value: 0.62 * (small ? 1.06 : 1) }, uEye: { value: new THREE.Vector2(0.19 * eyeK, 0.36 * eyeK) },
      uOpen: { value: 1 }, uStyle: { value: 0 }, uHappy: { value: 0 }, uClosed: { value: 0 }, uLid: { value: 0 }, uSad: { value: 0 }, uTilt: { value: 0 }, uRot: { value: 0 },
      uSoft: { value: 0 }, uStroke: { value: small ? 1.35 : 1 },
      uMouth: { value: new THREE.Vector2(0, -0.62) }, uMW: { value: 0.25 * (small ? 1.3 : eyeK) }, uM: { value: [0, 0, 0, 0, 0, 0] },
      uSmile: { value: 0.8 }, uLevel: { value: 0 }, uOSize: { value: 1 },
      uBeacon: { value: 0 }, uBeat: { value: 0 }, uGlowP: { value: 0 }, uSigCol: { value: new THREE.Color() }, uSigHot: { value: new THREE.Color() }, uSigInk: { value: new THREE.Color() }, uSigTip: { value: new THREE.Color() },
      uTip: { value: new THREE.Vector2(0, small ? 0.78 : size === 'header' ? 0.82 : 0.86) }, uDotK: { value: small ? 2.2 : size === 'header' ? 1.5 : 1 },
      uSpark: { value: 0 }, uT: { value: 0 }, uSpk: { value: SPARKS.map(([x, y, z, w]) => new THREE.Vector4(x * sparkPos, y * sparkPos, z * sparkK, w)) }, uSparkCol: { value: new THREE.Color() },
      uThink: { value: 0 }, uOrbit: { value: 0 }, uCometR: { value: small ? 0.08 : size === 'header' ? 0.066 : 0.052 }, uCometCol: { value: new THREE.Color() }, uCometGlow: { value: new THREE.Color() },
      uShadow: { value: 1 }, uShadowY: { value: -B - 0.04 }, uShadowCol: { value: new THREE.Color() }, uCausticCol: { value: new THREE.Color() },
      uSweat: { value: 0 }, uSweatP: { value: new THREE.Vector3(0.5, 0.3, 0.07) }, uSweatCol: { value: new THREE.Color() }, uSweatEdge: { value: new THREE.Color() },
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

    // colors (linear; face and rim uniforms take sRGB, converted where they are set)
    const C = {
      eye: new THREE.Color(), eyeEdge: new THREE.Color(), eyeWarm: new THREE.Color(), eyeWarmEdge: new THREE.Color(), halo: new THREE.Color(), core: new THREE.Color(),
      spark: new THREE.Color(), rim: new THREE.Color(), caustic: new THREE.Color(), warm: new THREE.Color(), lamp: new THREE.Color(), warmGlass: new THREE.Color(),
    }
    const tmp = new THREE.Color()
    const srgb = (dst, src) => dst.copy(src).convertLinearToSRGB()
    let topK = 0.3

    function setLook(l) {
      L = l
      const tn = l.tint
      const warmTint = tn.key === 'peach'
      if (l.dark) delete glassExtra.roughness
      else glassExtra.roughness = 0.03 + 0.15 * l.frost // light: keep refraction crisp, show frost in the veil instead
      kit.updateGlass(glass, l, glassExtra)
      glass.clearcoatRoughness = 0.06 + 0.26 * l.frost
      C.warm.copy(warmTint ? WARM_PEACH : WARM)
      if (l.dark) {
        C.eye.copy(WHITE).lerp(tn.glow, 0.14)
        C.eyeEdge.copy(WHITE).lerp(tn.glow, 0.5)
        C.eyeWarm.copy(WHITE).lerp(C.warm, 0.6)
        C.eyeWarmEdge.copy(C.warm).lerp(WHITE, 0.15)
        C.halo.copy(tn.glow)
        C.spark.copy(WHITE).lerp(tn.glow, 0.45)
        C.caustic.copy(tn.glow)
        C.rim.copy(tn.soft).lerp(WHITE, 0.35)
        C.lamp.copy(C.warm)
        srgb(fu.uShadowCol.value, tmp.set('#000000'))
        srgb(fu.uCometCol.value, tmp.copy(WHITE).lerp(tn.glow, 0.25))
        srgb(fu.uCometGlow.value, tn.glow)
        srgb(fu.uSweatCol.value, tmp.copy(tn.soft).lerp(WHITE, 0.4))
        // warm glass reads as brown when it is darkened: keep peach brighter and its dome untinted
        glass.color.multiplyScalar(warmTint ? 0.88 : 0.7)
        glass.envMapIntensity = 0.5
        glass.attenuationDistance = 1.5 - l.frost * 0.5
        GU.uEdgeCol.value.copy(tn.glass).multiply(tn.glass).lerp(tn.glow, 0.25)
        GU.uEdgeK.value = 0.5
        GU.uEdgeP.value = 1.8
        GU.uLift.value = 0.05
        GU.uSoftTone.value = 0
        GU.uSpecIn.value = 1
        GU.uThick.value = 0
        GU.uClearA.value = 1
        GU.uCCEdge.value = 1
        GU.uSpecEdge.value = 1
        GU.uMilk.value = l.frost * 0.12
        GU.uMilkCol.value.copy(tn.glow).multiplyScalar(0.22)
        topK = warmTint ? 0.1 : 0.3
        C.warmGlass.copy(glass.color).lerp(C.warm, 0.25)
      } else {
        // deep enough to read on the pale glass: darken toward ink until it clears a contrast target
        const target = lum(tn.glass) * 0.21
        let k = 0.55
        while (k < 0.92 && lum(C.eye.copy(tn.glow).lerp(tn.ink, k)) > target) k += 0.04
        C.eyeEdge.copy(tn.glow).lerp(tn.ink, Math.min(1, k + 0.1))
        C.eyeWarm.copy(C.eye).lerp(WARM_INK, 0.4)
        C.eyeWarmEdge.copy(C.eyeEdge).lerp(WARM_INK, 0.4)
        C.halo.copy(tn.glow)
        C.spark.copy(tn.glow).lerp(tn.ink, 0.3)
        C.caustic.copy(tn.glow).lerp(WHITE, 0.55)
        C.rim.copy(WHITE).lerp(tn.glow, 0.2)
        C.lamp.copy(C.warm).lerp(WARM_INK, warmTint ? 0.15 : 0)
        srgb(fu.uShadowCol.value, tmp.copy(tn.ink).lerp(new THREE.Color(0.02, 0.03, 0.06), 0.4))
        srgb(fu.uCometCol.value, C.eye)
        srgb(fu.uCometGlow.value, tn.glow)
        srgb(fu.uSweatCol.value, tmp.copy(WHITE).lerp(tn.glow, 0.25))
        // optical glass on a pale panel: near-clear body, tint only where the path is long, a dark refracted edge
        glass.color.copy(tn.glass).lerp(WHITE, 0.9)
        glass.envMapIntensity = 1.0
        glass.attenuationColor.copy(WHITE) // the tint lives on the shoulders (uDeep), not in a uniform volume dye
        glass.attenuationDistance = 50
        GU.uCCEdge.value = 0.2
        GU.uSpecEdge.value = 0.15
        GU.uEdgeCol.value.copy(tn.ink).lerp(tn.glass, 0.2)
        GU.uEdgeK.value = 0.95
        GU.uEdgeP.value = 0
        GU.uLift.value = 0.1
        GU.uSoftTone.value = 1
        GU.uSpecIn.value = 0.6
        GU.uDeep.value.copy(tn.glass).multiply(tn.glass).lerp(tn.glow, 0.15)
        GU.uThick.value = 1
        GU.uClearA.value = 0.4 + 0.36 * l.frost
        GU.uMilk.value = l.frost * 0.32
        GU.uMilkCol.value.copy(WHITE).lerp(tn.glass, 0.3)
        topK = 0.2
        C.warmGlass.copy(glass.color).lerp(C.warm, 0.12)
        if (warmTint) C.warmGlass.multiplyScalar(0.86)
      }
      C.core.copy(tn.glow)
      srgb(fu.uEyeShCol.value, tn.ink)
      srgb(fu.uEyeLit.value, tmp.copy(tn.glow).lerp(C.eye, 0.35))
      srgb(fu.uSweatEdge.value, tn.ink)
      srgb(fu.uSparkCol.value, C.spark)
      srgb(fu.uSigCol.value, l.dark ? SIGNAL : tmp.copy(SIGNAL).lerp(SIGNAL_DEEP, 0.35))
      srgb(fu.uSigHot.value, tmp.copy(WHITE).lerp(SIGNAL, 0.12))
      srgb(fu.uSigInk.value, tmp.copy(tn.ink).lerp(new THREE.Color(0.02, 0.02, 0.03), 0.3))
      srgb(fu.uSigTip.value, l.dark ? SIGNAL : tmp.copy(SIGNAL).lerp(WHITE, 0.55))
      srgb(rimMat.uniforms.uPulseCol.value, SIGNAL)
      coreMat.uniforms.uInk.value.copy(tn.ink).lerp(tn.glass, 0.25)
      fu.uDark.value = coreMat.uniforms.uDark.value = rimMat.uniforms.uDark.value = l.dark ? 1 : 0
      fu.uDepth.value = l.dark ? 0 : 1
      fu.uStyle.value = l.eyes === 'dots' ? 1 : l.eyes === 'arcs' ? 2 : 0
      fu.uSoft.value = (small ? 0.004 : 0.002) + l.frost * 0.008
      fu.uHaloK.value = 13 - l.frost * 5
      rimMat.uniforms.uI.value = l.dark ? 0.95 : 0.85
      rimMat.uniforms.uPow.value = l.dark ? 3.2 : 4.2
      fu.uShadow.value = small ? 0 : 1
      GU.uFaceSpec.value = 0.1
      coreMat.uniforms.uCaustic.value = l.dark ? 0.55 : 1.6 * (1 - 0.45 * l.frost)
      coreMat.uniforms.uCoreFall.value = l.dark ? 4.5 : 14
      coreMat.uniforms.uWin.value = (l.dark ? 0.5 : 1.4) * (1 - 0.5 * l.frost)
      coreMat.uniforms.uHorizon.value = l.dark ? 0 : 0.3 * (1 - 0.5 * l.frost)
      const DBG = globalThis.__lumenDbg || {}
      for (const [k, v] of Object.entries(DBG)) {
        if (GU[k]) { if (Array.isArray(v)) GU[k].value.set(...v); else GU[k].value = v }
        else if (coreMat.uniforms[k]) coreMat.uniforms[k].value = v
        else if (fu[k]) fu[k].value = v
        else if (rimMat.uniforms[k]) rimMat.uniforms[k].value = v
        else if (k in glass) glass[k] = v
      }
      baseColor.copy(glass.color)
      baseAtt.copy(glass.attenuationColor)
      baseEdge.copy(GU.uEdgeCol.value)
    }
    setLook(look)

    return {
      object,
      update(f, look) {
        if (look !== L && look) L = look
        const dt = inited ? Math.min(0.1, f.dt || 1 / 30) : 1
        const tg = MOOD[f.mood] || MOOD.idle
        const rate = inited ? 9 : 1e3
        for (const k of KEYS) S[k] = ease(S[k], tg[k], rate, dt)
        for (let i = 0; i < 6; i++) M[i] = ease(M[i], tg.m[i], inited ? 14 : 1e3, dt)
        inited = true
        const rm = f.rm
        const P = f.P
        const tt = rm ? 0 : f.clock
        const amp = 0.45 + 0.55 * P
        const dark = L.dark

        // surface
        U.uClock.value = tt
        U.uWob.value = f.wob
        U.uRip.value = f.rip
        U.uSwirl.value = f.swirl
        const ringOn = f.mood === 'done' && !rm
        U.uRing.value = f.moodAge * 1.3
        U.uRingA.value = ringOn ? Math.max(0, 1 - f.moodAge / 2.2) : 0

        // worried: a sweat bead slides down the temple every ~2.4 s, and the drop shudders as it starts
        const wph = rm ? 0.38 : (f.t * 0.42 + 0.2) % 1
        const shud = rm ? 0 : f.warm * Math.max(0, 1 - wph / 0.14)

        // pose: breathing, squash, lean, celebrating hop
        const breathe = rm ? 0 : Math.sin(tt * 1.25) * 0.012 * amp
        let sy = 1 + S.squash + breathe - shud * 0.03
        const bnc = -f.bounce
        const hopK = small ? 0.3 : size === 'header' ? 0.5 : P > 1 ? 0.6 : 1
        const hop = bnc * hopK
        if (f.mood === 'celebrating' && !rm) {
          const hmax = P > 1 ? 0.16 : 0.09
          const h = Math.min(1, bnc / hmax)
          sy += h * (small ? 0.025 : 0.045) - Math.pow(1 - h, 6) * 0.06
        }
        const sx = 1 / Math.sqrt(Math.max(0.5, sy))
        pose.scale.set(sx, sy, sx)
        object.position.y = hop
        const sway = rm ? 0 : f.mood === 'sleepy' ? Math.sin(f.t * 0.7) * 0.03 : Math.sin(tt * 0.6) * 0.008 * amp
        const shiver = rm ? 0 : f.warm * (Math.sin(f.t * 33) * (small ? 0.012 : 0.006) * amp + Math.sin(f.t * 47) * shud * (small ? 0.035 : 0.022))
        pose.rotation.z = S.lean + sway - f.lookX * 0.025
        pose.rotation.x = S.pitch + f.lookY * 0.05
        pose.rotation.y = f.lookX * 0.08
        object.position.x = shiver

        // glass: stays clear when worried (the warmth is a lamp inside, not a dye); more iridescent when celebrating
        glass.color.copy(baseColor).lerp(C.warmGlass, f.warm)
        glass.attenuationColor.copy(baseAtt).lerp(C.warm, f.warm * 0.35)
        GU.uEdgeCol.value.copy(baseEdge)
        GU.uTopK.value = topK * (1 - f.warm)
        glass.iridescence = 0.25 + f.spark * 0.55

        // face
        const lx = f.lookX * 0.11, ly = -f.lookY * 0.09 - S.low * 0.045
        fu.uFace.value.set(lx, -0.24 + ly)
        fu.uMouth.value.set(lx * 0.8, -0.62 + ly * 0.8)
        const openShape = (f.open + (1 - f.open) * S.sleep) * f.blink
        fu.uOpen.value = openShape
        fu.uLid.value = S.lid + S.sleep * Math.max(0, 1 - f.open) * 0.78
        fu.uTilt.value = S.tilt
        fu.uSad.value = S.sad
        fu.uRot.value = S.rot
        fu.uHappy.value = S.happy
        fu.uClosed.value = S.closed
        fu.uSmile.value = S.smile
        fu.uLevel.value = f.level
        fu.uOSize.value = S.osz * (rm ? 1 : 1 + S.sleep * 0.18 * Math.sin(f.t * 1.1))
        fu.uEye.value.set(0.19 * eyeK * (1 + S.big * (small ? 0.1 : 0.05)), 0.36 * eyeK * (1 + S.big * (small ? 0.2 : 0.1)))
        for (let i = 0; i < 6; i++) fu.uM.value[i] = M[i]
        fu.uHaloA.value = S.halo * (dark ? 0.36 : 0.22) * (1 - S.sleep * 0.4)
        const beat = rm ? 0.35 : (f.t * 0.85) % 1
        fu.uBeacon.value = S.beacon
        fu.uBeat.value = beat
        fu.uGlowP.value = rm ? 0.7 : 0.5 + 0.5 * Math.cos(beat * Math.PI * 2)
        fu.uSpark.value = f.spark
        fu.uThink.value = f.swirl
        fu.uOrbit.value = rm ? -0.5 : f.t * 2.4 - 1.6 // still pose: the bead in front, toward where the eyes look
        fu.uT.value = rm ? 0.7 : f.t
        fu.uShadowY.value = -B - 0.04 - hop / Math.max(0.5, sy)
        fu.uShadow.value = small ? 0 : Math.max(0, 1 - hop * 3)
        // sweat bead path: hugging the right temple, accelerating as it slides
        const sy0 = 0.5 - wph * wph * 0.42
        const ssz = small ? 0.1 : size === 'header' ? 0.085 : 0.068
        fu.uSweatP.value.set(dropR(sy0) - ssz * 1.25, sy0, ssz)
        fu.uSweat.value = f.warm * (rm ? 1 : Math.min(1, wph / 0.08) * Math.min(1, (1 - wph) / 0.18))

        // colors (warm when worried)
        tmp.copy(C.eye).lerp(C.eyeWarm, f.warm)
        srgb(fu.uEyeCol.value, tmp)
        tmp.copy(C.eyeEdge).lerp(C.eyeWarmEdge, f.warm)
        srgb(fu.uEyeEdge.value, tmp)
        tmp.copy(C.halo).lerp(C.warm, f.warm)
        srgb(fu.uHaloCol.value, tmp)
        tmp.copy(C.caustic).lerp(C.warm, f.warm)
        srgb(fu.uCausticCol.value, tmp)
        rimMat.uniforms.uCol.value.copy(C.rim).lerp(C.warm, f.warm * 0.85).convertLinearToSRGB()
        rimMat.uniforms.uT.value = tt
        rimMat.uniforms.uPulse.value = S.beacon * (dark ? 0.7 : 0.9) * fu.uGlowP.value

        // core light
        const cu = coreMat.uniforms
        cu.uCoreCol.value.copy(C.core).lerp(C.warm, f.warm)
        cu.uCausticCol.value.copy(L.dark ? C.caustic : WHITE).lerp(C.warm, f.warm)
        cu.uLampCol.value.copy(C.lamp)
        cu.uLamp.value = f.warm * (rm ? 0.85 : 0.72 + 0.28 * Math.sin(f.t * 1.9)) * (dark ? 1 : 0.9)
        cu.uCore.value = S.core * (1 + f.level * 0.45) * (dark ? 0.5 : 0.12) * (1 - f.warm * 0.5)
        cu.uSpiral.value = small ? 0 : f.swirl * (dark ? 0.75 : 0.5)
        cu.uClock.value = tt
        cu.uRip.value = f.rip
        cu.uLevel.value = f.level
        cu.uMouthC.value.copy(fu.uMouth.value)
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
