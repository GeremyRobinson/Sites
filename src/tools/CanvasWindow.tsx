import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { newNode, useActivePage, useProject, useRawPage, useStore, type CanvasTool } from '../store'
import { VIEWS, effective, resolvePage } from '../views'
import { resolveColor, type Scheme } from '../theme'
import type { Breakpoint } from '../types'
import type { SNode } from '../types'
import { PageContent, nodeStyle } from '../ui/NodeView'
import { ancestors, byId, childrenOf, descendantIds } from '../tree'
import { cyclicFor } from '../codegen'
import { fileToAsset } from '../ui/files'
import { toast } from '../ui/toast'
import { Inspector } from './Inspector'
import { Layers } from './Layers'
import { Preview } from './Preview'
import { PRESETS, PresetIcon, flipPath, type Preset } from './shapes'
import * as A from './canvasActions'
import { Seg } from '../ui/controls'
import { I } from '../ui/icons'
import './canvas.css'

type Box = { x: number; y: number; w: number; h: number }
type Guide = { axis: 'x' | 'y'; at: number; from: number; to: number }
type Line = { x1: number; y1: number; x2: number; y2: number }

const TOOL_BUTTONS: { id: CanvasTool; label: string; key: string }[] = [
  { id: 'select', label: 'Move', key: 'V' },
  { id: 'frame', label: 'Frame', key: 'F' },
  { id: 'stack', label: 'Stack', key: 'S' },
  { id: 'grid', label: 'Grid', key: 'G' },
  { id: 'text', label: 'Text', key: 'T' },
]

export const SHORTCUTS: [string, string, string][] = [
  ['Tools', 'V', 'Move'], ['Tools', 'F', 'Frame'], ['Tools', 'S', 'Stack'], ['Tools', 'G', 'Grid'], ['Tools', 'T', 'Text'],
  ['Tools', 'R', 'Rectangle'], ['Tools', 'O', 'Oval'], ['Tools', 'P', 'Pen'], ['Tools', 'H / Space', 'Hand'],
  ['Layout', '⌘⏎', 'Wrap in frame'], ['Layout', '⇧A', 'Wrap in stack'], ['Layout', '⇧G', 'Wrap in grid'], ['Layout', '⇧⌘G', 'Remove wrapper'],
  ['Layout', '←↑→↓', 'Reorder inside a stack or grid'], ['Layout', 'Drag', 'Reorder, or drop into another frame'],
  ['Components', '⌥⌘K', 'Create component'], ['Components', '⌥⌘B', 'Detach instance'], ['Components', 'Double-click', 'Edit component'],
  ['Select', 'Click', 'Select in current level'], ['Select', '⌘ Click', 'Select deepest layer'], ['Select', 'Double-click', 'Select inside, edit text'],
  ['Select', '⏎', 'Select children, edit text'], ['Select', '⇧⏎ / Esc', 'Select parent'], ['Select', 'Tab ⇧Tab', 'Next, previous sibling'], ['Select', '⌘A', 'Select all siblings'],
  ['Edit', '⌘D', 'Duplicate'], ['Edit', '⌥ drag', 'Duplicate while moving'], ['Edit', '⌘C ⌘V ⌘X', 'Copy, paste, cut'], ['Edit', '⌫', 'Delete'],
  ['Edit', '↑↓←→', 'Nudge 1px, ⇧ for 10px'], ['Edit', '⌘] ⌘[', 'Forward, backward'], ['Edit', '⌘⌥] ⌘⌥[', 'Front, back'],
  ['Edit', '⌘⇧H', 'Hide'], ['Edit', '⌘⇧L', 'Lock'], ['Edit', '⌘Z ⌘⇧Z', 'Undo, redo'],
  ['View', '⇧1', 'Zoom to fit'], ['View', '⇧2', 'Zoom to selection'], ['View', '⌘0', 'Zoom to 100%'], ['View', '⌘+ ⌘−', 'Zoom in, out'],
  ['View', '⌘P', 'Preview'], ['View', '⌘ drag', 'Ignore smart guides'], ['View', '⌘K', 'Command palette'], ['View', '?', 'Shortcuts'],
]

const union = (bs: Box[]): Box | null => {
  if (!bs.length) return null
  const x = Math.min(...bs.map((b) => b.x))
  const y = Math.min(...bs.map((b) => b.y))
  return { x, y, w: Math.max(...bs.map((b) => b.x + b.w)) - x, h: Math.max(...bs.map((b) => b.y + b.h)) - y }
}

function snapBox(b: Box, others: Box[], thr: number) {
  const guides: Guide[] = []
  let dx = 0
  let dy = 0
  let best = thr
  for (const o of others) for (const t of [o.x, o.x + o.w / 2, o.x + o.w]) for (const m of [b.x, b.x + b.w / 2, b.x + b.w]) {
    if (Math.abs(t - m) < best) { best = Math.abs(t - m); dx = t - m }
  }
  best = thr
  for (const o of others) for (const t of [o.y, o.y + o.h / 2, o.y + o.h]) for (const m of [b.y, b.y + b.h / 2, b.y + b.h]) {
    if (Math.abs(t - m) < best) { best = Math.abs(t - m); dy = t - m }
  }
  const s = { x: b.x + dx, y: b.y + dy, w: b.w, h: b.h }
  for (const o of others) {
    for (const t of [o.x, o.x + o.w / 2, o.x + o.w]) for (const m of [s.x, s.x + s.w / 2, s.x + s.w]) {
      if (Math.abs(t - m) < 0.5) guides.push({ axis: 'x', at: t, from: Math.min(o.y, s.y), to: Math.max(o.y + o.h, s.y + s.h) })
    }
    for (const t of [o.y, o.y + o.h / 2, o.y + o.h]) for (const m of [s.y, s.y + s.h / 2, s.y + s.h]) {
      if (Math.abs(t - m) < 0.5) guides.push({ axis: 'y', at: t, from: Math.min(o.x, s.x), to: Math.max(o.x + o.w, s.x + s.w) })
    }
  }
  return { dx, dy, guides }
}

// Distances for the canvas: red lines with the number of pixels between two boxes.
type Measure = { x1: number; y1: number; x2: number; y2: number; v: number; ext?: Line[] }
const inside = (a: Box, b: Box) => a.x >= b.x - 0.5 && a.y >= b.y - 0.5 && a.x + a.w <= b.x + b.w + 0.5 && a.y + a.h <= b.y + b.h + 0.5
const mid = (a0: number, a1: number, b0: number, b1: number) => (Math.max(a0, b0) + Math.min(a1, b1)) / 2

// Between a selection and another box: gaps when apart, edge distances when one holds the other.
function pairMeasure(a: Box, b: Box): Measure[] {
  const out: Measure[] = []
  if (inside(a, b) || inside(b, a)) {
    const [i, o] = inside(a, b) ? [a, b] : [b, a]
    const cy = i.y + i.h / 2
    const cx = i.x + i.w / 2
    out.push({ x1: o.x, y1: cy, x2: i.x, y2: cy, v: i.x - o.x }, { x1: i.x + i.w, y1: cy, x2: o.x + o.w, y2: cy, v: o.x + o.w - i.x - i.w })
    out.push({ x1: cx, y1: o.y, x2: cx, y2: i.y, v: i.y - o.y }, { x1: cx, y1: i.y + i.h, x2: cx, y2: o.y + o.h, v: o.y + o.h - i.y - i.h })
    return out.filter((m) => m.v > 0.5)
  }
  const yOver = a.y < b.y + b.h && b.y < a.y + a.h
  const xOver = a.x < b.x + b.w && b.x < a.x + a.w
  const hx = a.x + a.w <= b.x ? [a.x + a.w, b.x] : b.x + b.w <= a.x ? [b.x + b.w, a.x] : null
  if (hx) {
    const y = yOver ? mid(a.y, a.y + a.h, b.y, b.y + b.h) : a.y + a.h / 2
    const bx = hx[0] === a.x + a.w ? b.x : b.x + b.w
    out.push({ x1: hx[0], y1: y, x2: hx[1], y2: y, v: hx[1] - hx[0], ext: yOver ? [] : [{ x1: bx, y1: y, x2: bx, y2: y < b.y ? b.y : b.y + b.h }] })
  }
  const vy = a.y + a.h <= b.y ? [a.y + a.h, b.y] : b.y + b.h <= a.y ? [b.y + b.h, a.y] : null
  if (vy) {
    const x = xOver ? mid(a.x, a.x + a.w, b.x, b.x + b.w) : a.x + a.w / 2
    const by = vy[0] === a.y + a.h ? b.y : b.y + b.h
    out.push({ x1: x, y1: vy[0], x2: x, y2: vy[1], v: vy[1] - vy[0], ext: xOver ? [] : [{ x1: x, y1: by, x2: x < b.x ? b.x : b.x + b.w, y2: by }] })
  }
  return out
}

// While moving: the distance to the nearest neighbour on each side, or to the parent's edge.
function nearestMeasure(a: Box, others: Box[], parent: Box): Measure[] {
  const out: Measure[] = []
  const cy = a.y + a.h / 2
  const cx = a.x + a.w / 2
  const rowMates = others.filter((o) => o.y < a.y + a.h && a.y < o.y + o.h)
  const colMates = others.filter((o) => o.x < a.x + a.w && a.x < o.x + o.w)
  const left = Math.max(parent.x, ...rowMates.filter((o) => o.x + o.w <= a.x + 0.5).map((o) => o.x + o.w))
  const right = Math.min(parent.x + parent.w, ...rowMates.filter((o) => o.x >= a.x + a.w - 0.5).map((o) => o.x))
  const top = Math.max(parent.y, ...colMates.filter((o) => o.y + o.h <= a.y + 0.5).map((o) => o.y + o.h))
  const bottom = Math.min(parent.y + parent.h, ...colMates.filter((o) => o.y >= a.y + a.h - 0.5).map((o) => o.y))
  if (a.x - left > 0.5) out.push({ x1: left, y1: cy, x2: a.x, y2: cy, v: a.x - left })
  if (right - a.x - a.w > 0.5) out.push({ x1: a.x + a.w, y1: cy, x2: right, y2: cy, v: right - a.x - a.w })
  if (a.y - top > 0.5) out.push({ x1: cx, y1: top, x2: cx, y2: a.y, v: a.y - top })
  if (bottom - a.y - a.h > 0.5) out.push({ x1: cx, y1: a.y + a.h, x2: cx, y2: bottom, v: bottom - a.y - a.h })
  return out
}

// Layer boxes in artboard coordinates, read from the rendered DOM so stacks and grids report where they really are.
function measure(root: HTMLElement, zoom: number): Map<string, Box> {
  const out = new Map<string, Box>()
  const rr = root.getBoundingClientRect()
  root.querySelectorAll<Element>('[data-nid]').forEach((el) => {
    const id = (el as HTMLElement).dataset.nid!
    if (el instanceof HTMLElement) {
      let x = 0
      let y = 0
      let cur: HTMLElement | null = el
      while (cur && cur !== root) { x += cur.offsetLeft; y += cur.offsetTop; cur = cur.offsetParent as HTMLElement | null }
      out.set(id, { x, y, w: el.offsetWidth, h: el.offsetHeight })
    } else {
      const r = el.getBoundingClientRect()
      out.set(id, { x: (r.left - rr.left) / zoom, y: (r.top - rr.top) / zoom, w: r.width / zoom, h: r.height / zoom })
    }
  })
  return out
}

const Icon = ({ k }: { k: string }) => { const C = I[k as keyof typeof I]; return <C /> }

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const
const DIR_GLYPH = { row: <I.right />, column: <I.down /> }

export function CanvasWindow() {
  const project = useProject()!
  const page = useActivePage()!
  const selection = useStore((s) => s.selection)
  const tool = useStore((s) => s.tool)
  const editingTextId = useStore((s) => s.editingTextId)
  const settings = project.windows.canvas.settings
  // Which colour mode the page is drawn in. Only colour styles with a dark value change.
  const scheme: Scheme = settings.scheme === 'dark' ? 'dark' : 'light'
  const colors = project.styles?.colors || []
  const hasDark = colors.some((c) => c.dark)
  const stageRef = useRef<HTMLDivElement>(null)
  const artRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ x: 40, y: 40, zoom: 0.5 })
  const viewRef = useRef(view)
  viewRef.current = view
  const [boxes, setBoxes] = useState<Map<string, Box>>(new Map())
  const boxesRef = useRef(boxes)
  boxesRef.current = boxes
  const [guides, setGuides] = useState<Guide[]>([])
  const [marquee, setMarquee] = useState<Box | null>(null)
  const [drawBox, setDrawBox] = useState<Box | null>(null)
  const [ghost, setGhost] = useState<Box | null>(null)
  const [insertLine, setInsertLine] = useState<Line | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null | undefined>(undefined)
  const [pen, setPen] = useState<{ x: number; y: number }[] | null>(null)
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)
  const [space, setSpace] = useState(false)
  const [preview, setPreview] = useState(false)
  const [help, setHelp] = useState(false)
  const [menu, setMenu] = useState<'shapes' | 'components' | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const [alt, setAlt] = useState(false)
  const [, setTick] = useState(0)
  const act = useRef<any>(null)
  const lastPage = useRef<string | null>(null)

  const s = useStore.getState
  const map = useMemo(() => byId(page.nodes), [page.nodes])
  const isComp = page.kind === 'component'

  // Desktop, tablet and phone sit side by side. Editing happens in the active one;
  // coordinates below are local to it, shifted by its origin in the world.
  const raw = useRawPage()!
  const active = effective(raw, useStore((st) => st.breakpoint))
  const boards = useMemo(() => {
    const out: { bp: Breakpoint; label: string; w: number; h: number; x: number; min: number; max?: number }[] = []
    let x = 0
    for (const v of VIEWS) {
      if (v.bp !== 'desktop' && (isComp || !raw.views?.[v.bp])) continue
      // A view grows to hold what's in it (see resolvePage).
      const size = v.bp === 'desktop' ? { width: raw.width, height: raw.height } : resolvePage(raw, v.bp)
      out.push({ bp: v.bp, label: v.label, w: size.width, h: size.height, x, min: 0 })
      x += size.width + 160
    }
    // Each view covers the widths from its own up to just below the view above it; the last one goes down to zero.
    out.forEach((b, i) => { b.min = i === out.length - 1 ? 0 : b.w; if (i > 0) b.max = out[i - 1].w - 1 })
    return out
  }, [raw, isComp])
  // Pages grow with what's in them: a list with more items, or a grid that drops columns in a view,
  // stretches its board instead of being cut off at the page's height.
  const worldRef = useRef<HTMLDivElement>(null)
  const [grown, setGrown] = useState<Partial<Record<Breakpoint, number>>>({})
  useLayoutEffect(() => {
    const next: Partial<Record<Breakpoint, number>> = {}
    worldRef.current?.querySelectorAll<HTMLElement>('.cv-artboard').forEach((el) => {
      let bottom = 0
      if (!isComp) for (const c of el.children) if (c instanceof HTMLElement && c.dataset.nid && c.offsetParent) bottom = Math.max(bottom, c.offsetTop + c.offsetHeight)
      const h = bottom > parseFloat(el.style.height) ? Math.ceil(bottom + 48) : 0
      if (el.style.minHeight !== (h ? h + 'px' : '')) el.style.minHeight = h ? h + 'px' : ''
      if (h) next[el.dataset.bp as Breakpoint] = h
    })
    if (JSON.stringify(next) !== JSON.stringify(grown)) setGrown(next)
  })
  const ox = boards.find((b) => b.bp === active)?.x ?? 0
  const oxRef = useRef(ox)
  oxRef.current = ox
  const span = { x: 0, y: 0, w: boards[boards.length - 1].x + boards[boards.length - 1].w, h: Math.max(...boards.map((b) => b.h)) }
  if (!isComp) lastPage.current = page.id

  // Re-measure after every render; only store a new map when something moved.
  const sig = useRef('')
  useLayoutEffect(() => {
    if (!artRef.current) return
    const m = measure(artRef.current, viewRef.current.zoom)
    const next = [...m].map(([k, b]) => `${k}:${b.x},${b.y},${b.w},${b.h}`).join('|')
    if (next !== sig.current) { sig.current = next; setBoxes(m) }
  })
  useEffect(() => { document.fonts?.ready.then(() => setTick((t) => t + 1)) }, [])

  // Holding ⌥ measures from the selection to whatever is under the pointer.
  useEffect(() => {
    const k = (e: KeyboardEvent) => setAlt(e.altKey)
    const off = () => setAlt(false)
    window.addEventListener('keydown', k)
    window.addEventListener('keyup', k)
    window.addEventListener('blur', off)
    return () => { window.removeEventListener('keydown', k); window.removeEventListener('keyup', k); window.removeEventListener('blur', off) }
  }, [])

  const toWorld = useCallback((cx: number, cy: number) => {
    const r = stageRef.current!.getBoundingClientRect()
    const v = viewRef.current
    return { x: (cx - r.left - v.x) / v.zoom - oxRef.current, y: (cy - r.top - v.y) / v.zoom }
  }, [])

  const fit = useCallback((box?: Box | null) => {
    const el = stageRef.current
    if (!el) return
    // Boxes are in world space; with none given, fit every view.
    const b = box || span
    const pad = 48
    // Keep the artboard clear of the floating panels.
    const L = settings.layers && el.clientWidth > 640 ? 232 : 0
    const R = settings.inspector && el.clientWidth > 480 ? 288 : 0
    const W = el.clientWidth - L - R
    const zoom = Math.min(4, Math.max(0.05, Math.min((W - pad * 2) / Math.max(b.w, 1), (el.clientHeight - pad * 2) / Math.max(b.h, 1))))
    setView({ zoom, x: L + (W - b.w * zoom) / 2 - b.x * zoom, y: (el.clientHeight - b.h * zoom) / 2 - b.y * zoom })
  }, [span.w, span.h, settings.layers, settings.inspector]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fit the artboard when the page changes, and keep it fitted as the window resizes until the user pans or zooms.
  const fitted = useRef(true)
  useLayoutEffect(() => { fitted.current = true; fit() }, [page.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const ro = new ResizeObserver(() => { if (fitted.current) fit() })
    ro.observe(stageRef.current!)
    return () => ro.disconnect()
  }, [fit])

  const zoomAt = (factor: number, cx?: number, cy?: number) => {
    fitted.current = false
    const el = stageRef.current!
    const r = el.getBoundingClientRect()
    const px = cx ?? r.left + el.clientWidth / 2
    const py = cy ?? r.top + el.clientHeight / 2
    setView((v) => {
      const zoom = Math.min(8, Math.max(0.05, v.zoom * factor))
      const wx = (px - r.left - v.x) / v.zoom
      const wy = (py - r.top - v.y) / v.zoom
      return { zoom, x: px - r.left - wx * zoom, y: py - r.top - wy * zoom }
    })
  }

  // Wheel: pan, or zoom with ⌘/ctrl (and trackpad pinch).
  useEffect(() => {
    const el = stageRef.current!
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      fitted.current = false
      if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY)
      else setView((v) => ({ ...v, x: v.x - (e.shiftKey ? e.deltaY : e.deltaX), y: v.y - (e.shiftKey ? 0 : e.deltaY) }))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const nodesNow = () => {
    const st = s()
    const pg = st.projects.find((p) => p.id === st.currentId)?.pages.find((x) => x.id === page.id)
    return pg ? resolvePage(pg, st.breakpoint).nodes : []
  }
  const chainOf = (id: string) => { const n = map.get(id)!; return [...ancestors(page.nodes, id).reverse(), n] }
  const boxOf = (id?: string | null): Box => (id ? boxesRef.current.get(id) : undefined) || { x: 0, y: 0, w: page.width, h: page.height }

  // Deepest layer under the pointer. Skips `exclude` entirely; climbs out of locked layers (and non-frames when framesOnly).
  const hitDeepest = (cx: number, cy: number, exclude?: Set<string>, framesOnly = false): string | undefined => {
    const art = artRef.current
    if (!art) return undefined
    for (const el of document.elementsFromPoint(cx, cy)) {
      const t = (el as HTMLElement).closest?.('[data-nid]') as HTMLElement | null
      if (!t || !art.contains(t)) continue
      let id: string | undefined = t.dataset.nid
      if (exclude?.has(id!)) continue
      const chain = chainOf(id!)
      const lockedAt = chain.findIndex((n) => n.locked)
      if (lockedAt === 0) continue
      if (lockedAt > 0) id = chain[lockedAt - 1].id
      while (id && framesOnly && map.get(id)?.type !== 'frame') id = map.get(id)?.parentId
      if (id || framesOnly) return id
    }
    return undefined
  }

  // Click picks the layer at the current depth: siblings of the selection, or top level.
  const pick = (chain: SNode[], sel = s().selection) => {
    const scope = new Set<string>()
    for (const id of sel) for (const a of ancestors(page.nodes, id)) scope.add(a.id)
    for (let i = chain.length - 1; i >= 0; i--) if (!chain[i].parentId || scope.has(chain[i].parentId!)) return chain[i]
    return chain[0]
  }

  const flowIndex = (parentId: string, p: { x: number; y: number }, exclude: Set<string>) => {
    const parent = map.get(parentId)!
    const sibs = childrenOf(page.nodes, parentId).filter((n) => !exclude.has(n.id) && !n.hidden)
      .map((n) => ({ n, b: boxesRef.current.get(n.id) })).filter((x): x is { n: SNode; b: Box } => !!x.b)
    const pb = boxOf(parentId)
    const pad = parent.pad || 0
    const gap = parent.gap || 0
    let index: number
    let line: Line
    if (parent.layout === 'stack') {
      const row = parent.dir === 'row'
      index = sibs.filter((x) => (row ? x.b.x + x.b.w / 2 < p.x : x.b.y + x.b.h / 2 < p.y)).length
      const before = sibs[index]?.b
      const after = sibs[index - 1]?.b
      const at = before ? (row ? before.x : before.y) - (after ? gap / 2 : 0) : after ? (row ? after.x + after.w : after.y + after.h) + gap / 2 : (row ? pb.x : pb.y) + pad
      line = row ? { x1: at, x2: at, y1: pb.y + pad, y2: pb.y + pb.h - pad } : { y1: at, y2: at, x1: pb.x + pad, x2: pb.x + pb.w - pad }
    } else {
      let k = -1
      let best = Infinity
      sibs.forEach((x, i) => { const d = Math.hypot(x.b.x + x.b.w / 2 - p.x, x.b.y + x.b.h / 2 - p.y); if (d < best) { best = d; k = i } })
      if (k < 0) { index = 0; line = { x1: pb.x + pad, x2: pb.x + pad, y1: pb.y + pad, y2: pb.y + pb.h - pad } }
      else {
        const b = sibs[k].b
        const after = p.x > b.x + b.w / 2
        index = k + (after ? 1 : 0)
        const x = after ? b.x + b.w + gap / 2 : b.x - gap / 2
        line = { x1: x, x2: x, y1: b.y, y2: b.y + b.h }
      }
    }
    return { index, line }
  }

  const finishPen = (close = false) => {
    if (pen && pen.length > 1) {
      const b = union(pen.map((p) => ({ ...p, w: 0, h: 0 })))!
      const w = Math.max(b.w, 1)
      const h = Math.max(b.h, 1)
      const d = pen.map((p, i) => `${i ? 'L' : 'M'}${(((p.x - b.x) / w) * 100).toFixed(2)} ${(((p.y - b.y) / h) * 100).toFixed(2)}`).join(' ') + (close ? ' Z' : '')
      const cid = act.current?.penContainer as string | undefined
      const cb = cid ? boxOf(cid) : { x: 0, y: 0 }
      s().addNodes([newNode('path', {
        x: Math.round(b.x - cb.x), y: Math.round(b.y - cb.y), w: Math.round(w), h: Math.round(h), d, parentId: cid,
        fill: close ? String(settings.fill || '#d9d9d9') : 'none', stroke: close ? 'none' : '#111111', strokeWidth: close ? 0 : 2,
      })])
    }
    act.current = null
    setPen(null)
    s().setTool('select')
  }

  const clearDrag = () => { setGuides([]); setMarquee(null); setGhost(null); setInsertLine(null); setDropTarget(undefined); setDrawBox(null) }

  const onPointerDown = (e: React.PointerEvent) => {
    if (preview || e.button === 2) return
    setMenu(null)
    const el = stageRef.current!
    el.setPointerCapture(e.pointerId)
    const p = toWorld(e.clientX, e.clientY)
    const st = s()
    if (st.editingTextId) st.setEditingText(null)

    if (e.button === 1 || space || tool === 'hand') {
      act.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }
      return
    }
    // A press in another view makes it the active one and selects what's under the pointer there.
    const other = document.elementsFromPoint(e.clientX, e.clientY).map((x) => (x as HTMLElement).closest?.('[data-bp]') as HTMLElement | null).find(Boolean)
    if (other && other.dataset.bp !== active) {
      st.setBreakpoint(other.dataset.bp as Breakpoint)
      const hit = document.elementsFromPoint(e.clientX, e.clientY).map((x) => (x as HTMLElement).closest?.('[data-nid]') as HTMLElement | null).find((x) => x && other.contains(x))
      if (hit && tool === 'select') { const n = map.get(hit.dataset.nid!); if (n) st.setSelection([pick(chainOf(n.id)).id]) }
      return
    }
    if (tool === 'pen') {
      if (pen && pen.length > 2) {
        const f = pen[0]
        if (Math.hypot((f.x - p.x) * view.zoom, (f.y - p.y) * view.zoom) < 8) { finishPen(true); return }
      }
      if (!pen) act.current = { mode: 'pen', penContainer: hitDeepest(e.clientX, e.clientY, undefined, true) }
      setPen([...(pen || []), { x: Math.round(p.x), y: Math.round(p.y) }])
      return
    }
    if (tool !== 'select') {
      act.current = { mode: 'draw', p0: p, container: hitDeepest(e.clientX, e.clientY, undefined, true) }
      return
    }
    const deep = hitDeepest(e.clientX, e.clientY)
    if (deep) {
      const chain = chainOf(deep)
      const hit = e.metaKey || e.ctrlKey ? chain[chain.length - 1] : pick(chain)
      let sel = st.selection
      if (e.shiftKey) sel = sel.includes(hit.id) ? sel.filter((x) => x !== hit.id) : [...sel, hit.id]
      else if (!sel.includes(hit.id)) sel = [hit.id]
      st.setSelection(sel)
      const ids = sel.filter((id) => map.get(id)?.parentId === hit.parentId)
      act.current = { mode: 'move', p0: p, ids, alt: e.altKey, started: false }
    } else {
      const scopeParent = map.get(st.selection[0])?.parentId
      if (!e.shiftKey) st.setSelection([])
      act.current = { mode: 'marquee', p0: p, base: e.shiftKey ? st.selection : [], scopeParent }
    }
  }

  const startResize = (e: React.PointerEvent, handle: string) => {
    e.stopPropagation()
    stageRef.current!.setPointerCapture(e.pointerId)
    const ids = A.sameParentSelection()
    const items = ids.map((id) => ({ n: map.get(id)!, b: boxOf(id) }))
    act.current = { mode: 'resize', handle, B: union(items.map((i) => i.b)), items, sx: e.clientX, sy: e.clientY, started: false }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const p = toWorld(e.clientX, e.clientY)
    if (pen) setCursor(p)
    const a = act.current
    if (!a || a.mode === 'pen') {
      if (tool === 'select' && !space) {
        const deep = hitDeepest(e.clientX, e.clientY)
        setHover(deep ? (e.metaKey || e.ctrlKey ? deep : pick(chainOf(deep)).id) : null)
      }
      return
    }
    const st = s()
    const Z = view.zoom
    if (a.mode === 'board') {
      const d = Math.round(((a.axis === 'w' ? e.clientX - a.sx : e.clientY - a.sy) / Z))
      // Views keep their order: each stays narrower than the one above it.
      const i = boards.findIndex((b) => b.bp === a.bp)
      const lo = a.axis === 'w' ? Math.max(240, (boards[i + 1]?.w ?? 0) + 1) : 200
      const hi = a.axis === 'w' ? (boards[i - 1]?.w ?? 4001) - 1 : 20000
      const v = Math.min(hi, Math.max(lo, (a.axis === 'w' ? a.w0 : a.h0) + d))
      const key = a.axis === 'w' ? 'width' : 'height'
      if (a.bp === 'desktop') st.updatePage(raw.id, { [key]: v })
      else st.updateView(raw.id, a.bp, { [key]: v })
      return
    }
    if (a.mode === 'pan') {
      fitted.current = false
      setView((v) => ({ ...v, x: a.vx + e.clientX - a.sx, y: a.vy + e.clientY - a.sy }))
    } else if (a.mode === 'draw') {
      let w = p.x - a.p0.x
      let h = p.y - a.p0.y
      if (e.shiftKey) { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m }
      setDrawBox({ x: Math.min(a.p0.x, a.p0.x + w), y: Math.min(a.p0.y, a.p0.y + h), w: Math.abs(w), h: Math.abs(h) })
      if (a.container && A.isFlow(map.get(a.container))) setInsertLine(flowIndex(a.container, p, new Set()).line)
    } else if (a.mode === 'move') {
      let dx = p.x - a.p0.x
      let dy = p.y - a.p0.y
      if (!a.started) {
        if (Math.hypot(dx, dy) * Z < 3 || !a.ids.length) return
        a.started = true
        const origIds: string[] = a.ids
        const origBoxes = origIds.map((id) => boxOf(id))
        if (a.alt) {
          st.setSelection(origIds)
          a.ids = st.duplicate(0)
        } else st.checkpoint()
        const now = byId(nodesNow())
        a.parent = now.get(a.ids[0])?.parentId
        a.orig = new Map(a.ids.map((id: string) => [id, { x: now.get(id)!.x, y: now.get(id)!.y }]))
        a.worldBoxes = a.ids.map((_: string, i: number) => origBoxes[i])
        a.bbox = union(a.worldBoxes)
        a.exclude = new Set<string>([...a.ids, ...a.ids.flatMap((id: string) => [...descendantIds(nodesNow(), id)])])
        a.live = false
      }
      if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0 }
      const target = hitDeepest(e.clientX, e.clientY, a.exclude, true)
      const tn = target ? map.get(target) : undefined
      const moved = { ...a.bbox, x: a.bbox.x + dx, y: a.bbox.y + dy }
      if (!A.isFlow(tn) && target === a.parent) {
        let g: Guide[] = []
        if (settings.snap && !(e.metaKey || e.ctrlKey)) {
          const others = [boxOf(a.parent), ...childrenOf(page.nodes, a.parent).filter((n) => !a.exclude.has(n.id) && !n.hidden).map((n) => boxOf(n.id))]
          const r = snapBox(moved, others, 6 / Z)
          dx += r.dx
          dy += r.dy
          g = r.guides
        }
        setGuides(g)
        setGhost(null)
        setInsertLine(null)
        setDropTarget(undefined)
        a.live = true
        st.updateNodes(a.ids, (n) => ({ x: Math.round(a.orig.get(n.id).x + dx), y: Math.round(a.orig.get(n.id).y + dy) }))
        a.drop = { kind: 'same' }
      } else {
        if (a.live) { a.live = false; st.updateNodes(a.ids, (n) => ({ x: a.orig.get(n.id).x, y: a.orig.get(n.id).y })) }
        setGuides([])
        setGhost(moved)
        setDropTarget(target ?? null)
        if (A.isFlow(tn)) {
          const f = flowIndex(target!, p, a.exclude)
          setInsertLine(f.line)
          a.drop = { kind: 'flow', parent: target, index: f.index }
        } else {
          setInsertLine(null)
          a.drop = { kind: 'free', parent: target, dx, dy }
        }
      }
    } else if (a.mode === 'resize') {
      if (!a.started) { a.started = true; st.checkpoint() }
      const dx = (e.clientX - a.sx) / Z
      const dy = (e.clientY - a.sy) / Z
      const B: Box = a.B
      let { x, y, w, h } = B
      if (a.handle.includes('e')) w = B.w + dx
      if (a.handle.includes('s')) h = B.h + dy
      if (a.handle.includes('w')) { w = B.w - dx; x = B.x + dx }
      if (a.handle.includes('n')) { h = B.h - dy; y = B.y + dy }
      if (e.shiftKey && a.handle.length === 2 && B.w && B.h) {
        const k = Math.max(w / B.w, h / B.h)
        const nw = B.w * k
        const nh = B.h * k
        if (a.handle.includes('w')) x = B.x + B.w - nw
        if (a.handle.includes('n')) y = B.y + B.h - nh
        w = nw
        h = nh
      }
      w = Math.max(1, w)
      h = Math.max(1, h)
      const sx = B.w ? w / B.w : 1
      const sy = B.h ? h / B.h : 1
      const horiz = /[ew]/.test(a.handle)
      const vert = /[ns]/.test(a.handle)
      const items = new Map<string, { n: SNode; b: Box }>(a.items.map((i: { n: SNode; b: Box }) => [i.n.id, i]))
      st.updateNodes([...items.keys()], (n) => {
        const { n: o, b } = items.get(n.id)!
        const nb = { x: x + (b.x - B.x) * sx, y: y + (b.y - B.y) * sy, w: Math.max(1, Math.round(b.w * sx)), h: Math.max(1, Math.round(b.h * sy)) }
        const flow = A.isFlow(map.get(o.parentId!))
        return {
          ...(flow ? {} : { x: Math.round(o.x + nb.x - b.x), y: Math.round(o.y + nb.y - b.y) }),
          ...(horiz ? { w: nb.w, wMode: undefined } : {}),
          ...(vert ? { h: nb.h, hMode: undefined } : {}),
        }
      })
    } else if (a.mode === 'marquee') {
      const box = { x: Math.min(a.p0.x, p.x), y: Math.min(a.p0.y, p.y), w: Math.abs(p.x - a.p0.x), h: Math.abs(p.y - a.p0.y) }
      setMarquee(box)
      const inside = childrenOf(page.nodes, a.scopeParent).filter((n) => {
        const b = boxesRef.current.get(n.id)
        return b && !n.hidden && !n.locked && b.x < box.x + box.w && b.x + b.w > box.x && b.y < box.y + box.h && b.y + b.h > box.y
      }).map((n) => n.id)
      st.setSelection([...new Set([...a.base, ...inside])])
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    const a = act.current
    if (a?.mode !== 'pen') act.current = null
    clearDrag()
    const st = s()
    if (a?.mode === 'move' && a.started && a.drop && a.drop.kind !== 'same') {
      if (a.drop.kind === 'flow') st.moveNodes(a.ids, a.drop.parent, a.drop.index)
      else {
        const tb = a.drop.parent ? boxOf(a.drop.parent) : { x: 0, y: 0 }
        const pos = new Map<string, { x: number; y: number }>(a.ids.map((id: string, i: number) => [id, { x: Math.round(a.worldBoxes[i].x + a.drop.dx - tb.x), y: Math.round(a.worldBoxes[i].y + a.drop.dy - tb.y) }]))
        A.reparent(a.ids, a.drop.parent, childrenOf(nodesNow(), a.drop.parent).filter((n) => !a.ids.includes(n.id)).length, pos, false)
      }
      st.setSelection(a.ids)
    }
    if (a?.mode === 'draw') {
      const p = toWorld(e.clientX, e.clientY)
      let w = Math.abs(p.x - a.p0.x)
      let h = Math.abs(p.y - a.p0.y)
      if (e.shiftKey) w = h = Math.max(w, h)
      const clicked = w < 4 && h < 4
      const x0 = clicked ? a.p0.x : Math.min(a.p0.x, p.x)
      const y0 = clicked ? a.p0.y : Math.min(a.p0.y, p.y)
      const container = a.container as string | undefined
      const cb = container ? boxOf(container) : { x: 0, y: 0 }
      const t = tool
      const over: Partial<SNode> = t === 'text'
        ? { text: '', w: clicked ? 240 : w, h: 29, wMode: clicked ? 'fit' : undefined, hMode: 'fit' }
        : t === 'stack' ? { name: 'Stack', layout: 'stack', dir: 'column', gap: 12, pad: 16, w: clicked ? 240 : w, h: clicked ? 160 : h, ...(clicked ? { wMode: 'fit', hMode: 'fit' } as const : {}) }
        : t === 'grid' ? { name: 'Grid', layout: 'grid', cols: 3, gap: 12, pad: 16, w: clicked ? 360 : w, h: clicked ? 240 : h }
        : { w: clicked ? 100 : w, h: clicked ? 100 : h }
      const type = t === 'text' ? 'text' : t === 'rect' ? 'rect' : t === 'ellipse' ? 'ellipse' : 'frame'
      const n = newNode(type, { x: Math.round(x0 - cb.x), y: Math.round(y0 - cb.y), parentId: container, ...over })
      if (type === 'frame' && t === 'frame' && container) n.fill = '#ffffff'
      n.w = Math.round(n.w)
      n.h = Math.round(n.h)
      st.addNodes([n])
      if (container && A.isFlow(map.get(container))) st.moveNodes([n.id], container, flowIndex(container, p, new Set()).index)
      if (type === 'text') st.setEditingText(n.id)
      st.setTool('select')
    }
  }

  const onDoubleClick = (e: React.MouseEvent) => {
    if (tool === 'pen') { finishPen(false); return }
    const deep = hitDeepest(e.clientX, e.clientY)
    if (!deep) return
    const st = s()
    const chain = chainOf(deep)
    const cur = map.get(st.selection[0])
    const i = cur ? chain.findIndex((n) => n.id === cur.id) : -1
    if (cur?.type === 'text' && i >= 0) { st.setEditingText(cur.id); return }
    if (cur?.type === 'instance' && i >= 0) { A.editComponent(cur.id); return }
    const next = i >= 0 ? chain[i + 1] : pick(chain)
    if (!next) return
    st.setSelection([next.id])
    if (next.type === 'text') st.setEditingText(next.id)
  }

  const zoomSel = () => { const u = union(s().selection.map((id) => boxOf(id))); fit(u && { ...u, x: u.x + ox }) }

  // View commands from the command palette.
  useEffect(() => {
    const on = (e: Event) => {
      const cmd = (e as CustomEvent<string>).detail
      if (cmd === 'fit') { fitted.current = true; fit() }
      else if (cmd === 'zoomSel') zoomSel()
      else if (cmd === 'zoom100') zoomAt(1 / viewRef.current.zoom)
      else if (cmd === 'zoomIn') zoomAt(1.25)
      else if (cmd === 'zoomOut') zoomAt(0.8)
      else if (cmd === 'preview') setPreview(true)
      else if (cmd === 'help') setHelp(true)
      else if (cmd === 'shapes') setMenu('shapes')
      else if (cmd === 'components') setMenu('components')
    }
    window.addEventListener('sites:canvas', on)
    return () => window.removeEventListener('sites:canvas', on)
  })

  // Keyboard shortcuts, live while the canvas is the front window.
  useEffect(() => {
    const isFront = () => {
      const st = s()
      const p = st.projects.find((x) => x.id === st.currentId)
      if (!p) return false
      const top = Math.max(...Object.values(p.windows).filter((w) => w.open).map((w) => w.z))
      return p.windows.canvas.z === top
    }
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable=true], .cm-editor')) return
      if (!isFront() || document.querySelector('.palette')) return
      const st = s()
      const mod = e.metaKey || e.ctrlKey
      const k = e.key.toLowerCase()
      const sel = st.selection
      const one = map.get(sel[0])
      if (e.code === 'Space' && !space) { setSpace(true); e.preventDefault(); return }
      if (preview) { if (k === 'escape' || (mod && k === 'p')) { e.preventDefault(); setPreview(false) } return }
      if (mod && k === 'p') { e.preventDefault(); setPreview(true); return }
      if (mod && k === 'enter') { e.preventDefault(); A.wrapSelection('free'); return }
      if (mod && e.altKey && e.code === 'KeyG') { e.preventDefault(); A.wrapSelection('free'); return }
      if (mod && e.shiftKey && e.code === 'KeyG') { e.preventDefault(); A.unwrapSelection(); return }
      if (mod && e.altKey && e.code === 'KeyK') { e.preventDefault(); A.componentFromSelection(); return }
      if (mod && e.altKey && e.code === 'KeyB') { e.preventDefault(); A.detachSelection(); return }
      if (mod && k === 'd') { e.preventDefault(); st.duplicate(); return }
      if (mod && k === 'c') { st.copy(); return }
      if (mod && k === 'x') { st.copy(); st.deleteNodes(sel); return }
      if (mod && k === 'v') { e.preventDefault(); st.paste(); return }
      if (mod && k === 'a') { e.preventDefault(); A.selectAll(); return }
      if (mod && e.shiftKey && k === 'h') { e.preventDefault(); A.toggle('hidden'); return }
      if (mod && e.shiftKey && k === 'l') { e.preventDefault(); A.toggle('locked'); return }
      if (mod && (e.code === 'BracketRight' || e.code === 'BracketLeft')) {
        e.preventDefault()
        const fwd = e.code === 'BracketRight'
        st.reorder(sel, e.altKey ? (fwd ? 'front' : 'back') : fwd ? 'forward' : 'backward')
        return
      }
      if (mod && e.key === '0') { e.preventDefault(); zoomAt(1 / viewRef.current.zoom); return }
      if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoomAt(1.25); return }
      if (mod && e.key === '-') { e.preventDefault(); zoomAt(0.8); return }
      if (mod) return
      if (e.shiftKey && e.code === 'Digit1') { fitted.current = true; fit(); return }
      if (e.shiftKey && e.code === 'Digit2') { zoomSel(); return }
      if (e.shiftKey && e.code === 'KeyA') { e.preventDefault(); A.wrapSelection('stack'); return }
      if (e.shiftKey && e.code === 'KeyG') { e.preventDefault(); A.wrapSelection('grid'); return }
      if (e.key === '?') { setHelp((v) => !v); return }
      if (k === 'backspace' || k === 'delete') { st.deleteNodes(sel); return }
      if (k === 'tab') { e.preventDefault(); A.selectSibling(e.shiftKey ? -1 : 1); return }
      if (k === 'escape') {
        if (pen) finishPen(false)
        else if (menu || help) { setMenu(null); setHelp(false) }
        else if (st.tool !== 'select') st.setTool('select')
        else A.selectParent()
        return
      }
      if (k === 'enter') {
        e.preventDefault()
        if (pen) { finishPen(false); return }
        if (e.shiftKey) { A.selectParent(); return }
        if (one?.type === 'text' && sel.length === 1) { st.setEditingText(one.id); return }
        A.selectChildren()
        return
      }
      if (k.startsWith('arrow') && sel.length) {
        e.preventDefault()
        if (A.moveInFlow(k.slice(5) as 'left' | 'right' | 'up' | 'down')) return
        const d = e.shiftKey ? 10 : 1
        st.checkpoint()
        st.updateNodes(sel, (n) => ({
          x: n.x + (k === 'arrowleft' ? -d : k === 'arrowright' ? d : 0),
          y: n.y + (k === 'arrowup' ? -d : k === 'arrowdown' ? d : 0),
        }))
        return
      }
      const keys: Record<string, CanvasTool> = { v: 'select', f: 'frame', s: 'stack', g: 'grid', t: 'text', r: 'rect', o: 'ellipse', p: 'pen', h: 'hand' }
      if (keys[k] && !e.shiftKey && !e.altKey) { if (pen) finishPen(false); st.setTool(keys[k]) }
    }
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') setSpace(false) }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  })

  // Inserted layers land inside the selected frame (or next to the selected layer), otherwise in the middle of the artboard.
  const insert = (n: SNode) => {
    const st = s()
    const sel = map.get(st.selection[0])
    const parent = sel?.type === 'frame' ? sel : sel ? map.get(sel.parentId!) : undefined
    const pb = boxOf(parent?.id)
    n.parentId = parent?.id
    n.x = Math.round((pb.w - n.w) / 2)
    n.y = Math.round((pb.h - n.h) / 2)
    st.addNodes([n])
    setMenu(null)
  }
  const addPreset = (p: Preset) => {
    const fill = String(settings.fill || '#d9d9d9')
    const base: Partial<SNode> = { name: p.name, w: 160, h: p.line ? 40 : 160 }
    insert(p.kind === 'path'
      ? newNode('path', { ...base, d: p.d, fill: p.line ? 'none' : fill, stroke: p.line ? '#111111' : 'none', strokeWidth: p.line ? 2 : 0 })
      : newNode(p.kind, { ...base, fill, radius: p.radius || 0 }))
  }
  const comps = project.pages.filter((p) => p.kind === 'component')
  const blocked = isComp ? cyclicFor(project.pages, page.id) : new Set<string>()

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    const p = toWorld(e.clientX, e.clientY)
    const container = hitDeepest(e.clientX, e.clientY, undefined, true)
    const place = (id: string, w = 400, h = 300) => {
      const k = Math.min(1, 480 / w)
      const cb = container ? boxOf(container) : { x: 0, y: 0 }
      s().addNodes([newNode('image', { assetId: id, parentId: container, x: Math.round(p.x - cb.x), y: Math.round(p.y - cb.y), w: Math.round(w * k), h: Math.round(h * k), name: 'Image' })])
    }
    const assetId = e.dataTransfer.getData('application/x-sites-asset')
    if (assetId) {
      const a = project.assets.find((x) => x.id === assetId)
      if (a) place(a.id, a.w, a.h)
      return
    }
    for (const f of Array.from(e.dataTransfer.files)) {
      const a = await fileToAsset(f)
      if (!a || a.kind !== 'image') continue
      s().addAsset(a)
      place(a.id, a.w, a.h)
      toast(`Added ${a.name}`)
    }
  }

  const editing = page.nodes.find((n) => n.id === editingTextId)
  const Z = view.zoom
  const sx = (x: number) => view.x + (ox + x) * Z
  const sy = (y: number) => view.y + y * Z
  const toS = (b: Box) => ({ x: sx(b.x), y: sy(b.y), width: b.w * Z, height: b.h * Z })
  // Dots every 8, 16, 32… canvas pixels, whichever lands between 16 and 32 screen pixels apart.
  const dotStep = (() => { let st = 8; while (st * Z < 16) st *= 2; while (st * Z > 32 && st > 1) st /= 2; return st * Z })()
  const selNodes = selection.map((id) => map.get(id)).filter((n): n is SNode => !!n)
  const selBoxes = selNodes.map((n) => boxes.get(n.id)).filter((b): b is Box => !!b)
  const bb = union(selBoxes)
  const one = selNodes.length === 1 ? selNodes[0] : undefined
  const parentOfOne = one?.parentId ? map.get(one.parentId) : undefined
  const hoverNode = hover && !selection.includes(hover) ? map.get(hover) : undefined
  const cursorStyle = space || tool === 'hand' ? (act.current?.mode === 'pan' ? 'grabbing' : 'grab') : tool === 'select' ? 'default' : tool === 'text' ? 'text' : 'crosshair'
  const selPath = one?.type === 'path' ? one : undefined

  // Padding and gaps of a selected stack or grid, drawn as hatched bands.
  const spacing = (() => {
    if (!one || !A.isFlow(one) || !bb) return null
    const pad = one.pad || 0
    const inner = { x: bb.x + pad, y: bb.y + pad, w: bb.w - pad * 2, h: bb.h - pad * 2 }
    const kids = childrenOf(page.nodes, one.id).filter((n) => !n.hidden).map((n) => boxes.get(n.id)).filter((b): b is Box => !!b)
    const gaps: Box[] = []
    if (one.layout === 'stack' && (one.gap || 0) > 0 && !one.wrap) {
      for (let i = 0; i + 1 < kids.length; i++) {
        const a = kids[i]
        const b = kids[i + 1]
        if (one.dir === 'row') gaps.push({ x: a.x + a.w, y: inner.y, w: b.x - a.x - a.w, h: inner.h })
        else gaps.push({ x: inner.x, y: a.y + a.h, w: inner.w, h: b.y - a.y - a.h })
      }
    }
    const o = toS(bb)
    const i2 = toS(inner)
    const padPath = pad > 0 ? `M${o.x} ${o.y}h${o.width}v${o.height}h${-o.width}Z M${i2.x} ${i2.y}v${i2.height}h${i2.width}v${-i2.height}Z` : ''
    return { padPath, gaps }
  })()

  // Measurements: live while moving or resizing in a free frame, or on demand with ⌥ held.
  const a0 = act.current
  const moving = a0?.mode === 'move' && a0.started && a0.live
  const resizing = a0?.mode === 'resize' && a0.started
  const boxOrPage = (id?: string) => (id ? boxes.get(id) : { x: 0, y: 0, w: page.width, h: page.height })
  const selParent = selNodes[0]?.parentId
  let measures: Measure[] = []
  let measureTarget: Box | undefined
  if (bb && !editingTextId && !ghost && tool === 'select' && selNodes.every((m) => m.parentId === selParent)) {
    if ((moving || resizing) && !A.isFlow(map.get(selParent!))) {
      const others = childrenOf(page.nodes, selParent).filter((m) => !selection.includes(m.id) && !m.hidden).map((m) => boxes.get(m.id)).filter((b): b is Box => !!b)
      const pb = boxOrPage(selParent)
      if (pb) measures = nearestMeasure(bb, others, pb)
    } else if (alt && !a0) {
      measureTarget = hoverNode ? boxes.get(hoverNode.id) : boxOrPage(selParent)
      if (measureTarget) measures = pairMeasure(bb, measureTarget)
    }
  }
  const siblings = one && A.isFlow(parentOfOne) && !ghost ? childrenOf(page.nodes, parentOfOne!.id).filter((m) => m.id !== one.id && !m.hidden).map((m) => boxes.get(m.id)).filter((b): b is Box => !!b) : []
  const labels: { x: number; y: number; t: string; cls: string }[] = []
  measures.forEach((m) => { if (m.v >= 0.5) labels.push({ x: (sx(m.x1) + sx(m.x2)) / 2, y: (sy(m.y1) + sy(m.y2)) / 2, t: String(Math.round(m.v)), cls: '' }) })
  if (spacing && one && !a0) {
    spacing.gaps.forEach((g) => { if (Math.min(g.w, g.h) * Z >= 10) labels.push({ x: sx(g.x + g.w / 2), y: sy(g.y + g.h / 2), t: String(one.gap || 0), cls: 'gap' }) })
    if ((one.pad || 0) * Z >= 12 && bb) labels.push({ x: sx(bb.x + bb.w / 2), y: sy(bb.y + (one.pad || 0) / 2), t: String(one.pad), cls: 'gap soft' })
  }

  const modeLabel = (n: SNode, axis: 'w' | 'h') => {
    const m = axis === 'w' ? n.wMode : n.hMode
    return m === 'fill' ? 'Fill' : m === 'fit' ? 'Fit' : ''
  }

  const hints: [string, string][] = !one
    ? selNodes.length > 1 ? [['⇧A', 'Stack'], ['⌘⏎', 'Frame'], ['⌥⌘K', 'Component']] : [['F', 'Frame'], ['S', 'Stack'], ['T', 'Text'], ['⌘K', 'Commands']]
    : one.type === 'instance' ? [['Double-click', 'Edit component'], ['⌥⌘B', 'Detach'], ['⇧⏎', 'Parent']]
    : A.isFlow(parentOfOne) ? [['Drag / ←→', 'Reorder'], ['⇧⏎', `Select ${parentOfOne!.layout}`], ['⌥⌘K', 'Component']]
    : one.type === 'frame' ? [['⏎', 'Children'], [one.layout === 'stack' ? '⇧G' : '⇧A', one.layout === 'stack' ? 'Wrap in grid' : 'Wrap in stack'], ['⌥⌘K', 'Component']]
    : one.type === 'text' ? [['⏎', 'Edit text'], ['⇧A', 'Stack'], ['⌘D', 'Duplicate']]
    : [['⇧A', 'Stack'], ['⌘⏎', 'Frame'], ['⌘D', 'Duplicate']]
  if (one) hints.push(['⌥', 'Measure'])

  return (
    <div className={`cv ${settings.theme === 'dark' ? 'cv-dark' : settings.theme === 'light' ? 'cv-light' : ''}`}>
      <div className="cv-bar">
        <div className="cv-tools">
          {TOOL_BUTTONS.map((t) => (
            <button key={t.id} className={`cv-tool ${tool === t.id ? 'on' : ''}`} title={`${t.label} (${t.key})`} onClick={() => { if (pen) finishPen(false); s().setTool(t.id) }}>
              <Icon k={t.id} /><span className="cv-tool-l">{t.label}</span>
            </button>
          ))}
          <button className={`cv-tool ${menu === 'shapes' || ['rect', 'ellipse', 'pen'].includes(tool) ? 'on' : ''}`} onClick={() => setMenu(menu === 'shapes' ? null : 'shapes')} title="Shapes and pen">
            <Icon k="shapes" /><span className="cv-tool-l">Shapes</span>
          </button>
          <button className={`cv-tool ${menu === 'components' ? 'on' : ''}`} onClick={() => setMenu(menu === 'components' ? null : 'components')} title="Insert a component">
            <Icon k="components" /><span className="cv-tool-l">Components</span>
          </button>
          <button className={`cv-tool ${tool === 'hand' ? 'on' : ''}`} onClick={() => s().setTool('hand')} title="Hand (H)"><Icon k="hand" /><span className="cv-tool-l">Hand</span></button>
        </div>
        {boards.length > 1 && (
          <div className="cv-views">
            <Seg size="sm" undo={false} value={active} options={boards.map((b) => [b.bp, b.label, `Edit the ${b.label.toLowerCase()} view`] as [Breakpoint, string, string])}
              onChange={(v) => s().setBreakpoint(v)} />
          </div>
        )}
        <div className="row" style={{ gap: 6 }}>
          <div className="cv-tools">
          <button className="cv-tool cv-round" onClick={() => zoomAt(0.8)} title="Zoom out (⌘−)"><I.minus size={14} /></button>
          <button className="cv-tool mono cv-zoom" onClick={() => { fitted.current = true; fit() }} title="Zoom to fit (⇧1)">{Math.round(Z * 100)}%</button>
          <button className="cv-tool cv-round" onClick={() => zoomAt(1.25)} title="Zoom in (⌘+)"><I.plus size={14} /></button>
          <button className={`cv-tool cv-round ${help ? 'on' : ''}`} onClick={() => setHelp((v) => !v)} title="Shortcuts (?)">?</button>
        </div>
          {hasDark && (
            <div className="cv-tools">
              <button className="cv-tool cv-round" aria-pressed={scheme === 'dark'} onClick={() => s().setWindowSetting('canvas', 'scheme', scheme === 'dark' ? 'light' : 'dark')}
                title={scheme === 'dark' ? 'Showing dark mode colours. Show light' : 'Showing light mode colours. Show dark'}>
                {scheme === 'dark' ? <I.moon /> : <I.sun />}
              </button>
            </div>
          )}
          <button className="cv-tool cv-play" onClick={() => setPreview(true)} title="Preview (⌘P)">
            <I.play size={12} fill="currentColor" />
            <span className="cv-tool-l">Preview</span>
          </button>
        </div>
        {menu === 'shapes' && (
          <div className="cv-menu" onPointerDown={(e) => e.stopPropagation()}>
            <div className="cv-menu-row">
              {([['rect', 'Rectangle', 'R'], ['ellipse', 'Oval', 'O'], ['pen', 'Pen', 'P']] as const).map(([id, l, key]) => (
                <button key={id} className={`cv-menu-tool ${tool === id ? 'on' : ''}`} onClick={() => { s().setTool(id); setMenu(null) }}>{l} <kbd>{key}</kbd></button>
              ))}
            </div>
            <div className="cv-menu-label">Insert shape</div>
            <div className="cv-shape-grid">
              {PRESETS.map((p) => (
                <button key={p.name} className="cv-shape" onClick={() => addPreset(p)} title={`Insert ${p.name}`}>
                  <PresetIcon p={p} /><span>{p.name}</span>
                </button>
              ))}
            </div>
            {selPath && (
              <div className="cv-menu-row" style={{ marginTop: 8 }}>
                <button className="cv-menu-tool" onClick={() => { s().checkpoint(); s().updateNodes([selPath.id], { d: flipPath(selPath.d || '', 'x') }) }}>Flip <I.flipX size={14} /></button>
                <button className="cv-menu-tool" onClick={() => { s().checkpoint(); s().updateNodes([selPath.id], { d: flipPath(selPath.d || '', 'y') }) }}>Flip <I.flipY size={14} /></button>
              </div>
            )}
          </div>
        )}
        {menu === 'components' && (
          <div className="cv-menu" onPointerDown={(e) => e.stopPropagation()}>
            <div className="cv-menu-label">Insert component</div>
            {comps.length === 0 && <div className="cv-menu-empty">No components yet. Select layers and press <kbd>⌥⌘K</kbd>.</div>}
            {comps.map((c) => (
              <button key={c.id} className="cv-menu-item" disabled={blocked.has(c.id)} title={blocked.has(c.id) ? `${c.name} would contain itself` : `Insert ${c.name}`}
                onClick={() => insert(newNode('instance', { name: c.name, componentId: c.id, w: c.width, h: c.height }))}>
                <span className="cv-ico"><I.instance size={14} /></span><span className="grow">{c.name}</span><span className="cv-li-meta">{c.width}×{c.height}</span>
              </button>
            ))}
            <button className="cv-menu-item muted" onClick={() => { s().addComponent(`Component ${comps.length + 1}`); setMenu(null) }}>+ New empty component</button>
          </div>
        )}
      </div>
      <div className="cv-main">
        {settings.layers && <Layers />}
        <div
          ref={stageRef}
          className={`cv-stage ${isComp ? 'is-comp' : ''}`}
          style={{ cursor: cursorStyle }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={() => setHover(null)}
          onDoubleClick={onDoubleClick}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
        >
          <svg className="cv-dots" aria-hidden>
            <defs>
              <pattern id="cv-dot" width={dotStep} height={dotStep} patternUnits="userSpaceOnUse" x={view.x % dotStep} y={view.y % dotStep}>
                <circle cx={0.75} cy={0.75} r={0.75} />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#cv-dot)" />
          </svg>
          <div className="cv-world" ref={worldRef} style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${Z})` }}>
            {boards.map((b) => {
              const on = b.bp === active
              const pg = on ? page : resolvePage(raw, b.bp)
              return (
                <div key={b.bp}>
                  <div className={`cv-artboard-label ${on ? 'on' : ''}`} style={{ left: b.x, maxWidth: b.w, fontSize: 11 / Z, top: -24 / Z }}
                    onPointerDown={(e) => { e.stopPropagation(); if (!on) s().setBreakpoint(b.bp) }}>
                    {isComp ? <><b className="cv-comp-mark">Component ·</b>{page.name}</> : <b>{b.label}</b>}
                    <span>{isComp ? `${b.w} × ${b.h}` : b.max ? `${b.min}–${b.max}` : boards.length > 1 ? `${b.min}+` : `${b.w}`}</span>
                  </div>
                  <div ref={on ? artRef : undefined} data-bp={b.bp}
                    className={`cv-artboard ${page.background === 'transparent' ? 'checker' : ''} ${on ? 'on' : ''}`}
                    style={{ position: 'absolute', left: b.x, top: 0, width: b.w, height: b.h, background: page.background === 'transparent' ? undefined : resolveColor(page.background, colors, scheme) }}>
                    <PageContent page={pg} pages={project.pages} assets={project.assets} cms={project.cms} colors={colors} scheme={scheme} editingId={on ? editingTextId : null} interactive />
                    {on && editing && boxes.get(editing.id) && <TextEditor node={editing} box={boxes.get(editing.id)!} />}
                  </div>
                  {on && settings.grid && Z >= 4 && <div className="cv-pixelgrid" style={{ left: b.x, width: b.w, height: b.h, backgroundSize: '1px 1px' }} />}
                </div>
              )
            })}
          </div>
          <svg className="cv-overlay">
            <defs>
              <pattern id="cv-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="6" height="6" className="ov-hatch-bg" /><line x1="0" y1="0" x2="0" y2="6" className="ov-hatch-line" />
              </pattern>
            </defs>
            {parentOfOne && boxes.get(parentOfOne.id) && <rect {...toS(boxes.get(parentOfOne.id)!)} className="ov-parent" />}
            {siblings.map((b, i) => <rect key={'sib' + i} {...toS(b)} className="ov-sibling" />)}
            {hoverNode && boxes.get(hoverNode.id) && <rect {...toS(boxes.get(hoverNode.id)!)} className="ov-hover" />}
            {spacing?.padPath && <path d={spacing.padPath} className="ov-space" fillRule="evenodd" />}
            {spacing?.gaps.map((g, i) => <rect key={i} {...toS(g)} className="ov-space" />)}
            {selBoxes.length > 1 && selBoxes.map((b, i) => <rect key={i} {...toS(b)} className="ov-hover" />)}
            {bb && !editingTextId && !ghost && <rect {...toS(bb)} className="ov-sel" />}
            {dropTarget !== undefined && <rect {...toS(boxOf(dropTarget))} className="ov-drop" />}
            {ghost && <rect {...toS(ghost)} className="ov-ghost" />}
            {insertLine && (
              <>
                <line x1={sx(insertLine.x1)} y1={sy(insertLine.y1)} x2={sx(insertLine.x2)} y2={sy(insertLine.y2)} className="ov-insert" />
                <circle cx={sx(insertLine.x1)} cy={sy(insertLine.y1)} r={3.5} className="ov-insert-cap" />
                <circle cx={sx(insertLine.x2)} cy={sy(insertLine.y2)} r={3.5} className="ov-insert-cap" />
              </>
            )}
            {drawBox && <rect {...toS(drawBox)} className="ov-draw" />}
            {guides.map((g, i) => {
              // A snapped edge: a red line with a small cross at each end, where the two edges meet.
              const [x1, y1, x2, y2] = g.axis === 'x' ? [sx(g.at), sy(g.from), sx(g.at), sy(g.to)] : [sx(g.from), sy(g.at), sx(g.to), sy(g.at)]
              const X = (x: number, y: number) => `M${x - 3} ${y - 3}l6 6M${x + 3} ${y - 3}l-6 6`
              return <g key={'g' + i}><line x1={x1} y1={y1} x2={x2} y2={y2} className="ov-guide" /><path d={X(x1, y1) + X(x2, y2)} className="ov-snap" /></g>
            })}
            {measureTarget && <rect {...toS(measureTarget)} className="ov-target" />}
            {measures.map((m, i) => {
              const [x1, y1, x2, y2] = [sx(m.x1), sy(m.y1), sx(m.x2), sy(m.y2)]
              const horiz = Math.abs(y1 - y2) < 0.01
              const cap = (x: number, y: number) => (horiz ? `M${x} ${y - 4}v8` : `M${x - 4} ${y}h8`)
              return (
                <g key={'m' + i}>
                  <line x1={x1} y1={y1} x2={x2} y2={y2} className="ov-measure" />
                  <path d={cap(x1, y1) + cap(x2, y2)} className="ov-measure-cap" />
                  {m.ext?.map((e, j) => <line key={j} x1={sx(e.x1)} y1={sy(e.y1)} x2={sx(e.x2)} y2={sy(e.y2)} className="ov-measure-ext" />)}
                </g>
              )
            })}
            {marquee && <rect {...toS(marquee)} className="ov-marquee" />}
            {pen && (
              <>
                <polyline className="ov-pen" points={[...pen, ...(cursor ? [cursor] : [])].map((p) => `${sx(p.x)},${sy(p.y)}`).join(' ')} />
                {pen.map((p, i) => <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={i === 0 ? 5 : 3.5} className="ov-pt" />)}
              </>
            )}
          </svg>
          {!isComp && tool === 'select' && boards.map((b) => {
            // Grips on each view's right and bottom edges set its width and height.
            const bh = Math.max(b.h, grown[b.bp] || 0)
            const X = view.x + (b.x + b.w) * Z
            const Y = view.y + bh * Z
            const start = (axis: 'w' | 'h') => (e: React.PointerEvent) => {
              e.stopPropagation()
              stageRef.current!.setPointerCapture(e.pointerId)
              s().checkpoint()
              act.current = { mode: 'board', bp: b.bp, axis, w0: b.w, h0: b.h, sx: e.clientX, sy: e.clientY }
            }
            return (
              <div key={'grip' + b.bp}>
                <div className="cv-grip v" title={`${b.label} width`} style={{ left: X + 6, top: view.y + (bh * Z) / 2 - 16 }} onPointerDown={start('w')} />
                <div className="cv-grip h" title={`${b.label} height`} style={{ left: view.x + (b.x + b.w / 2) * Z - 16, top: Y + 6 }} onPointerDown={start('h')} />
              </div>
            )
          })}
          {parentOfOne && boxes.get(parentOfOne.id) && !ghost && (
            <div className="cv-badge ghosted" style={{ left: sx(boxes.get(parentOfOne.id)!.x), top: sy(boxes.get(parentOfOne.id)!.y) - 20 }}>
              {parentOfOne.name}{A.isFlow(parentOfOne) && <em>{childrenOf(page.nodes, parentOfOne.id).findIndex((n) => n.id === one!.id) + 1}/{childrenOf(page.nodes, parentOfOne.id).length}</em>}
            </div>
          )}
          {one && bb && !editingTextId && !ghost && (one.type === 'frame' || one.type === 'instance') && (
            <div className={`cv-badge ${one.type === 'instance' ? 'is-inst' : ''}`} style={{ left: sx(bb.x), top: sy(bb.y) - 20 }}>
              {one.type === 'instance' && <I.instance size={12} />}{one.name}
              {one.layout === 'stack' && <em>{DIR_GLYPH[one.dir || 'column']} {one.gap || 0}</em>}
              {one.layout === 'grid' && <em>{one.cols || 2} col · {one.gap || 0}</em>}
            </div>
          )}
          {hoverNode && boxes.get(hoverNode.id) && !a0 && !alt && hoverNode.id !== parentOfOne?.id && (
            <div className="cv-badge hovered" style={{ left: sx(boxes.get(hoverNode.id)!.x), top: sy(boxes.get(hoverNode.id)!.y) - 20 }}>{hoverNode.name}</div>
          )}
          {ghost && dropTarget !== undefined && (() => {
            const b = boxOf(dropTarget)
            const t = dropTarget ? map.get(dropTarget) : undefined
            return <div className="cv-badge drop" style={{ left: sx(b.x), top: sy(b.y) - 24 }}>Into {t ? t.name : page.name}</div>
          })()}
          {labels.map((l, i) => <div key={'l' + i} className={`cv-num ${l.cls}`} style={{ left: l.x, top: l.y }}>{l.t}</div>)}
          {bb && !editingTextId && tool === 'select' && !ghost && (
            <>
              {HANDLES.map((h) => {
                const r = toS(bb)
                const x = r.x + (h.includes('w') ? 0 : h.includes('e') ? r.width : r.width / 2)
                const y = r.y + (h.includes('n') ? 0 : h.includes('s') ? r.height : r.height / 2)
                const [w, hh] = h === 'n' || h === 's' ? [14, 7] : h === 'e' || h === 'w' ? [7, 14] : [9, 9]
                return <div key={h} className={`cv-handle h-${h}`} style={{ left: x - w / 2, top: y - hh / 2 }} onPointerDown={(e) => startResize(e, h)} />
              })}
              {!moving && <div className="cv-size mono" style={{ left: toS(bb).x + toS(bb).width / 2, top: toS(bb).y + toS(bb).height + 8 }}>
                {Math.round(bb.w)}{one && modeLabel(one, 'w') ? <i> {modeLabel(one, 'w')}</i> : ''} × {Math.round(bb.h)}{one && modeLabel(one, 'h') ? <i> {modeLabel(one, 'h')}</i> : ''}
              </div>}
            </>
          )}
          {isComp && lastPage.current !== page.id && (
            <button className="cv-back" onPointerDown={(e) => e.stopPropagation()} onClick={() => { const back = project.pages.find((p) => p.id === lastPage.current) || project.pages.find((p) => p.kind !== 'component'); if (back) s().setActivePage(back.id) }}>
              ← Back to {(project.pages.find((p) => p.id === lastPage.current) || project.pages.find((p) => p.kind !== 'component'))?.name}
            </button>
          )}
          {pen ? <div className="cv-hint">Click to add points · click the first point to close · ⏎ to finish</div> : (
            <div className="cv-hints" onPointerDown={(e) => e.stopPropagation()}>
              {hints.map(([k, v]) => <span key={k + v}><kbd>{k}</kbd>{v}</span>)}
            </div>
          )}
          {help && <ShortcutSheet onClose={() => setHelp(false)} />}
        </div>
        {settings.inspector && <Inspector />}
      </div>
      {preview && <Preview onClose={() => setPreview(false)} />}
    </div>
  )
}

function TextEditor({ node, box }: { node: SNode; box: Box }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const started = useRef(false)
  const grow = () => { const el = ref.current; if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' } }
  useEffect(() => {
    const el = ref.current!
    el.focus()
    el.select()
    grow()
  }, [])
  useEffect(grow, [box.w])
  const commit = () => {
    const st = useStore.getState()
    if (!ref.current?.value.trim()) st.deleteNodes([node.id])
    st.setEditingText(null)
  }
  const style = nodeStyle(node)
  return (
    <textarea
      ref={ref}
      className="cv-text-edit"
      style={{ ...style, position: 'absolute', left: box.x, top: box.y, width: Math.max(box.w, 24), height: 'auto', minHeight: box.h, transform: undefined, visibility: 'visible', zIndex: 5 }}
      defaultValue={node.text}
      onPointerDown={(e) => e.stopPropagation()}
      onInput={(e) => {
        const st = useStore.getState()
        if (!started.current) { started.current = true; st.checkpoint() }
        const el = e.currentTarget
        grow()
        st.updateNodes([node.id], node.hMode === 'fit' ? { text: el.value } : { text: el.value, h: Math.max(el.scrollHeight, Math.round((node.fontSize || 16) * (node.lineHeight || 1.2))) })
      }}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); commit() } }}
    />
  )
}

function ShortcutSheet({ onClose }: { onClose: () => void }) {
  const groups = [...new Set(SHORTCUTS.map((s) => s[0]))]
  return (
    <div className="cv-help" onPointerDown={(e) => e.stopPropagation()}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
        <b className="cv-help-title">Shortcuts</b>
        <button className="win-btn" onClick={onClose} title="Close"><I.close /></button>
      </div>
      {groups.map((g) => (
        <div key={g} className="cv-help-group">
          <div className="cv-help-head">{g}</div>
          {SHORTCUTS.filter((s) => s[0] === g).map(([, k, v]) => (
            <div key={k + v} className="cv-help-row"><span>{v}</span><kbd>{k}</kbd></div>
          ))}
        </div>
      ))}
    </div>
  )
}
