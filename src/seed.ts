import type { Project } from './types'
import { defaultWindows, newNode, newPage, uid } from './store'

// Two starter projects so the grid has something in it on first run.
export function seedProjects(): Project[] {
  const now = Date.now()

  const home = newPage('Home', '/')
  const nav = newNode('frame', { name: 'Header', x: 64, y: 48, w: 1072, h: 24, fill: 'transparent', layout: 'stack', dir: 'row', justify: 'between', align: 'center', hMode: 'fit', tag: 'blue' })
  const plates = newNode('frame', { name: 'Plates', x: 64, y: 480, w: 1072, h: 340, fill: 'transparent', layout: 'grid', cols: 3, gap: 26, hMode: 'fit', tag: 'pink' })
  const plate = (name: string, fill: string) => newNode('frame', { name, parentId: plates.id, w: 340, h: 340, fill, wMode: 'fill', layout: 'stack', justify: 'center', align: 'center' })
  const p1 = plate('Plate 1', '#e8e6e1')
  const p2 = plate('Plate 2', '#1d1d1d')
  const p3 = plate('Plate 3', '#cfd8d3')
  home.nodes = [
    nav,
    newNode('text', { name: 'Wordmark', parentId: nav.id, w: 200, h: 24, text: 'Field Notes', fontSize: 16, fontWeight: 500, wMode: 'fit' }),
    newNode('text', { name: 'Nav', parentId: nav.id, w: 300, h: 24, text: 'Index   Archive   About', fontSize: 16, wMode: 'fit', link: '' }),
    newNode('text', { name: 'Headline', x: 64, y: 200, w: 900, h: 190, text: 'A slow collection of places, objects and ideas.', fontSize: 80, fontWeight: 400, lineHeight: 1.05, letterSpacing: -2 }),
    plates, p1,
    newNode('ellipse', { name: 'Sun', parentId: p1.id, w: 140, h: 140, fill: '#f2c14e' }),
    p2,
    newNode('path', { name: 'Mark', parentId: p2.id, w: 140, h: 140, fill: 'none', stroke: '#ffffff', strokeWidth: 2, d: 'M0 100 L50 0 L100 100 Z' }),
    p3,
    newNode('text', { name: 'Caption', x: 64, y: 846, w: 400, h: 20, text: 'Plates 1–3, 2026', fontSize: 13, color: '#8a8a8a', mono: true }),
  ]
  const about = newPage('About', '/about')
  about.nodes = [
    newNode('text', { name: 'Title', x: 64, y: 120, w: 700, h: 60, text: 'About', fontSize: 48 }),
    newNode('text', { name: 'Body', x: 64, y: 210, w: 560, h: 160, text: 'Field Notes is a small archive kept by hand. Everything here was built in Sites and exported as plain React.', fontSize: 20, lineHeight: 1.45, color: '#444444' }),
  ]
  home.nodes = home.nodes.map((n) => (n.name === 'Nav' ? { ...n, link: about.id } : n))

  // A button component, used inside a stack on the studio home page.
  const button = newPage('Button', '')
  button.kind = 'component'
  button.tag = 'violet'
  button.width = 160
  button.height = 48
  button.background = 'transparent'
  const btnBg = newNode('frame', { name: 'Surface', w: 160, h: 48, wMode: 'fill', hMode: 'fill', fill: '#f4f4f0', radius: 24, layout: 'stack', justify: 'center', align: 'center' })
  button.nodes = [btnBg, newNode('text', { name: 'Label', parentId: btnBg.id, w: 120, h: 20, text: 'Get in touch', fontSize: 16, color: '#111111', wMode: 'fit' })]

  const studioHome = newPage('Home', '/')
  studioHome.background = '#111111'
  const card = newNode('frame', { name: 'Card', x: 64, y: 520, w: 520, h: 280, fill: '#1f1f1f', radius: 16, layout: 'stack', dir: 'column', gap: 40, pad: 32, hMode: 'fit', tag: 'yellow' })
  studioHome.nodes = [
    newNode('text', { name: 'Headline', x: 64, y: 120, w: 1000, h: 300, text: 'Studio\nOrdinary', fontSize: 140, fontWeight: 700, lineHeight: 0.95, color: '#f4f4f0', letterSpacing: -4 }),
    card,
    newNode('text', { name: 'Card text', parentId: card.id, w: 440, h: 80, text: 'Identity, type and websites for small institutions.', fontSize: 24, color: '#f4f4f0', lineHeight: 1.3, wMode: 'fill' }),
    newNode('instance', { name: 'Button', parentId: card.id, componentId: button.id, w: 160, h: 48 }),
    newNode('ellipse', { name: 'Orb', x: 760, y: 500, w: 320, h: 320, fill: '#3a5bff' }),
  ]

  const base = (name: string, pages: Project['pages'], offset: number): Project => ({
    id: uid('p_'), name, description: '', createdAt: now - offset, updatedAt: now - offset,
    pages, files: [], assets: [],
    settings: { siteTitle: name, font: 'ABC Areal', accent: '#111111', repo: '' },
    windows: defaultWindows(), activePageId: pages[0].id,
  })

  const a = base('Field Notes', [home, about], 1000 * 60 * 20)
  a.files = [{
    id: uid('f_'), path: 'components/Footer.tsx',
    content: `export function Footer() {\n  return (\n    <footer style={{ padding: 64, fontSize: 13, color: '#8a8a8a' }}>\n      © {new Date().getFullYear()} Field Notes\n    </footer>\n  )\n}\n`,
  }]
  return [a, base('Studio Ordinary', [studioHome, button], 1000 * 60 * 60 * 26)]
}
