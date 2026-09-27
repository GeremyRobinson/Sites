import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useProject, useStore } from '../store'
import type { ToolId } from '../types'
import { Window, type SettingDef } from './Window'
import { Toaster } from './toast'
import { registerFont } from './files'
import { ThemeSwitch } from './theme'
import { Palette } from './Palette'
import { getCommands } from './commands'
import { CodeWindow } from '../tools/CodeWindow'
import { CanvasWindow } from '../tools/CanvasWindow'
import { MediaWindow } from '../tools/MediaWindow'
import { SettingsWindow } from '../tools/SettingsWindow'
import { CmsWindow } from '../tools/CmsWindow'
import { I } from './icons'

export const TOOLS: { id: ToolId; label: string; settings?: SettingDef[] }[] = [
  { id: 'code', label: 'Code', settings: [
    { key: 'theme', label: 'Theme', type: 'select', options: ['graphite', 'phosphor', 'amber', 'paper'] },
    { key: 'mode', label: 'Mode', type: 'select', options: ['auto', 'light', 'dark'] },
    { key: 'fontSize', label: 'Font size', type: 'number', min: 10, max: 22 },
    { key: 'lineNumbers', label: 'Line numbers', type: 'bool' },
    { key: 'wrap', label: 'Wrap lines', type: 'bool' },
  ] },
  { id: 'canvas', label: 'Canvas', settings: [
    { key: 'theme', label: 'Canvas', type: 'select', options: ['auto', 'light', 'dark'] },
    { key: 'fill', label: 'Shape fill', type: 'select', options: ['#d9d9d9', '#111111', '#2f6bff', '#ff4fa3', '#ffd400'] },
    { key: 'grid', label: 'Pixel grid', type: 'bool' },
    { key: 'snap', label: 'Smart guides', type: 'bool' },
    { key: 'layers', label: 'Layers panel', type: 'bool' },
    { key: 'inspector', label: 'Properties panel', type: 'bool' },
  ] },
  { id: 'media', label: 'Media & Text', settings: [
    { key: 'columns', label: 'Columns', type: 'number', min: 2, max: 6 },
  ] },
  { id: 'cms', label: 'CMS' },
  { id: 'settings', label: 'Project' },
]

const pad2 = (n: number) => String(n).padStart(2, '0')

export function Workspace() {
  const project = useProject()!
  const frameRef = useRef<HTMLDivElement>(null)
  const [bounds, setBounds] = useState({ w: 1200, h: 800 })
  const [palette, setPalette] = useState(false)

  useLayoutEffect(() => {
    const el = frameRef.current!
    const ro = new ResizeObserver(() => {
      const b = { w: el.clientWidth, h: el.clientHeight }
      setBounds(b)
      const st = useStore.getState()
      if (!st.projects.find((p) => p.id === st.currentId)?.tiled) st.tileWindows(b)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => { project.assets.forEach(registerFont) }, [project.assets])


  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { toggleWindow, undo, redo } = useStore.getState()
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'k' && !e.altKey && !e.shiftKey) { e.preventDefault(); setPalette((v) => !v); return }
      const typing = (e.target as HTMLElement).closest('input, textarea, select, [contenteditable=true], .cm-editor')
      if (e.altKey && /^Digit[1-4]$/.test(e.code)) {
        e.preventDefault()
        toggleWindow(TOOLS[Number(e.code.slice(5)) - 1].id)
        return
      }
      if (typing) return
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo() }
      else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo() }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  const top = Math.max(...TOOLS.map((t) => (project.windows[t.id].open ? project.windows[t.id].z : -1)))
  const page = project.pages.find((p) => p.id === project.activePageId)!
  const anyOpen = TOOLS.some((t) => project.windows[t.id].open)
  const tile = () => useStore.getState().tileWindows(bounds)
  const commands = useMemo(() => (palette ? getCommands(TOOLS, tile) : []), [palette]) // eslint-disable-line react-hooks/exhaustive-deps

  const num = (id: ToolId) => pad2(TOOLS.findIndex((t) => t.id === id) + 1)
  const titles: Record<ToolId, React.ReactNode> = {
    code: <><span className="win-no">{num('code')}</span><b>Code</b><span className="mono muted">~/{project.name.toLowerCase().replace(/\s+/g, '-')}</span></>,
    canvas: <><span className="win-no">{num('canvas')}</span><b>Canvas</b><span className="muted">{page.kind === 'component' && <I.instance size={12} style={{ verticalAlign: -1, marginRight: 4 }} />}{page.name}</span></>,
    media: <><span className="win-no">{num('media')}</span><b>Media & Text</b></>,
    cms: <><span className="win-no">{num('cms')}</span><b>CMS</b><span className="muted">{(project.cms || []).length} collection{(project.cms || []).length === 1 ? '' : 's'}</span></>,
    settings: <><span className="win-no">{num('settings')}</span><b>Project</b><span className="muted">{project.name}</span></>,
  }
  const focusedId = TOOLS.find((t) => project.windows[t.id].open && project.windows[t.id].z === top)?.id
  const nPages = project.pages.filter((p) => p.kind !== 'component').length
  const nComps = project.pages.length - nPages
  const counts = `${nPages} page${nPages === 1 ? '' : 's'} · ${nComps} component${nComps === 1 ? '' : 's'}`

  // The dock's plate glides to whichever tool is in front.
  const dockRef = useRef<HTMLElement>(null)
  const glideRef = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const g = glideRef.current
    const b = focusedId ? dockRef.current?.querySelector<HTMLElement>(`[data-tool="${focusedId}"]`) : null
    if (!g) return
    if (!b) { g.style.opacity = '0'; return }
    const first = g.style.opacity !== '1'
    if (first) g.style.transition = 'none'
    g.style.transform = `translateX(${b.offsetLeft}px)`
    g.style.width = `${b.offsetWidth}px`
    g.style.opacity = '1'
    if (first) { void g.offsetWidth; g.style.transition = '' }
  })
  const bodies: Record<ToolId, React.ReactNode> = {
    code: <CodeWindow />, canvas: <CanvasWindow />, media: <MediaWindow />, cms: <CmsWindow />, settings: <SettingsWindow />,
  }

  return (
    <div className="workspace">
      <div className="workspace-top">
        <span className="ws-crumb pill-group">
          <button className="pill" onClick={() => useStore.getState().openProject(null)} title="All projects">
            <I.back />
            Projects
          </button>
          <b className="pill" style={{ pointerEvents: 'none' }}>{project.name}</b>
          <span className="ws-count">{counts}</span>
        </span>
        <span className="row" style={{ gap: 10 }}>
          <ThemeSwitch />
          <span className="pill-group">
            <button className="pill" onClick={tile} title="Arrange windows">Arrange</button>
            <button className="pill" onClick={() => setPalette(true)} title="Command palette">Search <kbd>⌘K</kbd></button>
          </span>
        </span>
      </div>
      <div className="frame-area" ref={frameRef}>
        {!anyOpen && <div className="empty-hint"><b>No windows open</b><span>Pick a tool below, or press <kbd>⌘K</kbd>.</span></div>}
        {TOOLS.map((t) =>
          project.windows[t.id].open ? (
            <Window key={t.id} id={t.id} win={project.windows[t.id]} title={titles[t.id]} focused={project.windows[t.id].z === top}
              bounds={bounds} settings={t.settings} className={`win-${t.id}`}>
              {bodies[t.id]}
            </Window>
          ) : null,
        )}
      </div>
      <nav className="dock" ref={dockRef}>
        <i className="dock-glide" ref={glideRef} />
        <button className="dock-item dock-home" onClick={() => useStore.getState().openProject(null)} title="All projects">
          <I.home />
        </button>
        <i className="dock-sep" />
        {TOOLS.map((t, i) => {
          const w = project.windows[t.id]
          return (
            <button key={t.id} data-tool={t.id} className={`dock-item ${w.open ? 'open' : ''} ${focusedId === t.id ? 'front' : ''}`}
              title={`${t.label} (⌥${i + 1})`}
              onClick={() => {
                const s = useStore.getState()
                if (w.open && w.z !== top) s.focusWindow(t.id)
                else s.toggleWindow(t.id)
              }}>
              <span className="dock-num">{pad2(i + 1)}</span>
              <span className="dock-label">{t.label}</span>
            </button>
          )
        })}
        <i className="dock-sep" />
        <button className="dock-item dock-k" onClick={() => setPalette(true)} title="Command palette"><kbd>⌘K</kbd></button>
      </nav>
      {palette && <Palette commands={commands} onClose={() => setPalette(false)} />}
      <Toaster />
    </div>
  )
}
