import type { ColorStyle, Collection, Page, Project, SNode, TextStyle, Variable } from './types'
import { defaultWindows, newNode, newPage, uid } from './store'
import { defaultViews } from './views'
import { cmsUid, fieldKey, slugify } from './cms'
import { matchesText, textPatch } from './theme'

// The starter project: a guide to Sites, built with the features each of its pages explains.
export const GUIDE_NAME = 'Sites Guide'

const COLORS: ColorStyle[] = [
  { id: 'cs_ink', name: 'Ink', light: '#111111', dark: '#f2f2f0' },
  { id: 'cs_paper', name: 'Paper', light: '#ffffff', dark: '#0e0e0e' },
  { id: 'cs_muted', name: 'Muted', light: '#6f6f6f', dark: '#9a9a9a' },
  { id: 'cs_surface', name: 'Surface', light: '#f3f3f1', dark: '#1b1b1b' },
  { id: 'cs_line', name: 'Line', light: '#e4e4e1', dark: '#2a2a2a' },
  { id: 'cs_accent', name: 'Accent', light: '#ff5a1f' },
]
const TEXTS: TextStyle[] = [
  { id: 'ts_display', name: 'Display', fontSize: 64, fontWeight: 500, lineHeight: 1.05, letterSpacing: -1.5, color: '$cs_ink' },
  { id: 'ts_heading', name: 'Heading', fontSize: 24, fontWeight: 500, lineHeight: 1.25, letterSpacing: 0, color: '$cs_ink' },
  { id: 'ts_lede', name: 'Lede', fontSize: 20, fontWeight: 400, lineHeight: 1.5, letterSpacing: 0, color: '$cs_muted' },
  { id: 'ts_body', name: 'Body', fontSize: 18, fontWeight: 400, lineHeight: 1.5, letterSpacing: 0, color: '$cs_ink' },
  { id: 'ts_small', name: 'Small', fontSize: 15, fontWeight: 400, lineHeight: 1.45, letterSpacing: 0, color: '$cs_muted' },
  { id: 'ts_caption', name: 'Caption', fontSize: 13, fontWeight: 400, lineHeight: 1.4, letterSpacing: 0, color: '$cs_muted' },
]
const c = (id: string) => '$cs_' + id
const ts = (id: string) => TEXTS.find((t) => t.id === 'ts_' + id)!

type Lesson = { page: Page; num: string; title: string; summary: string }

export function seedProjects(): Project[] {
  const now = Date.now()
  const blank = (name: string, path: string, height: number): Page => ({ ...newPage(name, path), height, background: c('paper'), views: defaultViews(height) })

  const start = blank('Start', '/', 1360)
  const layout = blank('Layout', '/layout', 1690)
  const components = blank('Components', '/components', 1430)
  const styles = blank('Styles', '/styles', 1720)
  const cmsPage = blank('CMS', '/cms', 1540)
  const motion = blank('Motion', '/motion', 1420)
  const code = blank('Code', '/code', 1110)
  const tip = { ...blank('Tip', '/tips', 640) }

  const lessons: Lesson[] = [
    { page: layout, num: '01', title: 'Layout', summary: 'Stacks, grids, nesting and the three views.' },
    { page: components, num: '02', title: 'Components', summary: 'Reusable parts with variables for each copy.' },
    { page: styles, num: '03', title: 'Styles', summary: 'Named colours with dark values, and text styles.' },
    { page: cmsPage, num: '04', title: 'CMS', summary: 'Collections, lists and a page for every item.' },
    { page: motion, num: '05', title: 'Motion', summary: 'Hover, appear on scroll, shadows, blur and links.' },
    { page: code, num: '06', title: 'Code', summary: 'Two way sync with React, and export.' },
  ]

  // ─── Components ─────────────────────────────────────────
  const v = (name: string, key: string, type: Variable['type'], value: Variable['value']): Variable => ({ id: uid('v_'), name, key, type, value })

  const button: Page = { ...newPage('Button', '/components/button'), kind: 'component', width: 200, height: 48, background: 'transparent', views: undefined }
  const bLabel = v('Label', 'label', 'text', 'Get started')
  const bTint = v('Tint', 'tint', 'color', c('accent'))
  const bInk = v('Text colour', 'textColor', 'color', '#ffffff')
  const bArrow = v('Show arrow', 'showArrow', 'toggle', true)
  const bUrl = v('Web link', 'url', 'link', '')
  button.vars = [bLabel, bTint, bInk, bArrow, bUrl]
  const bSurface = newNode('frame', { name: 'Surface', w: 200, h: 48, wMode: 'fill', hMode: 'fill', fill: c('accent'), radius: 24, layout: 'stack', dir: 'row', justify: 'center', align: 'center', gap: 8, use: { fill: bTint.id } })
  button.nodes = [
    bSurface,
    newNode('text', { name: 'Label', parentId: bSurface.id, w: 120, h: 20, wMode: 'fit', text: 'Get started', fontSize: 15, fontWeight: 500, color: '#ffffff', use: { text: bLabel.id, color: bInk.id } }),
    newNode('text', { name: 'Arrow', parentId: bSurface.id, w: 16, h: 20, wMode: 'fit', text: '→', fontSize: 15, fontWeight: 500, color: '#ffffff', use: { visible: bArrow.id, color: bInk.id } }),
  ]

  const card: Page = { ...newPage('Lesson card', '/components/lesson-card'), kind: 'component', width: 340, height: 220, background: 'transparent', views: undefined }
  const cNum = v('Number', 'num', 'text', '01')
  const cTitle = v('Title', 'title', 'text', 'Lesson')
  const cSummary = v('Summary', 'summary', 'text', 'What this lesson covers.')
  card.vars = [cNum, cTitle, cSummary]
  const cSurface = newNode('frame', { name: 'Surface', w: 340, h: 220, wMode: 'fill', hMode: 'fill', fill: c('surface'), radius: 16, layout: 'stack', dir: 'column', justify: 'between', gap: 12, pad: 24 })
  const cText = newNode('frame', { name: 'Text', parentId: cSurface.id, w: 292, h: 80, wMode: 'fill', hMode: 'fit', fill: 'transparent', layout: 'stack', dir: 'column', gap: 6 })
  card.nodes = [
    cSurface,
    newNode('text', { name: 'Number', parentId: cSurface.id, w: 40, h: 18, wMode: 'fit', text: '01', mono: true, ...textPatch(ts('caption')), textStyle: 'ts_caption', use: { text: cNum.id } }),
    cText,
    newNode('text', { name: 'Title', parentId: cText.id, w: 292, h: 30, wMode: 'fill', text: 'Lesson', ...textPatch(ts('heading')), textStyle: 'ts_heading', use: { text: cTitle.id } }),
    newNode('text', { name: 'Summary', parentId: cText.id, w: 292, h: 44, wMode: 'fill', text: 'What this lesson covers.', ...textPatch(ts('small')), textStyle: 'ts_small', use: { text: cSummary.id } }),
  ]

  // ─── CMS ───────────────────────────────────────────────
  const fields = (['Title', 'Number', 'Summary', 'Body'] as const).map((name, i, all) => ({
    id: cmsUid('fd_'), name, key: fieldKey(name, all.slice(0, i).map((m) => fieldKey(m))), type: (name === 'Summary' || name === 'Body' ? 'long' : 'text') as 'long' | 'text',
  }))
  const [fTitle, fNum, fSummary, fBody] = fields
  const tipRows: [string, string, string, string][] = [
    ['Name every layer', 'Tip 1', 'Names become comments in code.', 'Double click a layer in the Layers panel to rename it. The name is written above that element in the code, so a well named canvas reads like a well written file.'],
    ['Stack before you nudge', 'Tip 2', 'Let stacks do the spacing.', 'Instead of moving layers by hand, wrap them in a stack with ⇧A and set one gap. Everything stays evenly spaced when text changes length.'],
    ['Style once', 'Tip 3', 'Colours and text styles keep a site consistent.', 'Save a colour or text style in Assets and use it everywhere. Change the style later and every layer that uses it follows, in light and dark.'],
    ['Check the phone view', 'Tip 4', 'Views fit themselves, but look anyway.', 'Tablet and phone follow desktop on their own. Switch views to check them, and change anything that needs its own size or position there.'],
  ]
  const collection: Collection = {
    id: cmsUid('col_'), name: 'Tips', slug: 'tips', fields,
    items: tipRows.map(([title, num, summary, body]) => ({ id: cmsUid('it_'), slug: slugify(title), values: { [fTitle.id]: title, [fNum.id]: num, [fSummary.id]: summary, [fBody.id]: body } })),
  }
  tip.collection = collection.id

  // ─── Page building blocks ──────────────────────────────
  const W = 1072
  // Every page: a header, then one column that flows top to bottom.
  const scaffold = (pg: Page, current?: Page) => {
    const nodes: SNode[] = []
    const header = newNode('frame', { name: 'Header', x: 64, y: 40, w: W, h: 24, hMode: 'fit', fill: 'transparent', layout: 'stack', dir: 'row', justify: 'between', align: 'center', wrap: true, gap: 16 })
    const links = newNode('frame', { name: 'Links', parentId: header.id, w: 520, h: 20, hMode: 'fit', fill: 'transparent', layout: 'stack', dir: 'row', justify: 'end', gap: 20, wrap: true, bp: { phone: { justify: 'start', gap: 12 } } })
    nodes.push(
      header,
      newNode('text', { name: 'Wordmark', parentId: header.id, w: 120, h: 20, wMode: 'fit', text: 'Sites Guide', fontSize: 15, fontWeight: 500, color: c('ink'), link: start.id }),
      links,
      ...lessons.map((l) => newNode('text', {
        name: l.title, parentId: links.id, w: 80, h: 20, wMode: 'fit', text: l.title, fontSize: 15, color: l.page === current ? c('ink') : c('muted'), link: l.page.id, hover: { color: c('ink') }, bp: { phone: { fontSize: 14 } },
      })),
    )
    const body = newNode('frame', { name: 'Content', x: 64, y: 136, w: W, h: 800, hMode: 'fit', fill: 'transparent', clip: false, layout: 'stack', dir: 'column', gap: 72 })
    nodes.push(body)
    pg.nodes = nodes
    return body
  }
  const add = (pg: Page, n: SNode) => { pg.nodes.push(n); return n }
  // A text layer in one of the text styles; it stays linked only while nothing overrides the style.
  const text = (pg: Page, parent: SNode, style: string, t: string, over: Partial<SNode> = {}) => {
    const n = newNode('text', { name: t.length > 24 ? style[0].toUpperCase() + style.slice(1) : t, parentId: parent.id, w: 720, h: 24, text: t, ...textPatch(ts(style)), ...over })
    return add(pg, { ...n, textStyle: matchesText(n, ts(style)) ? ts(style).id : undefined })
  }
  const group = (pg: Page, parent: SNode, name: string, over: Partial<SNode> = {}) =>
    add(pg, newNode('frame', { name, parentId: parent.id, w: W, h: 100, wMode: 'fill', hMode: 'fit', fill: 'transparent', clip: false, layout: 'stack', dir: 'column', gap: 16, ...over }))

  const intro = (pg: Page, body: SNode, kicker: string, title: string, lede: string) => {
    const g = group(pg, body, 'Intro', { gap: 20 })
    text(pg, g, 'caption', kicker, { name: 'Kicker', mono: true })
    text(pg, g, 'display', title, { name: 'Title', w: 900 })
    text(pg, g, 'lede', lede, { name: 'Lede' })
    return g
  }
  const steps = (pg: Page, body: SNode, list: string[]) => {
    const g = group(pg, body, 'How to', { gap: 18 })
    text(pg, g, 'heading', 'How to', { name: 'Heading', h: 30 })
    list.forEach((s, i) => {
      const row = add(pg, newNode('frame', { name: `Step ${i + 1}`, parentId: g.id, w: 720, h: 40, hMode: 'fit', fill: 'transparent', layout: 'stack', dir: 'row', gap: 20, align: 'start' }))
      text(pg, row, 'caption', String(i + 1).padStart(2, '0'), { name: 'Number', w: 28, mono: true, lineHeight: 1.4 })
      text(pg, row, 'body', s, { name: 'Text', w: 672, wMode: 'fill' })
    })
    return g
  }
  const demo = (pg: Page, body: SNode, label = 'Try it') => {
    const g = group(pg, body, 'Demo', { gap: 24 })
    text(pg, g, 'heading', label, { name: 'Heading', h: 30 })
    return g
  }
  const caption = (pg: Page, parent: SNode, t: string) => text(pg, parent, 'caption', t, { name: 'Caption', w: 240, wMode: 'fit' })
  const inst = (pg: Page, parent: SNode, comp: Page, over: Partial<SNode>) =>
    add(pg, newNode('instance', { name: comp.name, parentId: parent.id, componentId: comp.id, w: comp.width, h: comp.height, ...over }))

  // ─── Start ─────────────────────────────────────────────
  {
    const body = scaffold(start)
    const g = intro(start, body, 'Guide', 'Build a site, one idea at a time.',
      'This project is a working tour of Sites. Each page explains one part of the editor and is built with the thing it describes. Select anything on the canvas and the inspector on the right shows how it was made.')
    const row = add(start, newNode('frame', { name: 'Actions', parentId: g.id, w: 480, h: 48, wMode: 'fit', hMode: 'fit', fill: 'transparent', clip: false, layout: 'stack', dir: 'row', gap: 12, wrap: true }))
    inst(start, row, button, { name: 'Start button', w: 200, link: layout.id, props: { [bLabel.id]: 'Start with layout' }, hover: { scale: 1.03 }, cursor: 'pointer' })
    inst(start, row, button, { name: 'Code button', w: 168, link: code.id, props: { [bLabel.id]: 'See the code', [bTint.id]: c('surface'), [bInk.id]: c('ink'), [bArrow.id]: false }, hover: { scale: 1.03 }, cursor: 'pointer' })

    const lg = demo(start, body, 'Lessons')
    const grid = add(start, newNode('frame', { name: 'Lessons', parentId: lg.id, w: W, h: 464, wMode: 'fill', hMode: 'fit', fill: 'transparent', clip: false, layout: 'grid', cols: 3, gap: 24, bp: { phone: { cols: 1 } }, appear: { y: 24, opacity: 0, duration: 0.6 } }))
    for (const l of lessons) {
      inst(start, grid, card, {
        name: l.title, w: 341, h: 220, wMode: 'fill', hMode: 'fit', link: l.page.id, cursor: 'pointer', hover: { y: -4 },
        props: { [cNum.id]: l.num, [cTitle.id]: l.title, [cSummary.id]: l.summary },
      })
    }
    const keys = group(start, body, 'Keys', { gap: 12 })
    text(start, keys, 'heading', 'Keys worth learning', { name: 'Heading', h: 30 })
    text(start, keys, 'body', 'V select · F frame · S stack · G grid · T text · R rectangle · O oval · P pen · H hand', { name: 'Tools', mono: true, fontSize: 15, color: c('muted') })
    text(start, keys, 'body', '⇧A wrap in a stack · ⌘⏎ wrap in a frame · ⌥⌘K make a component · ⌘D duplicate · ⌘K commands', { name: 'Actions', mono: true, fontSize: 15, color: c('muted') })
  }

  // ─── 01 Layout ─────────────────────────────────────────
  {
    const pg = layout
    const body = scaffold(pg, pg)
    intro(pg, body, '01 · Layout', 'Stacks, grids and free layers.',
      'Layers either sit where you put them, or flow inside a stack or a grid. Flowing layout keeps spacing even as content changes, and it is what lets a page fit tablet and phone.')
    steps(pg, body, [
      'Press S and drag to draw a stack. Layers inside it line up in a row or a column, with one gap you set in the inspector.',
      'Select two or more layers and press ⇧A to wrap them in a stack. ⌘⏎ wraps them in a plain frame instead.',
      'Press G and drag for a grid. Set its columns and gap; set a layer to Fill so it takes the whole cell.',
      'Size each layer as Fixed, Fill or Fit, and place children with the 3 × 3 alignment grid in the inspector.',
      'Switch to Tablet or Phone at the top of the canvas. Views fit themselves to desktop, and anything you change there applies only to that view.',
    ])
    const d = demo(pg, body)
    const chip = (parent: SNode, name: string, w: number, fill = c('surface')) => add(pg, newNode('rect', { name, parentId: parent.id, w, h: 56, fill, radius: 12 }))
    caption(pg, d, 'A row stack, gap 12')
    const rowStack = add(pg, newNode('frame', { name: 'Row stack', parentId: d.id, w: 480, h: 80, wMode: 'fit', hMode: 'fit', fill: 'transparent', stroke: c('line'), strokeWidth: 1, radius: 16, pad: 12, layout: 'stack', dir: 'row', gap: 12, wrap: true }))
    chip(rowStack, 'A', 96); chip(rowStack, 'B', 140, c('ink')); chip(rowStack, 'C', 64)
    caption(pg, d, 'A grid, 4 columns, cells set to Fill')
    const grid = add(pg, newNode('frame', { name: 'Grid', parentId: d.id, w: W, h: 200, wMode: 'fill', hMode: 'fit', fill: 'transparent', layout: 'grid', cols: 4, gap: 12 }))
    for (let i = 0; i < 8; i++) add(pg, newNode('rect', { name: `Cell ${i + 1}`, parentId: grid.id, w: 259, h: 96, wMode: 'fill', fill: i === 5 ? c('accent') : c('surface'), radius: 12 }))
    caption(pg, d, 'Nesting: a column stack holding a row stack')
    const outer = add(pg, newNode('frame', { name: 'Column', parentId: d.id, w: 520, h: 200, hMode: 'fit', fill: c('surface'), radius: 16, pad: 20, layout: 'stack', dir: 'column', gap: 12 }))
    text(pg, outer, 'heading', 'A card is a stack', { name: 'Title', w: 480, wMode: 'fill' })
    text(pg, outer, 'small', 'Its title, text and buttons flow down; the buttons sit in a row stack of their own.', { name: 'Text', w: 480, wMode: 'fill' })
    const inner = add(pg, newNode('frame', { name: 'Row', parentId: outer.id, w: 300, h: 40, wMode: 'fit', hMode: 'fit', fill: 'transparent', layout: 'stack', dir: 'row', gap: 8 }))
    add(pg, newNode('rect', { name: 'Pill', parentId: inner.id, w: 88, h: 32, fill: c('ink'), radius: 16 }))
    add(pg, newNode('rect', { name: 'Pill', parentId: inner.id, w: 64, h: 32, fill: c('line'), radius: 16 }))
  }

  // ─── 02 Components ─────────────────────────────────────
  {
    const pg = components
    const body = scaffold(pg, pg)
    intro(pg, body, '02 · Components', 'Make it once, use it everywhere.',
      'A component is a part you reuse, like a button or a card. Variables decide what each copy can change: its label, colour, image, whether something shows, or where it links.')
    steps(pg, body, [
      'Select some layers and press ⌥⌘K to make them a component. It appears under Components in the Layers panel.',
      'Open the component and, with nothing selected, add variables in the inspector: text, colour, image, toggle, link or number.',
      'Select a layer inside it and choose the variable each property follows, or pick New variable to make one from its current value.',
      'Back on a page, select a copy to set its own values. Edit component changes every copy at once, and Detach turns a copy back into layers.',
    ])
    const d = demo(pg, body, 'Three copies of Button')
    const row = add(pg, newNode('frame', { name: 'Buttons', parentId: d.id, w: W, h: 48, wMode: 'fill', hMode: 'fit', fill: 'transparent', clip: false, layout: 'stack', dir: 'row', gap: 12, wrap: true }))
    inst(pg, row, button, { name: 'Default', w: 168, hover: { scale: 1.03 } })
    inst(pg, row, button, { name: 'Ink', w: 148, props: { [bLabel.id]: 'Secondary', [bTint.id]: c('ink'), [bInk.id]: c('paper'), [bArrow.id]: false }, hover: { scale: 1.03 } })
    inst(pg, row, button, { name: 'Quiet', w: 164, props: { [bLabel.id]: 'Source code', [bTint.id]: c('surface'), [bInk.id]: c('ink'), [bUrl.id]: 'https://github.com/GeremyRobinson/sites' }, hover: { scale: 1.03 } })
    caption(pg, d, 'Default values · Tint and label changed, arrow off · A web link set on the copy')
    const d2 = demo(pg, body, 'And a card')
    inst(pg, d2, card, { name: 'Card', w: 340, h: 220, props: { [cNum.id]: '02', [cTitle.id]: 'Components', [cSummary.id]: 'This card is the same one the Start page uses six times.' } })
  }

  // ─── 03 Styles ─────────────────────────────────────────
  {
    const pg = styles
    const body = scaffold(pg, pg)
    intro(pg, body, '03 · Styles', 'Name a colour once.',
      'Colour and text styles keep a site consistent. Every colour here can have a second value for dark mode, and the whole site switches with the visitor\'s system setting.')
    steps(pg, body, [
      'Open Assets at the top of the canvas\'s left panel. Colours and text styles for the whole site live there.',
      'Click + next to Colors to add one, and turn on Dark to give it a value for dark mode.',
      'Click any colour dot in the inspector to pick a style, detach from one, or save the current colour as a new style.',
      'Select a text layer and click + next to Text to save its size, weight and spacing. Editing the style updates every layer that uses it.',
      'Use the sun and moon button on the canvas, or Light and Dark in Preview, to check both modes.',
    ])
    const d = demo(pg, body, 'Colours')
    const grid = add(pg, newNode('frame', { name: 'Swatches', parentId: d.id, w: W, h: 150, wMode: 'fill', hMode: 'fit', fill: 'transparent', layout: 'grid', cols: 6, gap: 16 }))
    for (const s of COLORS) {
      const cell = add(pg, newNode('frame', { name: s.name, parentId: grid.id, w: 165, h: 140, wMode: 'fill', hMode: 'fit', fill: 'transparent', layout: 'stack', dir: 'column', gap: 10 }))
      add(pg, newNode('rect', { name: 'Swatch', parentId: cell.id, w: 165, h: 96, wMode: 'fill', fill: '$' + s.id, radius: 12, stroke: c('line'), strokeWidth: 1 }))
      text(pg, cell, 'small', s.name, { name: 'Name', w: 160, wMode: 'fill', color: c('ink') })
    }
    const t = demo(pg, body, 'Text styles')
    const spec = group(pg, t, 'Specimen', { gap: 20 })
    for (const s of TEXTS) {
      const row = add(pg, newNode('frame', { name: s.name, parentId: spec.id, w: W, h: 40, wMode: 'fill', hMode: 'fit', fill: 'transparent', layout: 'stack', dir: 'column', gap: 4 }))
      text(pg, row, 'caption', `${s.name} · ${s.fontSize}/${s.fontWeight}`, { name: 'Label', mono: true })
      text(pg, row, s.id.slice(3), s.id === 'ts_display' ? 'Art in a white room' : 'The quick brown fox jumps over the lazy dog.', { name: 'Sample', w: 900 })
    }
  }

  // ─── 04 CMS ────────────────────────────────────────────
  {
    const pg = cmsPage
    const body = scaffold(pg, pg)
    intro(pg, body, '04 · CMS', 'Content that lives apart from layout.',
      'A collection holds items with the same fields, like journal entries, projects or team members. Lay out one item on the canvas and the list repeats it for every item.')
    steps(pg, body, [
      'Open CMS from the dock. This project has a collection called Tips.',
      'Add fields such as text, image, date, link, toggle or colour, then add items. Items marked as drafts stay off the site.',
      'Select a frame on the canvas and choose a collection under List. Its first layer repeats once for each item.',
      'Connect a text or image layer to a field, or connect a component\'s variables to fields, like the cards below.',
      'Make page turns a collection into one page per item. Each card links to its own tip.',
    ])
    const d = demo(pg, body, 'Tips, from the CMS')
    const list = add(pg, newNode('frame', { name: 'Tips list', parentId: d.id, w: W, h: 464, wMode: 'fill', hMode: 'fit', fill: 'transparent', clip: false, layout: 'grid', cols: 2, gap: 24, list: { collection: collection.id }, bp: { phone: { cols: 1 } } }))
    inst(pg, list, card, {
      name: 'Tip card', w: 524, h: 220, wMode: 'fill', hMode: 'fit', link: tip.id, cursor: 'pointer', hover: { y: -4 },
      propBind: { [cNum.id]: fNum.id, [cTitle.id]: fTitle.id, [cSummary.id]: fSummary.id },
    })
  }

  // ─── Tip (one page per CMS item) ───────────────────────
  {
    const pg = tip
    const body = scaffold(pg, cmsPage)
    const g = group(pg, body, 'Tip', { gap: 20 })
    text(pg, g, 'caption', '← All tips', { name: 'Back', link: cmsPage.id, w: 120, wMode: 'fit', hover: { color: c('ink') } })
    text(pg, g, 'caption', 'Tip 1', { name: 'Number', mono: true, bind: fNum.id })
    text(pg, g, 'display', 'Name every layer', { name: 'Title', w: 900, bind: fTitle.id })
    text(pg, g, 'lede', 'Names become comments in code.', { name: 'Summary', bind: fSummary.id })
    text(pg, g, 'body', 'Body', { name: 'Body', bind: fBody.id })
  }

  // ─── 05 Motion ─────────────────────────────────────────
  {
    const pg = motion
    const body = scaffold(pg, pg)
    intro(pg, body, '05 · Motion', 'Small movements, on purpose.',
      'Hover and appear effects give a page a sense of response. Effects add depth, and links connect pages or leave the site.')
    steps(pg, body, [
      'Select a layer and open Interaction in the inspector. Turn on Hover to scale, lift, fade or recolour it under the pointer.',
      'Turn on Appear to fade and slide a layer in as it scrolls into view. Time and Delay set its pace.',
      'Effects adds a shadow, a layer blur, or a background blur for glass.',
      'Link to sends a layer to another page or a web address, and Cursor sets the pointer shown over it.',
      'Press Preview to try hover and appear. They run in Preview and on the exported site, not while you edit.',
    ])
    const d = demo(pg, body, 'Try it in Preview')
    const row = add(pg, newNode('frame', { name: 'Examples', parentId: d.id, w: W, h: 240, wMode: 'fill', hMode: 'fit', fill: 'transparent', clip: false, layout: 'grid', cols: 3, gap: 24, bp: { phone: { cols: 1 } } }))
    const tile = (name: string, over: Partial<SNode>) => add(pg, newNode('frame', { name, parentId: row.id, w: 341, h: 240, wMode: 'fill', fill: c('surface'), radius: 16, pad: 24, layout: 'stack', dir: 'column', justify: 'end', gap: 6, ...over }))
    const hover = tile('Hover', { hover: { scale: 1.03, y: -6 }, shadow: { x: 0, y: 12, blur: 32, spread: 0, color: 'rgba(0,0,0,0.08)' }, cursor: 'pointer' })
    text(pg, hover, 'heading', 'Hover', { name: 'Title', w: 290, wMode: 'fill' })
    text(pg, hover, 'small', 'Scale 1.03, lift 6, with a soft shadow.', { name: 'Text', w: 290, wMode: 'fill' })
    const appear = tile('Appear', { appear: { y: 32, opacity: 0, duration: 0.7, delay: 0.1 } })
    text(pg, appear, 'heading', 'Appear', { name: 'Title', w: 290, wMode: 'fill' })
    text(pg, appear, 'small', 'Slides up 32 as it scrolls into view.', { name: 'Text', w: 290, wMode: 'fill' })
    const glass = tile('Glass', { fill: c('surface'), clip: true, justify: 'end' })
    add(pg, newNode('ellipse', { name: 'Sun', parentId: glass.id, w: 120, h: 120, fill: c('accent') }))
    // The sun sits behind a blurred pane: background blur makes glass.
    const pane = add(pg, newNode('frame', { name: 'Pane', parentId: glass.id, w: 290, h: 72, wMode: 'fill', hMode: 'fit', fill: 'rgba(255,255,255,0.45)', radius: 12, pad: 14, bgBlur: 16, layout: 'stack', dir: 'column', gap: 2 }))
    text(pg, pane, 'heading', 'Glass', { name: 'Title', w: 260, wMode: 'fill', color: '#111111' })
    text(pg, pane, 'small', 'Background blur 16.', { name: 'Text', w: 260, wMode: 'fill', color: '#444444' })
    const links = group(pg, body, 'Links', { gap: 12 })
    text(pg, links, 'heading', 'Links', { name: 'Heading', h: 30 })
    text(pg, links, 'body', 'Back to the start →', { name: 'Page link', w: 300, wMode: 'fit', link: start.id, textDecoration: 'underline', hover: { opacity: 0.6 } })
    text(pg, links, 'body', 'The Sites source on GitHub ↗', { name: 'Web link', w: 300, wMode: 'fit', href: 'https://github.com/GeremyRobinson/sites', newTab: true, textDecoration: 'underline', hover: { opacity: 0.6 } })
  }

  // ─── 06 Code ───────────────────────────────────────────
  {
    const pg = code
    const body = scaffold(pg, pg)
    intro(pg, body, '06 · Code', 'The canvas is React.',
      'Every page and component is a React file you can read and edit. Changes go both ways: edit the canvas and the code follows, edit the code and the canvas follows.')
    steps(pg, body, [
      'Open Code from the dock. Pick a page or component in its file list to see its file.',
      'Change a text, a number or a colour in the code and the canvas updates. Your own files, like components/Footer.tsx here, sit alongside.',
      'theme.css and the cms folder are written for you from Assets and the CMS, so they are read only.',
      'Export from Project to download a Vite and React site. Run npm install, then npm run dev.',
    ])
    const d = demo(pg, body, 'This page\'s button, in code')
    const block = add(pg, newNode('frame', { name: 'Snippet', parentId: d.id, w: 720, h: 120, hMode: 'fit', fill: c('ink'), radius: 16, pad: 24, layout: 'stack', dir: 'column', gap: 4 }))
    for (const line of ['<Button', '  label="Start with layout"', '  showArrow', '/>']) text(pg, block, 'small', line, { name: 'Line', w: 672, wMode: 'fill', mono: true, color: c('paper') })
  }

  const project: Project = {
    id: uid('p_'), name: GUIDE_NAME, description: 'A tour of every feature', createdAt: now, updatedAt: now,
    pages: [start, layout, components, styles, cmsPage, tip, motion, code, button, card],
    files: [{
      id: uid('f_'), path: 'components/Footer.tsx',
      content: `export function Footer() {\n  return (\n    <footer style={{ padding: 64, fontSize: 13, color: 'var(--muted)' }}>\n      Built in Sites\n    </footer>\n  )\n}\n`,
    }],
    assets: [], cms: [collection], styles: { colors: COLORS, text: TEXTS },
    settings: { siteTitle: GUIDE_NAME, font: 'ABC Areal', accent: '#111111', repo: '', guide: true, viewsFitted: true, viewsAuto: true },
    windows: defaultWindows(), activePageId: start.id,
  }
  return [project]
}

// The two samples earlier versions started with. The guide replaces them once.
export const OLD_SAMPLES = ['Field Notes', 'Studio Ordinary']
