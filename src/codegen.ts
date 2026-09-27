import JSZip from 'jszip'
import type { Asset, Collection, Page, Project, SNode, Variable } from './types'
import { collectionVar, itemType, listItems } from './cms'
import { nodeStyle } from './ui/NodeView'
import { childrenOf, componentUses } from './tree'
import { resolveNode, resolvePage } from './views'
import { codeColor, themeCss } from './theme'
import { fxRules, hasFx } from './fx'
import type { Breakpoint } from './types'

export const componentName = (name: string) =>
  (name.replace(/[^a-zA-Z0-9]+/g, ' ').trim().split(' ').map((w) => w[0]?.toUpperCase() + w.slice(1)).join('') || 'Page').replace(/^[0-9]/, 'P$&')

export const isComponent = (pg: Page) => pg.kind === 'component'

export const pageFile = (pg: Page) => `${isComponent(pg) ? 'components' : 'pages'}/${componentName(pg.name)}.tsx`

export const assetFileName = (a: Asset) => {
  const ext = a.mime.split('/')[1]?.replace('svg+xml', 'svg').replace('jpeg', 'jpg') || 'bin'
  const base = a.name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || a.id
  return `${base}.${ext}`
}

// Libraries a project can opt into. Versions are what the exported package.json asks for.
export const LIBRARIES: { id: string; version: string; what: string; snippet: string }[] = [
  { id: 'gsap', version: '^3.13.0', what: 'Timeline animation', snippet: "import gsap from 'gsap'" },
  { id: 'motion', version: '^12.0.0', what: 'React animation and gestures', snippet: "import { motion } from 'motion/react'" },
  { id: 'lenis', version: '^1.3.0', what: 'Smooth scrolling', snippet: "import Lenis from 'lenis'" },
  { id: 'three', version: '^0.178.0', what: '3D rendering', snippet: "import * as THREE from 'three'" },
  { id: '@react-three/fiber', version: '^8.18.0', what: '3D as React components', snippet: "import { Canvas } from '@react-three/fiber'" },
  { id: 'zustand', version: '^5.0.0', what: 'Shared state', snippet: "import { create } from 'zustand'" },
  { id: 'clsx', version: '^2.1.0', what: 'Class names', snippet: "import clsx from 'clsx'" },
  { id: 'lucide-react', version: '^0.500.0', what: 'Icons', snippet: "import { ArrowRight } from 'lucide-react'" },
]

// A value written as code rather than as a literal: a component variable, like `accent`.
class Raw { constructor(public v: string) {} }
const fmtVal = (v: unknown) => (v instanceof Raw ? v.v : typeof v === 'number' ? String(Math.round(v * 100) / 100) : `'${String(v).replace(/'/g, "\\'")}'`)

const styleObj = (s: Record<string, unknown>, extra = '') => {
  const body = Object.entries(s).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${k}: ${fmtVal(v)}`)
  if (extra) body.push(extra)
  return '{{ ' + body.join(', ') + ' }}'
}

const escText = (t: string) => t.replace(/[{}<>]/g, (c) => `{'${c}'}`).replace(/\n/g, '<br />')
// An attribute value: "plain" when it can be, {'…'} otherwise.
const attr = (v: string) => (/["{}\n]/.test(v) ? `{${JSON.stringify(v)}}` : `"${v}"`)

interface Ctx {
  project: Project; nodes: SNode[]; classed: Set<string>; shown: Set<string>; scope?: Collection
  col: (c: string) => string
  vars?: Variable[] // inside a component: its variables
}

// Class names only on layers that change in a tablet or phone view, or that have hover or appear effects.
const cls = (n: SNode, ctx: Ctx) => (ctx.classed.has(n.id) ? ` className="s-${n.id}"` : '')

// A variable's value as code: text as written, colours through styles, images as their file.
export function varLiteral(v: Variable['value'], type: Variable['type'], project: Project): string {
  if (type === 'toggle') return `{${v === false ? 'false' : 'true'}}`
  if (type === 'number') return `{${Number(v) || 0}}`
  if (type === 'color') return attr(codeColor(project.styles?.colors || [])(String(v || '#111111')))
  if (type === 'image') {
    const a = project.assets.find((x) => x.id === v)
    return attr(a ? '/assets/' + assetFileName(a) : String(v || ''))
  }
  return attr(String(v ?? ''))
}
const varDefault = (v: Variable, project: Project) => {
  const lit = varLiteral(v.value, v.type, project)
  return lit.startsWith('{') ? lit.slice(1, -1) : `'${lit.slice(1, -1).replace(/'/g, "\\'")}'`
}

// \`key\` goes on the outermost element when the layer is repeated by a list.
function nodeJSX(n: SNode, parent: SNode | undefined, ctx: Ctx, ind: string, key = ''): string {
  const s = nodeStyle(n, parent, ctx.col) as Record<string, unknown>
  // Hidden on desktop but shown in a smaller view: written out, hidden until the view's rule shows it.
  if (n.hidden) s.display = 'none'
  // Inside a component, properties that follow a variable are written as that variable.
  const vk = (id?: string) => (id ? ctx.vars?.find((v) => v.id === id)?.key : undefined)
  const use = { text: vk(n.use?.text), fill: vk(n.use?.fill), color: vk(n.use?.color), image: vk(n.use?.image), visible: vk(n.use?.visible), link: vk(n.use?.link) }
  if (use.fill && n.type !== 'text') s.background = new Raw(use.fill)
  if (use.color && n.type === 'text') s.color = new Raw(use.color)
  const page = n.link ? ctx.project.pages.find((p) => p.id === n.link) : undefined
  const web = !page && (use.link || n.href) ? true : false
  const link = !!page || web
  const i = link ? ind + '  ' : ind
  const comment = `${i}{/* ${n.name.replace(/\*\//g, '')} */}\n`
  const k = link ? '' : key
  const appear = n.appear ? ' data-appear' : ''
  // A field of the item in scope, when the layer is bound to one.
  const field = n.bind ? ctx.scope?.fields.find((f) => f.id === n.bind) : undefined
  let el: string
  if (n.type === 'text') {
    const body = use.text ? `{${use.text}}` : field ? `{item.${field.key}}` : escText(n.text || '')
    el = `${i}<p${k}${cls(n, ctx)}${appear} style=${styleObj(s)}>${body}</p>`
  } else if (n.type === 'image') {
    const a = ctx.project.assets.find((x) => x.id === n.assetId)
    const src = use.image ? `{${use.image}}` : field?.type === 'image' ? `{item.${field.key}}` : `"/assets/${a ? assetFileName(a) : 'missing.png'}"`
    el = `${i}<img${k}${cls(n, ctx)}${appear} src=${src} alt=${attr(n.alt || '')} style=${styleObj({ ...s, objectFit: n.fit || 'cover' })} />`
  } else if (n.type === 'path') {
    const stroke = n.stroke === 'none' ? '' : ` stroke="${ctx.col(n.stroke)}" strokeWidth={${n.strokeWidth}} vectorEffect="non-scaling-stroke"`
    delete s.outline
    delete s.outlineOffset
    const fill = use.fill ? `{${use.fill}}` : `"${n.fill === 'none' ? 'none' : ctx.col(n.fill)}"`
    delete s.background
    el = `${i}<svg${k}${cls(n, ctx)}${appear} viewBox="0 0 100 100" preserveAspectRatio="none" style=${styleObj({ ...s, overflow: 'visible' })}>\n` +
      `${i}  <path d="${n.d}" fill=${fill}${stroke} />\n${i}</svg>`
  } else if (n.type === 'instance') {
    const comp = ctx.project.pages.find((p) => p.id === n.componentId)
    delete s.overflow
    // Variables: connected to a field of the item in scope, or set on this instance.
    const props = (comp?.vars || []).map((v) => {
      const f = n.propBind?.[v.id] ? ctx.scope?.fields.find((x) => x.id === n.propBind![v.id]) : undefined
      if (f) return ` ${v.key}={item.${f.key}}`
      if (n.props && v.id in n.props) return ` ${v.key}=${varLiteral(n.props[v.id], v.type, ctx.project)}`
      return ''
    }).join('')
    el = `${i}<${comp ? componentName(comp.name) : 'Missing'}${k}${cls(n, ctx)}${appear}${props} style=${styleObj(s)} />`
  } else {
    const kids = childrenOf(ctx.nodes, n.id).filter((c) => ctx.shown.has(c.id))
    const coll = n.list && kids.length ? ctx.project.cms?.find((c) => c.id === n.list!.collection) : undefined
    let inner = kids.map((c) => nodeJSX(c, n, ctx, i + '  ')).join('\n')
    if (coll) {
      // A list: its first layer is written once inside a .map over the collection's items.
      const [tpl, ...rest] = kids
      const l = n.list!
      const sortKey = l.sort === 'slug' ? 'slug' : coll.fields.find((f) => f.id === l.sort)?.key
      const opts = [sortKey && `sort: '${sortKey}'`, sortKey && l.desc && 'desc: true', l.limit && `limit: ${l.limit}`].filter(Boolean).join(', ')
      const call = `list(${collectionVar(coll)}${opts ? `, { ${opts} }` : ''})`
      // The layer's name comment can't sit inside the arrow's ( ), so it goes above the list.
      const t = nodeJSX(tpl, n, { ...ctx, scope: coll }, i + '    ', ' key={item.slug}')
      const name = t.match(/^\s*\{\/\*.*\*\/\}\n/)?.[0] || ''
      inner = (name ? `${i}  ${name.trim()}\n` : '') + `${i}  {${call}.map((item) => (\n${t.slice(name.length)}\n${i}  ))}` +
        rest.map((c) => '\n' + nodeJSX(c, n, ctx, i + '  ')).join('')
    }
    el = kids.length
      ? `${i}<div${k}${cls(n, ctx)}${appear} style=${styleObj(s)}>\n${inner}\n${i}</div>`
      : `${i}<div${k}${cls(n, ctx)}${appear} style=${styleObj(s)} />`
  }
  // display: contents keeps the link out of the layout, so it works inside stacks and grids too.
  // A link to a collection's page goes to the item in scope, or to its first item.
  const toColl = page?.collection ? ctx.project.cms?.find((c) => c.id === page.collection) : undefined
  const href = page
    ? toColl && ctx.scope?.id === toColl.id
      ? `{'${page.path}/' + item.slug}`
      : toColl ? `"${page.path}/${listItems(toColl, { collection: toColl.id })[0]?.slug ?? ''}"` : `"${page.path}"`
    : use.link ? `{${use.link}}` : attr(n.href || '')
  const tab = web && n.newTab ? ' target="_blank" rel="noreferrer"' : ''
  let out = link
    ? `${ind}<a${key} href=${href}${tab} style={{ display: 'contents', color: 'inherit', textDecoration: 'none' }}>\n${comment}${el}\n${ind}</a>`
    : comment + el
  // A layer shown by a toggle variable: {show && (…)}, with its name above.
  if (use.visible) {
    const name = out.match(/^\s*\{\/\*.*\*\/\}\n/)?.[0] || ''
    const body = out.slice(name.length).split('\n').map((l) => '  ' + l).join('\n')
    out = (name ? `${ind}${name.trim()}\n` : '') + `${ind}{${use.visible} && (\n${body}\n${ind})}`
  }
  return out
}

// ─── Views: tablet and phone as CSS media rules ─────────────
const UNITLESS = new Set(['opacity', 'fontWeight', 'lineHeight', 'flexShrink', 'flexGrow', 'zIndex'])
const kebab = (k: string) => k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())
const cssVal = (k: string, v: unknown) => (typeof v === 'number' && !UNITLESS.has(k) ? `${Math.round(v * 100) / 100}px` : String(v))

type Views = { bp: Breakpoint; width: number; height: number; max: number }[]
const viewsOf = (pg: Page): Views => {
  if (isComponent(pg)) return []
  const out: Views = []
  let above = pg.width
  for (const bp of ['tablet', 'phone'] as const) {
    const v = pg.views?.[bp]
    if (!v) continue
    out.push({ bp, width: v.width, height: resolvePage(pg, bp).height, max: above - 1 })
    above = v.width
  }
  return out
}

// For each view, the style each layer gets there compared with the view above it.
function viewRules(pg: Page, col: (c: string) => string) {
  const views = viewsOf(pg)
  const rules: { max: number; width: number; height: number; css: Map<string, Record<string, string>> }[] = []
  let prevBp: Breakpoint = 'desktop'
  for (const v of views) {
    // Views as the canvas shows them: fitted from the view above, then their own changes.
    const prev = new Map(resolvePage(pg, prevBp).nodes.map((n) => [n.id, n]))
    const cur = new Map(resolvePage(pg, v.bp).nodes.map((n) => [n.id, n]))
    const css = new Map<string, Record<string, string>>()
    for (const n of pg.nodes) {
      const a = prev.get(n.id)!
      const b = cur.get(n.id)!
      const pa = n.parentId ? prev.get(n.parentId) : undefined
      const pb = n.parentId ? cur.get(n.parentId) : undefined
      const sa = nodeStyle(a, pa, col) as Record<string, unknown>
      const sb = nodeStyle(b, pb, col) as Record<string, unknown>
      if (a.hidden) sa.display = 'none'
      if (b.hidden) sb.display = 'none'
      else if (a.hidden) sb.display = sb.display ?? 'block'
      const out: Record<string, string> = {}
      for (const k of new Set([...Object.keys(sa), ...Object.keys(sb)])) {
        if (sa[k] === sb[k] || (sa[k] === undefined && sb[k] === undefined)) continue
        out[kebab(k)] = sb[k] === undefined ? 'unset' : cssVal(k, sb[k])
      }
      if (Object.keys(out).length) css.set(n.id, out)
    }
    rules.push({ max: v.max, width: v.width, height: v.height, css })
    prevBp = v.bp
  }
  return rules
}

const cssText = (pg: Page, rules: ReturnType<typeof viewRules>) =>
  rules.map((r) => {
    const lines = [`  .s-page { width: ${r.width}px !important; height: ${r.height}px !important; }`]
    for (const [id, st] of r.css) lines.push(`  .s-${id} { ${Object.entries(st).map(([k, v]) => `${k}: ${v} !important;`).join(' ')} }`)
    return `@media (max-width: ${r.max}px) {\n${lines.join('\n')}\n}`
  }).join('\n')

const body = (pg: Page, project: Project, ind: string, classed = new Set<string>()) => {
  const scope = !isComponent(pg) && pg.collection ? project.cms?.find((c) => c.id === pg.collection) : undefined
  // A layer is written if it shows in any view.
  const views: Breakpoint[] = ['desktop', ...viewsOf(pg).map((v) => v.bp)]
  const shown = new Set(pg.nodes.filter((n) => views.some((bp) => !resolveNode(n, bp).hidden)).map((n) => n.id))
  const ctx: Ctx = { project, nodes: pg.nodes, classed, shown, scope, col: codeColor(project.styles?.colors || []), vars: isComponent(pg) ? pg.vars : undefined }
  return childrenOf(pg.nodes, undefined).filter((n) => shown.has(n.id)).map((n) => nodeJSX(n, undefined, ctx, ind)).join('\n')
}

// Components used directly by a page, for its import lines.
const usedComponents = (pg: Page, pages: Page[]) =>
  [...new Set(pg.nodes.filter((n) => n.type === 'instance' && !n.hidden).map((n) => n.componentId!))]
    .map((id) => pages.find((p) => p.id === id)).filter((p): p is Page => !!p)

// The CMS import a page or component needs: the collections its lists repeat, and its own item type.
const cmsImport = (pg: Page, project: Project) => {
  const cms = project.cms || []
  const lists = [...new Set(pg.nodes.filter((n) => n.list && pg.nodes.some((k) => k.parentId === n.id)).map((n) => n.list!.collection))]
    .map((id) => cms.find((c) => c.id === id)).filter((c): c is Collection => !!c)
  const own = !isComponent(pg) && pg.collection ? cms.find((c) => c.id === pg.collection) : undefined
  // The item type is imported as Entry, so it can't clash with a page called, say, Journal item.
  const names = [...lists.map(collectionVar), ...(lists.length ? ['list'] : []), ...(own ? [`type ${itemType(own)} as Entry`] : [])]
  return { line: names.length ? `import { ${names.join(', ')} } from '../cms'\n` : '', own }
}

export function generatePage(pg: Page, project: Project): string {
  const comps = usedComponents(pg, project.pages)
  const cms = cmsImport(pg, project)
  const col = codeColor(project.styles?.colors || [])
  // Hover and appear effects, as class rules like the views.
  const fxNodes = pg.nodes.filter(hasFx)
  const fx = fxRules(fxNodes, (n) => `.s-${n.id}`, col)
  if (isComponent(pg)) {
    const imports = comps.filter((c) => c.id !== pg.id).map((c) => `import ${componentName(c.name)} from './${componentName(c.name)}'`)
    const bg = pg.background === 'transparent' ? '' : `, background: '${col(pg.background)}'`
    const vars = pg.vars || []
    const types: Record<string, string> = { text: 'string', color: 'string', image: 'string', link: 'string', toggle: 'boolean', number: 'number' }
    const params = [...vars.map((v) => `${v.key} = ${varDefault(v, project)}`), 'style', 'className'].join(', ')
    const shape = [...vars.map((v) => `${v.key}?: ${types[v.type]}`), 'style?: CSSProperties', 'className?: string'].join('; ')
    const classed = new Set(fxNodes.map((n) => n.id))
    return `// ${pg.name} · component
// Synced with the canvas. Edit here or on the canvas and the other side follows.${vars.length ? `\n// Variables (${vars.map((v) => v.key).join(', ')}) are set on each instance; they're defined in the canvas inspector.` : ''}
import type { CSSProperties } from 'react'
${cms.line}${imports.length ? imports.join('\n') + '\n' : ''}${fx ? `\n// Hover and appear effects. Written from the canvas: change them there.\nconst css = \`\n${fx}\n\`\n` : ''}
export default function ${componentName(pg.name)}({ ${params} }: { ${shape} }) {
  return (
    <div className={className} style={{ position: 'relative', width: ${pg.width}, height: ${pg.height}${bg}, ...style }}>
${body(pg, project, '      ', classed)}${fx ? '\n      <style>{css}</style>' : ''}
    </div>
  )
}
`
  }
  const imports = comps.map((c) => `import ${componentName(c.name)} from '../components/${componentName(c.name)}'`)
  const rules = viewRules(pg, col)
  const classed = new Set([...rules.flatMap((r) => [...r.css.keys()]), ...fxNodes.map((n) => n.id)])
  const sizes = viewsOf(pg).map((v) => `${v.bp} ${v.width}`).join(', ')
  const parts = [fx, rules.length ? cssText(pg, rules) : ''].filter(Boolean)
  const what = [fx && 'Hover and appear effects', rules.length && `tablet and phone views (${sizes})`].filter(Boolean).join(', ')
  const css = parts.length
    ? `
// ${what[0].toUpperCase() + what.slice(1)}. Written from the canvas: change them there.
const css = \`
${parts.join('\n')}
\`
`
    : ''
  return `// ${pg.name} · ${pg.path}${cms.own ? '/:slug' : ''}
// Synced with the canvas. Edit here or on the canvas and the other side follows.
${cms.line}${imports.length ? imports.join('\n') + '\n' : ''}${css}
export default function ${componentName(pg.name)}(${cms.own ? '{ item }: { item: Entry }' : ''}) {
  return (
    <main style={{ background: '${col(pg.background)}', minHeight: '100vh' }}>
      <div${rules.length ? ' className="s-page"' : ''} style={{ position: 'relative', width: ${pg.width}, height: ${pg.height}, margin: '0 auto' }}>
${body(pg, project, '        ', classed)}
      </div>${parts.length ? '\n      <style>{css}</style>' : ''}
    </main>
  )
}
`
}

export function generateApp(project: Project): string {
  const pages = project.pages.filter((p) => !isComponent(p))
  const collOf = (pg: Page) => (pg.collection ? project.cms?.find((c) => c.id === pg.collection) : undefined)
  const dynamic = pages.filter((pg) => collOf(pg))
  const imports = pages.map((pg) => `import ${componentName(pg.name)} from './${pageFile(pg).replace('.tsx', '')}'`).join('\n')
  const routes = pages.filter((pg) => !collOf(pg)).map((pg) => `  '${pg.path}': ${componentName(pg.name)},`).join('\n')
  const vars = [...new Set(dynamic.map((pg) => collectionVar(collOf(pg)!)))]
  // A collection's page answers at its path plus an item's slug.
  const items = dynamic.map((pg) => {
    const base = pg.path.replace(/\/$/, '')
    return `  if (path.startsWith('${base}/')) {
    const item = ${collectionVar(collOf(pg)!)}.find((i) => path === '${base}/' + i.slug)
    if (item) return <${componentName(pg.name)} item={item} />
  }\n`
  }).join('')
  // Layers with an appear effect wait, hidden, until they scroll into view.
  const appear = project.pages.some((pg) => pg.nodes.some((n) => n.appear))
  const watch = appear ? `  useEffect(() => {
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) }
    }), { threshold: 0.15 })
    document.querySelectorAll('[data-appear]').forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])
` : ''
  return `${appear ? "import { useEffect } from 'react'\n" : ''}${imports}${vars.length ? `\nimport { ${vars.join(', ')} } from './cms'` : ''}

const routes: Record<string, () => JSX.Element> = {
${routes}
}

export default function App() {
${watch}  const path = window.location.pathname.replace(/(.)\\/$/, '$1')
${items}  const Page = routes[path] || routes['/'] || (() => <p>Not found</p>)
  return <Page />
}
`
}

// ─── CMS: each collection as JSON, plus types and a list helper ─────────────
const jsType = (t: Collection['fields'][number]['type']) => (t === 'number' ? 'number' : t === 'toggle' ? 'boolean' : 'string')

// Colour styles as CSS variables, with their dark values.
export const themeFile = (project: Project) => ({ path: 'theme.css', content: themeCss(project.styles?.colors || []) })

export function cmsFiles(project: Project): { path: string; content: string }[] {
  const cms = project.cms || []
  if (!cms.length) return []
  const value = (c: Collection, f: Collection['fields'][number], v: unknown) => {
    if (f.type === 'number') return typeof v === 'number' ? v : Number(v) || 0
    if (f.type === 'toggle') return !!v
    if (f.type === 'color') return codeColor(project.styles?.colors || [])(String(v || '#111111'))
    if (f.type === 'image' && typeof v === 'string' && v && !/^(https?:|\/)/.test(v)) {
      const a = project.assets.find((x) => x.id === v)
      return a ? '/assets/' + assetFileName(a) : ''
    }
    return v === undefined ? '' : String(v)
  }
  const json = cms.map((c) => ({
    path: `cms/${c.slug}.json`,
    content: JSON.stringify(c.items.filter((it) => !it.draft).map((it) => ({ slug: it.slug, ...Object.fromEntries(c.fields.map((f) => [f.key, value(c, f, it.values[f.id])])) })), null, 2) + '\n',
  }))
  const index = `// CMS content, written from the CMS window. Edit items there; drafts are left out.
${cms.map((c) => `import ${collectionVar(c)}Data from './${c.slug}.json'`).join('\n')}

${cms.map((c) => `export interface ${itemType(c)} {\n  slug: string\n${c.fields.map((f) => `  ${f.key}: ${jsType(f.type)}`).join('\n')}\n}\nexport const ${collectionVar(c)}: ${itemType(c)}[] = ${collectionVar(c)}Data`).join('\n\n')}

// Sorts and cuts a collection the way a list on the canvas asks for.
export function list<T extends { slug: string }>(items: T[], o: { sort?: keyof T; desc?: boolean; limit?: number } = {}): T[] {
  const out = [...items]
  const k = o.sort
  if (k) out.sort((a, b) => (a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0) * (o.desc ? -1 : 1))
  return o.limit ? out.slice(0, o.limit) : out
}
`
  return [{ path: 'cms/index.ts', content: index }, ...json]
}

// Components a component can't contain without nesting itself.
export const cyclicFor = (pages: Page[], compId: string) => new Set([...pages].filter((p) => p.kind === 'component' && componentUses(pages, p.id).has(compId)).map((p) => p.id))

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'site'

const dataUrlToBytes = (url: string) => {
  const b64 = url.split(',')[1] || ''
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function packageJson(project: Project) {
  const libs = Object.fromEntries((project.settings.libraries || []).map((id) => [id, LIBRARIES.find((l) => l.id === id)?.version || 'latest']))
  return JSON.stringify({
    name: slug(project.name), private: true, version: '0.1.0', type: 'module',
    scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' },
    dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1', ...libs },
    devDependencies: { '@types/react': '^18.3.0', '@types/react-dom': '^18.3.0', '@vitejs/plugin-react': '^4.3.0', typescript: '^5.5.0', vite: '^5.4.0', ...((project.settings.libraries || []).includes('three') ? { '@types/three': '^0.178.0' } : {}) },
  }, null, 2)
}

// A complete Vite + React project, ready to push to GitHub.
export async function exportZip(project: Project) {
  const zip = new JSZip()
  const root = zip.folder(slug(project.name))!
  root.file('package.json', packageJson(project))
  root.file('vite.config.ts', `import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\n\nexport default defineConfig({ plugins: [react()] })\n`)
  root.file('tsconfig.json', JSON.stringify({ compilerOptions: { target: 'ES2021', module: 'ESNext', moduleResolution: 'bundler', jsx: 'react-jsx', strict: true, skipLibCheck: true, noEmit: true, resolveJsonModule: true }, include: ['src'] }, null, 2))
  const fontFaces = [
    `@font-face { font-family: 'Sites Sans'; src: url('/fonts/ABCArealSuperfamilyVariable.ttf'); font-weight: 400 700; }`,
    ...project.assets.filter((a) => a.kind === 'font').map((a) => `@font-face { font-family: '${a.name.replace(/\.[^.]+$/, '')}'; src: url('/assets/${assetFileName(a)}'); }`),
  ].join('\n      ')
  root.file('index.html', `<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>${project.settings.siteTitle}</title>\n    <style>\n      ${fontFaces}\n      body { margin: 0; font-family: 'Sites Sans', system-ui, sans-serif; }\n    </style>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.tsx"></script>\n  </body>\n</html>\n`)
  root.file('.gitignore', 'node_modules\ndist\n')
  root.file('README.md', `# ${project.name}\n\nBuilt with Sites.\n\n\`\`\`\nnpm install\nnpm run dev\n\`\`\`\n`)
  const src = root.folder('src')!
  src.file(themeFile(project).path, themeFile(project).content)
  src.file('main.tsx', `import { createRoot } from 'react-dom/client'\nimport App from './App'\nimport './theme.css'\n\ncreateRoot(document.getElementById('root')!).render(<App />)\n`)
  src.file('App.tsx', generateApp(project))
  for (const pg of project.pages) src.file(pageFile(pg), generatePage(pg, project))
  for (const f of cmsFiles(project)) src.file(f.path, f.content)
  for (const f of project.files) src.file(f.path, f.content)
  const pub = root.folder('public')!.folder('assets')!
  for (const a of project.assets) {
    if (a.kind === 'text') pub.file(a.name, a.data)
    else pub.file(assetFileName(a), dataUrlToBytes(a.data))
  }
  const font = await fetch(import.meta.env.BASE_URL + 'fonts/ABCArealSuperfamilyVariable.ttf').then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null)
  if (font) root.folder('public')!.folder('fonts')!.file('ABCArealSuperfamilyVariable.ttf', font)
  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)
  const el = document.createElement('a')
  el.href = url
  el.download = `${slug(project.name)}.zip`
  el.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
