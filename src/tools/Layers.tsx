import { useState } from 'react'
import { useActivePage, useProject, useStore } from '../store'
import type { Page, SNode } from '../types'
import { childrenOf, descendantIds } from '../tree'
import { isFlow, reparent } from './canvasActions'
import { effective, overrideCount } from '../views'
import { I } from '../ui/icons'
import { Seg } from '../ui/controls'
import { Assets } from './Assets'

const icon = (n: SNode) => {
  const C = n.type === 'frame' ? (n.list ? I.list : n.layout === 'stack' ? (n.dir === 'row' ? I.stackRow : I.stack) : n.layout === 'grid' ? I.grid : I.frame)
    : ({ text: I.text, rect: I.rect, ellipse: I.ellipse, image: I.image, path: I.path, instance: I.instance } as Record<string, typeof I.frame>)[n.type] || I.frame
  return <C size={14} />
}

type Drop = { id: string; where: 'before' | 'after' | 'inside' } | null

export function Layers() {
  const project = useProject()!
  const page = useActivePage()!
  const selection = useStore((s) => s.selection)
  const s = useStore.getState
  const [renaming, setRenaming] = useState<string | null>(null)
  const [adding, setAdding] = useState<'page' | 'component' | null>(null)
  const [closed, setClosed] = useState<Set<string>>(new Set())
  const [drag, setDrag] = useState<string[] | null>(null)
  const [drop, setDrop] = useState<Drop>(null)
  const bp = effective(page, useStore((st) => st.breakpoint))

  const pages = project.pages.filter((p) => p.kind !== 'component')
  const comps = project.pages.filter((p) => p.kind === 'component')
  const byId = new Map(page.nodes.map((n) => [n.id, n]))

  // Stack and grid children list in layout order; free children list front-most first.
  const ordered = (parentId?: string) => {
    const kids = childrenOf(page.nodes, parentId)
    return isFlow(byId.get(parentId!)) ? kids : [...kids].reverse()
  }

  const doDrop = () => {
    if (!drag || !drop) return
    const target = byId.get(drop.id)!
    const blocked = new Set(drag.flatMap((id) => [id, ...descendantIds(page.nodes, id)]))
    if (blocked.has(drop.id)) return
    if (drop.where === 'inside') {
      if (target.type !== 'frame') return
      reparent(drag, target.id, childrenOf(page.nodes, target.id).filter((n) => !drag.includes(n.id)).length)
    } else {
      const parentId = target.parentId
      const sibs = childrenOf(page.nodes, parentId).filter((n) => !drag.includes(n.id))
      const i = sibs.findIndex((n) => n.id === target.id)
      const natural = isFlow(byId.get(parentId!))
      const above = drop.where === 'before'
      reparent(drag, parentId, natural ? (above ? i : i + 1) : above ? i + 1 : i)
    }
    s().setSelection(drag)
  }

  const row = (n: SNode, depth: number) => {
    const kids = ordered(n.id)
    const open = !closed.has(n.id)
    const on = selection.includes(n.id)
    const dropCls = drop?.id === n.id ? `drop-${drop.where}` : ''
    return (
      <div key={n.id}>
        <div
          className={`cv-li ${on ? 'on' : ''} ${n.hidden ? 'dim' : ''} ${dropCls}`}
          style={{ paddingLeft: 8 + depth * 14 }}
          draggable={renaming !== n.id}
          onDragStart={(e) => {
            const ids = on ? selection : [n.id]
            setDrag(ids)
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData('text/plain', n.name)
          }}
          onDragEnd={() => { setDrag(null); setDrop(null) }}
          onDragOver={(e) => {
            if (!drag) return
            e.preventDefault()
            const r = e.currentTarget.getBoundingClientRect()
            const f = (e.clientY - r.top) / r.height
            setDrop({ id: n.id, where: n.type === 'frame' && f > 0.28 && f < 0.72 ? 'inside' : f < 0.5 ? 'before' : 'after' })
          }}
          onDrop={(e) => { e.preventDefault(); doDrop(); setDrag(null); setDrop(null) }}
          onClick={(e) => {
            const sel = s().selection
            s().setSelection(e.shiftKey ? (sel.includes(n.id) ? sel.filter((x) => x !== n.id) : [...sel, n.id]) : [n.id])
          }}
          onDoubleClick={() => setRenaming(n.id)}
        >
          <button className={`cv-twisty ${kids.length ? '' : 'none'} ${open ? '' : 'closed'}`} onClick={(e) => {
            e.stopPropagation()
            setClosed((c) => { const x = new Set(c); x.has(n.id) ? x.delete(n.id) : x.add(n.id); return x })
          }}>{kids.length ? <I.twisty /> : ''}</button>
          <span className={`cv-ico mono ${n.type === 'instance' ? 'inst' : ''}`}>{icon(n)}</span>
          {renaming === n.id ? (
            <input autoFocus className="field grow" defaultValue={n.name} style={{ height: 24, padding: '0 6px', borderRadius: 6 }}
              onBlur={(e) => { s().updateNodes([n.id], { name: e.target.value || n.name }); setRenaming(null) }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur() }} />
          ) : <span className="grow ellipsis">{n.name}</span>}
          {overrideCount(n, bp) > 0 && <i className="cv-changed" title="Changed in this view" />}
          <button className="cv-li-act" title={n.locked ? 'Unlock' : 'Lock'} onClick={(e) => { e.stopPropagation(); s().updateNodes([n.id], { locked: !n.locked }) }}>
            {n.locked ? 'Locked' : 'Lock'}
          </button>
          <button className="cv-li-act" title={n.hidden ? 'Show' : 'Hide'} onClick={(e) => { e.stopPropagation(); s().updateNodes([n.id], { hidden: !n.hidden }) }}>
            {n.hidden ? 'Show' : 'Hide'}
          </button>
        </div>
        {open && kids.map((k) => row(k, depth + 1))}
      </div>
    )
  }

  const pageRow = (pg: Page) => (
    <button key={pg.id} className={`cv-li ${pg.id === page.id ? 'on' : ''}`} onClick={() => s().setActivePage(pg.id)}>
      <span className={`cv-ico mono ${pg.kind === 'component' ? 'inst' : ''}`}>{pg.kind === 'component' ? <I.instance size={14} /> : <I.page size={14} />}</span>
      <span className="grow ellipsis">{pg.name}</span>
      <span className="cv-li-meta">{pg.kind === 'component' ? `${pg.width}×${pg.height}` : pg.path}</span>
    </button>
  )

  const addInput = (kind: 'page' | 'component') => (
    <input autoFocus className="field" placeholder={kind === 'page' ? 'Page name' : 'Component name'} style={{ height: 30, marginTop: 4, borderRadius: 8 }}
      onBlur={(e) => { const v = e.target.value.trim(); if (v) kind === 'page' ? s().addPage(v) : s().addComponent(v); setAdding(null) }}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setAdding(null) }} />
  )

  const tab = project.windows.canvas.settings.leftTab === 'assets' ? 'assets' : 'layers'
  return (
    <aside className="cv-layers">
      <div className="cv-left-tabs">
        <Seg size="sm" undo={false} value={tab} options={[['layers', 'Layers'], ['assets', 'Assets']]} onChange={(v) => s().setWindowSetting('canvas', 'leftTab', v)} />
      </div>
      {tab === 'assets' ? <Assets /> : <>
      <div className="cv-panel-head"><span>Pages</span><button className="link" onClick={() => setAdding('page')} title="Add page">+</button></div>
      <div className="cv-list">
        {pages.map(pageRow)}
        {adding === 'page' && addInput('page')}
      </div>
      <div className="cv-panel-head"><span>Components</span><button className="link" onClick={() => setAdding('component')} title="Add component">+</button></div>
      <div className="cv-list">
        {comps.length === 0 && adding !== 'component' && <div className="cv-empty">Select layers, then <kbd>⌥⌘K</kbd></div>}
        {comps.map(pageRow)}
        {adding === 'component' && addInput('component')}
      </div>
      <div className="cv-panel-head"><span>Layers</span><span className="tag">{page.nodes.length}</span></div>
      <div className="cv-list grow" style={{ overflow: 'auto' }}
        onDragOver={(e) => { if (drag) e.preventDefault() }}
        onDrop={(e) => {
          // Dropping below the list moves layers to the top level.
          if (!drag || drop) return
          e.preventDefault()
          reparent(drag, undefined, childrenOf(page.nodes, undefined).filter((n) => !drag.includes(n.id)).length)
          setDrag(null)
        }}>
        {page.nodes.length === 0 && <div className="cv-empty">Nothing here yet. Press <kbd>F</kbd>, <kbd>S</kbd> or <kbd>T</kbd> and drag on the canvas.</div>}
        {ordered(undefined).map((n) => row(n, 0))}
      </div>
      </>}
    </aside>
  )
}
