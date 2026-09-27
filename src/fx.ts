// Hover and appear effects as CSS. The canvas preview selects layers by data-fx, exported code by class.
import type { SNode } from './types'

const num = (v: number) => Math.round(v * 1000) / 1000

export function fxRules(nodes: SNode[], sel: (n: SNode) => string, col: (c: string) => string = (c) => c): string {
  const out: string[] = []
  for (const n of nodes) {
    const h = n.hover
    const a = n.appear
    if (!h && !a) continue
    const s = sel(n)
    const t = a?.duration ?? 0.6
    const d = a?.delay ?? 0
    // Individual scale and translate leave the layer's own rotation alone.
    const trans = [
      ...(h ? ['opacity .25s', 'scale .25s', 'translate .25s', 'background-color .25s', 'color .25s'] : []),
      ...(a ? [`opacity ${num(t)}s ${num(d)}s`, `scale ${num(t)}s ${num(d)}s`, `translate ${num(t)}s ${num(d)}s`] : []),
    ]
    out.push(`${s} { transition: ${[...new Set(trans)].join(', ')}; transition-timing-function: cubic-bezier(.2, .8, .2, 1); }`)
    if (h) {
      const r = [
        h.opacity !== undefined && `opacity: ${num(h.opacity)} !important;`,
        h.scale !== undefined && h.scale !== 1 && `scale: ${num(h.scale)};`,
        h.y && `translate: 0 ${num(h.y)}px;`,
        h.fill && `background-color: ${col(h.fill)} !important;`,
        h.color && `color: ${col(h.color)} !important;`,
      ].filter(Boolean)
      if (r.length) out.push(`${s}:hover { ${r.join(' ')} transition-delay: 0s; }`)
    }
    if (a) {
      const r = [
        `opacity: ${num(a.opacity ?? 0)} !important;`,
        a.y && `translate: 0 ${num(a.y)}px;`,
        a.scale !== undefined && a.scale !== 1 && `scale: ${num(a.scale)};`,
      ].filter(Boolean)
      out.push(`${s}[data-appear]:not(.in) { ${r.join(' ')} }`)
    }
  }
  return out.join('\n')
}

export const hasFx = (n: SNode) => !!(n.hover || n.appear)

// Marks layers with an appear effect as shown once they scroll into view.
export function watchAppear(root: ParentNode) {
  const els = [...root.querySelectorAll<HTMLElement>('[data-appear]:not(.in)')]
  if (!els.length || typeof IntersectionObserver === 'undefined') { els.forEach((e) => e.classList.add('in')); return () => {} }
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) } }), { threshold: 0.15 })
  els.forEach((e) => io.observe(e))
  return () => io.disconnect()
}
