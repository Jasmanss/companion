// The black of Steward in the notch is made of pieces (a band, a bottom strip and two corner circles) that slide and
// scale, so it changes shape with transform alone and its corners never squash. Black on black, the overlaps don't
// show. Used by the Chin and Wings looks (Notch.tsx) and the island (notch-island.ts).

export const div = (cls: string, css = ''): HTMLDivElement => {
  const d = document.createElement('div')
  d.className = cls
  if (css) d.style.cssText = css
  return d
}
export const px = (v: number) => `${+v.toFixed(2)}px`

/**
 * A black rounded box made of pieces, anchored at its top center: a band, a bottom strip and two corner circles.
 * size(w, h) slides and scales them together, so it grows without its corners squashing.
 */
export function blob(parent: HTMLElement, w0: number, h0: number, rb: number): { size(w: number, h: number): void } {
  const el = div('blob')
  const parts: [HTMLElement, (w: number, h: number) => string][] = []
  const add = (css: string, origin: string, fn: (w: number, h: number) => string) => {
    const p = div('bp', `${css};transform-origin:${origin}`)
    el.append(p)
    parts.push([p, fn])
  }
  const hm0 = h0 - rb + 0.5
  add(`left:${px(-w0 / 2)};top:0;width:${px(w0)};height:${px(hm0)}`, '50% 0', (w, h) => `scale(${w / w0},${Math.max(0.001, (h - rb + 0.5) / hm0)})`)
  add(`left:${px(-(w0 / 2 - rb))};top:${px(h0 - rb - 0.5)};width:${px(w0 - 2 * rb)};height:${px(rb + 0.5)}`, '50% 0', (w, h) => `translateY(${px(h - h0)}) scaleX(${Math.max(0.001, (w - 2 * rb) / (w0 - 2 * rb))})`)
  for (const s of [-1, 1])
    add(`left:${px(s * (w0 / 2 - rb) - rb)};top:${px(h0 - 2 * rb)};width:${px(2 * rb)};height:${px(2 * rb)};border-radius:50%`, '50% 50%', (w, h) => `translate(${px((s * (w - w0)) / 2)},${px(h - h0)})`)
  parent.append(el)
  return { size: (w, h) => parts.forEach(([p, fn]) => (p.style.transform = fn(w, h))) }
}

