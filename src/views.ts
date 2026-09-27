import type { Breakpoint, Page, SNode, View } from './types'

// Desktop is the page itself. Tablet follows desktop and phone follows tablet, fitted to their
// widths automatically every time they're shown; a change made in a view is stored on the layer
// for that view only and wins over the automatic fit.

export const VIEWS: { bp: Breakpoint; label: string; width: number }[] = [
  { bp: 'desktop', label: 'Desktop', width: 1200 },
  { bp: 'tablet', label: 'Tablet', width: 810 },
  { bp: 'phone', label: 'Phone', width: 390 },
]

// What a view can't change: the layer's identity, its place in the tree and its words.
const SHARED = new Set<keyof SNode>([
  'id', 'type', 'name', 'parentId', 'componentId', 'text', 'locked', 'tag', 'link', 'href', 'newTab', 'assetId', 'alt', 'd', 'list', 'bind', 'bp',
  'textStyle', 'textTransform', 'textDecoration', 'use', 'props', 'propBind', 'shadow', 'blur', 'bgBlur', 'clip', 'cursor', 'hover', 'appear',
])

// The narrowest a grid cell gets before a growing grid drops a column.
const MIN_CELL = 160

export const defaultViews = (h: number): Page['views'] => ({ tablet: { width: 810, height: h }, phone: { width: 390, height: h } })

// A layer with only its own view changes applied, without the automatic fit. For things fitting never
// touches, like whether a layer is hidden; use resolvePage for positions and sizes.
export function resolveNode(n: SNode, bp: Breakpoint): SNode {
  if (bp === 'desktop' || !n.bp) return n
  const t = n.bp.tablet
  const p = bp === 'phone' ? n.bp.phone : undefined
  return t || p ? { ...n, ...t, ...p } : n
}

// A view that isn't switched on reads as the one above it.
export const effective = (pg: Page, bp: Breakpoint): Breakpoint =>
  pg.kind === 'component' || bp === 'desktop' ? 'desktop' : pg.views?.[bp] ? bp : bp === 'phone' && pg.views?.tablet ? 'tablet' : 'desktop'

export const viewSize = (pg: Page, bp: Breakpoint): View => {
  const e = effective(pg, bp)
  return e === 'desktop' ? { width: pg.width, height: pg.height } : pg.views![e as 'tablet' | 'phone']!
}

type Resolved = { page: Page; base: Map<string, SNode> }
const cache = new WeakMap<Page, Map<Breakpoint, Resolved>>()

// One view's layers: the view above, fitted to this view's width, then this view's own changes.
// base is the same without the own changes, which is what an edit in this view is compared with.
function resolveView(pg: Page, bp: 'tablet' | 'phone'): Resolved {
  let m = cache.get(pg)
  if (!m) { m = new Map(); cache.set(pg, m) }
  const hit = m.get(bp)
  if (hit) return hit
  const src = bp === 'phone' && pg.views?.tablet ? resolveView(pg, 'tablet').page : pg
  const view = pg.views![bp]!
  const patches = autoFit(pg, bp, src)
  const base = new Map<string, SNode>()
  const nodes = pg.nodes.map((n, i) => {
    const a = src.nodes[i]
    const p = patches.get(n.id)
    const b = p ? { ...a, ...p } : a
    base.set(n.id, b)
    const own = n.bp?.[bp]
    return own ? { ...b, ...own } : b
  })
  // A view is at least as tall as what's in it, keeping desktop's space at the bottom in proportion.
  const bottom = (ns: SNode[]) => Math.max(0, ...ns.filter((n) => !n.parentId && !n.hidden).map((n) => n.y + n.h))
  const k = view.width / src.width
  const room = Math.round(Math.max(0, src.height - bottom(src.nodes)) * Math.min(1, k))
  const height = Math.max(view.height, bottom(nodes) + room)
  const out = { page: { ...pg, width: view.width, height, nodes }, base }
  m.set(bp, out)
  return out
}

// The page as a view shows it, cached so React sees the same object until the page changes.
export function resolvePage(pg: Page, bp: Breakpoint): Page {
  const e = effective(pg, bp)
  return e === 'desktop' ? pg : resolveView(pg, e as 'tablet' | 'phone').page
}

// Each layer in a view before that view's own changes: the automatic fit of the view above.
export function viewBase(pg: Page, bp: Breakpoint): Map<string, SNode> {
  const e = effective(pg, bp)
  return e === 'desktop' ? new Map(pg.nodes.map((n) => [n.id, n])) : resolveView(pg, e as 'tablet' | 'phone').base
}

// Applies an edit made while looking at a view: shared fields change everywhere, the rest only in that view.
// A value that matches the automatic fit (base) isn't stored, so the layer keeps following desktop.
// loose: positions and sizes within a pixel of the fit count as matching (for edits read back from the canvas).
export function applyInView(n: SNode, bp: Breakpoint, patch: Partial<SNode>, base?: SNode, loose = false): SNode {
  if (bp === 'desktop') return { ...n, ...patch }
  const shared: Partial<SNode> = {}
  const own: Record<string, unknown> = { ...(n.bp?.[bp] || {}) }
  const above = base || (bp === 'phone' ? resolveNode(n, 'tablet') : n)
  const near = (k: keyof SNode, v: unknown) => loose && ['x', 'y', 'w', 'h'].includes(k) && typeof v === 'number' && typeof above[k] === 'number' && Math.abs(v - (above[k] as number)) <= 1
  for (const [k, v] of Object.entries(patch) as [keyof SNode, unknown][]) {
    if (SHARED.has(k)) (shared as Record<string, unknown>)[k] = v
    else if (above[k] === v || near(k, v)) delete own[k]
    else own[k] = v
  }
  const bpNext = { ...n.bp, [bp]: Object.keys(own).length ? own : undefined }
  if (!bpNext.tablet && !bpNext.phone) return { ...n, ...shared, bp: undefined }
  return { ...n, ...shared, bp: bpNext }
}

export const overrideCount = (n: SNode, bp: Breakpoint) => (bp === 'desktop' ? 0 : Object.keys(n.bp?.[bp] || {}).length)

export const clearView = (n: SNode, bp: Breakpoint): SNode => {
  if (bp === 'desktop' || !n.bp?.[bp]) return n
  const next = { ...n.bp, [bp]: undefined }
  return { ...n, bp: next.tablet || next.phone ? next : undefined }
}

// Fits a view's layers to its width from the view above (src), so nothing is wider than the view.
// Positions shrink in proportion; widths shrink only as far as they must to keep their margins;
// shapes and grid cells keep their proportions; large type shrinks a little less than the view.
// Layers whose position or width were changed in this view keep them (respectOwn).
function autoFit(pg: Page, bp: 'tablet' | 'phone', src: Page, respectOwn = true): Map<string, Partial<SNode>> {
  const patches = new Map<string, Partial<SNode>>()
  const view = pg.views?.[bp]
  if (!view) return patches
  const sw = src.width
  const k = view.width / sw
  if (k >= 1) return patches
  const above = new Map(src.nodes.map((n) => [n.id, n]))
  const fitted = new Map<string, SNode>()
  const type = Math.max(0.5, Math.pow(k, 0.85))
  // f: how much the parent's space shrank. pw and pw0: the parent's width now and before.
  const visit = (parentId: string | undefined, f: number, pw: number, pw0: number) => {
    const parent = parentId ? fitted.get(parentId) || above.get(parentId) : undefined
    const grid = parent?.layout === 'grid'
    const flow = grid || parent?.layout === 'stack'
    const cols = parent?.cols || 2
    const cellOf = (w: number, c = cols) => (w - 2 * (parent?.pad || 0) - (parent?.gap || 0) * (c - 1)) / c
    for (const n of pg.nodes) {
      if (n.parentId !== parentId) continue
      const a = above.get(n.id)!
      const own = respectOwn ? n.bp?.[bp] || {} : {}
      const fixedW = (a.wMode || 'fixed') === 'fixed'
      const fixedH = (a.hMode || 'fixed') === 'fixed'
      const shape = a.type === 'ellipse' || a.type === 'image' || a.type === 'path' || (a.type === 'rect' && !flow)
      const p: Partial<SNode> = {}
      let w = a.w
      let ratio = f
      // Values this view set by hand win anyway; a hand-placed x still decides how much width fits.
      if (grid) {
        ratio = fixedW ? Math.min(1, cellOf(pw) / a.w) : Math.min(1, cellOf(pw) / Math.max(1, cellOf(pw0, above.get(parentId!)?.cols || 2)))
        w = a.w * ratio
        if (fixedH) p.h = Math.max(1, Math.round(a.h * ratio))
      } else if (flow) {
        const inner = pw - 2 * (parent?.pad || 0)
        if (shape) w = a.w * f
        else if (fixedW && a.w > inner) w = inner
        if (shape && fixedH) p.h = Math.max(1, Math.round(a.h * f))
        if (fixedW) ratio = w / a.w
      } else {
        if (a.wMode !== 'fill') p.x = Math.round(a.x * f)
        if (shape) {
          w = a.w * f
          if (fixedH) p.h = Math.max(1, Math.round(a.h * f))
        } else if (fixedW) {
          const x = typeof own.x === 'number' ? own.x : p.x ?? a.x
          const margin = Math.min(x, Math.max(0, Math.round((pw0 - a.x - a.w) * f)))
          w = Math.min(a.w, Math.max(a.w * f, pw - x - margin))
          ratio = w / a.w
        }
      }
      if (typeof own.w === 'number') { w = own.w; ratio = own.w / a.w }
      if (fixedW && Math.round(w) !== a.w) p.w = Math.max(1, Math.round(w))
      if (p.x === a.x) delete p.x
      if (p.h === a.h) delete p.h
      if (a.type === 'text' && (a.fontSize || 16) > 28 && !('fontSize' in own)) p.fontSize = Math.round((a.fontSize || 16) * type)
      // A grid that grows with its content drops columns rather than squeezing cells below a readable width.
      if (a.layout === 'grid' && a.hMode === 'fit' && !('cols' in own)) {
        const gw = p.w ?? a.w
        const cell = (c: number) => (gw - 2 * (a.pad || 0) - (a.gap || 0) * (c - 1)) / c
        let c = a.cols || 2
        while (c > 1 && cell(c) < MIN_CELL) c--
        if (c !== (a.cols || 2)) p.cols = c
      }
      if (Object.keys(p).length) patches.set(n.id, p)
      if (n.type === 'frame') {
        fitted.set(n.id, { ...a, ...p })
        visit(n.id, Math.min(1, ratio), a.w * Math.min(1, ratio), a.w)
      }
    }
  }
  visit(undefined, k, view.width, sw)
  return patches
}

// Views used to be fitted once and stored as view changes. Drops the stored values that the automatic
// fit now gives anyway, so those layers follow desktop again; real changes made in a view stay.
export function dropFittedChanges(pg: Page): Page {
  let cur = pg
  for (const bp of ['tablet', 'phone'] as const) {
    if (!cur.views?.[bp] || !cur.nodes.some((n) => n.bp?.[bp])) continue
    const src = bp === 'phone' && cur.views.tablet ? resolvePage(cur, 'tablet') : { ...cur, nodes: cur.nodes }
    const fit = autoFit(cur, bp, src, false)
    cur = {
      ...cur,
      nodes: cur.nodes.map((n, i) => {
        const own = n.bp?.[bp]
        if (!own) return n
        const a = { ...src.nodes[i], ...fit.get(n.id) }
        const keep = Object.fromEntries(Object.entries(own).filter(([k, v]) => {
          const b = (a as Record<string, unknown>)[k]
          return !(b === v || (typeof v === 'number' && typeof b === 'number' && Math.abs(v - b) <= 1))
        }))
        const next = { ...n.bp, [bp]: Object.keys(keep).length ? keep : undefined }
        return { ...n, bp: next.tablet || next.phone ? next : undefined }
      }),
    }
  }
  return cur
}
