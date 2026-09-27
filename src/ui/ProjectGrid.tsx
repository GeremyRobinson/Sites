import { useLayoutEffect, useRef } from 'react'
import { useStore } from '../store'
import { stagger } from './motion'
import { PageThumb } from './NodeView'
import { ago } from './time'
import { ConfirmButton } from './ConfirmButton'
import { ThemeSwitch } from './theme'

const pad = (n: number) => String(n).padStart(2, '0')


export function ProjectGrid() {
  const projects = useStore((s) => s.projects)
  const { createProject, openProject, deleteProject, duplicateProject } = useStore.getState()
  const sorted = [...projects].sort((a, b) => b.updatedAt - a.updatedAt)

  const create = () => openProject(createProject('Untitled'))
  const gridRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => { if (gridRef.current) stagger(gridRef.current.children) }, [])

  return (
    <div className="home">
      <header className="home-head">
        <span className="wordmark">Sites</span>
        <div className="row" style={{ gap: 10 }}>
          <ThemeSwitch />
          <button className="btn primary" onClick={create}>New project</button>
        </div>
      </header>

      <div className="home-bar">
        <h1 className="home-title">Projects<span>{pad(projects.length)}</span></h1>
        <span className="label">Last edited first</span>
      </div>

      <div className="grid" ref={gridRef}>
        {sorted.map((p) => {
          const home = p.pages.find((pg) => pg.kind !== 'component') || p.pages[0]
          const nPages = p.pages.filter((pg) => pg.kind !== 'component').length
          const nComps = p.pages.length - nPages
          const landscape = home.width >= home.height
          return (
            <div key={p.id} className="block" onClick={() => openProject(p.id)}>
              <div className="block-face">
                <div className="thumb">
                  <PageThumb page={home} pages={p.pages} assets={p.assets} cms={p.cms} colors={p.styles?.colors} width={landscape ? 200 : 140} />
                </div>
                <div className="block-actions" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => duplicateProject(p.id)}>Duplicate</button>
                  <ConfirmButton label="Delete" confirmLabel="Click to delete" onConfirm={() => deleteProject(p.id)} />
                </div>
              </div>
              <div className="block-meta">
                <div className="grow">
                  <div className="block-title">{p.name}</div>
                  <div className="block-sub">{nPages} page{nPages === 1 ? '' : 's'}{nComps ? ` · ${nComps} component${nComps === 1 ? '' : 's'}` : ''} · {ago(p.updatedAt)}</div>
                </div>
              </div>
            </div>
          )
        })}
        <div className="block block-new" onClick={create}>
          <div className="block-face"><span className="plus">+</span></div>
          <div className="block-meta">
            <div className="grow">
              <div className="block-title">New project</div>
              <div className="block-sub">Empty · 1200 × 900</div>
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}
