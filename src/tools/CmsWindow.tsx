// CMS window: collections on the left, the selected collection's items as a table on the right.
import { useEffect, useRef, useState } from 'react'
import { activeViewPage, newNode, useProject, useStore } from '../store'
import type { Asset, CmsItem, Collection, ColorStyle, Field, FieldType, SNode } from '../types'
import { FIELD_TYPES, TEMPLATES, cmsUid, emptyValue, fieldKey, imageSrc, itemTitle, slugify, textValue, titleField, uniqueSlug } from '../cms'
import { ColorDot, Pick, Seg, Toggle } from '../ui/controls'
import { ConfirmButton } from '../ui/ConfirmButton'
import { I } from '../ui/icons'
import { toast } from '../ui/toast'
import { resolveColor } from '../theme'
import { childrenOf } from '../tree'
import './cms.css'

const st = useStore.getState

export function CmsWindow() {
  const project = useProject()!
  const cms = project.cms || []
  const [collId, setCollId] = useState<string | undefined>(cms[0]?.id)
  const [itemId, setItemId] = useState<string>()
  const [tab, setTab] = useState<'items' | 'fields'>('items')
  const [adding, setAdding] = useState(false)
  const c = cms.find((x) => x.id === collId) || cms[0]
  const item = c?.items.find((it) => it.id === itemId)

  useEffect(() => { setItemId(undefined) }, [c?.id])
  // A collection made elsewhere (the command palette) opens here.
  const count = useRef(cms.length)
  useEffect(() => {
    if (cms.length > count.current) setCollId(cms[cms.length - 1].id)
    count.current = cms.length
  }, [cms])

  const create = (template?: string) => {
    const id = st().addCollection(template)
    setCollId(id)
    setTab('items')
    setAdding(false)
  }

  const templates = (
    <div className="cms-templates">
      {[{ name: 'Blank', what: 'One text field' }, ...TEMPLATES.map((t) => ({ name: t.name, what: t.fields.map((f) => f[0]).join(', ') }))].map((t) => (
        <button key={t.name} className="cms-template" onClick={() => create(t.name === 'Blank' ? undefined : t.name)}>
          <b>{t.name}</b>
          <span>{t.what}</span>
        </button>
      ))}
    </div>
  )

  if (!c) {
    return (
      <div className="cms cms-empty">
        <div className="cms-empty-in">
          <I.cms size={20} />
          <p className="cms-empty-title">Start a collection</p>
          <p className="cms-empty-sub">Collections hold repeating content, like posts or projects. Lists on the canvas show their items, and a page can show one item at a time.</p>
          {templates}
        </div>
      </div>
    )
  }

  const update = (fn: (c: Collection) => Collection, undoable = false) => st().updateCollection(c.id, fn, undoable)

  return (
    <div className="cms">
      <aside className="cms-side">
        <div className="cms-side-head">
          <span>Collections</span>
          <button className={`cms-plus ${adding ? 'on' : ''}`} title="New collection" aria-label="New collection" aria-expanded={adding} onClick={() => setAdding(!adding)}><I.plus size={14} /></button>
        </div>
        {adding && templates}
        <div className="cms-colls">
          {cms.map((x) => (
            <button key={x.id} className={`cms-coll ${x.id === c.id ? 'on' : ''}`} onClick={() => { setCollId(x.id); setAdding(false) }}>
              <span>{x.name}</span>
              <span className="cms-count mono">{x.items.length}</span>
            </button>
          ))}
        </div>
      </aside>

      <section className="cms-main">
        <header className="cms-head">
          <div className="cms-title">
            <input className="cms-name" key={c.id + c.name} defaultValue={c.name} aria-label="Collection name" spellCheck={false}
              onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && update((x) => ({ ...x, name: e.target.value.trim() }), true)}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
            <input className="cms-slug mono" key={c.id + c.slug} defaultValue={c.slug} aria-label="Collection slug" spellCheck={false} title="Its folder in code: cms/slug.json"
              onBlur={(e) => {
                const s = slugify(e.target.value)
                if (!s || s === c.slug) { e.target.value = c.slug; return }
                if (cms.some((x) => x.slug === s && x.id !== c.id)) { toast('Another collection uses that slug'); e.target.value = c.slug; return }
                update((x) => ({ ...x, slug: s }), true)
              }}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
          </div>
          <div className="cms-acts">
            <button className="btn sm" onClick={() => addList(c)} title="Add a list of these items to the page on the canvas">Add to page</button>
            <button className="btn sm" onClick={() => makePage(c)} title="A page that shows one item, at its own address">Make page</button>
            <button className="btn sm primary" onClick={() => { setTab('items'); setItemId(addItem(c)) }}><I.plus size={12} /> Item</button>
          </div>
        </header>

        <div className="cms-tabs">
          <Seg size="sm" undo={false} value={tab} options={[['items', `Items ${c.items.length}`], ['fields', `Fields ${c.fields.length}`]]} onChange={setTab} />
        </div>

        <div className="cms-body">
          {tab === 'items'
            ? <Items c={c} selected={item?.id} onPick={(id) => setItemId(id === itemId ? undefined : id)} onAdd={() => setItemId(addItem(c))} />
            : <Fields c={c} update={update} />}
          {tab === 'items' && item && <ItemEditor c={c} it={item} onClose={() => setItemId(undefined)} update={update} />}
        </div>

        <footer className="cms-foot">
          <span>{c.items.filter((it) => it.draft).length ? `${c.items.filter((it) => it.draft).length} draft${c.items.filter((it) => it.draft).length === 1 ? '' : 's'} left out of lists and code` : 'Published items show in lists and code'}</span>
          <ConfirmButton className="btn ghost sm cms-del" label="Delete collection" confirmLabel="Click again to delete" onConfirm={() => { st().deleteCollection(c.id); setCollId(undefined) }} />
        </footer>
      </section>
    </div>
  )
}

// ─── Items table ─────────────────────────────────────────
function Items({ c, selected, onPick, onAdd }: { c: Collection; selected?: string; onPick: (id: string) => void; onAdd: () => void }) {
  const project = useProject()!
  const cols = c.fields.slice(0, 4)
  if (!c.items.length) {
    return (
      <div className="cms-none">
        <p>No items yet.</p>
        <button className="btn sm" onClick={onAdd}><I.plus size={12} /> Add the first item</button>
      </div>
    )
  }
  return (
    <div className="cms-table-wrap">
      <table className="cms-table">
        <thead>
          <tr>
            {cols.map((f) => <th key={f.id}>{f.name}</th>)}
            <th className="cms-th-state">Status</th>
          </tr>
        </thead>
        <tbody>
          {c.items.map((it) => (
            <tr key={it.id} className={it.id === selected ? 'on' : ''} onClick={() => onPick(it.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onPick(it.id)}>
              {cols.map((f, i) => <td key={f.id} className={i === 0 ? 'cms-td-title' : ''}><Cell f={f} v={it.values[f.id]} assets={project.assets} colors={project.styles?.colors || []} /></td>)}
              <td className="cms-td-state">{it.draft ? <span className="cms-draft">Draft</span> : <span className="cms-live">Published</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Cell({ f, v, assets, colors }: { f: Field; v: CmsItem['values'][string]; assets: Asset[]; colors: ColorStyle[] }) {
  if (f.type === 'image') {
    const src = imageSrc(v, assets)
    return src ? <img className="cms-thumb" src={src} alt="" /> : <span className="cms-nil">—</span>
  }
  if (f.type === 'toggle') return v ? <span>Yes</span> : <span className="cms-nil">—</span>
  if (f.type === 'color') return typeof v === 'string' && v ? <i className="cpop-sw" style={{ display: 'inline-block', verticalAlign: 'middle', background: resolveColor(v, colors) }} /> : <span className="cms-nil">—</span>
  const t = textValue(v, f)
  if (!t) return <span className="cms-nil">—</span>
  return <span className={f.type === 'date' || f.type === 'number' ? 'mono' : ''}>{t}</span>
}

// ─── Item editor ─────────────────────────────────────────
function ItemEditor({ c, it, onClose, update }: { c: Collection; it: CmsItem; onClose: () => void; update: (fn: (c: Collection) => Collection, undoable?: boolean) => void }) {
  const project = useProject()!
  const images = project.assets.filter((a) => a.kind === 'image')
  const setItem = (patch: Partial<CmsItem>, undoable = false) => update((x) => ({ ...x, items: x.items.map((y) => (y.id === it.id ? { ...y, ...patch } : y)) }), undoable)
  const setVal = (f: Field, v: CmsItem['values'][string]) => {
    const values = { ...it.values, [f.id]: v }
    // A new item's slug follows its title until the slug is edited by hand.
    const tf = titleField(c)
    const follows = f.id === tf?.id && (!it.slug || it.slug === uniqueSlug(String(it.values[f.id] ?? ''), c.items, it.id) || /^item(-\d+)?$/.test(it.slug))
    setItem({ values, ...(follows ? { slug: uniqueSlug(String(v ?? ''), c.items, it.id) } : {}) })
  }
  const mark = () => st().checkpoint()
  const idx = c.items.findIndex((y) => y.id === it.id)

  return (
    <aside className="cms-item" aria-label="Item">
      <header className="cms-item-head">
        <span className="cms-item-title">{itemTitle(c, it)}</span>
        <span className="cms-item-pos mono">{idx + 1} / {c.items.length}</span>
        <button className="set-x cms-x" aria-label="Close item" onClick={onClose}><I.close size={14} /></button>
      </header>
      <div className="cms-item-body">
        {c.fields.map((f) => {
          const v = it.values[f.id]
          if (f.type === 'color') {
            return <div key={f.id} className="fr"><span className="fr-label">{f.name}</span><span className="fr-value"><ColorDot value={String(v || '#111111')} onChange={(c) => setVal(f, c)} /></span></div>
          }
          if (f.type === 'toggle') {
            return <div key={f.id} className="fr"><span className="fr-label">{f.name}</span><span className="fr-value"><Toggle on={!!v} label={f.name} onChange={(on) => { mark(); setVal(f, on) }} /></span></div>
          }
          if (f.type === 'long') {
            return (
              <label key={f.id} className="cms-long">
                <span className="fr-label">{f.name}</span>
                <textarea className="field" rows={4} value={String(v ?? '')} onFocus={mark} onChange={(e) => setVal(f, e.target.value)} />
              </label>
            )
          }
          if (f.type === 'image') {
            const src = imageSrc(v, project.assets)
            const isUrl = typeof v === 'string' && /^(https?:|\/)/.test(v)
            return (
              <div key={f.id} className="cms-image">
                <div className="fr">
                  <span className="fr-label">{f.name}</span>
                  <span className="fr-value">
                    <Pick value={isUrl ? '@url' : String(v || '')} onChange={(x) => setVal(f, x === '@url' ? 'https://' : x)}>
                      <option value="">None</option>
                      {images.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                      <option value="@url">Web address</option>
                    </Pick>
                  </span>
                </div>
                {isUrl && <input className="field mono cms-url" value={String(v)} spellCheck={false} aria-label={`${f.name} address`} onFocus={mark} onChange={(e) => setVal(f, e.target.value)} />}
                {src && <img className="cms-preview" src={src} alt="" />}
                {!images.length && !isUrl && <p className="cms-hint">Add images in Media to pick them here.</p>}
              </div>
            )
          }
          return (
            <label key={f.id} className="fr">
              <span className="fr-label">{f.name}</span>
              <span className="fr-value">
                <input type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'} className={f.type === 'text' ? '' : 'mono'} value={String(v ?? '')} spellCheck={f.type === 'text'}
                  placeholder={f.type === 'link' ? 'https://' : ''} onFocus={mark}
                  onChange={(e) => setVal(f, f.type === 'number' ? (e.target.value === '' ? 0 : +e.target.value) : e.target.value)} />
              </span>
            </label>
          )
        })}
        <div className="cms-item-meta">
          <label className="fr">
            <span className="fr-label">Slug</span>
            <span className="fr-value"><input className="mono" key={it.id + it.slug} defaultValue={it.slug} spellCheck={false}
              onBlur={(e) => { const s = uniqueSlug(e.target.value, c.items, it.id); e.target.value = s; if (s !== it.slug) setItem({ slug: s }, true) }}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} /></span>
          </label>
          <div className="fr">
            <span className="fr-label">Published</span>
            <span className="fr-value"><Toggle on={!it.draft} label="Published" onChange={(on) => setItem({ draft: on ? undefined : true }, true)} /></span>
          </div>
        </div>
      </div>
      <footer className="cms-item-foot">
        <button className="btn ghost sm" onClick={() => {
          const copy: CmsItem = { ...structuredClone(it), id: cmsUid('it_'), slug: uniqueSlug(it.slug + '-copy', c.items) }
          update((x) => ({ ...x, items: [...x.items.slice(0, idx + 1), copy, ...x.items.slice(idx + 1)] }), true)
        }}>Duplicate</button>
        <ConfirmButton className="btn ghost sm cms-del" label="Delete item" confirmLabel="Click again to delete" onConfirm={() => { update((x) => ({ ...x, items: x.items.filter((y) => y.id !== it.id) }), true); onClose() }} />
      </footer>
    </aside>
  )
}

// ─── Fields ──────────────────────────────────────────────
const convert = (v: CmsItem['values'][string], t: FieldType) =>
  t === 'number' ? (Number(v) || 0) : t === 'toggle' ? !!v && v !== 'false' : typeof v === 'boolean' ? (v ? 'true' : '') : v === undefined ? '' : String(v)

function Fields({ c, update }: { c: Collection; update: (fn: (c: Collection) => Collection, undoable?: boolean) => void }) {
  const [type, setType] = useState<FieldType>('text')
  const setField = (id: string, patch: Partial<Field>) => update((x) => ({ ...x, fields: x.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)) }), true)
  const add = () => {
    const label = FIELD_TYPES.find((t) => t.type === type)!.label
    const f: Field = { id: cmsUid('fd_'), name: label, type, key: fieldKey(label, c.fields.map((x) => x.key)) }
    update((x) => ({ ...x, fields: [...x.fields, f], items: x.items.map((it) => ({ ...it, values: { ...it.values, [f.id]: emptyValue(type) } })) }), true)
  }
  const move = (i: number, d: number) => update((x) => {
    const fields = [...x.fields]
    const [f] = fields.splice(i, 1)
    fields.splice(i + d, 0, f)
    return { ...x, fields }
  }, true)
  return (
    <div className="cms-fields">
      <div className="cms-field cms-field-head">
        <span>Name</span><span>Type</span><span>In code</span><span />
      </div>
      {c.fields.map((f, i) => (
        <div key={f.id} className="cms-field fr">
          <input key={f.id + f.name} defaultValue={f.name} aria-label="Field name" spellCheck={false}
            onBlur={(e) => {
              const name = e.target.value.trim()
              if (!name || name === f.name) { e.target.value = f.name; return }
              // The code name follows the field's name while it still matches the old one.
              const others = c.fields.filter((x) => x.id !== f.id).map((x) => x.key)
              setField(f.id, { name, ...(f.key === fieldKey(f.name, others) ? { key: fieldKey(name, others) } : {}) })
            }}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
          <Pick value={f.type} onChange={(t) => update((x) => ({
            ...x,
            fields: x.fields.map((y) => (y.id === f.id ? { ...y, type: t as FieldType } : y)),
            items: x.items.map((it) => ({ ...it, values: { ...it.values, [f.id]: convert(it.values[f.id], t as FieldType) } })),
          }))}>
            {FIELD_TYPES.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
          </Pick>
          <input className="mono cms-key" key={f.id + f.key} defaultValue={f.key} aria-label="Name in code" spellCheck={false}
            onBlur={(e) => { const k = fieldKey(e.target.value, c.fields.filter((x) => x.id !== f.id).map((x) => x.key)); e.target.value = k; if (k !== f.key) setField(f.id, { key: k }) }}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
          <span className="cms-field-acts">
            <button className="set-x" disabled={i === 0} aria-label={`Move ${f.name} up`} title="Move up" onClick={() => move(i, -1)}><I.up size={14} /></button>
            <button className="set-x" disabled={c.fields.length < 2} aria-label={`Delete ${f.name}`} title="Delete field"
              onClick={() => update((x) => ({ ...x, fields: x.fields.filter((y) => y.id !== f.id), items: x.items.map((it) => { const values = { ...it.values }; delete values[f.id]; return { ...it, values } }) }), true)}>
              <I.close size={14} />
            </button>
          </span>
        </div>
      ))}
      <div className="cms-add-field">
        <span className="fr cms-add-type">
          <span className="fr-label">New field</span>
          <span className="fr-value">
            <Pick value={type} onChange={(t) => setType(t as FieldType)}>
              {FIELD_TYPES.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
            </Pick>
          </span>
        </span>
        <button className="btn sm" onClick={add}><I.plus size={12} /> Add</button>
      </div>
      <p className="cms-hint">The first text field names each item. Fields are read in code as <span className="mono">item.name</span>.</p>
    </div>
  )
}

// ─── Actions ─────────────────────────────────────────────
function addItem(c: Collection) {
  const it: CmsItem = { id: cmsUid('it_'), slug: uniqueSlug('item', c.items), draft: true, values: Object.fromEntries(c.fields.map((f) => [f.id, emptyValue(f.type)])) }
  st().updateCollection(c.id, (x) => ({ ...x, items: [...x.items, it] }), true)
  return it.id
}

const showCanvas = () => { st().toggleWindow('canvas', true); st().focusWindow('canvas') }

// Layers for one item: the image, the title and one more line of text, each showing its field.
function cardLayers(c: Collection, parentId: string, big: boolean): SNode[] {
  const img = c.fields.find((f) => f.type === 'image')
  const title = titleField(c)
  const sub = c.fields.find((f) => f !== title && (f.type === 'date' || f.type === 'text'))
  const longs = c.fields.filter((f) => f.type === 'long')
  // A card shows the first long field (an excerpt); an item's page shows the last (the body).
  const body = big ? longs[longs.length - 1] : longs[0]
  const out: SNode[] = []
  if (big) {
    if (title) out.push(newNode('text', { parentId, name: title.name, text: title.name, bind: title.id, fontSize: 56, fontWeight: 500, lineHeight: 1.05, wMode: 'fill' }))
    if (sub) out.push(newNode('text', { parentId, name: sub.name, text: sub.name, bind: sub.id, fontSize: 15, color: '#888888', wMode: 'fill' }))
    if (img) out.push(newNode('image', { parentId, name: img.name, bind: img.id, wMode: 'fill', h: 560, radius: 16 }))
    if (body) out.push(newNode('text', { parentId, name: body.name, text: body.name, bind: body.id, fontSize: 20, lineHeight: 1.5, wMode: 'fill' }))
  } else {
    if (img) out.push(newNode('image', { parentId, name: img.name, bind: img.id, wMode: 'fill', h: 240, radius: 12 }))
    if (title) out.push(newNode('text', { parentId, name: title.name, text: title.name, bind: title.id, fontSize: 22, fontWeight: 500, wMode: 'fill' }))
    const second = sub || body
    if (second) out.push(newNode('text', { parentId, name: second.name, text: second.name, bind: second.id, fontSize: 15, lineHeight: 1.4, color: '#888888', wMode: 'fill' }))
  }
  return out
}

function addList(c: Collection) {
  const pg = activeViewPage()
  if (!pg) return
  const tops = pg.nodes.filter((n) => !n.parentId && !n.hidden)
  const y = Math.round(tops.length ? Math.max(...tops.map((n) => n.y + n.h)) + 64 : 64)
  const w = Math.min(pg.width - 128, 1072)
  const list = newNode('frame', { name: c.name, layout: 'grid', cols: 3, gap: 32, x: Math.round((pg.width - w) / 2), y, w, h: 360, hMode: 'fit', fill: 'transparent', list: { collection: c.id } })
  const card = newNode('frame', { parentId: list.id, name: 'Item', layout: 'stack', dir: 'column', gap: 12, wMode: 'fill', hMode: 'fit', fill: 'transparent' })
  // The link to the collection's page, when there is one, goes on each repeat.
  const page = project().pages.find((p) => p.collection === c.id)
  if (page) card.link = page.id
  if (pg.kind !== 'component' && y + 520 > pg.height) st().updatePage(pg.id, { height: y + 520 })
  st().addNodes([list, card, ...cardLayers(c, card.id, false)])
  st().setSelection([list.id])
  showCanvas()
  toast(`${c.name} list added to ${pg.name}`)
}

function makePage(c: Collection) {
  const existing = project().pages.find((p) => p.collection === c.id)
  if (existing) { st().setActivePage(existing.id); showCanvas(); toast(`${existing.name} already shows ${c.name}`); return }
  st().addPage(c.name + ' item')
  const p = project()
  const pg = p.pages.find((x) => x.id === p.activePageId)!
  const path = '/' + c.slug
  st().updatePage(pg.id, { collection: c.id, path: p.pages.some((x) => x.id !== pg.id && x.path === path) ? path + '-item' : path })
  const wrap = newNode('frame', { name: 'Article', layout: 'stack', dir: 'column', gap: 24, x: 64, y: 96, w: pg.width - 128, h: 800, hMode: 'fit', fill: 'transparent' })
  st().addNodes([wrap, ...cardLayers(c, wrap.id, true)], false)
  // Each list of this collection now links its items to the new page.
  st().updateProject((x) => ({
    ...x,
    pages: x.pages.map((q) => {
      const tpls = new Set(q.nodes.filter((n) => n.list?.collection === c.id).map((n) => childrenOf(q.nodes, n.id)[0]?.id).filter(Boolean))
      return tpls.size ? { ...q, nodes: q.nodes.map((n) => (tpls.has(n.id) && !n.link ? { ...n, link: pg.id } : n)) } : q
    }),
  }))
  showCanvas()
  toast(`${pg.name} shows one ${c.name.toLowerCase()} item per page`)
}

const project = () => { const s = st(); return s.projects.find((p) => p.id === s.currentId)! }
