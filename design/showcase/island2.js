// The Island, directions D to H: five more ways to put Steward in the notch, each with the same eight states as A to C
// (island.js). Halo, Peek, Drip, One-sided and Shelf. Like A to C they only move transforms, opacity and clip paths,
// with a spring loop; Drip also puts a goo filter over its black shapes. Reduced Motion fades instead of moving.
// The notch has no pixels: nothing here is drawn inside the 185 x 32 notch, and each direction says what it covers.
import { setMood } from '../pill/eyes.js'
import { palette } from '../pill/render.js'
import { blob, NOTCH, MENU, CX, SIZE } from '../notch/notch.js'
import { stage } from './state.js'
import { LIP, BODY_TOP, HW, R, px, clamp, div, Spring, soft, MOODS, CT, SIZES, makeLoop, makeEyes, makeContents, makePanel, placePanel } from './island-kit.js'

export const NEW_DIRS = [
  { id: 'D', name: 'Halo', short: 'A thin lit ring hugs the notch. Its color and motion say what is going on. Eyes come out on a small lip only when there is news. A 3 pt strip beside the notch is all it touches.', covers: 'A 3 pt strip' },
  { id: 'E', name: 'Peek', short: 'Steward hides behind the notch and only peeks out: a small head, eyes half showing. It leans out further for news and hangs a sign for an approval. Nothing is covered.', covers: 'Nothing' },
  { id: 'F', name: 'Drip', short: 'Liquid black. A drop forms under the notch, swells into a capsule or a card, splits in two for two projects and drips back up. Drawn with an SVG goo filter. Nothing is covered.', covers: 'Nothing' },
  { id: 'G', name: 'One-sided', short: 'Only the right of the notch grows, like the phone\'s compact leading view: eyes and a few words in the menu bar band. The left stays clear. It covers the right-hand menu extras while out.', covers: 'Right side, 40 to 240 pt' },
  { id: 'H', name: 'Shelf', short: 'Rests as the chin. Resting the cursor drops a wide shelf with tabs for Projects, Tray and Reviews, like the Mac notch shelf apps. Approvals and reviews open it on their tab. Nothing is covered.', covers: 'Nothing' },
]

const GOO_ID = 'isl-goo'
function ensureGoo() {
  if (document.getElementById(GOO_ID)) return
  const d = document.createElement('div')
  d.innerHTML = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><filter id="${GOO_ID}" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur in="SourceGraphic" stdDeviation="6.5" result="b"/><feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10"/></filter></svg>`
  document.body.append(d.firstChild)
}

const ROWS = (a, b) => `<div class="shelf-rows"><div class="srow"><b>haven</b><span class="mut">${a}</span>${a.includes('Editing') ? '<span class="ic-dot"></span>' : ''}</div><div class="srow"><b>api</b><span class="mut">${b}</span>${b.includes('Running') ? '<span class="ic-dot"></span>' : ''}</div></div>`
const TABS = (on, n = 0) => `<div class="shelf-tabs">${['Projects', 'Tray', 'Reviews'].map((t) => `<span class="${t === on ? 'on' : ''}">${t}${t === 'Reviews' && n ? `<i>${n}</i>` : ''}</span>`).join('')}${on === 'Now' ? '<span class="on">Now</span>' : ''}</div>`
const SHELF = {
  hover: `<div class="shelf">${TABS('Projects')}${ROWS('idle', 'idle')}</div>`,
  two: `<div class="shelf">${TABS('Projects')}${ROWS('Editing page.tsx', 'Running tests')}</div>`,
  needs: `<div class="shelf">${TABS('Now')}<div class="shelf-now"><b>haven needs you</b> <span class="mut">Run</span> <code>npm install</code> <span class="mut">in haven?</span><div class="acts"><span class="pillbtn pri">Allow</span><span class="pillbtn">Deny</span></div></div></div>`,
  review: `<div class="shelf">${TABS('Reviews', 1)}<div class="shelf-now rv"><span class="thumbs"><i class="tb"></i><i class="ta"></i></span><span class="say"><b>haven changed.</b> <b>Claude says:</b> I made the Start button blue and added a row of logos.<div class="acts"><span class="pillbtn pri">Open big</span><span class="pillbtn">Looks good</span></div></span></div></div>`,
}

/** The chin, a card that grows out of it under the menu bar line, and the curved joins between them (D and H, like A). */
function chinBody(ctx) {
  const { shape, loop } = ctx
  const neck = blob(shape, { w0: NOTCH.w, h0: LIP, rb: R, cls: 'neck' })
  const body = blob(shape, { w0: 340, h0: 46, rt: 14, rb: 16, top: BODY_TOP, cls: 'body' })
  const F = SIZE.fillet
  const fils = [-1, 1].map((s) => {
    const f = div(`fil ${s < 0 ? 'l' : 'r'}`, `left:${px(s < 0 ? -HW - F : HW)};top:${px(MENU)};width:${F}px;height:${F}px;background:radial-gradient(circle at ${s < 0 ? '0 0' : '100% 0'},transparent ${F - 0.5}px,#000 ${F}px)`)
    shape.append(f)
    return f
  })
  const P = { L: loop.add(new Spring(NOTCH.h)), bw: loop.add(new Spring(140)), bh: loop.add(new Spring(30)), by: loop.add(new Spring(-39)), fil: loop.add(new Spring(0, 220, 22)) }
  return {
    apply() {
      neck.size(NOTCH.w, Math.max(NOTCH.h, P.L.v))
      body.size(Math.max(140, P.bw.v), Math.max(30, P.bh.v))
      body.el.style.transform = `translateY(${px(P.by.v)})`
      const f = clamp(P.fil.v, 0, 1.15)
      for (const el of fils) { el.style.opacity = String(clamp(f, 0, 1)); el.style.transform = `scale(${Math.max(0.2, f)})` }
    },
    aim(p, snap) {
      const set = (s, v) => (snap ? s.snap(v) : s.set(v))
      set(P.L, p.L)
      set(P.bw, p.body ? p.body.w : 140); set(P.bh, p.body ? p.body.h : 30)
      set(P.by, p.body ? 0 : -(BODY_TOP + 30 - p.L)); set(P.fil, p.body ? 1 : 0)
    },
  }
}

/* ================= D: Halo ================= */
function halo(ctx) {
  const { shape, root } = ctx
  const cb = chinBody(ctx)
  // One ring hugs the notch alone, a taller one hugs the notch with its lip: the two crossfade as the lip comes and goes.
  const mkRing = (h) => {
    const box = `left:${px(-HW - 3)};top:-6px;width:${NOTCH.w + 6}px;height:${h + 9}px`
    const glow = div('hl-glow', box)
    const ring = div('hl-ring', box)
    ring.append(div('hl-spin'))
    root.insertBefore(glow, shape)
    root.insertBefore(ring, shape)
    const lit = root.style.getPropertyValue('--lit')
    for (const el of [glow, ring]) el.style.setProperty('--c', lit)
    return [glow, ring]
  }
  const short = mkRing(NOTCH.h), tall = mkRing(LIP)
  return {
    apply: cb.apply,
    plan(st) {
      const p = { L: NOTCH.h, body: null, eyes: {}, contents: [], ring: 'rest', panel: false }
      const eyeChin = (s = 1) => (p.eyes.main = { x: 0, y: NOTCH.h + 11, s })
      switch (st) {
        case 'rest': break
        case 'hover': p.L = LIP; eyeChin(1.1); p.ring = 'hover'; break
        case 'working': p.L = LIP; eyeChin(); p.ring = 'working'; break
        case 'finished': p.L = LIP; eyeChin(); p.ring = 'done'; break
        case 'needs': case 'review': {
          const [w, h] = SIZES[st]
          p.L = LIP; p.body = { w, h }; p.ring = st
          p.eyes.main = { x: -w / 2 + 28, y: BODY_TOP + 28 }
          p.contents.push({ id: st, html: CT[st], x: -w / 2, y: BODY_TOP, w, h, eyes: true })
          break
        }
        case 'two': p.L = LIP; eyeChin(); p.ring = 'two'; break
        case 'quiet': p.ring = 'off'; break
        case 'open': p.L = LIP; p.panel = true; p.ring = 'off'; if (ctx.moved()) eyeChin(); else { p.body = { w: 400, h: 470 }; p.eyes.main = { x: -146, y: BODY_TOP + 39, o: 0 } } break
      }
      return p
    },
    aim(p, st, snap) {
      cb.aim(p, snap)
      const awake = p.L > NOTCH.h + 1
      short.forEach((el) => (el.dataset.k = awake ? 'off' : p.ring))
      tall.forEach((el) => (el.dataset.k = awake ? p.ring : 'off'))
    },
  }
}

/* ================= E: Peek ================= */
function peek(ctx) {
  const { shape, root, loop, g, g2 } = ctx
  const mkHead = (grp, name) => {
    const wrap = div('pk-head')
    const sw = div('pk-sway')
    wrap.append(sw)
    shape.append(wrap)
    const b = blob(sw, { w0: 76, h0: 80, rb: 18, cls: 'pkb' })
    const h = { wrap, sw, b, x: loop.add(new Spring(0)), w: loop.add(new Spring(76)), bot: loop.add(new Spring(NOTCH.h)), tilt: loop.add(new Spring(0, 120, 10)), on: false }
    h.e = ctx.ey.mk(name, grp, {
      parent: sw,
      clipFn: (e) => {
        const s = Math.max(0.01, e.s.v), hw = h.w.v / 2 - 4
        const top = (NOTCH.h - e.y.v) / s, bot = (h.bot.v - 3 - e.y.v) / s
        return `polygon(${px((-hw - e.x.v) / s)} ${px(top)},${px((hw - e.x.v) / s)} ${px(top)},${px((hw - e.x.v) / s)} ${px(bot)},${px((-hw - e.x.v) / s)} ${px(bot)})`
      },
    })
    return h
  }
  const heads = [mkHead(g, 'h0'), mkHead(g2, 'h1')]
  // the tag beside the head, and the sign that hangs from it
  const tagWrap = div('pk-tag'); shape.append(tagWrap)
  const tag = blob(tagWrap, { w0: 200, h0: 26, rt: 13, rb: 13, cls: 'pkt' })
  const T = { x: loop.add(new Spring(60)), w: loop.add(new Spring(60)), s: loop.add(new Spring(0.3, 220, 20)) }
  const signWrap = div('pk-sign'); shape.append(signWrap)
  const sign = blob(signWrap, { w0: 352, h0: 156, rt: 14, rb: 16, cls: 'pks' })
  const signCt = div('isl-ct')
  signWrap.append(signCt)
  const Sg = { top: loop.add(new Spring(40)), w: loop.add(new Spring(120)), h: loop.add(new Spring(40)), swing: loop.add(new Spring(0, 90, 7)), s: loop.add(new Spring(0.3, 220, 20)) }
  return {
    apply() {
      heads.forEach((h) => {
        h.wrap.style.transform = `translate(${px(h.x.v)},0) rotate(${+h.tilt.v.toFixed(2)}deg)`
        h.b.size(Math.max(40, h.w.v), Math.max(NOTCH.h, h.bot.v))
        h.wrap.style.visibility = h.bot.v <= NOTCH.h + 0.5 && !h.on ? 'hidden' : ''
      })
      const a = clamp((T.s.v - 0.3) / 0.7, 0, 1)
      tagWrap.style.opacity = String(a)
      tagWrap.style.transform = `translate(${px(T.x.v)},${px(BODY_TOP)}) scale(${Math.max(0.01, T.s.v)})`
      tag.size(Math.max(34, T.w.v), 34)
      const sa = clamp((Sg.s.v - 0.3) / 0.7, 0, 1)
      signWrap.style.opacity = String(sa)
      signWrap.style.visibility = sa < 0.01 ? 'hidden' : ''
      signWrap.style.transform = `translate(0,${px(Sg.top.v)}) rotate(${+Sg.swing.v.toFixed(2)}deg) scale(${Math.max(0.01, Sg.s.v)})`
      sign.size(Math.max(120, Sg.w.v), Math.max(60, Sg.h.v))
    },
    plan(st) {
      const p = { heads: [null, null], tag: null, sign: null, eyes: {}, contents: [], panel: false }
      const head = (i, x, w, bot, ey, extra = {}) => { p.heads[i] = { x, w, bot, tilt: 0, ...extra }; p.eyes[`h${i}`] = { x: 0, y: ey, s: 1 } }
      switch (st) {
        case 'rest': head(0, 0, 76, 43, 36); break
        case 'hover': head(0, 0, 76, 54, 43); break
        case 'working': head(0, 0, 76, 58, 45, { sway: true }); p.tag = { x: 38 + 8 + 80, w: 160, html: '<div class="ic-row" style="justify-content:center"><b>haven</b> <span class="mut">Editing page.tsx</span></div>' }; break
        case 'finished': head(0, 0, 76, 64, 50); p.tag = { x: 38 + 8 + 100, w: 200, html: '<div class="ic-row" style="justify-content:center"><b>haven</b> <span class="mut">finished · 3 files</span></div>' }; break
        case 'needs': head(0, 0, 76, 62, 49, { tilt: 9 }); p.sign = { st, html: CT.needs, w: 340, h: 104 }; break
        case 'review': head(0, 0, 76, 62, 49); p.sign = { st, html: CT.review, w: 352, h: 156 }; break
        case 'two':
          head(0, -36, 56, 60, 46, { sway: true }); head(1, 36, 56, 48, 38, { sway: true })
          p.contents.push({ id: 'l0', html: '<div class="ic-row" style="justify-content:center"><b>haven</b></div>', x: -64, y: 64, w: 56, h: 18, eyes: false }, { id: 'l1', html: '<div class="ic-row" style="justify-content:center"><b>api</b></div>', x: 8, y: 52, w: 56, h: 18, eyes: false })
          break
        case 'quiet': break
        case 'open': head(0, 0, 76, 54, 43); p.panel = true; break
      }
      return p
    },
    aim(p, st, snap) {
      const set = (s, v) => (snap ? s.snap(v) : s.set(v))
      heads.forEach((h, i) => {
        const t = p.heads[i]
        if (t) {
          if (!h.on && !snap) { h.x.snap(t.x); h.w.snap(t.w) }
          h.on = true
          set(h.x, t.x); set(h.w, t.w); set(h.bot, t.bot); set(h.tilt, t.tilt)
          h.sw.classList.toggle('sway', !!t.sway)
        } else { h.on = false; set(h.bot, NOTCH.h); set(h.tilt, 0); h.sw.classList.remove('sway') }
      })
      if (p.tag) {
        const fresh = T.s.t < 0.9
        if (fresh) { T.x.snap(p.tag.x - 50); T.w.snap(40) }
        set(T.x, p.tag.x); set(T.w, p.tag.w); set(T.s, 1)
        ctx.ct.set([{ id: 'tag', html: p.tag.html, x: p.tag.x - p.tag.w / 2, y: BODY_TOP, w: p.tag.w, h: 34, eyes: false }])
      } else set(T.s, 0.3)
      if (p.sign) {
        const fresh = Sg.s.t < 0.9
        const top = p.heads[0].bot - 4
        if (fresh && !snap) { Sg.top.snap(top); Sg.w.snap(p.sign.w * 0.6); Sg.h.snap(40); Sg.swing.snap(-11) }
        set(Sg.top, top); set(Sg.w, p.sign.w); set(Sg.h, p.sign.h); set(Sg.s, 1)
        set(Sg.swing, 0)
        Object.assign(signCt.style, { left: px(-p.sign.w / 2), top: '0px', width: px(p.sign.w), height: px(p.sign.h) })
        signCt.className = 'isl-ct'
        signCt.innerHTML = p.sign.html
        clearTimeout(signCt._t)
        signCt.classList.remove('on')
        signCt._t = setTimeout(() => signCt.classList.add('on'), 90)
      } else { set(Sg.s, 0.3); signCt.classList.remove('on') }
      void root
    },
  }
}

/* ================= F: Drip ================= */
function drip(ctx) {
  const { shape, loop } = ctx
  ensureGoo()
  const goo = div('dp-goo')
  const inner = div('dp-in')
  goo.append(inner)
  shape.append(goo)
  inner.append(div('dp-src', `left:${px(-HW)};top:-14px;width:${NOTCH.w}px;height:50px`))
  const mkDrop = () => {
    const wrap = div('dp-drop')
    inner.append(wrap)
    const b = blob(wrap, { w0: 60, h0: 30, rt: 10, rb: 10, cls: 'dpb' })
    return { wrap, b, on: false, x: loop.add(new Spring(0)), y: loop.add(new Spring(-6)), w: loop.add(new Spring(22)), h: loop.add(new Spring(22)), s: loop.add(new Spring(0.2, 200, 18)) }
  }
  const drops = [mkDrop(), mkDrop(), mkDrop()]
  return {
    apply() {
      for (const d of drops) {
        const a = clamp((d.s.v - 0.2) / 0.5, 0, 1)
        d.wrap.style.opacity = String(a)
        d.wrap.style.visibility = a < 0.01 && !d.on ? 'hidden' : ''
        d.wrap.style.transform = `translate(${px(d.x.v)},${px(d.y.v)})`
        d.b.size(Math.max(21, d.w.v * Math.min(1, d.s.v)), Math.max(21, d.h.v * Math.min(1, d.s.v)))
      }
    },
    plan(st) {
      const p = { drops: [], eyes: {}, contents: [], panel: false, fall: false }
      const bulb = (x, top, w, h) => p.drops.push({ x, top, w, h, from: { x: 0, top: -4, w: 24, h: 22 } })
      switch (st) {
        case 'rest': bulb(0, 26, 56, 30); p.eyes.main = { x: 0, y: 43 }; break
        case 'hover': bulb(0, 26, 62, 42); p.eyes.main = { x: 0, y: 46, s: 1.1 }; break
        case 'working': bulb(0, 41, 270, 34); p.eyes.main = { x: -110, y: 58 }; p.contents.push({ id: 'row', html: CT.working, x: -135, y: 41, w: 270, h: 34, eyes: true }); break
        case 'finished': bulb(0, 41, 270, 34); p.eyes.main = { x: -110, y: 58 }; p.contents.push({ id: 'row', html: CT.done, x: -135, y: 41, w: 270, h: 34, eyes: true }); p.fall = true; break
        case 'needs': case 'review': { const [w, h] = SIZES[st]; bulb(0, 41, w, h); p.eyes.main = { x: -w / 2 + 28, y: 41 + 28 }; p.contents.push({ id: st, html: CT[st], x: -w / 2, y: 41, w, h, eyes: true }); break }
        case 'two':
          bulb(0, 41, 250, 34)
          p.drops.push({ x: 158, top: 41, w: 34, h: 34, from: { x: 108, top: 41, w: 22, h: 30 } })
          p.eyes.main = { x: -100, y: 58 }; p.eyes.b2 = { x: 158, y: 58 }
          p.contents.push({ id: 'row', html: CT.working, x: -125, y: 41, w: 250, h: 34, eyes: true })
          break
        case 'quiet': break
        case 'open': p.panel = true; if (ctx.moved()) { bulb(0, 26, 56, 30); p.eyes.main = { x: 0, y: 43 } } else { bulb(0, 41, 400, 470); p.eyes.main = { x: -146, y: 80, o: 0 } } break
      }
      return p
    },
    aim(p, st, snap) {
      const set = (s, v) => (snap ? s.snap(v) : s.set(v))
      drops.forEach((d, i) => {
        const t = p.drops[i]
        if (t) {
          if (!d.on || snap) { const f = t.from; d.x.snap(f.x); d.y.snap(f.top); d.w.snap(f.w); d.h.snap(f.h); d.s.snap(0.7) }
          d.on = true
          set(d.x, t.x); set(d.y, t.top); set(d.w, t.w); set(d.h, t.h); set(d.s, 1)
          if (snap) { d.x.snap(t.x); d.y.snap(t.top); d.w.snap(t.w); d.h.snap(t.h); d.s.snap(1) }
        } else if (d.on && i < 2) {
          // dripping back up: it shrinks into the notch above it
          d.on = false
          set(d.y, -6); set(d.x, d.x.v * 0.2); set(d.w, 24); set(d.h, 22); set(d.s, 0.2)
        }
      })
      // finished: a little droplet falls off the capsule and goes
      const dr = drops[2]
      if (p.fall && !snap) {
        dr.on = true
        dr.x.snap(-90); dr.y.snap(72); dr.w.snap(14); dr.h.snap(14); dr.s.snap(1)
        dr.y.set(120); dr.s.set(0.2)
        setTimeout(() => { dr.on = false }, 700)
      } else if (!p.fall && dr.on) { dr.on = false; dr.s.set(0.2) }
    },
  }
}

const row2 = (a, b) => `<div class="ic-row"><span><b>${a}</b> <span class="mut">${b}</span></span></div>`

/* ================= G: One-sided ================= */
function oneSided(ctx) {
  const { shape, loop } = ctx
  const wrap = div('os-wing'); shape.append(wrap)
  const wing = blob(wrap, { w0: NOTCH.w + 40, h0: NOTCH.h, rb: R, cls: 'wing' })
  const W = loop.add(new Spring(0))
  const cardWrap = div('os-card'); shape.append(cardWrap)
  const card = blob(cardWrap, { w0: 320, h0: 120, rb: 16, cls: 'oscard' })
  const C = { x: loop.add(new Spring(100)), w: loop.add(new Spring(120)), h: loop.add(new Spring(40)), s: loop.add(new Spring(0.3, 220, 20)) }
  const pillWrap = div('os-pill'); shape.append(pillWrap)
  const pill = blob(pillWrap, { w0: 140, h0: NOTCH.h, rt: 14, rb: 14, cls: 'ospill' })
  const Q = { x: loop.add(new Spring(0)), y: loop.add(new Spring(0)), w: loop.add(new Spring(40)), s: loop.add(new Spring(0.3, 220, 20)) }
  return {
    apply() {
      wrap.style.transform = `translateX(${px(W.v / 2)})`
      wing.size(NOTCH.w + Math.max(0, W.v), NOTCH.h)
      const ca = clamp((C.s.v - 0.3) / 0.7, 0, 1)
      cardWrap.style.opacity = String(ca)
      cardWrap.style.visibility = ca < 0.01 ? 'hidden' : ''
      cardWrap.style.transform = `translate(${px(C.x.v)},${px(NOTCH.h - 2)})`
      card.size(Math.max(120, C.w.v * Math.min(1, C.s.v)), Math.max(48, C.h.v * Math.min(1, C.s.v)))
      const qa = clamp((Q.s.v - 0.3) / 0.7, 0, 1)
      pillWrap.style.opacity = String(qa)
      pillWrap.style.visibility = qa < 0.01 ? 'hidden' : ''
      pillWrap.style.transform = `translate(${px(Q.x.v)},${px(Q.y.v)})`
      pill.size(Math.max(40, Q.w.v), NOTCH.h)
    },
    plan(st) {
      const p = { W: 0, eyes: {}, contents: [], card: null, pill: null, panel: false }
      const eye = (s = 1) => (p.eyes.main = { x: HW + 26, y: NOTCH.h / 2, s })
      const row = (w, html) => p.contents.push({ id: 'row', html, x: HW, y: 0, w, h: NOTCH.h, eyes: true })
      // a card that hangs from the wing and the notch, its right edge under the wing's end
      const hang = (w, html) => {
        const right = HW + w, cw = 330
        p.card = { x: right - cw / 2, w: cw, h: 128 }
        p.contents.push({ id: 'card', html, x: right - cw, y: NOTCH.h + 4, w: cw, h: 124, eyes: false })
      }
      const NEEDS = `<div class="col"><div class="head"><b>haven needs you</b></div><div class="row2"><span class="mut">Run</span><code>npm install</code><span class="mut">in haven?</span></div><div class="acts"><span class="pillbtn pri">Allow</span><span class="pillbtn">Deny</span></div></div>`
      const REV = CT.review.replace('<div class="head"><b>haven changed</b><span class="mut">localhost:3000/pricing</span></div>', '')
      switch (st) {
        case 'rest': p.W = 40; p.eyes.main = { x: HW + 20, y: NOTCH.h / 2 }; break
        case 'hover': p.W = 52; p.eyes.main = { x: HW + 26, y: NOTCH.h / 2, s: 1.1 }; break
        case 'working': p.W = 150; eye(); row(150, row2('haven', 'editing')); break
        case 'finished': p.W = 150; eye(); row(150, row2('haven', 'done · 3 files')); break
        case 'needs': p.W = 150; eye(); row(150, row2('Needs', 'you')); hang(150, NEEDS); break
        case 'review': p.W = 150; eye(); row(150, row2('haven', 'changed')); hang(150, REV); break
        case 'two':
          p.W = 150; eye(); row(150, row2('haven', 'editing'))
          p.pill = { x: HW + 150 - 50, w: 100, top: BODY_TOP }
          p.contents.push({ id: 'pill', html: row2('api', 'tests'), x: HW + 150 - 100, y: BODY_TOP, w: 100, h: NOTCH.h, eyes: false })
          break
        case 'quiet': break
        case 'open': p.W = 40; p.eyes.main = { x: HW + 20, y: NOTCH.h / 2 }; p.panel = true; break
      }
      return p
    },
    aim(p, st, snap) {
      const set = (s, v) => (snap ? s.snap(v) : s.set(v))
      set(W, p.W)
      if (p.card) {
        if (C.s.t < 0.9 || snap) { C.x.snap(p.card.x); C.w.snap(p.card.w * 0.7); C.h.snap(48) }
        set(C.x, p.card.x); set(C.w, p.card.w); set(C.h, p.card.h); set(C.s, 1)
      } else set(C.s, 0.3)
      if (p.pill) {
        if (Q.s.t < 0.9 || snap) { Q.x.snap(HW + 100); Q.y.snap(0); Q.w.snap(40) }
        set(Q.x, p.pill.x); set(Q.y, p.pill.top); set(Q.w, p.pill.w); set(Q.s, 1)
      } else set(Q.s, 0.3)
    },
  }
}

/* ================= H: Shelf ================= */
function shelf(ctx) {
  const cb = chinBody(ctx)
  return {
    apply: cb.apply,
    plan(st) {
      const p = { L: NOTCH.h, body: null, eyes: {}, contents: [], panel: false }
      const chin = (s = 1) => { p.L = LIP; p.eyes.main = { x: 0, y: NOTCH.h + 11, s } }
      const capsule = (html) => { p.L = LIP; p.body = { w: 270, h: 34 }; p.eyes.main = { x: -110, y: BODY_TOP + 17 }; p.contents.push({ id: 'row', html, x: -135, y: BODY_TOP, w: 270, h: 34, eyes: true }) }
      const shelfAt = (key, h) => {
        p.L = LIP; p.body = { w: 460, h }
        p.eyes.main = { x: -230 + 28, y: BODY_TOP + 21 }
        p.contents.push({ id: key, html: SHELF[key], x: -230, y: BODY_TOP, w: 460, h, eyes: true })
      }
      switch (st) {
        case 'rest': chin(); break
        case 'hover': shelfAt('hover', 124); break
        case 'working': capsule(CT.working); break
        case 'finished': capsule(CT.done); break
        case 'needs': shelfAt('needs', 138); break
        case 'review': shelfAt('review', 150); break
        case 'two': shelfAt('two', 124); break
        case 'quiet': break
        case 'open': p.L = LIP; p.panel = true; if (ctx.moved()) chin(); else { p.body = { w: 400, h: 470 }; p.eyes.main = { x: -146, y: BODY_TOP + 39, o: 0 } } break
      }
      return p
    },
    aim(p, st, snap) { cb.aim(p, snap) },
  }
}

const ENGINES = { D: halo, E: peek, F: drip, G: oneSided, H: shelf }

export function createIsland2(screen, o) {
  const { dir, kind, color, rm = () => false } = o
  const lit = palette(kind, { color, lit: true }).lit
  const root = div('isl', `left:${px(CX)};--lit:${[1, 3, 5].map((i) => parseInt(lit.slice(i, i + 2), 16)).join(',')}`)
  const shape = div('isl-shape')
  root.append(shape)
  const g = stage.group({ seed: o.seed ?? 1, anchor: o.anchor ?? screen, mood: 'resting', think: o.think ?? 'dots', mouth: o.mouth ?? true, owner: o.owner })
  const g2 = stage.group({ seed: (o.seed ?? 1) + 9, anchor: o.anchor ?? screen, mood: 'thinking', glint: 'sweep', think: 'dots', mouth: true, owner: o.owner })
  let state = null, moved = !!o.moved
  let eng = null
  const loop = makeLoop(root, () => { ey.apply(); eng?.apply() })
  const ey = makeEyes({ root, kind, color, mouth: o.mouth ?? true }, loop.add)
  const ct = makeContents(root, rm, () => state)
  const ctx = { root, shape, loop, g, g2, ey, ct, moved: () => moved }
  // eyes the engine wants are made first (Peek makes its own inside the heads); the common ones after
  eng = ENGINES[dir](ctx)
  if (dir !== 'E') ey.mk('main', g)
  if (['D', 'F', 'G', 'H'].includes(dir)) ey.mk('b2', g2, { E: 9 })
  let panelBits = null
  if (o.panel) panelBits = makePanel({ root, kind, color, mouth: o.mouth ?? true, dark: o.dark }, g)

  function aim(p, st, snap) {
    eng.aim(p, st, snap)
    ey.aim(p.eyes ?? {}, snap)
    if (dir !== 'E') ct.set(p.contents ?? [])
    else if (p.contents?.length && !p.tag) ct.set(p.contents)
    else if (!p.tag) ct.set([])
    if (panelBits) placePanel(panelBits.panel, moved, !!p.panel)
    root.dataset.st = st
    loop.kick()
  }
  function go(st, { first = false } = {}) {
    state = st
    const [mood, glint] = MOODS[st] ?? MOODS.rest
    setMood(g.st, mood, glint)
    const p = eng.plan(st)
    if (st === 'open' && moved) { /* the island only acknowledges: a small squash */
      root.classList.add('squash'); setTimeout(() => root.classList.remove('squash'), 200)
    }
    if (rm() && !first) {
      root.classList.add('rm-out')
      clearTimeout(go.t)
      go.t = setTimeout(() => { aim(eng.plan(state), state, true); eng.apply(); ey.apply(); void root.offsetWidth; root.classList.remove('rm-out') }, 130)
      return
    }
    aim(p, st, first)
    if (first) { eng.apply(); ey.apply() }
  }
  screen.append(root)
  go(o.state ?? 'rest', { first: true })
  return {
    root, group: g, go,
    get state() { return state },
    setMoved(v) { moved = v },
    remove() { clearTimeout(go.t); ct.clear(); loop.stop(); root.remove() },
  }
}
