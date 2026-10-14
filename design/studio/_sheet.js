// TEMPORARY verification harness (not committed): renders contact sheets of characters into one canvas.
import * as E from './engine.js'

export async function sheet(cfg) {
  const studio = window.__studio
  const W = cfg.w || 220, H = cfg.h || 190, LBL = 16
  const cells = cfg.cells, cols = cfg.cols || cells.length, rows = Math.ceil(cells.length / cols)
  let out = document.getElementById('__sheet')
  if (!out) { out = document.createElement('canvas'); out.id = '__sheet'; out.style.cssText = 'display:block;margin:12px auto;background:#fff'; document.body.prepend(out) }
  out.width = cols * W; out.height = rows * (H + LBL); out.style.width = out.width + 'px'
  const g = out.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, out.width, out.height)
  const tmp = document.createElement('canvas'); document.body.append(tmp)
  const tctx = tmp.getContext('2d')
  const defs = {}
  let i = 0
  for (const c of cells) {
    const id = c.id || cfg.id
    defs[id] ??= (await import(`./characters/${id}.js?v=${Date.now()}`)).default
    const dark = !!(c.dark ?? cfg.dark)
    const tn = E.tint(c.body || cfg.body || 'ice')
    const look = { tint: tn, frost: (c.frost ?? cfg.frost ?? 55) / 100, dark, eyes: c.eyes || cfg.eyes || 'pills', hat: c.hat || cfg.hat || 'none', glasses: c.glasses || cfg.glasses || 'none', size: c.size || cfg.size || 'big', rm: !!(c.rm ?? cfg.rm), eye: E.eyeFor(tn, c.eye || cfg.eye || 'auto'), accent: E.accentFor(tn, c.accent || cfg.accent || 'auto'), accentArms: !!(c.arms ?? cfg.arms), think: c.think || cfg.think || 'juggle' }
    const st = studio.stage(defs[id], look, look.size)
    const f = E.newFace(0.3)
    const T = c.t ?? cfg.t ?? 1.6, pers = c.pers || cfg.pers || 'calm'
    for (let t = 0; t <= T + 1e-6; t += 1 / 30) { E.step(f, c.mood || cfg.mood || 'idle', t, 1 / 30, { x: 0.2, y: 0.1 }, { pers, rm: look.rm }); st.inst.update(f, look) }
    const cw = c.cw || cfg.cw || W, ch = c.ch || cfg.ch || H
    tmp.style.cssText = `position:fixed;left:-9999px;width:${cw}px;height:${ch}px`
    studio.render(st, tctx, cw, ch, dark)
    const x = (i % cols) * W, y = Math.floor(i / cols) * (H + LBL)
    g.fillStyle = dark ? '#171a22' : '#eef1f7'; g.fillRect(x + 1, y + 1, W - 2, H - 2)
    g.drawImage(tmp, 0, 0, tmp.width, tmp.height, x + (W - cw) / 2, y + (H - ch) / 2, cw, ch)
    g.fillStyle = '#333'; g.font = '600 11px system-ui'; g.fillText(c.label || '', x + 4, y + H + 12)
    st.inst.dispose(); i++
  }
  tmp.remove()
  document.querySelector('.bar').style.position = 'static'
  out.scrollIntoView({ block: 'start' })
  return { w: out.width, h: out.height, errors: window.__errors }
}
export const MOODS = E.MOODS.map((m) => m[0])
