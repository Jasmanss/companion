// Six still looks for Steward, plus the face the app draws today. Only how they look, no animation.
// Each design draws into a 120 x 120 box (ground near y = 106) and has two versions: 'big' for anything over
// about 100 px, and 'small' for the real 64x54 header and 50x44 peek, redrawn the way icon designers redraw
// small sizes (fewer details, bigger eyes, heavier lines) instead of just shrinking the big one.
//
// A design: { id, name, style, idea, basedOn, bbox: [x0, y0, x1, y1], svg(variant, uid) -> inner SVG markup,
//             pixel?: { grid, palette } for sprites that must land on whole pixels }

const ink = '#231d33'

/* ---------------- 1. Glow: a screen face in a soft shell ---------------- */
const glow = {
  id: 'glow',
  name: 'Glow',
  style: 'Screen face',
  idea: 'A little rounded device with a dark glass face and two glowing eyes. Closest to what the app draws today, just given a body.',
  basedOn: 'Anki Cozmo and Vector, and EVE from WALL-E: two light shapes on a dark screen carry every mood.',
  bbox: [6, 6, 114, 102],
  notes: {
    good: ['Reads best of all at 50×44. The eyes alone can carry every mood, and the app already animates exactly this.', 'Clear silhouette: antenna and ear pucks.'],
    bad: ['A generic robot. It looks like a hundred AI assistant icons.', 'Coldest of the six. The Tolan team dropped robots as "too on the nose" for an AI companion.'],
  },
  svg(v, u) {
    const small = v === 'small'
    return `
<defs>
  <linearGradient id="${u}sh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9cfff"/><stop offset="1" stop-color="#ad9cf0"/></linearGradient>
  <filter id="${u}gl" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="${small ? 1.6 : 2.6}" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<line x1="60" y1="28" x2="60" y2="${small ? 16 : 15}" stroke="#9f8ee6" stroke-width="${small ? 5 : 3.4}" stroke-linecap="round"/>
<circle cx="60" cy="${small ? 13 : 12}" r="${small ? 7 : 5.5}" fill="#ffb3a1"/>
<rect x="7" y="50" width="15" height="26" rx="7.5" fill="#9f8ee6"/>
<rect x="98" y="50" width="15" height="26" rx="7.5" fill="#9f8ee6"/>
<rect x="15" y="26" width="90" height="76" rx="31" fill="url(#${u}sh)"/>
${small ? '' : '<path d="M31 37 Q38 31 49 30" stroke="#fff" stroke-opacity=".6" stroke-width="3.4" stroke-linecap="round" fill="none"/>'}
<rect x="${small ? 22 : 24}" y="${small ? 35 : 37}" width="${small ? 76 : 72}" height="${small ? 58 : 54}" rx="${small ? 22 : 21}" fill="#15131e"/>
<g filter="url(#${u}gl)" fill="#efeaff">
  <rect x="${small ? 37 : 39}" y="${small ? 49 : 51}" width="${small ? 18 : 15}" height="${small ? 29 : 25}" rx="${small ? 9 : 7.5}"/>
  <rect x="${small ? 65 : 66}" y="${small ? 49 : 51}" width="${small ? 18 : 15}" height="${small ? 29 : 25}" rx="${small ? 9 : 7.5}"/>
</g>`
  },
}

/* ---------------- 2. Pixel: a penguin in a bow tie, on a pixel grid ---------------- */
// One sprite for every size, drawn at whole-pixel scales (3 px a cell in the peek, 4 in the header).
const PENGUIN = [
  '.......bo.......',
  '.....oobboo.....',
  '...oobbbbbboo...',
  '..oBwwwbbwwwbo..',
  '.obwwwwwwwwwwbo.',
  '.obwwewwwwewwbo.',
  '.obwwewwwwewwbo.',
  '.obwwwwyywwwwbo.',
  'obbbbrwwwwrbbbbo',
  'bbbbbrrRRrrbbbbb',
  '.obbbrwwwwrbbbo.',
  '..oobbwwwwbboo..',
  '....yyy..yyy....',
]
const pixel = {
  id: 'pixel',
  name: 'Pip',
  style: 'Pixel sprite',
  idea: 'A penguin chick in a bow tie, drawn on a 16 by 13 grid. A penguin already wears a tuxedo, which fits the name Steward.',
  basedOn: 'Pixel Pals on the iPhone Dynamic Island, the Claude Code sprite, and the pixel pets now living in Mac notches.',
  pixel: {
    grid: PENGUIN,
    palette: { o: '#1a1d2b', b: '#5a6db8', B: '#7e91dc', w: '#f6f3ec', e: '#1a1d2b', y: '#ffad3d', r: '#ef4f5f', R: '#b8263a' },
  },
  notes: {
    good: ['A penguin already wears a tuxedo, so the steward idea needs no explaining. None of the notch pets I found is a penguin.', 'Pixel art is made for tiny sizes: one drawing, perfectly crisp at every size.'],
    bad: ['Pixel pets are now the cliché of the notch, and the style is close in spirit to the Claude Code sprite.', 'Clashes with the smooth, rounded app unless the whole app leans retro. Expressions are limited by the grid.'],
  },
  svg() {
    const { grid, palette } = this.pixel
    let out = ''
    grid.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const c = palette[row[x]]
        if (c) out += `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${c}"/>`
      }
    })
    return out
  },
}

/* ---------------- 3. Bold: big white eyes on a chunky geometric body ---------------- */
const bold = {
  id: 'bold',
  name: 'Hop',
  style: 'Bold and geometric',
  idea: 'A chunky frog-like body where the eyes sit on top as two bumps. Big white eyes with pupils, so you can always tell where it is looking.',
  basedOn: "Duolingo's shape rules: rounded rectangles and circles only, the fewest shapes possible, flat color with one shade.",
  bbox: [12, 22, 108, 108],
  notes: {
    good: ['Strongest at real size: the biggest eyes, and you can tell where it looks.', 'A silhouette nobody else in the notch has: the two eye bumps.'],
    bad: ["Very close to Sanrio's Keroppi (a frog with big eyes on top and blush).", 'A frog has nothing to do with "Steward". The loud blue may be a lot at the screen edge all day.'],
  },
  svg(v, u) {
    const small = v === 'small'
    const body = '#45b4ff', shade = '#2a94e6', pr = small ? 9.5 : 8, er = small ? 15.5 : 14.5
    return `
<defs><clipPath id="${u}c"><rect x="16" y="44" width="88" height="60" rx="28"/><circle cx="38" cy="46" r="21"/><circle cx="82" cy="46" r="21"/></clipPath></defs>
<rect x="22" y="97" width="24" height="11" rx="5.5" fill="${shade}"/>
<rect x="74" y="97" width="24" height="11" rx="5.5" fill="${shade}"/>
<g clip-path="url(#${u}c)">
  <rect x="0" y="0" width="120" height="120" fill="${shade}"/>
  <g transform="translate(-5 -5)"><rect x="16" y="44" width="88" height="60" rx="28" fill="${body}"/><circle cx="38" cy="46" r="21" fill="${body}"/><circle cx="82" cy="46" r="21" fill="${body}"/></g>
  ${small ? '' : '<ellipse cx="58" cy="92" rx="24" ry="9" fill="#8fd2ff"/>'}
</g>
<circle cx="38" cy="46" r="${er}" fill="#fff"/>
<circle cx="82" cy="46" r="${er}" fill="#fff"/>
<circle cx="40.5" cy="49" r="${pr}" fill="${ink}"/>
<circle cx="79.5" cy="49" r="${pr}" fill="${ink}"/>
<circle cx="43.5" cy="45.5" r="${small ? 3.2 : 2.8}" fill="#fff"/>
<circle cx="82.5" cy="45.5" r="${small ? 3.2 : 2.8}" fill="#fff"/>
<path d="M${small ? 49 : 50} 74 Q60 ${small ? 84 : 82} ${small ? 71 : 70} 74" stroke="${ink}" stroke-width="${small ? 5 : 3.6}" stroke-linecap="round" fill="none"/>
<ellipse cx="29" cy="73" rx="${small ? 7 : 6}" ry="${small ? 4.4 : 3.6}" fill="#ff8fb3" opacity=".8"/>
<ellipse cx="91" cy="73" rx="${small ? 7 : 6}" ry="${small ? 4.4 : 3.6}" fill="#ff8fb3" opacity=".8"/>`
  },
}

/* ---------------- 4. Soft: a kawaii ghost steward ---------------- */
const soft = {
  id: 'soft',
  name: 'Wisp',
  style: 'Soft and minimal',
  idea: 'A small friendly ghost with a bow tie. One simple shape, small low eyes, and a tail. A ghost that lives at the edge of your screen and drifts out when needed.',
  basedOn: 'The baby schema (big round head, eyes set low and wide, tiny mouth) and minimal characters like Miffy and Molang.',
  bbox: [10, 20, 110, 108],
  notes: {
    good: ['A ghost that lives at the edge of the screen, fades in and drifts out, is a natural story for a peek tab.', 'Pale lilac matches the app accent and pops on the dark tab.'],
    bad: ["Pale body with small dark eyes is the closest of the six to coucou's Mochi.", 'Smallest eyes of the six at peek. Ghosts can also read as spooky, and the bow tie is a bit of a gimmick.'],
  },
  svg(v, u) {
    const small = v === 'small'
    const body = '#e2d8ff', shade = '#c5b6fb'
    const path = 'M24 92 L24 58 A36 36 0 0 1 96 58 L96 92 A12 12 0 0 1 72 92 A12 12 0 0 1 48 92 A12 12 0 0 1 24 92 Z'
    const ex = small ? 5.6 : 4.6, ey = small ? 7.4 : 6.2
    return `
<defs><clipPath id="${u}c"><path d="${path}"/></clipPath></defs>
<g transform="rotate(-6 60 64)">
  <ellipse cx="22" cy="74" rx="8.5" ry="6" transform="rotate(-30 22 74)" fill="${shade}"/>
  <ellipse cx="101" cy="62" rx="8.5" ry="6" transform="rotate(-55 101 62)" fill="${shade}"/>
  <path d="${path}" fill="${shade}"/>
  <g clip-path="url(#${u}c)"><path d="${path}" transform="translate(-5 -4)" fill="${body}"/></g>
  <ellipse cx="48" cy="63" rx="${ex}" ry="${ey}" fill="${ink}"/>
  <ellipse cx="72" cy="63" rx="${ex}" ry="${ey}" fill="${ink}"/>
  ${small ? '' : '<circle cx="49.6" cy="60.4" r="1.7" fill="#fff"/><circle cx="73.6" cy="60.4" r="1.7" fill="#fff"/>'}
  ${small ? '' : `<path d="M56.5 72 Q60 75.5 63.5 72" stroke="${ink}" stroke-width="2.4" stroke-linecap="round" fill="none"/>`}
  <path d="M60 ${small ? 81 : 82} L${small ? 47 : 50} ${small ? 75 : 77} L${small ? 47 : 50} ${small ? 87 : 87} Z M60 ${small ? 81 : 82} L${small ? 73 : 70} ${small ? 75 : 77} L${small ? 73 : 70} ${small ? 87 : 87} Z" fill="#7a5cf0" stroke="#7a5cf0" stroke-width="2.4" stroke-linejoin="round"/>
  <circle cx="60" cy="${small ? 81 : 82}" r="${small ? 3.6 : 2.8}" fill="#5636d4"/>
</g>`
  },
}

/* ---------------- 5. Crafted: an organic creature with brows and a sprout ---------------- */
const crafted = {
  id: 'crafted',
  name: 'Fern',
  style: 'Organic and handmade',
  idea: 'A soft, slightly lopsided creature with a sprout, eyebrows and a warm belly. Richer at large sizes, with a stripped-down small version.',
  basedOn: 'Tolan (the AI companion app): organic shapes over robots, eyebrows for expression, a smooth but handmade finish.',
  bbox: [14, 8, 106, 112],
  notes: {
    good: ['Most personality: eyebrows give it a range the others lack.', 'Feels warm and handmade at large sizes.'],
    bad: ['Busiest at peek: the sprout takes height, so the face gets small.', 'The texture vanishes when small, and sprout creatures are common (Pikmin, Bulbasaur).'],
  },
  svg(v, u) {
    const small = v === 'small'
    const body = 'M60 30 C83 29 97 50 96 73 C95 95 80 107 60 107 C40 107 25 96 24 74 C23 51 37 31 60 30 Z'
    return `
<defs>
  <radialGradient id="${u}g" cx=".38" cy=".3" r=".85"><stop offset="0" stop-color="#b8acff"/><stop offset=".6" stop-color="#9787f5"/><stop offset="1" stop-color="#7563dc"/></radialGradient>
  <clipPath id="${u}c"><path d="${body}"/></clipPath>
  <filter id="${u}n" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="2" seed="4"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .16 -.03"/><feComposite in2="SourceGraphic" operator="in"/></filter>
</defs>
<path d="M60 31 C59 24 61 19 64 15" stroke="#4fae73" stroke-width="${small ? 4.5 : 3}" stroke-linecap="round" fill="none"/>
<path d="M64 16 C58 6 47 6 43 10 C48 17 57 19 64 16 Z" fill="#7fd69a"/>
<path d="M64 16 C70 5 81 5 85 9 C80 16 71 19 64 16 Z" fill="#62c283"/>
<ellipse cx="25" cy="80" rx="7" ry="10" transform="rotate(22 25 80)" fill="#7563dc"/>
<ellipse cx="95" cy="80" rx="7" ry="10" transform="rotate(-22 95 80)" fill="#7563dc"/>
<ellipse cx="47" cy="106" rx="10" ry="5" fill="#6553cc"/>
<ellipse cx="73" cy="106" rx="10" ry="5" fill="#6553cc"/>
<path d="${body}" fill="${small ? '#9787f5' : `url(#${u}g)`}"/>
<g clip-path="url(#${u}c)">
  <ellipse cx="60" cy="100" rx="${small ? 25 : 23}" ry="${small ? 17 : 15}" fill="#ffcfb4"/>
  ${small ? '' : `<rect x="0" y="0" width="120" height="120" filter="url(#${u}n)" fill="#fff"/>`}
</g>
<ellipse cx="47" cy="63" rx="${small ? 10 : 8.5}" ry="${small ? 11 : 9.5}" fill="#fff"/>
<ellipse cx="73" cy="63" rx="${small ? 10 : 8.5}" ry="${small ? 11 : 9.5}" fill="#fff"/>
<circle cx="48.5" cy="65" r="${small ? 6 : 5}" fill="${ink}"/>
<circle cx="74.5" cy="65" r="${small ? 6 : 5}" fill="${ink}"/>
${small ? '' : '<circle cx="50.5" cy="62.6" r="1.8" fill="#fff"/><circle cx="76.5" cy="62.6" r="1.8" fill="#fff"/>'}
<path d="M39 ${small ? 47 : 49} Q46 ${small ? 42 : 45} 53 ${small ? 46 : 48}" stroke="#3a2b72" stroke-width="${small ? 5 : 3.6}" stroke-linecap="round" fill="none"/>
<path d="M67 ${small ? 46 : 48} Q74 ${small ? 42 : 45} 81 ${small ? 47 : 49}" stroke="#3a2b72" stroke-width="${small ? 5 : 3.6}" stroke-linecap="round" fill="none"/>
<path d="M53 79 Q60 ${small ? 89 : 87} 67 79 Z" fill="#3a1f4f" stroke="#3a1f4f" stroke-width="2" stroke-linejoin="round"/>
${small ? '' : '<path d="M56.5 83.5 Q60 81 63.5 83.5 Q60 86 56.5 83.5 Z" fill="#ff8fa3"/>'}`
  },
}

/* ---------------- 6. Clay: a soft 3D bear cub holding the edge ---------------- */
const clay = {
  id: 'clay',
  name: 'Mallow',
  style: 'Soft 3D, like modern emoji',
  idea: 'A bear cub head with two paws holding the bottom edge, as if peeking over it. Shaded like a clay toy.',
  basedOn: "Microsoft's Fluent 3D emoji and Apple Genmoji: soft gradients that still read at emoji size. Also what Copilot's Mico looks like.",
  bbox: [12, 10, 108, 112],
  notes: {
    good: ['Instantly likable and reads well at real size.', 'Paws holding the edge suit a character that peeks out from the side of the screen.'],
    bad: ['A teddy bear is the most generic subject here.', 'Soft 3D shading is the look of Mochi and Mico, and each new pose needs its own shading, which makes moods costly.'],
  },
  svg(v, u) {
    const small = v === 'small'
    return `
<defs>
  <radialGradient id="${u}f" cx=".36" cy=".28" r=".85"><stop offset="0" stop-color="#ffd9a3"/><stop offset=".55" stop-color="#f0aa5e"/><stop offset="1" stop-color="#c97a32"/></radialGradient>
  <radialGradient id="${u}m" cx=".45" cy=".3" r=".8"><stop offset="0" stop-color="#fff4e4"/><stop offset="1" stop-color="#f3cf9f"/></radialGradient>
  <radialGradient id="${u}p" cx=".4" cy=".3" r=".8"><stop offset="0" stop-color="#ffd9a3"/><stop offset="1" stop-color="#d98b42"/></radialGradient>
  <filter id="${u}b"><feGaussianBlur stdDeviation="2"/></filter>
</defs>
<circle cx="29" cy="30" r="14" fill="url(#${u}f)"/>
<circle cx="91" cy="30" r="14" fill="url(#${u}f)"/>
<circle cx="30" cy="31" r="7.5" fill="#d9894b"/>
<circle cx="90" cy="31" r="7.5" fill="#d9894b"/>
<circle cx="60" cy="62" r="42" fill="url(#${u}f)"/>
${small ? '' : `<ellipse cx="42" cy="36" rx="11" ry="5.5" transform="rotate(-28 42 36)" fill="#fff" opacity=".45" filter="url(#${u}b)"/>`}
<ellipse cx="60" cy="80" rx="${small ? 17 : 16}" ry="${small ? 12.5 : 12}" fill="url(#${u}m)"/>
<path d="M54.5 73.5 Q60 71 65.5 73.5 Q63 79 60 79 Q57 79 54.5 73.5 Z" fill="#4a281a"/>
${small ? '' : '<path d="M60 79 L60 82 M55 83 Q57.5 85.5 60 82 Q62.5 85.5 65 83" stroke="#4a281a" stroke-width="2" stroke-linecap="round" fill="none"/>'}
<ellipse cx="44" cy="63" rx="${small ? 6.4 : 5.2}" ry="${small ? 8 : 6.6}" fill="#2c1810"/>
<ellipse cx="76" cy="63" rx="${small ? 6.4 : 5.2}" ry="${small ? 8 : 6.6}" fill="#2c1810"/>
<circle cx="${small ? 45.6 : 45.4}" cy="${small ? 59.8 : 60.4}" r="${small ? 2.2 : 1.9}" fill="#fff"/>
<circle cx="${small ? 77.6 : 77.4}" cy="${small ? 59.8 : 60.4}" r="${small ? 2.2 : 1.9}" fill="#fff"/>
<ellipse cx="33" cy="77" rx="7" ry="4.2" fill="#ff8a76" opacity=".5"/>
<ellipse cx="87" cy="77" rx="7" ry="4.2" fill="#ff8a76" opacity=".5"/>
<ellipse cx="42" cy="104" rx="13" ry="9" fill="url(#${u}p)"/>
<ellipse cx="78" cy="104" rx="13" ry="9" fill="url(#${u}p)"/>
${small ? '' : '<path d="M37 101 v4 M42 100 v5 M47 101 v4 M73 101 v4 M78 100 v5 M83 101 v4" stroke="#b56a2c" stroke-width="1.6" stroke-linecap="round"/>'}`
  },
}

/* ---------------- 7. My pick: the penguin steward in the bold style ---------------- */
const pick = {
  id: 'pick',
  name: 'Penn',
  style: 'Mix: Pip as a subject, Hop as a style',
  pick: true,
  idea: 'The penguin steward drawn with the bold rules: big dark eyes on a white face, a tuxedo body, a red bow tie and a tuft. The theme of Pip with the readability of Hop.',
  basedOn: 'Everything above: one egg shape, eyes set low and wide on a high-contrast face, one signature tuft, flat color with one shade.',
  bbox: [12, 12, 108, 114],
  notes: {
    good: ['The steward idea reads at a glance: tuxedo and bow tie, no explaining.', 'Dark eyes on a white face are the highest contrast face here, so it survives 50×44 best after Glow and Hop.'],
    bad: ["Penguin mascots exist (Linux's Tux, Pingu, Tencent's QQ penguin with its red scarf). The blue body and bow tie keep it apart, but it is not a new idea.", 'Blue is a choice, not a fact: real penguins are black, and black would vanish on the dark tab.'],
  },
  svg(v, u) {
    const small = v === 'small'
    const body = 'M60 22 C85 22 100 44 100 70 C100 95 84 108 60 108 C36 108 20 95 20 70 C20 44 35 22 60 22 Z'
    const c = { body: '#5f7ff2', shade: '#4663d8', white: '#fdfbf6', beak: '#ffab3d', tie: '#f0506a', knot: '#c22f4b' }
    const ex = small ? 7.6 : 6.4, ey = small ? 9.6 : 8
    return `
<defs><clipPath id="${u}c"><path d="${body}"/></clipPath></defs>
<ellipse cx="46" cy="107" rx="10" ry="5" fill="${c.beak}"/>
<ellipse cx="74" cy="107" rx="10" ry="5" fill="${c.beak}"/>
<ellipse cx="21" cy="78" rx="7" ry="15" transform="rotate(18 21 78)" fill="${c.shade}"/>
<ellipse cx="99" cy="78" rx="7" ry="15" transform="rotate(-18 99 78)" fill="${c.shade}"/>
<path d="M57 24 C54 15 61 10 67 13 C62 14 61 18 63 23 Z" fill="${c.body}"/>
<path d="${body}" fill="${c.shade}"/>
<g clip-path="url(#${u}c)">
  <path d="${body}" transform="translate(-5 -4)" fill="${c.body}"/>
  <circle cx="46" cy="56" r="19" fill="${c.white}"/><circle cx="74" cy="56" r="19" fill="${c.white}"/>
  <ellipse cx="60" cy="68" rx="30" ry="16" fill="${c.white}"/>
  <ellipse cx="60" cy="106" rx="22" ry="15" fill="${c.white}"/>
</g>
<ellipse cx="47" cy="60" rx="${ex}" ry="${ey}" fill="${ink}"/>
<ellipse cx="73" cy="60" rx="${ex}" ry="${ey}" fill="${ink}"/>
<circle cx="${small ? 49.4 : 49}" cy="${small ? 56.4 : 57}" r="${small ? 2.6 : 2.2}" fill="#fff"/>
<circle cx="${small ? 75.4 : 75}" cy="${small ? 56.4 : 57}" r="${small ? 2.6 : 2.2}" fill="#fff"/>
<path d="M${small ? 52 : 53} 71 Q60 ${small ? 66 : 67} ${small ? 68 : 67} 71 Q${small ? 64 : 63} ${small ? 79 : 77} 60 ${small ? 79 : 77} Q${small ? 56 : 57} ${small ? 79 : 77} ${small ? 52 : 53} 71 Z" fill="${c.beak}"/>
${small ? '' : `<ellipse cx="35" cy="72" rx="5.5" ry="3.4" fill="#ff8fb3" opacity=".7"/><ellipse cx="85" cy="72" rx="5.5" ry="3.4" fill="#ff8fb3" opacity=".7"/>`}
<path d="M60 89 L${small ? 47 : 49} ${small ? 82 : 83} L${small ? 47 : 49} ${small ? 96 : 95} Z M60 89 L${small ? 73 : 71} ${small ? 82 : 83} L${small ? 73 : 71} ${small ? 96 : 95} Z" fill="${c.tie}" stroke="${c.tie}" stroke-width="3" stroke-linejoin="round"/>
<circle cx="60" cy="89" r="${small ? 4 : 3.4}" fill="${c.knot}"/>`
  },
}

/* ---------------- Today: the face the app draws now (eyes, brows, mouth in lilac light) ---------------- */
// A still copy of src/renderer/src/face-drawing.ts in its idle pose, for comparison only.
const today = {
  id: 'today',
  name: 'Today',
  style: 'What the app draws now',
  idea: 'Glowing lilac eyes, brows and mouth with no body.',
  basedOn: 'src/renderer/src/face-drawing.ts, idle pose.',
  bbox: [10, 16, 110, 100],
  svg(v, u) {
    // face-drawing.ts works in a 300 x 230 space; map it into the 120 box.
    const k = 0.4, cx = 60, cy = 0.44 * 230 * k + 10
    const e = (s) => cx + s * 58 * k
    return `
<defs><filter id="${u}gl" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="${16 * k / 2}"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
<g filter="url(#${u}gl)" fill="#c9bcff" stroke="#c9bcff" stroke-linecap="round">
  ${[-1, 1].map((s) => `<rect x="${e(s) - 20 * k}" y="${cy - 31 * k}" width="${40 * k}" height="${62 * k}" rx="${20 * k}" stroke="none"/>
  <line x1="${e(s) + s * 22 * k}" y1="${cy - 60 * k}" x2="${e(s) - s * 22 * k}" y2="${cy - 60 * k}" stroke-width="${8 * k}"/>`).join('')}
  <path d="M${cx - 26 * k} ${cy + 72 * k} Q${cx} ${cy + 102 * k} ${cx + 26 * k} ${cy + 72 * k}" stroke-width="${9 * k}" fill="none"/>
</g>`
  },
}

export const LOOKS = [glow, pixel, bold, soft, crafted, clay, pick]
export const TODAY = today
