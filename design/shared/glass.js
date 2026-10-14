// Tints and the fake desktop for the glass in glass.css. Shared by glass-lab.html and showcase.html.

/** The panel's five tints from the glass redesign. The app ships Ice. Each is RGB: glass, glow, ink (text), soft (dark text). */
export const TINTS = {
  ice: { name: 'Ice', glass: [200, 228, 255], glow: [96, 190, 255], ink: [18, 70, 120], soft: [178, 220, 255] },
  lilac: { name: 'Lilac', glass: [222, 212, 255], glow: [168, 140, 255], ink: [70, 46, 150], soft: [214, 202, 255] },
  mint: { name: 'Mint', glass: [198, 242, 224], glow: [70, 214, 160], ink: [12, 90, 64], soft: [170, 238, 210] },
  peach: { name: 'Peach', glass: [255, 218, 200], glow: [255, 146, 104], ink: [136, 52, 22], soft: [255, 206, 186] },
  graphite: { name: 'Graphite', glass: [168, 176, 190], glow: [200, 210, 228], ink: [30, 34, 42], soft: [214, 220, 232] },
}

const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255] }
function hsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h / 6, s, l]
}
function fromHsl(h, s, l) {
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q
  const f = (t) => { t = ((t % 1) + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p }
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map((v) => Math.round(v * 255))
}
/** A panel tint made from one of the Pill's colors: the same hue, at the lightness each part of the tint needs. */
export function tintFrom(name, hex) {
  const [h, s] = hsl(rgb(hex)), sat = (k, max = 1) => Math.min(max, s * k)
  return { name, glass: fromHsl(h, sat(0.95), 0.86), glow: fromHsl(h, sat(1.1), 0.62), ink: fromHsl(h, sat(1, 0.75), 0.26), soft: fromHsl(h, sat(1), 0.84) }
}

/** Set a tint (and optionally the frost, 0 clear to 1 frosted) on an element; .gx boxes inside it pick it up. */
export function applyTint(el, tint, frost) {
  el.style.setProperty('--tint', tint.glass.join(','))
  el.style.setProperty('--glow', tint.glow.join(','))
  el.style.setProperty('--ink', tint.ink.join(','))
  el.style.setProperty('--soft', tint.soft.join(','))
  if (frost !== undefined) el.style.setProperty('--frost', String(frost))
}

export const WALL_GRADS = ['linear-gradient(135deg,#ff9ec9,#7cc4ff)', 'linear-gradient(135deg,#ffd47a,#ff7a7a)', 'linear-gradient(135deg,#8ef0b0,#3aa3ff)', 'linear-gradient(135deg,#c8b6ff,#ff9ec9)', 'linear-gradient(135deg,#1e2a44,#6c8cff)', 'linear-gradient(135deg,#ffe6a8,#9be7ff)']

/** The busy desktop, 1080 x 700: wallpaper, menu bar, a code editor, a browser, a sticky note and the Dock. */
export function desktopHTML({ app = 'Code', clock = 'Fri 9:41 AM', note = 'ship v1.2<br>glass look ✦<br>⌘K switcher' } = {}) {
  const cols = ['#c792ea', '#82aaff', '#c3e88d', '#f78c6c', '#89ddff', '#ffcb6b', '#676e95']
  let seed = 7
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280
  let code = ''
  for (let i = 1; i <= 21; i++) {
    const ind = [0, 1, 1, 2, 2, 3, 2, 1, 0][Math.floor(rnd() * 9)]
    let line = `<span class="ln">${i}</span><span style="display:inline-block;width:${ind * 18}px"></span>`
    const n = 1 + Math.floor(rnd() * 4)
    for (let j = 0; j < n; j++) line += `<b style="width:${20 + Math.floor(rnd() * 90)}px;background:${cols[Math.floor(rnd() * cols.length)]}"></b>`
    code += `<div>${line}</div>`
  }
  const tiles = WALL_GRADS.concat(WALL_GRADS.slice(0, 3)).map((g) => `<i style="background:${g}"></i>`).join('')
  const dock = ['#3aa3ff', '#ff7a7a', '#8ef0b0', '#ffd47a', '#c8b6ff', '#1e2a44', '#ff9ec9', '#9be7ff'].map((c) => `<i style="background:${c}"></i>`).join('')
  return `<div class="wall"></div>
    <div class="menubar"><b>${app}</b><span>File</span><span>Edit</span><span>Selection</span><span>View</span><span>Go</span><span class="grow"></span><span>${clock}</span></div>
    <div class="dwin editor"><div class="tb"><i class="tl-r"></i><i class="tl-y"></i><i class="tl-g"></i><span>page.tsx</span></div><div class="code">${code}</div></div>
    <div class="dwin browser"><div class="tb"><i class="tl-r"></i><i class="tl-y"></i><i class="tl-g"></i><div class="url">dribbble.com/search/glass-ui</div></div><div class="tiles">${tiles}</div></div>
    <div class="sticky">${note}</div>
    <div class="dock">${dock}</div>`
}

/** Scale a fixed-size scene (w x h) to the width of its wrapper, now and whenever the wrapper resizes. */
export function fitScene(wrap, scene, w = 1080, h = 700, onScale) {
  const fit = () => {
    const k = wrap.clientWidth / w
    scene.style.transform = `scale(${k})`
    wrap.style.height = `${Math.round(h * k)}px`
    onScale?.(k)
  }
  new ResizeObserver(fit).observe(wrap)
  fit()
}
