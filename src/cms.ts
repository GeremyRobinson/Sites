// CMS helpers shared by the CMS window, the canvas and the code writer.
import type { Asset, CmsItem, Collection, Field, FieldType, SNode } from './types'

export const cmsUid = (p: string) => p + Math.random().toString(36).slice(2, 9)

export const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

// A field's key is what code reads (item.title). It stays a plain identifier and never clashes with id or slug.
export const fieldKey = (name: string, taken: string[] = []) => {
  let k = name.replace(/[^a-zA-Z0-9]+/g, ' ').trim().split(' ').map((w, i) => (i ? w[0]?.toUpperCase() + w.slice(1) : w.toLowerCase())).join('') || 'field'
  if (/^[0-9]/.test(k)) k = 'f' + k
  if (['id', 'slug', 'item', 'key'].includes(k)) k += 'Field'
  let out = k
  for (let i = 2; taken.includes(out); i++) out = k + i
  return out
}

// The variable a collection is exported as in code: team-members → teamMembers.
export const collectionVar = (c: Collection) => {
  const v = fieldKey(c.slug || c.name)
  return ['list', 'React'].includes(v) ? v + 'Items' : v
}
export const itemType = (c: Collection) => {
  const v = collectionVar(c)
  return v[0].toUpperCase() + v.slice(1) + 'Item'
}

export const FIELD_TYPES: { type: FieldType; label: string }[] = [
  { type: 'text', label: 'Text' },
  { type: 'long', label: 'Long text' },
  { type: 'image', label: 'Image' },
  { type: 'number', label: 'Number' },
  { type: 'date', label: 'Date' },
  { type: 'link', label: 'Link' },
  { type: 'toggle', label: 'Toggle' },
  { type: 'color', label: 'Color' },
]

export const emptyValue = (t: FieldType) => (t === 'number' ? 0 : t === 'toggle' ? false : t === 'color' ? '#111111' : '')

// The first text field names an item in lists and pickers.
export const titleField = (c: Collection) => c.fields.find((f) => f.type === 'text') || c.fields[0]
export const itemTitle = (c: Collection, it: CmsItem) => {
  const f = titleField(c)
  const v = f ? it.values[f.id] : undefined
  return v === undefined || v === '' ? it.slug || 'Untitled' : String(v)
}

// Items a list shows: published only, sorted, then cut to the limit.
export function listItems(c: Collection | undefined, l: NonNullable<SNode['list']>): CmsItem[] {
  if (!c) return []
  const out = c.items.filter((it) => !it.draft)
  const f = l.sort ? c.fields.find((x) => x.id === l.sort) : undefined
  if (l.sort === 'slug' || f) {
    const val = (it: CmsItem) => (l.sort === 'slug' ? it.slug : it.values[f!.id]) ?? ''
    out.sort((a, b) => {
      const x = val(a)
      const y = val(b)
      return (x < y ? -1 : x > y ? 1 : 0) * (l.desc ? -1 : 1)
    })
  }
  return l.limit ? out.slice(0, l.limit) : out
}

// An image value is an asset id from Media or a web address.
export const imageSrc = (v: unknown, assets: Asset[]) => {
  if (typeof v !== 'string' || !v) return undefined
  if (/^(https?:|data:|\/)/.test(v)) return v
  return assets.find((a) => a.id === v)?.data
}

// What a bound text layer shows for a value.
export const textValue = (v: unknown, f?: Field) => {
  if (v === undefined || v === '') return ''
  if (f?.type === 'toggle') return v ? 'Yes' : 'No'
  return String(v)
}

// Fields a layer of this type can show.
export const bindable = (type: SNode['type'], f: Field) => (type === 'image' ? f.type === 'image' : type === 'text' ? f.type !== 'image' && f.type !== 'color' : false)

// ─── Starting points ─────────────────────────────────────
type Template = { name: string; fields: [string, FieldType][]; items: Record<string, string | number | boolean>[] }

export const TEMPLATES: Template[] = [
  {
    name: 'Journal',
    fields: [['Title', 'text'], ['Date', 'date'], ['Excerpt', 'long'], ['Cover', 'image'], ['Body', 'long'], ['Featured', 'toggle']],
    items: [
      { Title: 'Notes on a quiet room', Date: '2026-09-18', Excerpt: 'Why the best interfaces leave space for the work.', Body: 'A room with nothing in it is not empty. It is waiting.', Featured: true },
      { Title: 'Drawing with constraints', Date: '2026-08-30', Excerpt: 'Grids, stacks and the freedom of a fixed column.', Body: 'Constraints are a kind of permission.' },
      { Title: 'Type as structure', Date: '2026-08-02', Excerpt: 'One family, a few sizes, and a clear order.', Body: 'Hierarchy comes from spacing before it comes from weight.' },
    ],
  },
  {
    name: 'Projects',
    fields: [['Name', 'text'], ['Client', 'text'], ['Year', 'number'], ['Cover', 'image'], ['Summary', 'long'], ['Link', 'link']],
    items: [
      { Name: 'Studio Ordinary', Client: 'Ordinary', Year: 2026, Summary: 'Identity and site for an architecture studio.', Link: 'https://example.com' },
      { Name: 'Field Notes', Client: 'Self', Year: 2025, Summary: 'A journal about making things slowly.' },
      { Name: 'North Hall', Client: 'North Hall', Year: 2024, Summary: 'Wayfinding and a booking site for a venue.' },
    ],
  },
  {
    name: 'Team',
    fields: [['Name', 'text'], ['Role', 'text'], ['Photo', 'image'], ['Bio', 'long']],
    items: [
      { Name: 'Ada Brooks', Role: 'Design', Bio: 'Draws systems and the rooms they live in.' },
      { Name: 'Kit Moreno', Role: 'Engineering', Bio: 'Makes the drawings move.' },
      { Name: 'Sam Oduya', Role: 'Writing', Bio: 'Finds the fewest words that work.' },
    ],
  },
]

export function fromTemplate(t: Template | undefined, taken: string[]): Collection {
  const name = t?.name || 'Collection'
  let slug = slugify(name)
  for (let i = 2; taken.includes(slug); i++) slug = slugify(name) + '-' + i
  const fields: Field[] = (t?.fields || [['Title', 'text']]).map(([n, type], i, all) => ({
    id: cmsUid('fd_'), name: n, type, key: fieldKey(n, all.slice(0, i).map(([m]) => fieldKey(m))),
  }))
  const first = fields.find((f) => f.type === 'text')
  const items: CmsItem[] = (t?.items || []).map((row) => ({
    id: cmsUid('it_'),
    slug: slugify(String(first ? row[first.name] ?? '' : '')) || cmsUid(''),
    values: Object.fromEntries(fields.map((f) => [f.id, row[f.name] ?? emptyValue(f.type)])),
  }))
  return { id: cmsUid('col_'), name: taken.includes(slugify(name)) ? name + ' ' + slug.split('-').pop() : name, slug, fields, items }
}

export const uniqueSlug = (base: string, items: CmsItem[], selfId?: string) => {
  const b = slugify(base) || 'item'
  let s = b
  for (let i = 2; items.some((it) => it.slug === s && it.id !== selfId); i++) s = b + '-' + i
  return s
}
