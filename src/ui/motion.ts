import gsap from 'gsap'

// Motion is decoration only: everything works the same with reduced motion on.
export const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false } }

// Surfaces arrive by settling into place: a short rise, a hint of scale, no bounce.
export function enter(el: Element | null, vars: gsap.TweenVars = {}) {
  if (!el || reduced()) return
  gsap.fromTo(el, { opacity: 0, y: 10, scale: 0.985 }, { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: 'expo.out', clearProps: 'transform,opacity', ...vars })
}

export function stagger(els: ArrayLike<Element> | Element[], vars: gsap.TweenVars = {}) {
  if (!els.length || reduced()) return
  gsap.fromTo(els, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.6, ease: 'expo.out', stagger: 0.04, clearProps: 'opacity,transform', ...vars })
}
