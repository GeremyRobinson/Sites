import { TEMPLATES } from '../cms'
import { useStore } from '../store'
import type { TagColor, ToolId } from '../types'
import { LIBRARIES, exportZip } from '../codegen'
import { newNode } from '../store'
import { setThemePref } from './theme'
import { toast } from './toast'
import * as A from '../tools/canvasActions'

export interface Command {
  id: string
  group: string
  label: string
  keys?: string
  hint?: string
  tag?: TagColor
  run: () => void
}

const st = useStore.getState
const project = () => { const s = st(); return s.projects.find((p) => p.id === s.currentId) }

// Brings the canvas forward before running a canvas action.
const onCanvas = (fn: () => void) => () => {
  const p = project()
  if (p && !p.windows.canvas.open) st().toggleWindow('canvas', true)
  st().focusWindow('canvas')
  fn()
}

export function getCommands(windowLabels: { id: ToolId; label: string }[], tile: () => void): Command[] {
  const p = project()
  if (!p) return []
  const cmds: Command[] = []
  const add = (c: Command) => cmds.push(c)

  windowLabels.forEach((w, i) => add({ id: 'win-' + w.id, group: 'Windows', label: `${p.windows[w.id].open ? 'Close' : 'Open'} ${w.label}`, keys: `⌥${i + 1}`, run: () => st().toggleWindow(w.id) }))
  add({ id: 'tile', group: 'Windows', label: 'Tile windows', run: tile })

  const tools: [string, string, string][] = [['select', 'Move', 'V'], ['frame', 'Frame', 'F'], ['stack', 'Stack', 'S'], ['grid', 'Grid', 'G'], ['text', 'Text', 'T'], ['rect', 'Rectangle', 'R'], ['ellipse', 'Oval', 'O'], ['pen', 'Pen', 'P'], ['hand', 'Hand', 'H']]
  tools.forEach(([id, label, keys]) => add({ id: 'tool-' + id, group: 'Tools', label: `${label} tool`, keys, run: onCanvas(() => st().setTool(id as never)) }))
  add({ id: 'shapes', group: 'Tools', label: 'Insert a shape…', run: onCanvas(() => A.canvasCommand('shapes')) })

  add({ id: 'wrap-frame', group: 'Layout', label: 'Wrap in frame', keys: '⌘⏎', run: onCanvas(() => A.wrapSelection('free')) })
  add({ id: 'wrap-stack', group: 'Layout', label: 'Wrap in stack', keys: '⇧A', run: onCanvas(() => A.wrapSelection('stack')) })
  add({ id: 'wrap-grid', group: 'Layout', label: 'Wrap in grid', keys: '⇧G', run: onCanvas(() => A.wrapSelection('grid')) })
  add({ id: 'unwrap', group: 'Layout', label: 'Remove wrapper', keys: '⇧⌘G', run: onCanvas(A.unwrapSelection) })
  add({ id: 'to-stack', group: 'Layout', label: 'Turn frame into stack', run: onCanvas(() => A.setLayout('stack')) })
  add({ id: 'to-grid', group: 'Layout', label: 'Turn frame into grid', run: onCanvas(() => A.setLayout('grid')) })
  add({ id: 'to-free', group: 'Layout', label: 'Turn frame into free layout', run: onCanvas(() => A.setLayout('free')) })
  add({ id: 'fill-w', group: 'Layout', label: 'Fill width', run: () => { st().checkpoint(); st().updateNodes(st().selection, { wMode: 'fill' }) } })
  add({ id: 'fit-h', group: 'Layout', label: 'Fit height to content', run: () => { st().checkpoint(); st().updateNodes(st().selection, { hMode: 'fit' }) } })

  add({ id: 'comp-make', group: 'Components', label: 'Create component from selection', keys: '⌥⌘K', run: onCanvas(A.componentFromSelection) })
  add({ id: 'comp-detach', group: 'Components', label: 'Detach instance', keys: '⌥⌘B', run: onCanvas(A.detachSelection) })
  add({ id: 'comp-edit', group: 'Components', label: 'Edit selected component', run: onCanvas(() => A.editComponent()) })
  add({ id: 'comp-new', group: 'Components', label: 'New empty component', run: onCanvas(() => st().addComponent(`Component ${p.pages.filter((x) => x.kind === 'component').length + 1}`)) })
  TEMPLATES.forEach((t) => add({ id: 'cms-' + t.name, group: 'CMS', label: `New ${t.name.toLowerCase()} collection`, run: () => { st().addCollection(t.name); st().toggleWindow('cms', true); st().focusWindow('cms') } }))
  for (const c of p.pages.filter((x) => x.kind === 'component')) {
    add({ id: 'ins-' + c.id, group: 'Components', label: `Insert ${c.name}`, tag: c.tag, run: onCanvas(() => {
      const pg = p.pages.find((x) => x.id === project()!.activePageId)!
      if (pg.id === c.id) return toast(`${c.name} can't contain itself`)
      st().addNodes([newNode('instance', { name: c.name, componentId: c.id, w: c.width, h: c.height, x: Math.round((pg.width - c.width) / 2), y: Math.round((pg.height - c.height) / 2) })])
    }) })
  }

  for (const pg of p.pages) {
    add({ id: 'go-' + pg.id, group: 'Go to', label: `${pg.kind === 'component' ? '◆ ' : ''}${pg.name}`, hint: pg.kind === 'component' ? 'component' : pg.path, tag: pg.tag, run: onCanvas(() => st().setActivePage(pg.id)) })
  }
  add({ id: 'page-new', group: 'Go to', label: 'New page', run: onCanvas(() => st().addPage(`Page ${p.pages.filter((x) => x.kind !== 'component').length + 1}`)) })

  add({ id: 'sel-parent', group: 'Select', label: 'Select parent', keys: '⇧⏎', run: onCanvas(A.selectParent) })
  add({ id: 'sel-kids', group: 'Select', label: 'Select children', keys: '⏎', run: onCanvas(() => { A.selectChildren() }) })
  add({ id: 'sel-all', group: 'Select', label: 'Select all siblings', keys: '⌘A', run: onCanvas(A.selectAll) })

  add({ id: 'dup', group: 'Edit', label: 'Duplicate', keys: '⌘D', run: () => { st().duplicate() } })
  add({ id: 'del', group: 'Edit', label: 'Delete selection', keys: '⌫', run: () => st().deleteNodes(st().selection) })
  add({ id: 'hide', group: 'Edit', label: 'Hide or show', keys: '⌘⇧H', run: () => A.toggle('hidden') })
  add({ id: 'lock', group: 'Edit', label: 'Lock or unlock', keys: '⌘⇧L', run: () => A.toggle('locked') })
  add({ id: 'front', group: 'Edit', label: 'Bring to front', keys: '⌘⌥]', run: () => st().reorder(st().selection, 'front') })
  add({ id: 'back', group: 'Edit', label: 'Send to back', keys: '⌘⌥[', run: () => st().reorder(st().selection, 'back') })
  add({ id: 'undo', group: 'Edit', label: 'Undo', keys: '⌘Z', run: () => st().undo() })
  add({ id: 'redo', group: 'Edit', label: 'Redo', keys: '⌘⇧Z', run: () => st().redo() })
  ;(['yellow', 'blue', 'pink', 'orange', 'green', 'violet'] as TagColor[]).forEach((t) =>
    add({ id: 'tag-' + t, group: 'Tag', label: `Tag ${t}`, tag: t, run: () => { st().checkpoint(); st().updateNodes(st().selection, { tag: t }) } }))
  add({ id: 'tag-none', group: 'Tag', label: 'Clear tag', run: () => { st().checkpoint(); st().updateNodes(st().selection, { tag: undefined }) } })

  add({ id: 'fit', group: 'View', label: 'Zoom to fit', keys: '⇧1', run: onCanvas(() => A.canvasCommand('fit')) })
  add({ id: 'zsel', group: 'View', label: 'Zoom to selection', keys: '⇧2', run: onCanvas(() => A.canvasCommand('zoomSel')) })
  add({ id: 'z100', group: 'View', label: 'Zoom to 100%', keys: '⌘0', run: onCanvas(() => A.canvasCommand('zoom100')) })
  for (const [bp, label] of [['desktop', 'Desktop'], ['tablet', 'Tablet'], ['phone', 'Phone']] as const) {
    add({ id: 'view-' + bp, group: 'View', label: `Edit the ${label.toLowerCase()} view`, run: onCanvas(() => useStore.getState().setBreakpoint(bp)) })
  }
  add({ id: 'preview', group: 'View', label: 'Preview site', keys: '⌘P', run: onCanvas(() => A.canvasCommand('preview')) })
  add({ id: 'help', group: 'View', label: 'Show canvas shortcuts', keys: '?', run: onCanvas(() => A.canvasCommand('help')) })
  ;(['light', 'dark', 'system'] as const).forEach((t) => add({ id: 'theme-' + t, group: 'View', label: `Theme: ${t}`, run: () => setThemePref(t) }))

  const libs = p.settings.libraries || []
  for (const l of LIBRARIES) {
    const on = libs.includes(l.id)
    add({ id: 'lib-' + l.id, group: 'Libraries', label: `${on ? 'Remove' : 'Add'} ${l.id}`, hint: l.what, run: () => {
      st().updateProject((x) => ({ ...x, settings: { ...x.settings, libraries: on ? libs.filter((i) => i !== l.id) : [...libs, l.id] } }))
      toast(`${l.id} ${on ? 'removed' : 'added to package.json'}`)
    } })
  }
  add({ id: 'export', group: 'Project', label: 'Export as Vite + React .zip', run: () => { exportZip(project()!).then(() => toast('Exported')).catch(() => toast('Export was blocked here. Try it in a full browser tab.')) } })
  add({ id: 'home', group: 'Project', label: 'Back to all projects', run: () => st().openProject(null) })
  return cmds
}

// Substring first, then word initials ("wis" finds Wrap in stack), then a tight subsequence; -1 for no match.
export function score(q: string, text: string) {
  if (!q) return 0
  const t = text.toLowerCase()
  const s = q.toLowerCase().trim()
  const at = t.indexOf(s)
  if (at >= 0) return 100 - at + (at === 0 || t[at - 1] === ' ' ? 20 : 0)
  const initials = t.split(/\s+/).map((w) => w[0]).join('')
  if (initials.startsWith(s.replace(/\s+/g, ''))) return 60
  let i = 0
  let first = -1
  let last = -1
  for (let j = 0; j < t.length && i < s.length; j++) {
    if (t[j] === s[i]) { if (first < 0) first = j; last = j; i++ }
  }
  return i === s.length && last - first < s.length * 2 ? 30 - (last - first) : -1
}
