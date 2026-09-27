// Reads a page or component file back into canvas layers, so code can be edited by hand.
// It understands the JSX the canvas writes (positioned divs, stacks, grids, p, img, svg paths,
// links and component instances) and reports anything else as an error with a line number.
import type { Asset, Collection, Page, Project, SNode } from './types'
import { assetFileName, componentName } from './codegen'
import { newNode } from './store'
import { resolveNode } from './views'
import { collectionVar } from './cms'
import { matchesText, refFromCode } from './theme'

export class ParseError extends Error {
  constructor(msg: string, public line: number) { super(msg) }
}

type Attr = { kind: 'str'; value: string } | { kind: 'expr'; value: string } | { kind: 'bool' }
interface El { type: 'el'; name: string; attrs: Record<string, Attr>; children: Child[]; line: number }
type Child = El | { type: 'text'; value: string } | { type: 'comment'; value: string; line: number }
  // {item.title}: a field of the CMS item in scope
  | { type: 'bind'; key: string; line: number }
  // {list(journal, { … }).map((item) => (<el />))}: a CMS list repeating one element
  | { type: 'list'; coll: string; opts: string; el: El; line: number }
  // {title}: a component variable
  | { type: 'var'; key: string; line: number }
  // {show && (<el />)}: a layer shown by a toggle variable
  | { type: 'when'; key: string; el: El; line: number }

function parser(src: string) {
  let i = 0
  const lineAt = (p = i) => src.slice(0, p).split('\n').length
  const fail = (msg: string, p = i): never => { throw new ParseError(msg, lineAt(p)) }
  const ws = () => { while (i < src.length && /\s/.test(src[i])) i++ }

  // Reads a balanced {...} expression, skipping over strings and comments.
  const braces = () => {
    const start = i
    let depth = 0
    while (i < src.length) {
      const c = src[i]
      if (c === "'" || c === '"' || c === '`') {
        const q = c
        i++
        while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++ }
      } else if (c === '/' && src[i + 1] === '*') {
        const end = src.indexOf('*/', i + 2)
        if (end < 0) fail('Unclosed comment')
        i = end + 1
      } else if (c === '{') depth++
      else if (c === '}') { depth--; if (depth === 0) { i++; return src.slice(start + 1, i - 1) } }
      i++
    }
    return fail('Missing }', start)
  }

  const element = (): El => {
    const tagAt = i
    const line = lineAt()
    if (src[i] !== '<') fail('Expected <')
    i++
    const name = src.slice(i).match(/^[A-Za-z][\w.]*/)?.[0] || fail('Expected a tag name')
    i += name.length
    const attrs: Record<string, Attr> = {}
    for (;;) {
      ws()
      if (src.startsWith('/>', i)) { i += 2; return { type: 'el', name, attrs, children: [], line } }
      if (src[i] === '>') { i++; break }
      const an = src.slice(i).match(/^[A-Za-z_:][\w:-]*/)?.[0] || fail(`Can't read the attributes of this <${name}>`, tagAt)
      i += an.length
      ws()
      if (src[i] !== '=') { attrs[an] = { kind: 'bool' }; continue }
      i++
      ws()
      if (src[i] === '"' || src[i] === "'") {
        const q = src[i]
        const end = src.indexOf(q, i + 1)
        if (end < 0) fail('Unclosed string')
        attrs[an] = { kind: 'str', value: src.slice(i + 1, end) }
        i = end + 1
      } else if (src[i] === '{') {
        const at = i
        attrs[an] = { kind: 'expr', value: braces().trim() }
        if (/[<>]/.test(attrs[an].kind === 'expr' ? (attrs[an] as { value: string }).value : '')) fail(`${an}={…} is missing a closing }`, at)
      }
      else fail(`Expected a value for ${an}`)
    }
    // <style> holds the tablet and phone rules, which come from the canvas views.
    if (name === 'style') {
      const end = src.indexOf('</style>', i)
      if (end < 0) fail('<style> is never closed', tagAt)
      i = end + '</style>'.length
      return { type: 'el', name, attrs, children: [], line }
    }
    const children: Child[] = []
    for (;;) {
      if (i >= src.length) fail(`<${name}> is never closed`, 0 + src.lastIndexOf('<' + name))
      if (src.startsWith('</', i)) {
        i += 2
        const close = src.slice(i).match(/^[A-Za-z][\w.]*/)?.[0]
        if (close !== name) fail(`Expected </${name}> but found </${close ?? ''}>`)
        i += name.length
        ws()
        if (src[i] !== '>') fail('Expected >')
        i++
        return { type: 'el', name, attrs, children, line }
      }
      if (src[i] === '<') { children.push(element()); continue }
      if (src[i] === '{') {
        const at = i
        const lm = src.slice(i).match(/^\{\s*list\(\s*([A-Za-z_$][\w$]*)\s*(?:,\s*(\{[^{}]*\}))?\s*\)\s*\.map\(\s*\(?\s*item\s*\)?\s*=>\s*\(\s*/)
        if (lm) {
          i += lm[0].length
          const el = element()
          ws()
          const close = src.slice(i).match(/^\)\s*\)\s*\}/)
          if (!close) fail('Expected ))} to close the list', at)
          i += close![0].length
          children.push({ type: 'list', coll: lm[1], opts: lm[2] || '', el, line: lineAt(at) })
          continue
        }
        const wm = src.slice(i).match(/^\{\s*([A-Za-z_$][\w$]*)\s*&&\s*\(\s*/)
        if (wm) {
          i += wm[0].length
          const el = element()
          ws()
          const close = src.slice(i).match(/^\)\s*\}/)
          if (!close) fail('Expected )} after the layer', at)
          i += close![0].length
          children.push({ type: 'when', key: wm[1], el, line: lineAt(at) })
          continue
        }
        const inner = braces().trim()
        const bm = inner.match(/^item\.([A-Za-z_$][\w$]*)$/)
        if (bm) { children.push({ type: 'bind', key: bm[1], line: lineAt(at) }); continue }
        const vm = inner.match(/^([A-Za-z_$][\w$]*)$/)
        if (vm) { children.push({ type: 'var', key: vm[1], line: lineAt(at) }); continue }
        const com = inner.match(/^\/\*([\s\S]*)\*\/$/)
        if (com) children.push({ type: 'comment', value: com[1].trim(), line: lineAt(at) })
        else if (/^(['"])[\s\S]*\1$/.test(inner)) children.push({ type: 'text', value: inner.slice(1, -1) })
        else if (inner) fail('Only plain text, layers and {/* names */} can go here. Put logic in a component.', at)
        continue
      }
      const next = src.slice(i).search(/[<{]/)
      const raw = next < 0 ? src.slice(i) : src.slice(i, i + next)
      i += raw.length
      children.push({ type: 'text', value: raw })
    }
  }

  return {
    // Pages start at <main>; components at the first element they return.
    parseRoot(component: boolean) {
      let at: number
      if (component) {
        const ret = src.search(/return\s*\(/)
        at = ret < 0 ? -1 : src.indexOf('<', ret)
        if (at < 0) fail('A component needs to return (<div …>)', 0)
      } else {
        at = src.indexOf('<main')
        if (at < 0) fail('A page needs a <main> element', 0)
      }
      i = at
      return element()
    },
  }
}

// Parses a style object literal like { left: 64, color: '#111' }. A trailing ...style spread is allowed.
function styleOf(el: El): Record<string, string | number> {
  const a = el.attrs.style
  if (!a) return {}
  if (a.kind !== 'expr') throw new ParseError('style needs {{ … }}', el.line)
  const body = a.value.trim()
  if (!body.startsWith('{') || !body.endsWith('}')) throw new ParseError('style needs {{ … }}', el.line)
  const out: Record<string, string | number> = {}
  const s = body.slice(1, -1).replace(/,?\s*\.\.\.style\s*,?/, ',')
  let i = 0
  const ws = () => { while (i < s.length && /[\s,]/.test(s[i])) i++ }
  while (i < s.length) {
    ws()
    if (i >= s.length) break
    const km = s.slice(i).match(/^(['"]?)([A-Za-z_$][\w$-]*)\1\s*:/)
    if (!km) throw new ParseError(`Can't read style near "${s.slice(i, i + 20)}"`, el.line)
    i += km[0].length
    while (/\s/.test(s[i])) i++
    const q = s[i]
    if (q === "'" || q === '"') {
      let j = i + 1
      let v = ''
      while (j < s.length && s[j] !== q) { if (s[j] === '\\') j++; v += s[j]; j++ }
      if (j >= s.length) throw new ParseError('Unclosed string in style', el.line)
      out[km[2]] = v
      i = j + 1
    } else {
      // A bare name is a component variable, like background: accent.
      const id = s.slice(i).match(/^[A-Za-z_$][\w$]*/)
      if (id) { out[km[2]] = '@var:' + id[0]; i += id[0].length; continue }
      const nm = s.slice(i).match(/^-?\d*\.?\d+(?:e-?\d+)?/)
      if (!nm) throw new ParseError(`${km[2]} must be a number or a 'string'`, el.line)
      out[km[2]] = parseFloat(nm[0])
      i += nm[0].length
    }
  }
  return out
}

const num = (v: unknown, d = 0) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && !isNaN(+v) ? +v : d)
const attrStr = (el: El, k: string) => (el.attrs[k]?.kind === 'str' ? (el.attrs[k] as { value: string }).value : undefined)
const attrNum = (el: El, k: string) => {
  const a = el.attrs[k]
  return a?.kind === 'expr' || a?.kind === 'str' ? num(a.value) : undefined
}

const JUSTIFY: Record<string, SNode['justify']> = { 'flex-start': 'start', start: 'start', center: 'center', 'flex-end': 'end', end: 'end', 'space-between': 'between' }
const ALIGN: Record<string, SNode['align']> = { 'flex-start': 'start', start: 'start', center: 'center', 'flex-end': 'end', end: 'end', stretch: 'stretch' }

// Position and size, reading fill and fit back from how the style places the layer.
function box(st: Record<string, string | number>, parent: SNode | undefined, prev: SNode | undefined): Partial<SNode> {
  const rot = String(st.transform || '').match(/rotate\((-?[\d.]+)deg\)/)
  const flow = parent?.layout === 'stack' || parent?.layout === 'grid'
  const row = parent?.layout === 'stack' && parent.dir === 'row'
  const grows = String(st.flex || '').startsWith('1')
  const mode = (axis: 'w' | 'h'): SNode['wMode'] => {
    const v = st[axis === 'w' ? 'width' : 'height']
    if (typeof v === 'number') return 'fixed'
    if (v === '100%') return 'fill'
    if (flow && parent!.layout === 'stack') {
      const main = row ? 'w' : 'h'
      if (axis === main && grows) return 'fill'
      if (axis !== main && st.alignSelf === 'stretch') return 'fill'
    }
    return 'fit'
  }
  const wMode = mode('w')
  const hMode = mode('h')
  return {
    // Flow children and fill layers aren't placed by x and y, so they keep what they had.
    x: flow || wMode === 'fill' ? prev?.x ?? 0 : num(st.left), y: flow || hMode === 'fill' ? prev?.y ?? 0 : num(st.top),
    w: Math.max(1, typeof st.width === 'number' ? st.width : prev?.w ?? 100),
    h: Math.max(1, typeof st.height === 'number' ? st.height : prev?.h ?? 100),
    wMode: wMode === 'fixed' ? undefined : wMode, hMode: hMode === 'fixed' ? undefined : hMode,
    opacity: st.opacity === undefined ? 1 : num(st.opacity, 1), rotation: rot ? parseFloat(rot[1]) : 0,
  }
}

function layoutOf(st: Record<string, string | number>): Partial<SNode> {
  if (st.display === 'flex') {
    return {
      layout: 'stack', dir: st.flexDirection === 'row' ? 'row' : 'column', wrap: st.flexWrap === 'wrap' || undefined,
      gap: num(st.gap) || undefined, pad: num(st.padding) || undefined,
      justify: JUSTIFY[String(st.justifyContent)] || 'start', align: ALIGN[String(st.alignItems)] || 'start',
    }
  }
  if (st.display === 'grid') {
    const cols = String(st.gridTemplateColumns || '').match(/repeat\(\s*(\d+)/)
    return { layout: 'grid', cols: cols ? +cols[1] : 2, gap: num(st.gap) || undefined, pad: num(st.padding) || undefined, justify: JUSTIFY[String(st.justifyItems)] || 'start', align: ALIGN[String(st.alignItems)] || 'start' }
  }
  return { layout: 'free', dir: undefined, gap: undefined, pad: undefined, wrap: undefined }
}

// JSX whitespace rules: text that spans lines is trimmed per line and joined with spaces.
const jsxText = (t: string) =>
  t.includes('\n') ? t.split('\n').map((l, i, all) => (i === 0 ? l.trimEnd() : i === all.length - 1 ? l.trimStart() : l.trim())).filter(Boolean).join(' ') : t

const textOf = (children: Child[]) =>
  children.map((c) => (c.type === 'text' ? jsxText(c.value) : c.type === 'el' && c.name === 'br' ? '\n' : '')).join('')

// The options a list call passes: { sort: 'date', desc: true, limit: 6 }.
const listOpts = (o: string) => ({
  sort: o.match(/sort:\s*['"]([\w$]+)['"]/)?.[1],
  desc: /desc:\s*true/.test(o) || undefined,
  limit: +(o.match(/limit:\s*(\d+)/)?.[1] || 0) || undefined,
})

export function parsePage(src: string, page: Page, pages: Page[], assets: Asset[], cms: Collection[] = [], styles: Project['styles'] = { colors: [], text: [] }): Partial<Page> {
  const colors = styles?.colors || []
  const textStyleList = styles?.text || []
  const component = page.kind === 'component'
  const root = parser(src).parseRoot(component)
  let container: El
  let rootStyle: Record<string, string | number>
  if (component) {
    if (root.name !== 'div') throw new ParseError('A component should return one <div> that holds its layers', root.line)
    container = root
    rootStyle = styleOf(root)
  } else {
    rootStyle = styleOf(root)
    const box = root.children.find((c): c is El => c.type === 'el')
    if (!box || box.name !== 'div') throw new ParseError('<main> should contain one <div> that holds the layers', root.line)
    container = box
  }
  const boxStyle = styleOf(container)

  const nodes: SNode[] = []
  const pool = new Map<string, SNode[]>()
  // Layers hidden in every view aren't written, so they can't be matched.
  const bps = (['desktop', 'tablet', 'phone'] as const).filter((bp) => bp === 'desktop' || page.views?.[bp])
  const written = (n: SNode) => bps.some((bp) => !resolveNode(n, bp).hidden)
  for (const n of page.nodes) if (written(n)) pool.set(n.type, [...(pool.get(n.type) || []), n])
  // Keep layer ids stable: reuse the layer named by className="s-…", then the first unused one of the same type and name, then of the same type.
  const reuse = (type: SNode['type'], nm?: string, id?: string) => {
    const list = pool.get(type) || []
    let k = id ? list.findIndex((n) => n.id === id) : -1
    if (k < 0) k = list.findIndex((n) => n.name === nm)
    return k >= 0 ? list.splice(k, 1)[0] : list.shift()
  }

  // The collection whose item fields are in scope: the nearest list, or the page's own collection.
  let scope = page.kind !== 'component' && page.collection ? cms.find((c) => c.id === page.collection) : undefined
  const fieldId = (key: string, line: number) => {
    if (key === 'slug') throw new ParseError('item.slug is the address of an item; show a field instead', line)
    const f = scope?.fields.find((x) => x.key === key)
    if (!f) throw new ParseError(scope ? `${scope.name} has no field called ${key}` : `item.${key} only works inside a list or on a collection's page`, line)
    return f.id
  }

  // Colours written as var(--name) read back as the colour style.
  const toRef = refFromCode(colors)
  const colorOf = (v: unknown, d: string) => (v === undefined ? d : toRef(String(v)))
  // A component's variables, by the name code uses.
  const vars = page.kind === 'component' ? page.vars || [] : []
  const varId = (key: string, line: number) => {
    const v = vars.find((x) => x.key === key)
    if (!v) throw new ParseError(page.kind === 'component' ? `${key} isn't one of this component's variables. Add it in the canvas inspector.` : `{${key}} only works inside a component`, line)
    return v.id
  }
  const styleVar = (v: unknown, line: number) => (typeof v === 'string' && v.startsWith('@var:') ? varId(v.slice(5), line) : undefined)
  // Effects written inline: shadow, blurs, cursor, text case and lines.
  const effects = (st: Record<string, string | number>): Partial<SNode> => {
    const sh = String(st.boxShadow || '').match(/^(-?[\d.]+)px (-?[\d.]+)px ([\d.]+)px (?:(-?[\d.]+)px )?(.+)$/)
    const blur = String(st.filter || '').match(/blur\(([\d.]+)px\)/)
    const bg = String(st.backdropFilter || '').match(/blur\(([\d.]+)px\)/)
    return {
      shadow: sh ? { x: +sh[1], y: +sh[2], blur: +sh[3], spread: sh[4] ? +sh[4] : 0, color: toRef(sh[5].trim()) } : undefined,
      blur: blur ? +blur[1] : undefined, bgBlur: bg ? +bg[1] : undefined,
      cursor: ['pointer', 'default', 'text', 'grab'].includes(String(st.cursor)) ? st.cursor as SNode['cursor'] : undefined,
    }
  }
  // A border: outline with a matching inset offset (older code used an inset box-shadow).
  const border = (st: Record<string, string | number>) => {
    const o = String(st.outline || '').match(/^([\d.]+)px solid (.+)$/)
    if (o) return { stroke: toRef(o[2].trim()), strokeWidth: parseFloat(o[1]) }
    const ring = String(st.boxShadow || '').match(/inset 0 0 0 ([\d.]+)px (.+)$/)
    return ring ? { stroke: toRef(ring[2].trim()), strokeWidth: parseFloat(ring[1]) } : { stroke: 'none', strokeWidth: 0 }
  }
  type Link = { page?: string; href?: string; newTab?: boolean; linkVar?: string }

  const add = (el: El, parent: SNode | undefined, name: string | undefined, link: Link = {}, visibleVar?: string) => {
    const st = styleOf(el)
    const clsId = attrStr(el, 'className')?.match(/\bs-(\S+)/)?.[1]
    let prev: SNode | undefined
    const common = (type: SNode['type']) => {
      prev = reuse(type, name, clsId)
      return {
        ...(prev || newNode(type)), ...box(st, parent, prev), type, parentId: parent?.id, name: name || prev?.name || newNode(type).name,
        link: link.page, href: link.href, newTab: link.newTab, hidden: st.display === 'none' || undefined, ...effects(st),
        // Hover lives in the canvas's CSS; appear is marked by data-appear, with its settings kept from the canvas.
        appear: 'data-appear' in el.attrs ? prev?.appear ?? { opacity: 0, y: 24, duration: 0.6 } : undefined,
      }
    }
    // Which properties follow component variables.
    const use: NonNullable<SNode['use']> = {}
    if (visibleVar) use.visible = visibleVar
    if (link.linkVar) use.link = link.linkVar
    let n: SNode
    if (el.name === 'p' || el.name === 'span' || /^h[1-6]$/.test(el.name)) {
      const ff = typeof st.fontFamily === 'string' ? st.fontFamily.match(/^'([^']+)'/)?.[1] : undefined
      const b = el.children.find((c): c is Extract<Child, { type: 'bind' }> => c.type === 'bind')
      const v = el.children.find((c): c is Extract<Child, { type: 'var' }> => c.type === 'var')
      if (v) use.text = varId(v.key, v.line)
      const cv = styleVar(st.color, el.line)
      if (cv) use.color = cv
      const base = common('text')
      n = {
        ...base,
        // A bound text keeps its own words as the stand-in shown when there's no item or variable.
        text: b || v ? base.text ?? '' : textOf(el.children), bind: b ? fieldId(b.key, b.line) : undefined, fontSize: num(st.fontSize, 16), fontWeight: num(st.fontWeight, 400),
        lineHeight: num(st.lineHeight, 1.2), letterSpacing: num(st.letterSpacing, 0), color: cv ? base.color ?? '#111111' : colorOf(st.color, '#000000'),
        textAlign: (['left', 'center', 'right'].includes(String(st.textAlign)) ? st.textAlign : 'left') as SNode['textAlign'],
        textTransform: ['uppercase', 'lowercase', 'capitalize'].includes(String(st.textTransform)) ? st.textTransform as SNode['textTransform'] : undefined,
        textDecoration: ['underline', 'line-through'].includes(String(st.textDecoration)) ? st.textDecoration as SNode['textDecoration'] : undefined,
        fill: st.background ? colorOf(st.background, 'transparent') : 'transparent',
        mono: /MONO"?\s*100/.test(String(st.fontVariationSettings || '')), fontFamily: ff && ff !== 'Sites Sans' ? ff : undefined,
      }
      // Still following its text style only while the values match it.
      const ts = n.textStyle ? textStyleList.find((t) => t.id === n.textStyle) : undefined
      if (n.textStyle && (!ts || !matchesText(n, ts))) n.textStyle = undefined
    } else if (el.name === 'img') {
      const ex = el.attrs.src?.kind === 'expr' ? el.attrs.src.value : undefined
      const expr = ex?.match(/^item\.([A-Za-z_$][\w$]*)$/)?.[1]
      const vr = ex?.match(/^([A-Za-z_$][\w$]*)$/)?.[1]
      if (vr) use.image = varId(vr, el.line)
      const src = attrStr(el, 'src') || ''
      const file = src.replace(/^.*\/assets\//, '')
      const asset = ex ? undefined : assets.find((a) => assetFileName(a) === file)
      if (!ex && !asset) throw new ParseError(`No image called ${file} in Media`, el.line)
      const base = common('image')
      n = {
        ...base, assetId: asset?.id ?? base.assetId, bind: expr ? fieldId(expr, el.line) : undefined, fit: st.objectFit === 'contain' ? 'contain' : 'cover', radius: num(st.borderRadius),
        alt: attrStr(el, 'alt') || (el.attrs.alt?.kind === 'expr' ? JSON.parse(el.attrs.alt.value) : undefined) || undefined, ...border(st),
      }
    } else if (el.name === 'svg') {
      const path = el.children.find((c): c is El => c.type === 'el' && c.name === 'path')
      if (!path) throw new ParseError('<svg> needs a <path d="…" />', el.line)
      const stroke = attrStr(path, 'stroke') || 'none'
      const fv = path.attrs.fill?.kind === 'expr' ? path.attrs.fill.value.match(/^([A-Za-z_$][\w$]*)$/)?.[1] : undefined
      if (fv) use.fill = varId(fv, path.line)
      const base = common('path')
      n = { ...base, d: attrStr(path, 'd') || '', fill: fv ? base.fill : colorOf(attrStr(path, 'fill'), 'none'), stroke: toRef(stroke), strokeWidth: stroke === 'none' ? 0 : attrNum(path, 'strokeWidth') ?? 1 }
    } else if (/^[A-Z]/.test(el.name)) {
      const comp = pages.find((p) => p.kind === 'component' && componentName(p.name) === el.name)
      if (!comp) throw new ParseError(`There's no component called ${el.name}. Make one with ⌥⌘K on the canvas.`, el.line)
      if (comp.id === page.id) throw new ParseError(`${el.name} can't contain itself`, el.line)
      // Every other attribute sets one of the component's variables, or connects it to a CMS field.
      const props: NonNullable<SNode['props']> = {}
      const propBind: NonNullable<SNode['propBind']> = {}
      for (const [k, a] of Object.entries(el.attrs)) {
        if (['style', 'className', 'key', 'data-appear'].includes(k)) continue
        const v = (comp.vars || []).find((x) => x.key === k)
        if (!v) throw new ParseError(`${el.name} has no variable called ${k}`, el.line)
        if (a.kind === 'bool') { props[v.id] = true; continue }
        const raw = a.value.trim()
        const it = a.kind === 'expr' ? raw.match(/^item\.([A-Za-z_$][\w$]*)$/)?.[1] : undefined
        if (it) { propBind[v.id] = fieldId(it, el.line); continue }
        let val: string | number | boolean = a.kind === 'str' ? raw : raw
        if (a.kind === 'expr') {
          if (raw === 'true' || raw === 'false') val = raw === 'true'
          else if (/^-?\d*\.?\d+$/.test(raw)) val = +raw
          else if (/^(["'])[\s\S]*\1$/.test(raw)) val = raw.startsWith('"') ? JSON.parse(raw) : raw.slice(1, -1).replace(/\\'/g, "'")
          else throw new ParseError(`${k}={…} should be a value, like ${k}="…"`, el.line)
        }
        if (v.type === 'color' && typeof val === 'string') val = toRef(val)
        if (v.type === 'image' && typeof val === 'string' && val.includes('/assets/')) {
          const file = val.replace(/^.*\/assets\//, '')
          val = assets.find((x) => assetFileName(x) === file)?.id ?? val
        }
        if (v.type === 'number') val = Number(val) || 0
        props[v.id] = val
      }
      n = {
        ...common('instance'), componentId: comp.id, fill: 'transparent', radius: num(st.borderRadius), stroke: 'none', strokeWidth: 0,
        props: Object.keys(props).length ? props : undefined, propBind: Object.keys(propBind).length ? propBind : undefined,
      }
    } else if (el.name === 'div') {
      const ellipse = st.borderRadius === '50%'
      const kids = el.children.some((c) => c.type === 'el' || c.type === 'list' || c.type === 'when')
      const type: SNode['type'] = ellipse ? 'ellipse' : st.overflow === 'hidden' || st.overflow === 'visible' || kids || (st.display && st.display !== 'none') ? 'frame' : 'rect'
      const fv = styleVar(st.background, el.line)
      if (fv) use.fill = fv
      const base = common(type)
      n = {
        ...base,
        fill: fv ? base.fill : colorOf(st.background, 'transparent'), radius: ellipse ? 0 : num(st.borderRadius),
        ...border(st),
        ...(type === 'frame' && st.display !== 'none' ? layoutOf(st) : {}),
        clip: type === 'frame' && st.overflow === 'visible' ? false : undefined,
        list: undefined,
      }
    } else {
      throw new ParseError(`<${el.name}> can't be drawn on the canvas. Use div, p, img, svg, a or a component.`, el.line)
    }
    n.use = Object.keys(use).length ? use : undefined
    nodes.push(n)
    if (n.type === 'frame') walk(el, n)
  }

  // A link's page: by its path, a collection page by path + '/' + item.slug or path/any-slug.
  const linkTarget = (a: El): Link => {
    const ex = a.attrs.href?.kind === 'expr' ? a.attrs.href.value.trim() : undefined
    const vr = ex?.match(/^([A-Za-z_$][\w$]*)$/)?.[1]
    if (vr) return { linkVar: varId(vr, a.line), newTab: 'target' in a.attrs || undefined }
    const expr = ex?.match(/^['"]([^'"]*)\/['"]\s*\+\s*item\.slug$/)?.[1]
    const lit = ex && /^(["'])[\s\S]*\1$/.test(ex) ? ex.slice(1, -1) : undefined
    const href = expr ?? lit ?? attrStr(a, 'href') ?? '/'
    const real = pages.filter((p) => p.kind !== 'component')
    const pg = (expr === undefined ? real.find((p) => p.path === href) : undefined)
      || real.find((p) => p.collection && (href === p.path || href.startsWith(p.path.replace(/\/$/, '') + '/')))
    if (pg) return { page: pg.id }
    // Anything else is a web address.
    return { href, newTab: 'target' in a.attrs || undefined }
  }

  const walk = (el: El, parent: SNode | undefined) => {
    let name: string | undefined
    const one = (c: El, visibleVar?: string) => {
      if (c.name === 'style') return
      if (c.name === 'a') {
        const target = linkTarget(c)
        for (const inner of c.children) {
          if (inner.type === 'comment') name = inner.value
          else if (inner.type === 'el') { add(inner, parent, name, target, visibleVar); name = undefined }
        }
        return
      }
      add(c, parent, name, {}, visibleVar)
      name = undefined
    }
    for (const c of el.children) {
      if (c.type === 'comment') { name = c.value; continue }
      if (c.type === 'text') { if (c.value.trim()) throw new ParseError(`Stray text "${c.value.trim().slice(0, 24)}". Wrap it in <p>.`, el.line); continue }
      if (c.type === 'bind') throw new ParseError(`{item.${c.key}} goes inside a <p>`, c.line)
      if (c.type === 'var') throw new ParseError(`{${c.key}} goes inside a <p>`, c.line)
      if (c.type === 'when') { one(c.el, varId(c.key, c.line)); continue }
      if (c.type === 'list') {
        const coll = cms.find((x) => collectionVar(x) === c.coll)
        if (!coll) throw new ParseError(`There's no collection called ${c.coll}. Add it in the CMS window.`, c.line)
        if (!parent) throw new ParseError('A list goes inside a frame', c.line)
        const o = listOpts(c.opts)
        const sort = o.sort === 'slug' ? 'slug' : o.sort ? coll.fields.find((f) => f.key === o.sort)?.id : undefined
        if (o.sort && !sort) throw new ParseError(`${coll.name} has no field called ${o.sort} to sort by`, c.line)
        parent.list = { collection: coll.id, ...(sort ? { sort } : {}), ...(sort && o.desc ? { desc: true } : {}), ...(o.limit ? { limit: o.limit } : {}) }
        const outer = scope
        scope = coll
        one(c.el)
        scope = outer
        continue
      }
      one(c)
    }
  }
  walk(container, undefined)

  // Hidden layers aren't written to code, so keep them (and what's inside them) as they were.
  const ids = new Set(nodes.map((n) => n.id))
  const hiddenRoots = page.nodes.filter((n) => !written(n))
  const keep = new Set<string>()
  const under = (id: string) => page.nodes.filter((n) => n.parentId === id).forEach((k) => { keep.add(k.id); under(k.id) })
  hiddenRoots.forEach((h) => { keep.add(h.id); under(h.id) })
  const kept = page.nodes.filter((n) => keep.has(n.id) && !ids.has(n.id))
    .map((n) => (n.parentId && !ids.has(n.parentId) && !keep.has(n.parentId) ? { ...n, parentId: undefined } : n))
  return {
    background: component
      ? toRef(String(rootStyle.background ?? 'transparent'))
      : toRef(String(rootStyle.background ?? page.background)),
    width: Math.max(component ? 1 : 100, num(boxStyle.width, page.width)),
    height: Math.max(component ? 1 : 100, num(boxStyle.height, page.height)),
    nodes: [...nodes, ...kept],
  }
}
