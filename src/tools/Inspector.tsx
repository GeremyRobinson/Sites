import { newNode, useActivePage, useProject, useRawPage, useStore } from '../store'
import { VIEWS, effective, overrideCount } from '../views'
import type { SNode } from '../types'
import { fontFamilyOf } from '../ui/files'
import { childrenOf } from '../tree'
import * as A from './canvasActions'
import { AlignMatrix } from '../ui/AlignMatrix'
import { ColorDot, Pick, Row, Scrub, Section, Seg, Toggle } from '../ui/controls'
import { I } from '../ui/icons'
import { bindable, titleField } from '../cms'
import { textPatch } from '../theme'
import { ComponentVars, InstanceVars, LayerVars } from './Variables'

const ALIGN_ICONS = {
  left: I.alignLeft, hcenter: I.alignHCenter, right: I.alignRight, top: I.alignTop, vcenter: I.alignVCenter, bottom: I.alignBottom,
} as Record<string, typeof I.alignLeft>
const AlignIcon = ({ k }: { k: string }) => { const C = ALIGN_ICONS[k]; return <C /> }

export function Inspector() {
  const project = useProject()!
  const page = useActivePage()!
  const selection = useStore((s) => s.selection)
  const st = useStore.getState
  const nodes = page.nodes.filter((n) => selection.includes(n.id))
  const set = (patch: Partial<SNode> | ((n: SNode) => Partial<SNode>)) => st().updateNodes(selection, patch)
  const same = <K extends keyof SNode>(k: K) => nodes.every((n) => n[k] === nodes[0][k])
  const n = nodes[0]
  const isComp = page.kind === 'component'
  const raw = useRawPage()!
  const bp = effective(raw, useStore((s) => s.breakpoint))
  const viewLabel = VIEWS.find((v) => v.bp === bp)!.label
  const cms = project.cms || []
  const pageColl = cms.find((c) => c.id === page.collection)
  const setSize = (patch: { width?: number; height?: number }) =>
    bp === 'desktop' ? st().updatePage(page.id, patch) : st().updateView(page.id, bp, patch)

  if (!n) {
    const uses = isComp ? project.pages.reduce((c, p) => c + p.nodes.filter((x) => x.componentId === page.id).length, 0) : 0
    return (
      <aside className="cv-inspector" key={page.id}>
        <div className="in-title">
          <input className="in-name" key={page.id + page.name} defaultValue={page.name} onBlur={(e) => st().updatePage(page.id, { name: e.target.value || page.name })} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
          <span className="in-kind">{isComp ? 'Component' : 'Page'}</span>
        </div>
        <Section label={isComp ? 'Component' : 'Page'}>
          {!isComp && <Row label="Path"><input className="mono" key={page.id + page.path} defaultValue={page.path} onBlur={(e) => st().updatePage(page.id, { path: e.target.value.startsWith('/') ? e.target.value : '/' + e.target.value })} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} /></Row>}
          {!isComp && (
            <Row label="Collection">
              <Pick value={page.collection || ''} onChange={(v) => st().updatePage(page.id, { collection: v || undefined })} title="Show this page once for every item">
                <option value="">None</option>
                {cms.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Pick>
            </Row>
          )}
          {pageColl && <div className="in-note">One page per {pageColl.name.toLowerCase()} item at <span className="mono">{page.path}/slug</span>. Text and images can show its fields.</div>}
          {isComp && <div className="in-note">Used {uses} time{uses === 1 ? '' : 's'}. Edits here update every instance.</div>}
        </Section>
        {isComp && <ComponentVars page={raw} />}
        <Section label={isComp ? 'Size' : `${viewLabel} size`}>
          <div className="in-pair">
            <Scrub label="W" value={page.width} min={isComp ? 1 : 100} onChange={(v) => setSize({ width: v })} />
            <Scrub label="H" value={page.height} min={isComp ? 1 : 100} onChange={(v) => setSize({ height: v })} />
          </div>
          <Row label="Fill"><ColorDot value={page.background} allowNone={isComp} onChange={(v) => st().updatePage(page.id, { background: v === 'none' ? 'transparent' : v })} /></Row>
          {bp !== 'desktop' && effective(raw, bp) === bp && (
            <button className="in-chip" onClick={() => st().fitView(bp)} title={`Drops the changes made in ${viewLabel.toLowerCase()} so every layer fits itself from ${bp === 'phone' && raw.views?.tablet ? 'tablet' : 'desktop'} again`}>
              Make all automatic
            </button>
          )}
        </Section>
        {!isComp && (
          <Section label="Views">
            <Row label="Desktop"><span className="in-note-inline mono">{raw.width}+</span></Row>
            {(['tablet', 'phone'] as const).map((v) => (
              <Row key={v} label={v === 'tablet' ? 'Tablet' : 'Phone'}>
                {raw.views?.[v] && <span className="in-note-inline mono">{raw.views[v]!.width}</span>}
                <Toggle on={!!raw.views?.[v]} label={v} onChange={(on) => { st().checkpoint(); st().updateView(page.id, v, on ? {} : null); if (!on) st().setBreakpoint('desktop') }} />
              </Row>
            ))}
            <div className="in-note">Tablet and phone fit themselves to desktop as you design. Anything you change in a view stays in that view.</div>
          </Section>
        )}
        <p className="in-tip">Select a layer to edit it. Press <kbd>?</kbd> for shortcuts, <kbd>⌘K</kbd> for any command.</p>
      </aside>
    )
  }

  const parent = n.parentId ? page.nodes.find((x) => x.id === n.parentId) : undefined
  const inFlow = nodes.every((m) => m.parentId === n.parentId) && A.isFlow(parent)
  const sibs = parent ? childrenOf(page.nodes, parent.id) : []
  const sibsOf = (id: string) => childrenOf(page.nodes, id)
  const fonts = project.assets.filter((a) => a.kind === 'font')
  const one = nodes.length === 1
  const texts = project.styles?.text || []
  // Changing a styled text's look by hand detaches it from its style.
  // In tablet and phone the change stays in that view and the style link is kept.
  const setT = (patch: Partial<SNode>) => set(bp === 'desktop' ? { ...patch, textStyle: undefined } : patch)
  const frame = one && n.type === 'frame' ? n : undefined
  const canFit = (m: SNode) => m.type === 'text' || m.type === 'instance' || (m.type === 'frame' && A.isFlow(m))
  const kind = n.type === 'frame' ? (n.layout === 'stack' ? 'Stack' : n.layout === 'grid' ? 'Grid' : 'Frame') : n.type === 'instance' ? 'Instance' : n.type === 'ellipse' ? 'Oval' : n.type === 'rect' ? 'Rectangle' : n.type[0].toUpperCase() + n.type.slice(1)
  const comp = n.type === 'instance' ? project.pages.find((p) => p.id === n.componentId) : undefined
  const idx = sibs.findIndex((x) => x.id === n.id)
  // The collection a layer can show fields from: its nearest list, or the page's collection.
  let scope = pageColl
  for (let a = parent; a; a = a.parentId ? page.nodes.find((x) => x.id === a!.parentId) : undefined) {
    if (a.list) { scope = cms.find((c) => c.id === a!.list!.collection) || scope; break }
  }
  const fields = scope && one ? scope.fields.filter((f) => bindable(n.type, f)) : []
  const listColl = frame?.list ? cms.find((c) => c.id === frame.list!.collection) : undefined
  // Turning a frame into a list: it flows as a stack, and an empty frame gets a first layer to repeat.
  const makeList = (id: string) => {
    if (!frame) return
    st().checkpoint()
    if (!id) return set({ list: undefined })
    const c = cms.find((x) => x.id === id)!
    set({ list: { collection: id }, ...(A.isFlow(frame) ? {} : { layout: 'stack', dir: 'column', gap: frame.gap || 16 }) })
    if (!sibsOf(frame.id).length) {
      const t = titleField(c)
      st().addNodes([newNode('text', { parentId: frame.id, name: t?.name || 'Title', text: t?.name || 'Title', bind: t?.id, wMode: 'fill' })], false)
    }
  }

  // W or H: a scrub row with its sizing mode as a small pill on the right.
  const size = (axis: 'w' | 'h') => {
    const key = axis === 'w' ? 'wMode' : 'hMode'
    const v = (n[key] || 'fixed') as 'fixed' | 'fill' | 'fit'
    return (
      <div className="in-size">
        <Scrub label={axis.toUpperCase()} value={n[axis]} min={1} mixed={!same(axis)} onChange={(x) => set({ [axis]: x, [key]: undefined })} />
        <span className={`in-mode ${v !== 'fixed' ? 'on' : ''}`}>
          <Pick value={same(key) ? v : ''} onChange={(x) => set({ [key]: x === 'fixed' ? undefined : x })} title={`${axis === 'w' ? 'Width' : 'Height'} sizing`}>
            {!same(key) && <option value="">Mixed</option>}
            <option value="fixed">Fixed</option>
            <option value="fill">Fill</option>
            {nodes.every(canFit) && <option value="fit">Fit</option>}
          </Pick>
        </span>
      </div>
    )
  }

  const rawSel = nodes.map((m) => raw.nodes.find((x) => x.id === m.id)).filter((m): m is SNode => !!m)
  const differs = rawSel.filter((m) => m.bp).length
  const differsIn = (['tablet', 'phone'] as const).filter((v) => raw.views?.[v] && rawSel.some((m) => m.bp?.[v])).join(' and ') || 'other views'
  const overridden = nodes.reduce((c, m) => c + overrideCount(raw.nodes.find((x) => x.id === m.id)!, bp), 0)

  return (
    <aside className="cv-inspector">
      {bp !== 'desktop' && (
        <div className="in-view">
          <span><b>{viewLabel}</b> {overridden ? `${overridden} change${overridden === 1 ? '' : 's'} here` : 'Fits ' + (bp === 'phone' && raw.views?.tablet ? 'tablet' : 'desktop') + ' automatically'}</span>
          {overridden > 0 && <button onClick={() => st().resetView(selection)} title="Go back to the view above">Reset</button>}
        </div>
      )}

      <div className="in-title">
        {one
          ? <input className="in-name" key={n.id + n.name} defaultValue={n.name} onBlur={(e) => set({ name: e.target.value || n.name })} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
          : <span className="in-name">{nodes.length} layers</span>}
        {one && <span className={`in-kind ${n.type === 'instance' ? 'inst' : ''}`}>{kind}</span>}
      </div>
      {!inFlow && (
        <div className="in-align" role="group" aria-label="Align">
          {(['left', 'hcenter', 'right', 'top', 'vcenter', 'bottom'] as const).map((k) => (
            <button key={k} title={`Align ${k === 'hcenter' ? 'centre' : k === 'vcenter' ? 'middle' : k}${nodes.length > 1 ? '' : ' in parent'}`} onClick={() => A.alignSelection(k)}><AlignIcon k={k} /></button>
          ))}
        </div>
      )}

      {frame && (
        <Section label="Layout">
          <Seg value={frame.layout || 'free'} options={[['free', 'Free'], ['stack', 'Stack', 'Stack (⇧A)'], ['grid', 'Grid', 'Grid (⇧G)']]} onChange={(v) => A.setLayout(v)} />
          <Row label="Clip content" title="Hide anything that spills outside this frame"><Toggle on={frame.clip !== false} label="Clip content" onChange={(v) => { st().checkpoint(); set({ clip: v ? undefined : false }) }} /></Row>
          {frame.layout === 'stack' && (
            <>
              <div className="in-matrix">
                <AlignMatrix frame={frame} onChange={(p) => { st().checkpoint(); set(p) }} />
                <div className="in-matrix-side">
                  <Seg size="sm" value={frame.dir || 'column'} options={[['row', '→', 'Row'], ['column', '↓', 'Column']]} onChange={(dir) => set({ dir })} />
                  <button className={`in-chip ${frame.justify === 'between' ? 'on' : ''}`} aria-pressed={frame.justify === 'between'} title="Spread children to both ends"
                    onClick={() => { st().checkpoint(); set({ justify: frame.justify === 'between' ? 'start' : 'between' }) }}>Space between</button>
                  <button className={`in-chip ${frame.align === 'stretch' ? 'on' : ''}`} aria-pressed={frame.align === 'stretch'} title="Stretch children across the stack"
                    onClick={() => { st().checkpoint(); set({ align: frame.align === 'stretch' ? 'start' : 'stretch' }) }}>Stretch</button>
                </div>
              </div>
              <Scrub label="Gap" value={frame.gap || 0} min={0} range={[0, 80]} onChange={(gap) => set({ gap })} />
              <Scrub label="Padding" value={frame.pad || 0} min={0} range={[0, 80]} onChange={(pad) => set({ pad })} />
              <Row label="Wrap"><Toggle on={!!frame.wrap} label="Wrap" onChange={(v) => { st().checkpoint(); set({ wrap: v || undefined }) }} /></Row>
            </>
          )}
          {frame.layout === 'grid' && (
            <>
              <div className="in-matrix">
                <AlignMatrix frame={frame} onChange={(p) => { st().checkpoint(); set(p) }} />
                <div className="in-matrix-side">
                  <button className={`in-chip ${frame.align === 'stretch' ? 'on' : ''}`} aria-pressed={frame.align === 'stretch'} title="Stretch cells to the row's height"
                    onClick={() => { st().checkpoint(); set({ align: frame.align === 'stretch' ? 'start' : 'stretch' }) }}>Stretch</button>
                  <span className="in-note-inline">Where each child sits in its cell.</span>
                </div>
              </div>
              <Scrub label="Columns" value={frame.cols || 2} min={1} max={24} range={[1, 12]} onChange={(cols) => set({ cols: Math.round(cols) })} />
              <Scrub label="Gap" value={frame.gap || 0} min={0} range={[0, 80]} onChange={(gap) => set({ gap })} />
              <Scrub label="Padding" value={frame.pad || 0} min={0} range={[0, 80]} onChange={(pad) => set({ pad })} />
            </>
          )}
          {(frame.layout || 'free') === 'free' && <div className="in-note">Children are placed freely. <kbd>⇧A</kbd> turns this into a stack.</div>}
        </Section>
      )}

      {frame && cms.length > 0 && (
        <Section label="Collection">
          <Row label="List">
            <Pick value={frame.list?.collection || ''} onChange={makeList} title="Repeat the first layer once per item">
              <option value="">None</option>
              {cms.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Pick>
          </Row>
          {listColl && (
            <>
              <Row label="Sort by">
                <Pick value={frame.list!.sort || ''} onChange={(v) => set({ list: { ...frame.list!, sort: v || undefined } })}>
                  <option value="">CMS order</option>
                  <option value="slug">Slug</option>
                  {listColl.fields.filter((f) => f.type !== 'image' && f.type !== 'long').map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </Pick>
              </Row>
              {frame.list!.sort && (
                <Seg size="sm" value={frame.list!.desc ? 'desc' : 'asc'} options={[['asc', 'Ascending'], ['desc', 'Descending']]} onChange={(v) => set({ list: { ...frame.list!, desc: v === 'desc' || undefined } })} />
              )}
              <Scrub label="Show" value={frame.list!.limit || 0} min={0} max={100} range={[0, 24]} title="How many items to show. 0 shows them all."
                onChange={(v) => set({ list: { ...frame.list!, limit: Math.round(v) || undefined } })} />
              <div className="in-note">Repeats its first layer for each published item. Text and images inside it can show fields.</div>
            </>
          )}
        </Section>
      )}

      {fields.length > 0 && (
        <Section label="Content">
          <Row label="Field">
            <Pick value={n.bind || ''} onChange={(v) => set({ bind: v || undefined })} title={`Show a ${scope!.name.toLowerCase()} field`}>
              <option value="">None</option>
              {fields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </Pick>
          </Row>
        </Section>
      )}

      <Section label={inFlow ? `In ${parent!.name}` : 'Position & size'} aside={inFlow ? <span className="in-order mono">{idx + 1} / {sibs.length}</span> : undefined}>
        {inFlow ? (
          <div className="in-pair">
            <button className="in-btn" disabled={idx <= 0} onClick={() => A.moveInFlow(parent!.dir === 'row' ? 'left' : 'up')}>{parent!.dir === 'row' ? '←' : '↑'} Earlier</button>
            <button className="in-btn" disabled={idx >= sibs.length - 1} onClick={() => A.moveInFlow(parent!.dir === 'row' ? 'right' : 'down')}>Later {parent!.dir === 'row' ? '→' : '↓'}</button>
          </div>
        ) : (
          <div className="in-pair">
            <Scrub label="X" value={n.x} mixed={!same('x')} onChange={(v) => set({ x: v })} />
            <Scrub label="Y" value={n.y} mixed={!same('y')} onChange={(v) => set({ y: v })} />
          </div>
        )}
        {size('w')}
        {size('h')}
        <div className="in-pair">
          <Scrub label="Rotate" value={n.rotation} mixed={!same('rotation')} unit="°" onChange={(v) => set({ rotation: v })} />
          {n.type !== 'text' && n.type !== 'ellipse' && n.type !== 'path'
            ? <Scrub label="Radius" value={n.radius} min={0} mixed={!same('radius')} onChange={(v) => set({ radius: v })} />
            : <span />}
        </div>
        <Scrub label="Opacity" value={Math.round(n.opacity * 100)} min={0} max={100} range={[0, 100]} unit="%" mixed={!same('opacity')} onChange={(v) => set({ opacity: v / 100 })} />
      </Section>

      {comp && one && (
        <Section label="Component">
          <Row label="Uses">
            <Pick value={n.componentId || ''} onChange={(v) => set({ componentId: v })}>
              {project.pages.filter((p) => p.kind === 'component' && p.id !== page.id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Pick>
          </Row>
          <div className="in-pair">
            <button className="in-btn primary" onClick={() => A.editComponent(n.id)}>Edit component</button>
            <button className="in-btn" onClick={() => A.detachSelection()} title="⌥⌘B">Detach</button>
          </div>
        </Section>
      )}
      {comp && one && <InstanceVars n={n} comp={comp} scope={scope} />}
      {isComp && one && <LayerVars n={n} page={raw} />}

      {n.type === 'text' && (
        <Section label="Text">
          <Row label="Style">
            <Pick value={same('textStyle') ? n.textStyle || '' : ''} onChange={(v) => {
              const t = texts.find((x) => x.id === v)
              set(t ? { ...textPatch(t), textStyle: t.id } : { textStyle: undefined })
            }} title="Text style">
              <option value="">{texts.length ? 'None' : 'None yet'}</option>
              {texts.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Pick>
          </Row>
          {fonts.length > 0 && (
            <Row label="Font">
              <Pick value={n.fontFamily || ''} onChange={(v) => setT({ fontFamily: v || undefined })}>
                <option value="">Sites Sans</option>
                {fonts.map((f) => <option key={f.id} value={fontFamilyOf(f)}>{fontFamilyOf(f)}</option>)}
              </Pick>
            </Row>
          )}
          <Scrub label="Size" value={n.fontSize || 16} min={1} range={[8, 120]} onChange={(v) => setT({ fontSize: v })} />
          <Scrub label="Weight" value={n.fontWeight || 400} min={400} max={700} step={10} range={[400, 700]} onChange={(v) => setT({ fontWeight: v })} />
          <div className="in-pair">
            <Scrub label="Line" value={n.lineHeight || 1.2} min={0.5} step={0.05} onChange={(v) => setT({ lineHeight: v })} />
            <Scrub label="Track" value={n.letterSpacing || 0} step={0.1} onChange={(v) => setT({ letterSpacing: v })} />
          </div>
          <Row label="Color"><ColorDot value={n.color || '#111111'} onChange={(v) => setT({ color: v })} /></Row>
          <Seg size="sm" value={n.textAlign || 'left'} options={[['left', 'Left'], ['center', 'Centre'], ['right', 'Right']]} onChange={(textAlign) => set({ textAlign })} />
          <div className="in-pair">
            <Seg size="sm" value={n.textTransform || 'none'} options={[['none', 'Aa', 'As typed'], ['uppercase', 'AA', 'Uppercase'], ['lowercase', 'aa', 'Lowercase']]}
              onChange={(v) => set({ textTransform: v === 'none' ? undefined : v })} />
            <Seg size="sm" value={n.textDecoration || 'none'} options={[['none', '–', 'No line'], ['underline', 'U', 'Underline'], ['line-through', 'S', 'Strikethrough']]}
              onChange={(v) => set({ textDecoration: v === 'none' ? undefined : v })} />
          </div>
          <Row label="Monospace"><Toggle on={!!n.mono} label="Monospace" onChange={(v) => { st().checkpoint(); set({ mono: v }) }} /></Row>
        </Section>
      )}

      {n.type !== 'image' && n.type !== 'instance' && (
        <Section label={n.type === 'text' ? 'Background' : 'Fill'}>
          <Row label="Color"><ColorDot value={n.fill} allowNone onChange={(v) => set({ fill: v })} /></Row>
        </Section>
      )}

      {n.type === 'image' && (
        <Section label="Image">
          <Row label="Source">
            <Pick value={n.assetId || ''} onChange={(v) => set({ assetId: v })}>
              {project.assets.filter((a) => a.kind === 'image').map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Pick>
          </Row>
          <Seg size="sm" value={n.fit || 'cover'} options={[['cover', 'Fill'], ['contain', 'Fit']]} onChange={(fit) => set({ fit })} />
          <Row label="Alt text" title="Describes the image for screen readers and search">
            <input key={n.id + (n.alt || '')} defaultValue={n.alt || ''} placeholder="Describe the image" spellCheck
              onBlur={(e) => { if (e.target.value !== (n.alt || '')) { st().checkpoint(); set({ alt: e.target.value.trim() || undefined }) } }}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
          </Row>
        </Section>
      )}

      {n.type !== 'text' && n.type !== 'instance' && (
        <Section label="Border">
          <Row label="Color"><ColorDot value={n.stroke} allowNone onChange={(v) => set({ stroke: v, strokeWidth: v === 'none' ? 0 : n.strokeWidth || 1 })} /></Row>
          {n.stroke !== 'none' && <Scrub label="Width" value={n.strokeWidth} min={0} range={[0, 12]} onChange={(v) => set({ strokeWidth: v })} />}
        </Section>
      )}

      <Section label="Effects">
        <Row label="Shadow">
          {n.shadow && <ColorDot value={n.shadow.color} onChange={(c) => set({ shadow: { ...n.shadow!, color: c } })} />}
          <Toggle on={!!n.shadow} label="Shadow" onChange={(v) => { st().checkpoint(); set({ shadow: v ? { x: 0, y: 8, blur: 24, spread: 0, color: 'rgba(0,0,0,0.12)' } : undefined }) }} />
        </Row>
        {n.shadow && (
          <>
            <div className="in-pair">
              <Scrub label="X" value={n.shadow.x} onChange={(x) => set({ shadow: { ...n.shadow!, x } })} />
              <Scrub label="Y" value={n.shadow.y} onChange={(y) => set({ shadow: { ...n.shadow!, y } })} />
            </div>
            <div className="in-pair">
              <Scrub label="Blur" value={n.shadow.blur} min={0} onChange={(blur) => set({ shadow: { ...n.shadow!, blur } })} />
              <Scrub label="Spread" value={n.shadow.spread || 0} onChange={(spread) => set({ shadow: { ...n.shadow!, spread } })} />
            </div>
          </>
        )}
        <Scrub label="Layer blur" value={n.blur || 0} min={0} range={[0, 40]} onChange={(v) => set({ blur: v || undefined })} />
        {n.type !== 'text' && <Scrub label="Background blur" value={n.bgBlur || 0} min={0} range={[0, 40]} title="Blurs what's behind this layer; use with a see-through fill" onChange={(v) => set({ bgBlur: v || undefined })} />}
      </Section>

      <Section label="Wrap in">
        <div className="in-wrap">
          <button onClick={() => A.wrapSelection('free')}>Frame <kbd>⌘⏎</kbd></button>
          <button onClick={() => A.wrapSelection('stack')}>Stack <kbd>⇧A</kbd></button>
          <button onClick={() => A.wrapSelection('grid')}>Grid <kbd>⇧G</kbd></button>
          <button onClick={() => A.componentFromSelection()}>Component <kbd>⌥⌘K</kbd></button>
        </div>
      </Section>

      <Section label="Interaction">
        <Row label="Link to">
          <Pick value={n.link || (n.href !== undefined ? '@web' : '')} onChange={(v) => set(v === '@web' ? { link: undefined, href: n.href || 'https://' } : { link: v || undefined, href: undefined, newTab: undefined })}>
            <option value="">None</option>
            {!isComp && project.pages.filter((p) => p.kind !== 'component').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            <option value="@web">Web address</option>
          </Pick>
        </Row>
        {n.href !== undefined && (
          <>
            <input className="field mono in-url" key={n.id + n.href} defaultValue={n.href} spellCheck={false} aria-label="Web address"
              onBlur={(e) => { const v = e.target.value.trim(); if (v !== n.href) { st().checkpoint(); set({ href: v }) } }}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
            <Row label="Open in new tab"><Toggle on={!!n.newTab} label="Open in new tab" onChange={(v) => { st().checkpoint(); set({ newTab: v || undefined }) }} /></Row>
          </>
        )}
        <Row label="Cursor">
          <Pick value={n.cursor || ''} onChange={(v) => set({ cursor: (v || undefined) as SNode['cursor'] })}>
            <option value="">Auto</option>
            <option value="pointer">Pointer</option>
            <option value="default">Arrow</option>
            <option value="text">Text</option>
            <option value="grab">Grab</option>
          </Pick>
        </Row>
        <Row label="Hover">
          <Toggle on={!!n.hover} label="Hover effect" onChange={(v) => { st().checkpoint(); set({ hover: v ? { scale: 1.03 } : undefined }) }} />
        </Row>
        {n.hover && (
          <>
            <div className="in-pair">
              <Scrub label="Scale" value={Math.round((n.hover.scale ?? 1) * 100)} min={10} max={300} unit="%" onChange={(v) => set({ hover: { ...n.hover, scale: v / 100 } })} />
              <Scrub label="Y" value={n.hover.y || 0} onChange={(y) => set({ hover: { ...n.hover, y: y || undefined } })} />
            </div>
            <Scrub label="Opacity" value={Math.round((n.hover.opacity ?? 1) * 100)} min={0} max={100} range={[0, 100]} unit="%" onChange={(v) => set({ hover: { ...n.hover, opacity: v === 100 ? undefined : v / 100 } })} />
            {n.type !== 'text' && n.type !== 'image' && (
              <Row label="Fill"><ColorDot value={n.hover.fill || 'none'} allowNone onChange={(c) => set({ hover: { ...n.hover, fill: c === 'none' ? undefined : c } })} /></Row>
            )}
            {n.type === 'text' && (
              <Row label="Color"><ColorDot value={n.hover.color || 'none'} allowNone onChange={(c) => set({ hover: { ...n.hover, color: c === 'none' ? undefined : c } })} /></Row>
            )}
          </>
        )}
        <Row label="Appear" title="Fades in when scrolled into view">
          <Toggle on={!!n.appear} label="Appear effect" onChange={(v) => { st().checkpoint(); set({ appear: v ? { opacity: 0, y: 24, duration: 0.6 } : undefined }) }} />
        </Row>
        {n.appear && (
          <>
            <div className="in-pair">
              <Scrub label="From Y" value={n.appear.y || 0} onChange={(y) => set({ appear: { ...n.appear, y } })} />
              <Scrub label="Scale" value={Math.round((n.appear.scale ?? 1) * 100)} min={10} max={300} unit="%" onChange={(v) => set({ appear: { ...n.appear, scale: v / 100 } })} />
            </div>
            <Scrub label="From opacity" value={Math.round((n.appear.opacity ?? 0) * 100)} min={0} max={100} range={[0, 100]} unit="%" onChange={(v) => set({ appear: { ...n.appear, opacity: v / 100 } })} />
            <div className="in-pair">
              <Scrub label="Time" value={n.appear.duration ?? 0.6} min={0} step={0.05} unit="s" onChange={(duration) => set({ appear: { ...n.appear, duration } })} />
              <Scrub label="Delay" value={n.appear.delay || 0} min={0} step={0.05} unit="s" onChange={(delay) => set({ appear: { ...n.appear, delay: delay || undefined } })} />
            </div>
          </>
        )}
        {(n.hover || n.appear) && <div className="in-note">Plays in Preview and on the exported site.</div>}
      </Section>

      {bp === 'desktop' && differs > 0 && (
        <Section label="Views">
          <div className="in-note">{differs === 1 && one ? 'This layer is' : `${differs} of these layers are`} set differently in {differsIn}.</div>
          <button className="in-chip" onClick={() => st().resetViews(selection)} title="Drops the tablet and phone changes so these layers follow desktop everywhere">Match desktop everywhere</button>
        </Section>
      )}
    </aside>
  )
}
