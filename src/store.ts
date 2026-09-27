import { create } from 'zustand'
import type { Asset, Breakpoint, CodeFile, Collection, ColorStyle, Page, TextStyle, Project, SNode, ToolId, View, WinState } from './types'
import { applyInView, clearView, defaultViews, dropFittedChanges, effective, resolvePage, viewBase } from './views'
import { dbGet, dbSet } from './db'
import { seedProjects } from './seed'
import { TEMPLATES, fromTemplate } from './cms'
import { styleUid, textPatch } from './theme'
import { childrenOf, cloneSubtrees, descendantIds, moveInto, topmost } from './tree'

export const uid = (p = '') => p + Math.random().toString(36).slice(2, 9)

// Moves a layer by d in every view, including positions a view has changed.
const shift = (n: SNode, d: number): SNode => {
  const bp = n.bp && Object.fromEntries(Object.entries(n.bp).map(([k, o]) => [k, o && {
    ...o, ...(o.x !== undefined ? { x: o.x + d } : {}), ...(o.y !== undefined ? { y: o.y + d } : {}),
  }]))
  return { ...n, x: n.x + d, y: n.y + d, ...(bp ? { bp } : {}) }
}

// Every colour a page holds, including tablet and phone changes and hover colours.
export function mapPageColors(pg: Page, f: (c: string) => string): Page {
  const one = (n: Partial<SNode>): Partial<SNode> => {
    const o: Partial<SNode> = { ...n }
    if (o.fill) o.fill = f(o.fill)
    if (o.stroke) o.stroke = f(o.stroke)
    if (o.color) o.color = f(o.color)
    if (o.shadow) o.shadow = { ...o.shadow, color: f(o.shadow.color) }
    if (o.hover?.fill || o.hover?.color) o.hover = { ...o.hover, ...(o.hover.fill ? { fill: f(o.hover.fill) } : {}), ...(o.hover.color ? { color: f(o.hover.color) } : {}) }
    if (o.props) o.props = Object.fromEntries(Object.entries(o.props).map(([k, v]) => [k, typeof v === 'string' && v.startsWith('$') ? f(v) : v]))
    return o
  }
  return {
    ...pg,
    background: f(pg.background),
    nodes: pg.nodes.map((n) => ({ ...(one(n) as SNode), ...(n.bp ? { bp: { tablet: n.bp.tablet && one(n.bp.tablet), phone: n.bp.phone && one(n.bp.phone) } } : {}) })),
    vars: pg.vars?.map((v) => (v.type === 'color' && typeof v.value === 'string' ? { ...v, value: f(v.value) } : v)),
  }
}

export type CanvasTool = 'select' | 'frame' | 'stack' | 'grid' | 'text' | 'rect' | 'ellipse' | 'pen' | 'hand'

type Snapshot = { pages: Page[]; files: CodeFile[]; cms?: Collection[]; styles?: Project['styles'] }

interface State {
  loaded: boolean
  projects: Project[]
  currentId: string | null
  selection: string[]
  tool: CanvasTool
  breakpoint: Breakpoint
  editingTextId: string | null
  clipboard: SNode[]
  past: Snapshot[]
  future: Snapshot[]

  load: () => Promise<void>
  createProject: (name?: string) => string
  deleteProject: (id: string) => void
  duplicateProject: (id: string) => void
  openProject: (id: string | null) => void
  updateProject: (fn: (p: Project) => Project) => void

  checkpoint: () => void
  undo: () => void
  redo: () => void

  setActivePage: (id: string) => void
  addPage: (name: string) => void
  updatePage: (id: string, patch: Partial<Page>) => void
  deletePage: (id: string) => void

  addNodes: (nodes: SNode[], select?: boolean) => void
  updateNodes: (ids: string[], patch: Partial<SNode> | ((n: SNode) => Partial<SNode>)) => void
  updateNodesIn: (bp: Breakpoint, ids: string[], patch: Partial<SNode> | ((n: SNode) => Partial<SNode>), loose?: boolean) => void
  resetViews: (ids: string[]) => void
  deleteNodes: (ids: string[]) => void
  reorder: (ids: string[], dir: 'forward' | 'backward' | 'front' | 'back') => void
  moveNodes: (ids: string[], parentId: string | undefined, index: number, patch?: (n: SNode) => Partial<SNode>) => void
  wrap: (ids: string[], layout: 'free' | 'stack' | 'grid') => string | undefined
  unwrap: (id: string) => void
  createComponent: (ids: string[]) => void
  addComponent: (name: string) => void
  detach: (id: string) => void
  setSelection: (ids: string[]) => void
  setBreakpoint: (bp: Breakpoint) => void
  updateView: (pageId: string, bp: 'tablet' | 'phone', v: Partial<View> | null) => void
  fitView: (bp: 'tablet' | 'phone') => void
  resetView: (ids: string[]) => void
  setTool: (t: CanvasTool) => void
  setEditingText: (id: string | null) => void
  copy: () => void
  paste: () => void
  duplicate: (offset?: number) => string[]

  addAsset: (a: Asset) => void
  deleteAsset: (id: string) => void
  addFile: (path: string, content?: string) => string
  updateFile: (id: string, patch: Partial<CodeFile>) => void
  deleteFile: (id: string) => void

  addCollection: (template?: string) => string
  updateCollection: (id: string, fn: (c: Collection) => Collection, undoable?: boolean) => void
  deleteCollection: (id: string) => void

  addColorStyle: (s: Omit<ColorStyle, 'id'>) => string
  updateColorStyle: (id: string, patch: Partial<ColorStyle>) => void
  deleteColorStyle: (id: string) => void
  addTextStyle: (s: Omit<TextStyle, 'id'>) => string
  updateTextStyle: (id: string, patch: Partial<TextStyle>) => void
  deleteTextStyle: (id: string) => void

  toggleWindow: (t: ToolId, open?: boolean) => void
  focusWindow: (t: ToolId) => void
  setWindow: (t: ToolId, patch: Partial<WinState>) => void
  setWindowSetting: (t: ToolId, key: string, value: string | number | boolean) => void
  tileWindows: (b: { w: number; h: number }) => void
}

export const defaultWindows = (): Record<ToolId, WinState> => ({
  canvas: { open: true, x: 600, y: 24, w: 860, h: 600, z: 2, settings: { grid: true, snap: true, layers: true, inspector: true, theme: 'auto', fill: '#d9d9d9' } },
  code: { open: true, x: 24, y: 24, w: 560, h: 600, z: 1, settings: { fontSize: 13, theme: 'graphite', lineNumbers: true, wrap: true, wrapDefault: true, mode: 'auto' } },
  media: { open: false, x: 160, y: 100, w: 420, h: 480, z: 0, settings: { columns: 3 } },
  cms: { open: false, x: 120, y: 60, w: 860, h: 560, z: 0, settings: {} },
  settings: { open: false, x: 200, y: 60, w: 460, h: 560, z: 0, settings: {} },
})

export const newPage = (name: string, path: string): Page => ({
  id: uid('pg_'), name, path, width: 1200, height: 900, background: '#ffffff', nodes: [], views: defaultViews(900),
})

export const newNode = (type: SNode['type'], over: Partial<SNode> = {}): SNode => ({
  id: uid('n_'),
  type,
  name: { frame: 'Frame', text: 'Text', rect: 'Rectangle', ellipse: 'Oval', image: 'Image', path: 'Path', instance: 'Instance' }[type],
  x: 0, y: 0, w: 100, h: 100, rotation: 0, opacity: 1,
  fill: type === 'frame' ? '#f2f2f2' : type === 'text' ? 'transparent' : '#d9d9d9',
  stroke: 'none', strokeWidth: 0, radius: 0,
  ...(type === 'text' ? { text: 'Text', fontSize: 24, fontWeight: 400, lineHeight: 1.2, letterSpacing: 0, color: '#111111', textAlign: 'left' as const, hMode: 'fit' as const } : {}),
  ...(type === 'instance' ? { fill: 'transparent' } : {}),
  ...over,
})

const ls = {
  get: (k: string) => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k: string, v: string | null) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v) } catch { /* storage blocked */ } },
}

const cur = (s: State) => s.projects.find((p) => p.id === s.currentId) || null

let saveTimer: number | undefined
const scheduleSave = (projects: Project[]) => {
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    dbSet('projects', projects).catch((e) => console.warn('Sites: save failed', e))
  }, 300)
}

export const useStore = create<State>((set, get) => {
  // Apply a change to the open project and persist it.
  const mutate = (fn: (p: Project) => Project) => {
    const s = get()
    const p = cur(s)
    if (!p) return
    const next = { ...fn(p), updatedAt: Date.now() }
    const projects = s.projects.map((x) => (x.id === p.id ? next : x))
    set({ projects })
    scheduleSave(projects)
  }
  const mutatePage = (fn: (pg: Page) => Page) =>
    mutate((p) => ({ ...p, pages: p.pages.map((pg) => (pg.id === p.activePageId ? fn(pg) : pg)) }))
  const activeNodes = () => {
    const p = cur(get())
    return p?.pages.find((pg) => pg.id === p.activePageId)?.nodes || []
  }

  return {
    loaded: false,
    projects: [],
    currentId: null,
    selection: [],
    tool: 'select',
    breakpoint: 'desktop',
    editingTextId: null,
    clipboard: [],
    past: [],
    future: [],

    load: async () => {
      let projects = (await dbGet<Project[]>('projects').catch(() => undefined)) || []
      if (!projects.length) projects = seedProjects()
      projects = projects.map((p) => {
        const windows = { ...defaultWindows(), ...p.windows }
        // Canvas theme used to default to 'light'; it now follows the app theme.
        // Code now wraps by default; switch it on once for projects made before that.
        if (!windows.code.settings.wrapDefault) windows.code = { ...windows.code, settings: { ...windows.code.settings, wrap: true, wrapDefault: true } }
        if (windows.canvas.settings.theme === 'light') windows.canvas = { ...windows.canvas, settings: { ...windows.canvas.settings, theme: 'auto' } }
        delete (windows as Record<string, unknown>).shapes
        // Text alignment used to be stored as `align`; `align` now means cross-axis alignment in stacks.
        // Pages made before views existed get tablet and phone views once.
        // Views now fit themselves; values an earlier one-off fit stored are dropped so layers follow desktop.
        const pages = p.pages.map((pg) => {
          const out: Page = {
            ...pg,
            ...(pg.kind !== 'component' && !('views' in pg) ? { views: defaultViews(pg.height) } : {}),
            nodes: pg.nodes.map((n) => (n.type === 'text' && !n.textAlign && ['left', 'center', 'right'].includes(n.align as string)
              ? { ...n, textAlign: n.align as unknown as SNode['textAlign'], align: undefined } : n)),
          }
          return out.views && !p.settings.viewsAuto ? dropFittedChanges(out) : out
        })
        p = { ...p, settings: { ...p.settings, viewsFitted: true, viewsAuto: true } }
        return { ...p, pages, windows }
      })
      set({ projects, loaded: true })
      const last = ls.get('sites:current')
      if (last && projects.some((p) => p.id === last)) set({ currentId: last })
    },

    createProject: (name = 'Untitled') => {
      const home = newPage('Home', '/')
      const p: Project = {
        id: uid('p_'), name, description: '', createdAt: Date.now(), updatedAt: Date.now(),
        pages: [home], files: [], assets: [],
        settings: { siteTitle: name, font: 'ABC Areal', accent: '#111111', repo: '', viewsFitted: true, viewsAuto: true },
        windows: defaultWindows(), activePageId: home.id,
      }
      const projects = [p, ...get().projects]
      set({ projects })
      scheduleSave(projects)
      return p.id
    },
    deleteProject: (id) => {
      const projects = get().projects.filter((p) => p.id !== id)
      set({ projects, currentId: get().currentId === id ? null : get().currentId })
      scheduleSave(projects)
    },
    duplicateProject: (id) => {
      const src = get().projects.find((p) => p.id === id)
      if (!src) return
      const copy: Project = { ...structuredClone(src), id: uid('p_'), name: src.name + ' copy', createdAt: Date.now(), updatedAt: Date.now() }
      const projects = [copy, ...get().projects]
      set({ projects })
      scheduleSave(projects)
    },
    openProject: (id) => {
      ls.set('sites:current', id)
      set({ currentId: id, selection: [], past: [], future: [], tool: 'select', editingTextId: null })
    },
    updateProject: (fn) => mutate(fn),

    checkpoint: () => {
      const p = cur(get())
      if (!p) return
      set({ past: [...get().past.slice(-99), { pages: p.pages, files: p.files, cms: p.cms || [], styles: p.styles || { colors: [], text: [] } }], future: [] })
    },
    undo: () => {
      const { past, future } = get()
      const p = cur(get())
      if (!p || !past.length) return
      const prev = past[past.length - 1]
      set({ past: past.slice(0, -1), future: [...future, { pages: p.pages, files: p.files, cms: p.cms || [], styles: p.styles || { colors: [], text: [] } }], selection: [] })
      mutate((x) => ({ ...x, ...prev, activePageId: prev.pages.some((pg) => pg.id === x.activePageId) ? x.activePageId : prev.pages[0].id }))
    },
    redo: () => {
      const { past, future } = get()
      const p = cur(get())
      if (!p || !future.length) return
      const next = future[future.length - 1]
      set({ future: future.slice(0, -1), past: [...past, { pages: p.pages, files: p.files, cms: p.cms || [], styles: p.styles || { colors: [], text: [] } }], selection: [] })
      mutate((x) => ({ ...x, ...next, activePageId: next.pages.some((pg) => pg.id === x.activePageId) ? x.activePageId : next.pages[0].id }))
    },

    setActivePage: (id) => { set({ selection: [], breakpoint: 'desktop' }); mutate((p) => ({ ...p, activePageId: id })) },
    addPage: (name) => {
      get().checkpoint()
      if (name.startsWith('@')) { get().addComponent(name.slice(1)); return }
      const slug = '/' + name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      const pg = newPage(name.trim() || 'Page', slug === '/' ? '/page' : slug)
      mutate((p) => ({ ...p, pages: [...p.pages, pg], activePageId: pg.id }))
      set({ selection: [] })
    },
    updatePage: (id, patch) => mutate((p) => ({ ...p, pages: p.pages.map((pg) => (pg.id === id ? { ...pg, ...patch } : pg)) })),
    deletePage: (id) => {
      const p = cur(get())
      if (!p || p.pages.length < 2) return
      get().checkpoint()
      mutate((x) => {
        const pages = x.pages.filter((pg) => pg.id !== id)
        return { ...x, pages, activePageId: x.activePageId === id ? pages[0].id : x.activePageId }
      })
    },

    addNodes: (nodes, select = true) => {
      get().checkpoint()
      mutatePage((pg) => ({ ...pg, nodes: [...pg.nodes, ...nodes] }))
      if (select) set({ selection: nodes.map((n) => n.id) })
    },
    // In a tablet or phone view, edits land on that view; the layer's shared fields still change everywhere.
    updateNodes: (ids, patch) => get().updateNodesIn(get().breakpoint, ids, patch),
    updateNodesIn: (view, ids, patch, loose = false) =>
      mutatePage((pg) => {
        const bp = effective(pg, view)
        const shown = new Map(resolvePage(pg, bp).nodes.map((n) => [n.id, n]))
        const base = viewBase(pg, bp)
        return {
          ...pg,
          nodes: pg.nodes.map((n) => {
            if (!ids.includes(n.id)) return n
            return applyInView(n, bp, typeof patch === 'function' ? patch(shown.get(n.id)!) : patch, base.get(n.id), loose)
          }),
        }
      }),
    deleteNodes: (ids) => {
      if (!ids.length) return
      get().checkpoint()
      mutatePage((pg) => {
        const gone = new Set(ids)
        ids.forEach((id) => descendantIds(pg.nodes, id).forEach((d) => gone.add(d)))
        return { ...pg, nodes: pg.nodes.filter((n) => !gone.has(n.id)) }
      })
      set({ selection: [] })
    },
    // Reorders among siblings: forward/backward by one, front/back to the end.
    reorder: (ids, dir) => {
      if (!ids.length) return
      get().checkpoint()
      mutatePage((pg) => {
        let nodes = pg.nodes
        const first = nodes.find((n) => n.id === ids[0])
        if (!first) return pg
        const sibs = childrenOf(nodes, first.parentId)
        const moving = sibs.filter((n) => ids.includes(n.id)).map((n) => n.id)
        const stay = sibs.filter((n) => !ids.includes(n.id))
        const firstIdx = sibs.findIndex((n) => ids.includes(n.id))
        const idx = dir === 'front' ? stay.length : dir === 'back' ? 0 : Math.max(0, Math.min(stay.length, firstIdx + (dir === 'forward' ? 1 : -1)))
        nodes = moveInto(nodes, moving, first.parentId, idx)
        return { ...pg, nodes }
      })
    },
    moveNodes: (ids, parentId, index, patch) =>
      mutatePage((pg) => {
        const bp = effective(pg, get().breakpoint)
        const shown = new Map(resolvePage(pg, bp).nodes.map((n) => [n.id, n]))
        let nodes = moveInto(pg.nodes, topmost(pg.nodes, ids), parentId, index)
        if (patch) {
          const moved = { ...pg, nodes }
          const base = viewBase(moved, bp)
          nodes = nodes.map((n) => (ids.includes(n.id) ? applyInView(n, bp, patch({ ...shown.get(n.id)!, parentId }), base.get(n.id), true) : n))
        }
        return { ...pg, nodes }
      }),
    // Wraps the selection in a new frame, stack or grid (like ⌘⏎ in design tools).
    wrap: (ids, layout) => {
      const nodes = activeNodes()
      const roots = topmost(nodes, ids).map((id) => nodes.find((n) => n.id === id)!).filter(Boolean)
      if (!roots.length) return undefined
      get().checkpoint()
      const parentId = roots[0].parentId
      const sameParent = roots.filter((n) => n.parentId === parentId)
      const x = Math.min(...sameParent.map((n) => n.x))
      const y = Math.min(...sameParent.map((n) => n.y))
      const w = Math.max(...sameParent.map((n) => n.x + n.w)) - x
      const h = Math.max(...sameParent.map((n) => n.y + n.h)) - y
      // Read direction and gap from how the layers are already arranged.
      const apart = (axis: 'x' | 'y') => {
        const k = axis === 'x' ? 'w' : 'h'
        const sorted = [...sameParent].sort((a, b) => a[axis] - b[axis])
        return sorted.every((n, i) => i === 0 || n[axis] >= sorted[i - 1][axis] + sorted[i - 1][k] - 2)
      }
      const horizontal = apart('x') && !apart('y') ? true : apart('y') && !apart('x') ? false : w > h * 1.4
      const axis = horizontal ? 'x' : 'y'
      const sorted = [...sameParent].sort((a, b) => a[axis] - b[axis])
      const gaps = sorted.slice(1).map((n, i) => n[axis] - (sorted[i][axis] + sorted[i][horizontal ? 'w' : 'h'])).filter((g) => g >= 0)
      const gap = gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : 16
      const frame = newNode('frame', {
        name: layout === 'stack' ? 'Stack' : layout === 'grid' ? 'Grid' : 'Frame',
        x, y, w, h, parentId, fill: 'transparent', layout,
        ...(layout !== 'free' ? { gap, wMode: 'fit' as const, hMode: 'fit' as const, dir: horizontal ? 'row' as const : 'column' as const, cols: Math.min(sameParent.length, 3) || 2 } : {}),
      })
      mutatePage((pg) => {
        const sibs = childrenOf(pg.nodes, parentId)
        const at = sibs.findIndex((n) => n.id === sameParent[0].id)
        let list = moveInto([...pg.nodes, frame], [frame.id], parentId, at)
        // Children keep reading order for stacks, and become local to the frame when free.
        const order = [...sameParent].sort((a, b) => (horizontal ? a.x - b.x : a.y - b.y))
        list = moveInto(list, (layout === 'free' ? sameParent : order).map((n) => n.id), frame.id, 0)
        list = list.map((n) => (sameParent.some((m) => m.id === n.id) ? { ...n, x: n.x - x, y: n.y - y } : n))
        return { ...pg, nodes: list }
      })
      set({ selection: [frame.id] })
      return frame.id
    },
    unwrap: (id) => {
      const nodes = activeNodes()
      const f = nodes.find((n) => n.id === id)
      if (!f || f.type !== 'frame') return
      get().checkpoint()
      mutatePage((pg) => {
        const kids = childrenOf(pg.nodes, id).map((k) => k.id)
        const sibs = childrenOf(pg.nodes, f.parentId)
        const at = sibs.findIndex((n) => n.id === id)
        let list = moveInto(pg.nodes, kids, f.parentId, at)
        list = list.filter((n) => n.id !== id).map((n) => (kids.includes(n.id) ? { ...n, x: n.x + f.x, y: n.y + f.y } : n))
        return { ...pg, nodes: list }
      })
      set({ selection: childrenOf(nodes, id).map((k) => k.id) })
    },
    // Turns the selection into a component page and leaves an instance in its place.
    createComponent: (ids) => {
      const p = cur(get())
      const pg = p?.pages.find((x) => x.id === p.activePageId)
      if (!p || !pg) return
      const roots = topmost(pg.nodes, ids).map((id) => pg.nodes.find((n) => n.id === id)!).filter((n) => n && n.parentId === pg.nodes.find((m) => m.id === ids[0])?.parentId)
      if (!roots.length) return
      get().checkpoint()
      const x = Math.min(...roots.map((n) => n.x))
      const y = Math.min(...roots.map((n) => n.y))
      const w = Math.max(...roots.map((n) => n.x + n.w)) - x
      const h = Math.max(...roots.map((n) => n.y + n.h)) - y
      const include = new Set<string>()
      roots.forEach((r) => { include.add(r.id); descendantIds(pg.nodes, r.id).forEach((d) => include.add(d)) })
      const baseName = roots.length === 1 ? roots[0].name : 'Component'
      let name = baseName.replace(/[^A-Za-z0-9 ]/g, '').trim() || 'Component'
      while (p.pages.some((q) => q.name === name)) name += ' 2'
      const comp: Page = {
        id: uid('pg_'), kind: 'component', name, path: '', width: Math.round(w), height: Math.round(h), background: 'transparent',
        nodes: pg.nodes.filter((n) => include.has(n.id)).map((n) => (roots.includes(n) ? { ...n, parentId: undefined, x: n.x - x, y: n.y - y } : n)),
      }
      const inst = newNode('instance', { name, componentId: comp.id, x, y, w: comp.width, h: comp.height, parentId: roots[0].parentId, wMode: roots.length === 1 ? roots[0].wMode : undefined, hMode: roots.length === 1 ? roots[0].hMode : undefined })
      mutate((q) => ({
        ...q,
        pages: [...q.pages.map((x2) => {
          if (x2.id !== pg.id) return x2
          const sibs = childrenOf(x2.nodes, roots[0].parentId)
          const at = sibs.findIndex((n) => n.id === roots[0].id)
          const rest = [...x2.nodes.filter((n) => !include.has(n.id)), inst]
          return { ...x2, nodes: moveInto(rest, [inst.id], roots[0].parentId, Math.max(0, at)) }
        }), comp],
      }))
      set({ selection: [inst.id] })
    },
    addComponent: (name) => {
      const p = cur(get())
      if (!p) return
      get().checkpoint()
      const comp: Page = { id: uid('pg_'), kind: 'component', name: name.trim() || 'Component', path: '', width: 320, height: 200, background: 'transparent', nodes: [] }
      mutate((q) => ({ ...q, pages: [...q.pages, comp], activePageId: comp.id }))
      set({ selection: [] })
    },
    // Replaces an instance with a copy of its component's layers.
    detach: (id) => {
      const p = cur(get())
      const pg = p?.pages.find((x) => x.id === p.activePageId)
      const inst = pg?.nodes.find((n) => n.id === id)
      const comp = p?.pages.find((x) => x.id === inst?.componentId)
      if (!p || !pg || !inst || !comp) return
      get().checkpoint()
      const copies = cloneSubtrees(comp.nodes, comp.nodes.map((n) => n.id), () => uid('n_'))
      const frame = newNode('frame', { ...inst, id: uid('n_'), type: 'frame', name: inst.name, componentId: undefined, layout: 'free', fill: comp.background })
      const kids = copies.map((n) => (n.parentId ? n : { ...n, parentId: frame.id }))
      mutatePage((x) => {
        const sibs = childrenOf(x.nodes, inst.parentId)
        const at = sibs.findIndex((n) => n.id === id)
        const rest = [...x.nodes.filter((n) => n.id !== id), frame, ...kids]
        return { ...x, nodes: moveInto(rest, [frame.id], inst.parentId, at) }
      })
      set({ selection: [frame.id] })
    },
    setSelection: (ids) => set({ selection: ids }),
    setBreakpoint: (breakpoint) => set({ breakpoint, editingTextId: null }),
    updateView: (pageId, bp, v) =>
      mutate((p) => ({
        ...p,
        pages: p.pages.map((pg) => {
          if (pg.id !== pageId) return pg
          const views = { ...pg.views }
          if (v === null) {
            delete views[bp]
            // Removing a view drops what was changed in it.
            return { ...pg, views, nodes: pg.nodes.map((n) => clearView(n, bp)) }
          }
          views[bp] = { ...(views[bp] || { width: bp === 'tablet' ? 810 : 390, height: pg.height }), ...v }
          return { ...pg, views }
        }),
      })),
    // Starts a view over: drops its changes so every layer fits itself from the view above again.
    fitView: (bp) => { get().checkpoint(); mutatePage((pg) => ({ ...pg, nodes: pg.nodes.map((n) => clearView(n, bp)) })) },
    // Drops every tablet and phone change on these layers so they follow desktop again.
    resetViews: (ids) => {
      get().checkpoint()
      mutatePage((pg) => ({ ...pg, nodes: pg.nodes.map((n) => (ids.includes(n.id) ? { ...n, bp: undefined } : n)) }))
    },
    resetView: (ids) => {
      get().checkpoint()
      mutatePage((pg) => {
        const bp = effective(pg, get().breakpoint)
        return { ...pg, nodes: pg.nodes.map((n) => (ids.includes(n.id) ? clearView(n, bp) : n)) }
      })
    },
    setTool: (tool) => set({ tool, editingTextId: null }),
    setEditingText: (id) => set({ editingTextId: id }),
    copy: () => {
      const nodes = activeNodes()
      set({ clipboard: cloneSubtrees(nodes, get().selection, () => uid('n_')) })
    },
    paste: () => {
      const clip = get().clipboard
      if (!clip.length) return
      const nodes = activeNodes()
      // Paste into the selected frame if there is one, otherwise next to the originals.
      const sel = nodes.find((n) => n.id === get().selection[0])
      const target = sel?.type === 'frame' ? sel.id : sel?.parentId
      const ids = new Set(clip.map((n) => n.id))
      const fresh = cloneSubtrees(clip, clip.map((n) => n.id), () => uid('n_'))
      const roots = fresh.filter((n) => !n.parentId || !ids.has(n.parentId) && !fresh.some((m) => m.id === n.parentId))
      const placed = fresh.map((n) => (roots.includes(n) ? { ...shift(n, 20), parentId: target && nodes.some((m) => m.id === target) ? target : n.parentId } : n))
      set({ clipboard: clip })
      get().addNodes(placed)
      set({ selection: roots.map((r) => r.id) })
    },
    duplicate: (offset = 20) => {
      const nodes = activeNodes()
      const sel = topmost(nodes, get().selection)
      if (!sel.length) return []
      get().checkpoint()
      const copies = cloneSubtrees(nodes, sel, () => uid('n_'))
      const roots = copies.filter((c) => !copies.some((m) => m.id === c.parentId))
      mutatePage((pg) => {
        let list = [...pg.nodes, ...copies.map((c) => (roots.includes(c) ? shift(c, offset) : c))]
        // Each copy lands right after its original among its siblings.
        roots.forEach((r, i) => {
          const orig = pg.nodes.find((n) => n.id === sel[i])
          if (!orig) return
          const sibs = childrenOf(list, orig.parentId).filter((n) => n.id !== r.id)
          list = moveInto(list, [r.id], orig.parentId, sibs.findIndex((n) => n.id === orig.id) + 1)
        })
        return { ...pg, nodes: list }
      })
      set({ selection: roots.map((r) => r.id) })
      return roots.map((r) => r.id)
    },

    addAsset: (a) => mutate((p) => ({ ...p, assets: [...p.assets, a] })),
    deleteAsset: (id) => mutate((p) => ({ ...p, assets: p.assets.filter((a) => a.id !== id) })),
    addFile: (path, content = '') => {
      const id = uid('f_')
      get().checkpoint()
      mutate((p) => ({ ...p, files: [...p.files, { id, path, content }] }))
      return id
    },
    updateFile: (id, patch) => mutate((p) => ({ ...p, files: p.files.map((f) => (f.id === id ? { ...f, ...patch } : f)) })),
    deleteFile: (id) => { get().checkpoint(); mutate((p) => ({ ...p, files: p.files.filter((f) => f.id !== id) })) },

    addColorStyle: (c) => {
      const id = styleUid('cs_')
      get().checkpoint()
      mutate((p) => ({ ...p, styles: { colors: [...(p.styles?.colors || []), { ...c, id }], text: p.styles?.text || [] } }))
      return id
    },
    updateColorStyle: (id, patch) =>
      mutate((p) => ({ ...p, styles: { colors: (p.styles?.colors || []).map((c) => (c.id === id ? { ...c, ...patch } : c)), text: p.styles?.text || [] } })),
    // Layers using a deleted colour keep it as a plain colour.
    deleteColorStyle: (id) => {
      const p0 = cur(get())
      const st = p0?.styles?.colors.find((c) => c.id === id)
      if (!p0 || !st) return
      get().checkpoint()
      mutate((p) => ({
        ...p,
        pages: p.pages.map((pg) => mapPageColors(pg, (c) => (c === '$' + id ? st.light : c))),
        styles: { colors: (p.styles?.colors || []).filter((c) => c.id !== id), text: (p.styles?.text || []).map((t) => (t.color === '$' + id ? { ...t, color: st.light } : t)) },
      }))
    },
    addTextStyle: (t) => {
      const id = styleUid('ts_')
      get().checkpoint()
      mutate((p) => ({ ...p, styles: { colors: p.styles?.colors || [], text: [...(p.styles?.text || []), { ...t, id }] } }))
      return id
    },
    // Editing a text style updates every layer that follows it, in every page.
    updateTextStyle: (id, patch) =>
      mutate((p) => {
        const text = (p.styles?.text || []).map((t) => (t.id === id ? { ...t, ...patch } : t))
        const t = text.find((x) => x.id === id)
        if (!t) return p
        const vals = textPatch(t)
        return {
          ...p,
          styles: { colors: p.styles?.colors || [], text },
          pages: p.pages.map((pg) => (pg.nodes.some((n) => n.textStyle === id) ? { ...pg, nodes: pg.nodes.map((n) => (n.textStyle === id ? { ...n, ...vals } : n)) } : pg)),
        }
      }),
    deleteTextStyle: (id) => {
      get().checkpoint()
      mutate((p) => ({
        ...p,
        styles: { colors: p.styles?.colors || [], text: (p.styles?.text || []).filter((t) => t.id !== id) },
        pages: p.pages.map((pg) => (pg.nodes.some((n) => n.textStyle === id) ? { ...pg, nodes: pg.nodes.map((n) => (n.textStyle === id ? { ...n, textStyle: undefined } : n)) } : pg)),
      }))
    },

    addCollection: (template) => {
      const p = cur(get())
      const c = fromTemplate(TEMPLATES.find((t) => t.name === template), (p?.cms || []).map((x) => x.slug))
      get().checkpoint()
      mutate((x) => ({ ...x, cms: [...(x.cms || []), c] }))
      return c.id
    },
    updateCollection: (id, fn, undoable = false) => {
      if (undoable) get().checkpoint()
      mutate((p) => ({ ...p, cms: (p.cms || []).map((c) => (c.id === id ? fn(c) : c)) }))
    },
    // Lists and pages that used the collection keep their layers; they just stop repeating.
    deleteCollection: (id) => {
      get().checkpoint()
      mutate((p) => ({
        ...p,
        cms: (p.cms || []).filter((c) => c.id !== id),
        pages: p.pages.map((pg) => ({
          ...pg,
          collection: pg.collection === id ? undefined : pg.collection,
          nodes: pg.nodes.some((n) => n.list?.collection === id) ? pg.nodes.map((n) => (n.list?.collection === id ? { ...n, list: undefined } : n)) : pg.nodes,
        })),
      }))
    },

    toggleWindow: (t, open) =>
      mutate((p) => {
        const w = p.windows[t]
        const willOpen = open ?? !w.open
        const top = Math.max(...Object.values(p.windows).map((x) => x.z)) + 1
        return { ...p, windows: { ...p.windows, [t]: { ...w, open: willOpen, z: willOpen ? top : w.z } } }
      }),
    focusWindow: (t) =>
      mutate((p) => {
        const top = Math.max(...Object.values(p.windows).map((x) => x.z))
        if (p.windows[t].z === top) return p
        return { ...p, windows: { ...p.windows, [t]: { ...p.windows[t], z: top + 1 } } }
      }),
    setWindow: (t, patch) => mutate((p) => ({ ...p, windows: { ...p.windows, [t]: { ...p.windows[t], ...patch } } })),
    // Code on the left, canvas on the right, the rest floating in the middle.
    tileWindows: ({ w, h }) =>
      mutate((p) => {
        const gap = 16
        const cw = Math.round((w - gap) * 0.64)
        const win = { ...p.windows }
        win.code = { ...win.code, open: true, x: 0, y: 0, w: w - cw - gap, h, maximized: false }
        win.canvas = { ...win.canvas, open: true, x: w - cw, y: 0, w: cw, h, maximized: false }
        const float = (t: ToolId, fw: number, fh: number, i: number) => {
          win[t] = { ...win[t], w: fw, h: Math.min(fh, h - 40), x: Math.round((w - fw) / 2) + i * 28, y: 40 + i * 28, maximized: false }
        }
        float('media', 440, 520, 0)
        float('settings', 520, 640, 1)
        float('cms', Math.min(900, w - 80), 600, 2)
        return { ...p, windows: win, tiled: true }
      }),
    setWindowSetting: (t, key, value) =>
      mutate((p) => ({ ...p, windows: { ...p.windows, [t]: { ...p.windows[t], settings: { ...p.windows[t].settings, [key]: value } } } })),
  }
})

export const useProject = () => useStore((s) => s.projects.find((p) => p.id === s.currentId) || null)
// The active page as the current view shows it: tablet and phone changes applied.
export const useActivePage = () =>
  useStore((s) => {
    const p = s.projects.find((x) => x.id === s.currentId)
    const pg = p?.pages.find((x) => x.id === p.activePageId)
    return pg ? resolvePage(pg, s.breakpoint) : null
  })
export const useRawPage = () =>
  useStore((s) => {
    const p = s.projects.find((x) => x.id === s.currentId)
    return p?.pages.find((x) => x.id === p.activePageId) || null
  })
export const activeViewPage = () => {
  const s = useStore.getState()
  const p = s.projects.find((x) => x.id === s.currentId)
  const pg = p?.pages.find((x) => x.id === p.activePageId)
  return pg ? resolvePage(pg, s.breakpoint) : undefined
}

if (import.meta.env.DEV) (window as unknown as { __sites: typeof useStore }).__sites = useStore
