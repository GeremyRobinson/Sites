import { useEffect, useRef, useState } from 'react'
import { useProject, useStore } from '../store'
import type { Breakpoint } from '../types'
import { PageContent } from '../ui/NodeView'
import { Seg } from '../ui/controls'
import { VIEWS, effective, resolvePage } from '../views'
import { resolveColor, type Scheme } from '../theme'
import { watchAppear } from '../fx'

// Plays the site at 100%, with page links working, in any of its views.
export function Preview({ onClose }: { onClose: () => void }) {
  const project = useProject()!
  const pages = project.pages.filter((p) => p.kind !== 'component')
  const [pageId, setPageId] = useState(project.activePageId)
  const [itemId, setItemId] = useState<string>()
  const go = (id: string, item?: string) => { setPageId(id); setItemId(item) }
  const [bp, setBp] = useState<Breakpoint>(useStore.getState().breakpoint)
  const raw = project.pages.find((p) => p.id === pageId) || pages[0]
  const page = resolvePage(raw, bp)
  const views = VIEWS.filter((v) => v.bp === 'desktop' || raw.views?.[v.bp])
  const colors = project.styles?.colors || []
  const [scheme, setScheme] = useState<Scheme>(project.windows.canvas.settings.scheme === 'dark' ? 'dark' : 'light')
  // Appear effects play as layers scroll in; switching page or view plays them again.
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    el.querySelectorAll('[data-appear].in').forEach((e) => e.classList.remove('in'))
    return watchAppear(el)
  }, [pageId, itemId, bp])
  return (
    <div className="pv">
      <div className="pv-bar">
        <span className="tag">{project.settings.siteTitle}{raw.path || ` / ${raw.name}`}</span>
        {views.length > 1 && (
          <div className="cv-views">
            <Seg size="sm" undo={false} value={effective(raw, bp)} options={views.map((v) => [v.bp, v.label] as [Breakpoint, string])} onChange={setBp} />
          </div>
        )}
        {colors.some((c) => c.dark) && (
          <div className="cv-views">
            <Seg size="sm" undo={false} value={scheme} options={[['light', 'Light'], ['dark', 'Dark']]} onChange={setScheme} />
          </div>
        )}
        <div className="row" style={{ gap: 2 }}>
          {pages.map((p) => (
            <button key={p.id} className={`cv-tool ${p.id === raw.id ? 'on' : ''}`} onClick={() => go(p.id)}>{p.name}</button>
          ))}
          <button className="cv-tool" onClick={onClose}>Close <kbd>Esc</kbd></button>
        </div>
      </div>
      <div className="pv-scroll" ref={scroller} style={{ background: page.background === 'transparent' ? undefined : resolveColor(page.background, colors, scheme) }}>
        <div className="pv-page" style={{ position: 'relative', width: page.width, height: page.height, margin: '0 auto' }}>
          <PageContent page={page} pages={project.pages} assets={project.assets} cms={project.cms} itemId={itemId} onLink={go} colors={colors} scheme={scheme} fx />
        </div>
      </div>
    </div>
  )
}
