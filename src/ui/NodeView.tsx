import type { CSSProperties } from 'react'
import type { Asset, CmsItem, Collection, ColorStyle, Page, SNode } from '../types'
import { colorResolver, resolveColor, type Scheme } from '../theme'
import { fxRules } from '../fx'
import { childrenOf } from '../tree'
import { imageSrc, listItems, textValue } from '../cms'

const JUSTIFY = { start: 'flex-start', center: 'center', end: 'flex-end', between: 'space-between' } as const
const ALIGN = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch' } as const

// Style for one layer. `parent` decides whether it is placed absolutely or flows in a stack or grid.
// `col` turns stored colours (which can name a colour style) into what's drawn or written.
export function nodeStyle(n: SNode, parent?: SNode, col: (c: string) => string = (c) => c): CSSProperties {
  const flow = parent?.layout === 'stack' || parent?.layout === 'grid'
  const s: CSSProperties = { opacity: n.opacity === 1 ? undefined : n.opacity, transform: n.rotation ? `rotate(${n.rotation}deg)` : undefined }
  const wMode = n.wMode || 'fixed'
  const hMode = n.hMode || 'fixed'

  if (flow) {
    s.position = 'relative'
    s.flexShrink = 0
    const row = parent!.layout === 'stack' && (parent!.dir || 'column') === 'row'
    const main = parent!.layout === 'grid' ? null : row ? 'w' : 'h'
    for (const [axis, mode] of [['w', wMode], ['h', hMode]] as const) {
      const prop = axis === 'w' ? 'width' : 'height'
      if (mode === 'fixed') s[prop] = axis === 'w' ? n.w : n.h
      else if (mode === 'fill') {
        if (main === axis) { s.flex = '1 1 0'; s[axis === 'w' ? 'minWidth' : 'minHeight'] = 0 }
        else if (main === null) s[prop] = '100%'
        else s.alignSelf = 'stretch'
      }
    }
  } else {
    s.position = 'absolute'
    // Fill stretches across a free parent, so it starts at the parent's edge.
    s.left = wMode === 'fill' ? 0 : n.x
    s.top = hMode === 'fill' ? 0 : n.y
    if (wMode !== 'fit') s.width = wMode === 'fill' ? '100%' : n.w
    if (hMode !== 'fit') s.height = hMode === 'fill' ? '100%' : n.h
  }

  if (n.type === 'rect' || n.type === 'frame' || n.type === 'ellipse' || n.type === 'image' || n.type === 'instance') {
    if (n.type !== 'image' && n.fill !== 'transparent' && n.fill !== 'none') s.background = col(n.fill)
    const r = n.type === 'ellipse' ? '50%' : n.radius
    if (r) s.borderRadius = r
    // An inner border that doesn't change the layer's size, drawn with outline so shadows stay free.
    if (n.stroke !== 'none' && n.strokeWidth) { s.outline = `${n.strokeWidth}px solid ${col(n.stroke)}`; s.outlineOffset = -n.strokeWidth }
    if (n.type === 'frame' || n.type === 'image' || n.type === 'instance') s.overflow = n.clip === false && n.type === 'frame' ? 'visible' : 'hidden'
  }
  if (n.shadow) s.boxShadow = `${n.shadow.x}px ${n.shadow.y}px ${n.shadow.blur}px ${n.shadow.spread || 0}px ${col(n.shadow.color)}`
  if (n.blur) s.filter = `blur(${n.blur}px)`
  if (n.bgBlur) s.backdropFilter = `blur(${n.bgBlur}px)`
  if (n.cursor) s.cursor = n.cursor
  if (n.type === 'frame' && (n.layout === 'stack' || n.layout === 'grid')) {
    if (n.layout === 'stack') {
      s.display = 'flex'
      s.flexDirection = n.dir || 'column'
      if (n.wrap) s.flexWrap = 'wrap'
      s.justifyContent = JUSTIFY[n.justify || 'start']
      s.alignItems = ALIGN[n.align || 'start']
    } else {
      s.display = 'grid'
      s.gridTemplateColumns = `repeat(${n.cols || 2}, minmax(0, 1fr))`
      s.alignItems = ALIGN[n.align || 'start']
      if (n.justify && n.justify !== 'start' && n.justify !== 'between') s.justifyItems = n.justify
    }
    if (n.gap) s.gap = n.gap
    if (n.pad) s.padding = n.pad
  }
  if (n.type === 'text') {
    Object.assign(s, {
      margin: 0,
      fontSize: n.fontSize,
      fontWeight: n.fontWeight,
      lineHeight: n.lineHeight,
      letterSpacing: n.letterSpacing || undefined,
      color: n.color && col(n.color),
      textAlign: n.textAlign,
      textTransform: n.textTransform,
      textDecoration: n.textDecoration,
      whiteSpace: 'pre-wrap',
      background: n.fill === 'transparent' || n.fill === 'none' ? undefined : col(n.fill),
      fontFamily: n.fontFamily ? `'${n.fontFamily}', var(--font)` : undefined,
      fontVariationSettings: n.mono ? '"MONO" 100' : undefined,
    } satisfies CSSProperties)
  }
  return s
}

interface Ctx {
  nodes: SNode[]
  assets: Asset[]
  pages: Page[]
  editingId?: string | null
  interactive?: boolean // adds data-nid so the canvas can measure and hit-test layers
  onLink?: (pageId: string, itemId?: string) => void
  depth: number
  chain: string[] // component ids being rendered, to stop a component nesting itself
  cms?: Collection[]
  scope?: { c: Collection; it?: CmsItem } // the collection item a list repeat or a collection page shows
  col: (c: string) => string // colour styles, in the scheme being shown
  vals?: Record<string, string | number | boolean> // inside an instance: its component's variable values
  fx?: boolean // hover and appear effects are live (preview)
}

// A component layer's properties that come from the instance's variables.
function withVars(n: SNode, vals?: Ctx['vals']): SNode {
  if (!n.use || !vals) return n
  const v = (id?: string) => (id && id in vals ? vals[id] : undefined)
  const m = { ...n }
  if (v(n.use.text) !== undefined) m.text = String(v(n.use.text))
  if (typeof v(n.use.fill) === 'string' && v(n.use.fill)) m.fill = v(n.use.fill) as string
  if (typeof v(n.use.color) === 'string' && v(n.use.color)) m.color = v(n.use.color) as string
  return m
}

function One({ n: raw, parent, ctx }: { n: SNode; parent?: SNode; ctx: Ctx }) {
  if (raw.hidden) return null
  if (raw.use?.visible && ctx.vals && ctx.vals[raw.use.visible] === false) return null
  const n = withVars(raw, ctx.vals)
  const style = nodeStyle(n, parent, ctx.col)
  const data = {
    ...(ctx.interactive ? { 'data-nid': n.id } : {}),
    ...(ctx.fx && (n.hover || n.appear) ? { 'data-fx': n.id } : {}),
    ...(ctx.fx && n.appear ? { 'data-appear': '' } : {}),
  }
  // Page links move the preview; web links open in a new tab there (never on the canvas).
  const href = n.use?.link && ctx.vals ? String(ctx.vals[n.use.link] || '') : n.href
  const link = n.link && ctx.onLink ? { onClick: () => ctx.onLink!(n.link!, ctx.scope?.it?.id), style: { ...style, cursor: style.cursor || 'pointer' } }
    : href && ctx.onLink ? { onClick: () => window.open(href, '_blank', 'noopener'), style: { ...style, cursor: style.cursor || 'pointer' } }
    : { style }

  // Bound layers show the item's value; without an item (an empty list) they keep their own content as a stand-in.
  const field = n.bind && ctx.scope?.it ? ctx.scope.c.fields.find((f) => f.id === n.bind) : undefined
  if (n.type === 'text') {
    const text = field ? textValue(ctx.scope!.it!.values[field.id], field) : n.text
    return <div {...data} {...link} style={{ ...link.style, visibility: ctx.editingId === n.id ? 'hidden' : undefined }}>{text || '​'}</div>
  }
  if (n.type === 'image') {
    const fromVar = n.use?.image && ctx.vals ? imageSrc(ctx.vals[n.use.image], ctx.assets) : undefined
    const src = fromVar || (field ? imageSrc(ctx.scope!.it!.values[field.id], ctx.assets) : ctx.assets.find((x) => x.id === n.assetId)?.data)
    return (
      <div {...data} {...link} style={{ ...link.style, background: src ? undefined : 'repeating-linear-gradient(45deg, #ddd 0 6px, #eee 6px 12px)' }}>
        {src && <img src={src} alt={n.alt || ''} draggable={false} style={{ width: '100%', height: '100%', objectFit: n.fit || 'cover', display: 'block' }} />}
      </div>
    )
  }
  if (n.type === 'path') {
    return (
      <svg {...data} {...link} style={{ ...link.style, overflow: 'visible' }} viewBox="0 0 100 100" preserveAspectRatio="none">
        <path d={n.d} fill={n.fill === 'none' ? 'none' : ctx.col(n.fill)} stroke={n.stroke === 'none' ? undefined : ctx.col(n.stroke)} strokeWidth={n.strokeWidth} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    )
  }
  if (n.type === 'instance') {
    const comp = ctx.pages.find((p) => p.id === n.componentId)
    const loop = !comp || ctx.chain.includes(comp.id) || ctx.depth > 8
    // Each variable: connected to a CMS field in scope, else set on the instance, else its default.
    const vals = comp && Object.fromEntries((comp.vars || []).map((v) => {
      const f = n.propBind?.[v.id]
      const it = ctx.scope?.it
      const fv = f && it ? it.values[f] : undefined
      return [v.id, fv !== undefined && fv !== '' ? fv : n.props?.[v.id] ?? v.value]
    }))
    return (
      <div {...data} {...link}>
        {!loop && (
          <div style={{ position: 'relative', width: n.wMode === 'fit' ? comp.width : '100%', height: n.hMode === 'fit' ? comp.height : '100%', background: comp.background === 'transparent' ? undefined : ctx.col(comp.background) }}>
            <Tree ctx={{ ...ctx, nodes: comp.nodes, interactive: false, depth: ctx.depth + 1, chain: [...ctx.chain, comp.id], vals: vals as Ctx['vals'], scope: undefined }} />
          </div>
        )}
      </div>
    )
  }
  const kids = n.type === 'frame' ? childrenOf(ctx.nodes, n.id) : []
  const coll = n.list && kids.length ? ctx.cms?.find((c) => c.id === n.list!.collection) : undefined
  if (coll) {
    // A list repeats its first layer once per item. Only the first repeat is hit-tested,
    // so clicking any other repeat selects the list itself.
    const items = listItems(coll, n.list!)
    const [tpl, ...rest] = kids
    return (
      <div {...data} {...link}>
        {items.length
          ? items.map((it, i) => <One key={it.id} n={tpl} parent={n} ctx={{ ...ctx, scope: { c: coll, it }, interactive: ctx.interactive && i === 0 }} />)
          : <One n={tpl} parent={n} ctx={{ ...ctx, scope: { c: coll } }} />}
        {rest.map((c) => <One key={c.id} n={c} parent={n} ctx={ctx} />)}
      </div>
    )
  }
  return (
    <div {...data} {...link}>
      {kids.map((c) => <One key={c.id} n={c} parent={n} ctx={ctx} />)}
    </div>
  )
}

function Tree({ ctx }: { ctx: Ctx }) {
  return <>{childrenOf(ctx.nodes, undefined).map((n) => <One key={n.id} n={n} ctx={ctx} />)}</>
}

// A collection's page previews one item: the one asked for, or its first published item.
export const pageScope = (page: Page, cms: Collection[] | undefined, itemId?: string) => {
  const c = page.collection ? cms?.find((x) => x.id === page.collection) : undefined
  return c ? { c, it: c.items.find((it) => it.id === itemId) || c.items.find((it) => !it.draft) } : undefined
}

export function PageContent(props: {
  page: Page; pages: Page[]; assets: Asset[]; cms?: Collection[]; itemId?: string; editingId?: string | null; interactive?: boolean
  onLink?: (id: string, itemId?: string) => void; colors?: ColorStyle[]; scheme?: Scheme; fx?: boolean
}) {
  const { page, itemId, colors = [], scheme = 'light', ...rest } = props
  const col = colorResolver(colors, scheme)
  // A component shown on its own uses its variables' defaults.
  const vals = page.kind === 'component' && page.vars?.length ? Object.fromEntries(page.vars.map((v) => [v.id, v.value])) : undefined
  const ctx: Ctx = { ...rest, col, vals, nodes: page.nodes, depth: 0, chain: page.kind === 'component' ? [page.id] : [], scope: pageScope(page, props.cms, itemId) }
  if (!props.fx) return <Tree ctx={ctx} />
  const all = [page, ...props.pages.filter((p) => p.kind === 'component')].flatMap((p) => p.nodes)
  const css = fxRules(all, (n) => `[data-fx="${n.id}"]`, col)
  return <>{css && <style>{css}</style>}<Tree ctx={ctx} /></>
}

// Static render of a whole page, scaled to fit a box. Used for project thumbnails.
export function PageThumb({ page, pages, assets, cms, colors, width }: { page: Page; pages: Page[]; assets: Asset[]; cms?: Collection[]; colors?: ColorStyle[]; width: number }) {
  const scale = width / page.width
  return (
    <div style={{ width, height: page.height * scale, overflow: 'hidden', position: 'relative', background: resolveColor(page.background, colors || []) }}>
      <div style={{ width: page.width, height: page.height, transform: `scale(${scale})`, transformOrigin: '0 0', position: 'absolute' }}>
        <PageContent page={page} pages={pages} assets={assets} cms={cms} colors={colors} />
      </div>
    </div>
  )
}
