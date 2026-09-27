import { activeViewPage, useStore } from '../store'
import type { Breakpoint, Page, SNode } from '../types'
import { childrenOf, topmost } from '../tree'
import { toast } from '../ui/toast'

// Actions shared by canvas shortcuts, the layers panel, the inspector and the command palette.
const st = useStore.getState
const page = (): Page | undefined => activeViewPage()
const nodes = () => page()?.nodes || []
const sel = () => st().selection
const find = (id?: string) => nodes().find((n) => n.id === id)

// Whether any of these layers, or a frame they sit in, was placed by hand in a view.
// Where nothing was, the layers keep fitting themselves and moves between frames needn't pin them.
const placedIn = (ids: string[], bp: Breakpoint) => {
  if (bp === 'desktop') return true
  const s = st()
  const p = s.projects.find((x) => x.id === s.currentId)
  const all = p?.pages.find((x) => x.id === p.activePageId)?.nodes || []
  const placed = (id?: string): boolean => {
    const n = all.find((x) => x.id === id)
    if (!n) return false
    const own = n.bp?.[bp] || {}
    return 'x' in own || 'y' in own || 'w' in own || 'h' in own || placed(n.parentId)
  }
  return ids.some((id) => placed(id))
}

export const isFlow = (n?: SNode) => !!n && (n.layout === 'stack' || n.layout === 'grid')

// Only layers that share a parent can be wrapped or reordered together.
export const sameParentSelection = () => {
  const all = topmost(nodes(), sel())
  const first = find(all[0])
  return all.filter((id) => find(id)?.parentId === first?.parentId)
}

export function wrapSelection(layout: 'free' | 'stack' | 'grid') {
  const ids = sameParentSelection()
  if (!ids.length) return toast('Select layers to wrap')
  const parentId = find(ids[0])?.parentId
  const flowParent = isFlow(find(parentId))
  const before = measure(ids, parentId)
  const frame = st().wrap(ids, layout)
  // Each view keeps the layers where they were: the frame takes their bounds there, and free children stay put inside it.
  if (frame) for (const [bp, m] of before) {
    const bs = [...m.values()]
    if (!bs.length) continue
    const x = Math.min(...bs.map((b) => b.x))
    const y = Math.min(...bs.map((b) => b.y))
    const w = Math.max(...bs.map((b) => b.x + b.w)) - x
    const h = Math.max(...bs.map((b) => b.y + b.h)) - y
    st().updateNodesIn(bp, [frame], flowParent ? {} : layout === 'free' ? { x, y, w, h } : { x, y }, true)
    if (layout === 'free') st().updateNodesIn(bp, [...m.keys()], (n) => ({ x: m.get(n.id)!.x - x, y: m.get(n.id)!.y - y, ...((n.wMode || 'fixed') === 'fixed' ? { w: m.get(n.id)!.w } : {}) }), true)
  }
  toast(layout === 'stack' ? 'Wrapped in a stack' : layout === 'grid' ? 'Wrapped in a grid' : 'Wrapped in a frame')
}

export function unwrapSelection() {
  const n = find(sel()[0])
  if (!n || n.type !== 'frame') return toast('Select a frame, stack or grid')
  const kids = childrenOf(nodes(), n.id).map((k) => k.id)
  const before = isFlow(find(n.parentId)) ? new Map() : measure(kids, n.parentId, [n.id])
  st().unwrap(n.id)
  for (const [bp, m] of before) st().updateNodesIn(bp, [...m.keys()], (k) => ({ x: m.get(k.id)!.x, y: m.get(k.id)!.y }), true)
}

// Where layers sit relative to a parent in each view shown on the canvas, desktop first.
function measure(ids: string[], parentId?: string, also: string[] = []) {
  const out = new Map<Breakpoint, Map<string, { x: number; y: number; w: number; h: number }>>()
  for (const bp of shownViews()) {
    if (!placedIn([...ids, ...also], bp)) continue
    const pb = worldBox(parentId, bp)
    if (!pb) continue
    const m = new Map<string, { x: number; y: number; w: number; h: number }>()
    for (const id of ids) {
      const b = worldBox(id, bp)
      if (b) m.set(id, { x: Math.round(b.x - pb.x), y: Math.round(b.y - pb.y), w: Math.round(b.w), h: Math.round(b.h) })
    }
    out.set(bp, m)
  }
  return out
}

// Turns a selected frame into a stack or grid in place, or back to free.
export function setLayout(layout: 'free' | 'stack' | 'grid') {
  const ids = sel().filter((id) => find(id)?.type === 'frame')
  if (!ids.length) return wrapSelection(layout)
  st().checkpoint()
  st().updateNodes(ids, (n) => ({ layout, ...(layout !== 'free' && !n.gap ? { gap: 12 } : {}), ...(layout === 'grid' && !n.cols ? { cols: 2 } : {}) }))
}

export function componentFromSelection() {
  const ids = sameParentSelection()
  if (!ids.length) return toast('Select layers to make a component')
  st().createComponent(ids)
  toast('Component created')
}

export function detachSelection() {
  const n = find(sel()[0])
  if (n?.type !== 'instance') return toast('Select a component instance')
  st().detach(n.id)
}

export function editComponent(id?: string) {
  const n = find(id || sel()[0])
  if (n?.type === 'instance' && n.componentId) st().setActivePage(n.componentId)
}

export function selectParent() {
  const n = find(sel()[0])
  st().setSelection(n?.parentId ? [n.parentId] : [])
}

export function selectChildren() {
  const kids = sel().flatMap((id) => childrenOf(nodes(), id)).filter((n) => !n.hidden && !n.locked)
  if (kids.length) st().setSelection(kids.map((n) => n.id))
  return kids.length > 0
}

export function selectSibling(step: 1 | -1) {
  const n = find(sel()[0])
  if (!n) return
  const sibs = childrenOf(nodes(), n.parentId).filter((x) => !x.hidden)
  const i = sibs.findIndex((x) => x.id === n.id)
  st().setSelection([sibs[(i + step + sibs.length) % sibs.length].id])
}

export function selectAll() {
  const first = find(sel()[0])
  const kids = childrenOf(nodes(), first?.parentId).filter((n) => !n.hidden && !n.locked)
  st().setSelection(kids.map((n) => n.id))
}

// Moves flow children earlier or later in their stack or grid. Returns false if they aren't in one.
export function moveInFlow(dir: 'left' | 'right' | 'up' | 'down') {
  const ids = sameParentSelection()
  const n = find(ids[0])
  const parent = find(n?.parentId)
  if (!n || !parent || !isFlow(parent)) return false
  const sibs = childrenOf(nodes(), parent.id)
  const i = sibs.findIndex((x) => x.id === n.id)
  const cols = parent.layout === 'grid' ? parent.cols || 2 : 1
  const vertical = dir === 'up' || dir === 'down'
  const step = (dir === 'left' || dir === 'up' ? -1 : 1) * (parent.layout === 'grid' && vertical ? cols : 1)
  const others = sibs.length - ids.length
  const to = Math.max(0, Math.min(others, i + step))
  if (to === i) return true
  st().checkpoint()
  st().moveNodes(ids, parent.id, to)
  return true
}

export function toggle(key: 'hidden' | 'locked') {
  const ids = sel()
  if (!ids.length) return
  st().checkpoint()
  st().updateNodes(ids, (n) => ({ [key]: !n[key] }))
  if (key === 'locked') st().setSelection([])
}

// Tells the canvas window to run a view action (zoom, preview and so on).
export const canvasCommand = (cmd: string) => window.dispatchEvent(new CustomEvent('sites:canvas', { detail: cmd }))

// A layer's box in one view's artboard coordinates, read from the canvas DOM (when the canvas is open).
export function worldBox(id?: string, bp?: Breakpoint) {
  const art = document.querySelector<HTMLElement>(bp ? `.cv-artboard[data-bp="${bp}"]` : '.cv-artboard.on') || document.querySelector<HTMLElement>('.cv-artboard')
  if (!id) return { x: 0, y: 0, w: art?.offsetWidth ?? 0, h: art?.offsetHeight ?? 0 }
  let el = art?.querySelector<HTMLElement>(`[data-nid="${id}"]`) || null
  // Hidden in this view: there is no box to read.
  if (!art || !el || !el.offsetParent) return null
  const w = el.offsetWidth
  const h = el.offsetHeight
  let x = 0
  let y = 0
  while (el && el !== art) { x += el.offsetLeft; y += el.offsetTop; el = el.offsetParent as HTMLElement | null }
  return { x, y, w, h }
}

// Views shown on the canvas right now, desktop first.
const shownViews = (): Breakpoint[] =>
  (['desktop', 'tablet', 'phone'] as const).filter((bp) => document.querySelector(`.cv-artboard[data-bp="${bp}"]`))

// Moves layers into a new parent at an index. In a free parent each view keeps them where they are on screen,
// except the active view when `placed` gives their new spots there.
export function reparent(ids: string[], parentId: string | undefined, index: number, placed?: Map<string, { x: number; y: number }>, save = true) {
  const target = find(parentId)
  const active = st().breakpoint
  const spots = new Map<Breakpoint, Map<string, { x: number; y: number }>>()
  if (!isFlow(target)) {
    for (const bp of shownViews()) {
      if (bp !== active && !placedIn(parentId ? [...ids, parentId] : ids, bp)) continue
      const pb = worldBox(parentId, bp)
      if (!pb) continue
      const m = new Map<string, { x: number; y: number }>()
      for (const id of ids) {
        const own = bp === active ? placed?.get(id) : undefined
        const b = own ? null : worldBox(id, bp)
        if (own) m.set(id, own)
        else if (b) m.set(id, { x: Math.round(b.x - pb.x), y: Math.round(b.y - pb.y) })
      }
      spots.set(bp, m)
    }
  }
  if (save) st().checkpoint()
  st().moveNodes(ids, parentId, index)
  // Desktop first: tablet and phone only keep what differs from the view above them.
  for (const [bp, m] of spots) st().updateNodesIn(bp, [...m.keys()], (n) => m.get(n.id) || {}, true)
}

// Lines layers up in the active view, reading real sizes from the canvas so fill and fit layers land right.
// One layer aligns within its parent; several align to their shared bounds.
export function alignSelection(how: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom') {
  const ids = sel().filter((id) => !isFlow(find(find(id)?.parentId)))
  const items = ids.map((id) => ({ id, b: worldBox(id), p: worldBox(find(id)?.parentId) })).filter((i) => i.b && i.p) as { id: string; b: Box; p: Box }[]
  if (!items.length) return
  const area = items.length > 1
    ? { x: Math.min(...items.map((i) => i.b.x)), y: Math.min(...items.map((i) => i.b.y)), r: Math.max(...items.map((i) => i.b.x + i.b.w)), btm: Math.max(...items.map((i) => i.b.y + i.b.h)) }
    : { x: items[0].p.x, y: items[0].p.y, r: items[0].p.x + items[0].p.w, btm: items[0].p.y + items[0].p.h }
  const to = new Map(items.map(({ id, b, p }) => {
    const x = how === 'left' ? area.x : how === 'right' ? area.r - b.w : how === 'hcenter' ? (area.x + area.r - b.w) / 2 : undefined
    const y = how === 'top' ? area.y : how === 'bottom' ? area.btm - b.h : how === 'vcenter' ? (area.y + area.btm - b.h) / 2 : undefined
    return [id, { ...(x !== undefined ? { x: Math.round(x - p.x) } : {}), ...(y !== undefined ? { y: Math.round(y - p.y) } : {}) }]
  }))
  st().checkpoint()
  st().updateNodes([...to.keys()], (n) => to.get(n.id) || {})
}

type Box = { x: number; y: number; w: number; h: number }

