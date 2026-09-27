// Component variables: what each instance of a component can change, like its title, colour or image.
// Layers inside a component use variables; instances set them, or connect them to a CMS field.
import { useState } from 'react'
import { useProject, useStore } from '../store'
import type { Collection, FieldType, Page, SNode, Variable, VarType } from '../types'
import { fieldKey } from '../cms'
import { ColorDot, Pick, Row, Section, Toggle } from '../ui/controls'
import { I } from '../ui/icons'

const st = useStore.getState

export const VAR_TYPES: { type: VarType; label: string }[] = [
  { type: 'text', label: 'Text' },
  { type: 'color', label: 'Color' },
  { type: 'image', label: 'Image' },
  { type: 'toggle', label: 'Toggle' },
  { type: 'link', label: 'Link' },
  { type: 'number', label: 'Number' },
]

// CMS fields a variable of each type can be connected to.
const FIELDS_FOR: Record<VarType, FieldType[]> = {
  text: ['text', 'long', 'date', 'number', 'link'], color: ['color', 'text'], image: ['image'], toggle: ['toggle'], link: ['link', 'text'], number: ['number'],
}

const RESERVED = ['style', 'className', 'children', 'key', 'ref']
export const varKey = (name: string, taken: string[]) => {
  const k = fieldKey(name, taken)
  return RESERVED.includes(k) ? fieldKey(name + ' value', taken) : k
}
const defaultOf = (t: VarType): Variable['value'] => (t === 'toggle' ? true : t === 'number' ? 0 : t === 'color' ? '#111111' : t === 'link' ? 'https://' : '')

function setVars(page: Page, fn: (vars: Variable[]) => Variable[], undoable = true) {
  if (undoable) st().checkpoint()
  st().updatePage(page.id, { vars: fn(page.vars || []) })
}

// The value editor for one variable type.
function ValueEditor({ type, value, onChange }: { type: VarType; value: Variable['value']; onChange: (v: Variable['value']) => void }) {
  const project = useProject()!
  if (type === 'toggle') return <Toggle on={value !== false} label="Value" onChange={(v) => { st().checkpoint(); onChange(v) }} />
  if (type === 'color') return <ColorDot value={String(value || '#111111')} onChange={onChange} />
  if (type === 'image') {
    return (
      <Pick value={String(value || '')} onChange={onChange}>
        <option value="">None</option>
        {project.assets.filter((a) => a.kind === 'image').map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </Pick>
    )
  }
  return (
    <input className={type === 'text' ? '' : 'mono'} key={String(value)} defaultValue={String(value ?? '')} spellCheck={type === 'text'}
      onBlur={(e) => {
        const v = type === 'number' ? Number(e.target.value) || 0 : e.target.value
        if (v !== value) { st().checkpoint(); onChange(v) }
      }}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
  )
}

// A component with nothing selected: its variables, with their default values.
export function ComponentVars({ page }: { page: Page }) {
  const [type, setType] = useState<VarType>('text')
  const vars = page.vars || []
  const add = () => {
    const label = VAR_TYPES.find((t) => t.type === type)!.label
    setVars(page, (vs) => [...vs, { id: 'v_' + Math.random().toString(36).slice(2, 9), name: label, key: varKey(label, vs.map((v) => v.key)), type, value: defaultOf(type) }])
  }
  return (
    <Section label="Variables">
      {!vars.length && <div className="in-note">Variables let each instance change this component, like its title or colour. Select a layer inside it to use one.</div>}
      {vars.map((v) => (
        <div key={v.id} className="in-var">
          <div className="in-var-head">
            <input className="in-var-name" key={v.id + v.name} defaultValue={v.name} aria-label="Variable name" spellCheck={false}
              onBlur={(e) => {
                const name = e.target.value.trim()
                if (!name || name === v.name) { e.target.value = v.name; return }
                setVars(page, (vs) => vs.map((x) => (x.id === v.id ? { ...x, name, key: varKey(name, vs.filter((y) => y.id !== v.id).map((y) => y.key)) } : x)))
              }}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
            <span className="in-var-type mono">{v.key} · {VAR_TYPES.find((t) => t.type === v.type)!.label.toLowerCase()}</span>
            <button className="set-x in-var-x" aria-label={`Delete ${v.name}`} title="Delete variable" onClick={() => {
              setVars(page, (vs) => vs.filter((x) => x.id !== v.id))
              // Layers that used it keep their own values.
              st().updatePage(page.id, { nodes: page.nodes.map((n) => {
                if (!n.use || !Object.values(n.use).includes(v.id)) return n
                const use = Object.fromEntries(Object.entries(n.use).filter(([, id]) => id !== v.id))
                return { ...n, use: Object.keys(use).length ? use : undefined }
              }) })
            }}><I.close size={14} /></button>
          </div>
          <Row label="Default"><ValueEditor type={v.type} value={v.value} onChange={(value) => setVars(page, (vs) => vs.map((x) => (x.id === v.id ? { ...x, value } : x)), false)} /></Row>
        </div>
      ))}
      <div className="in-pair">
        <span className="in-mode-pick fr"><span className="fr-label">New</span><span className="fr-value">
          <Pick value={type} onChange={(t) => setType(t as VarType)}>{VAR_TYPES.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}</Pick>
        </span></span>
        <button className="in-btn" onClick={add}><I.plus size={12} /> Add variable</button>
      </div>
    </Section>
  )
}

type Prop = keyof NonNullable<SNode['use']>
// Which of a layer's properties can come from a variable, and of which type.
const propsFor = (n: SNode): [Prop, string, VarType[]][] => [
  ...(n.type === 'text' ? [['text', 'Text', ['text', 'number']], ['color', 'Color', ['color']]] as [Prop, string, VarType[]][] : []),
  ...(['frame', 'rect', 'ellipse', 'path'].includes(n.type) ? [['fill', 'Fill', ['color']]] as [Prop, string, VarType[]][] : []),
  ...(n.type === 'image' ? [['image', 'Image', ['image']]] as [Prop, string, VarType[]][] : []),
  ['visible', 'Visible', ['toggle']],
  ['link', 'Link', ['link']],
]

// A layer inside a component: pick the variable each property follows, or make one from its current value.
export function LayerVars({ n, page }: { n: SNode; page: Page }) {
  const vars = page.vars || []
  const set = (prop: Prop, id: string | undefined) => {
    const use = { ...n.use, [prop]: id }
    if (!id) delete use[prop]
    st().updateNodes([n.id], { use: Object.keys(use).length ? use : undefined })
  }
  const create = (prop: Prop, label: string, type: VarType) => {
    const value: Variable['value'] = prop === 'text' ? n.text || '' : prop === 'fill' ? n.fill : prop === 'color' ? n.color || '#111111'
      : prop === 'image' ? n.assetId || '' : prop === 'visible' ? true : n.href || 'https://'
    const name = prop === 'text' ? n.name : label
    const id = 'v_' + Math.random().toString(36).slice(2, 9)
    setVars(page, (vs) => [...vs, { id, name, key: varKey(name, vs.map((v) => v.key)), type, value }])
    set(prop, id)
  }
  return (
    <Section label="Variables">
      {propsFor(n).map(([prop, label, types]) => {
        const opts = vars.filter((v) => types.includes(v.type))
        return (
          <Row key={prop} label={label}>
            <Pick value={n.use?.[prop] || ''} onChange={(v) => (v === '@new' ? create(prop, label, types[0]) : set(prop, v || undefined))}>
              <option value="">{prop === 'visible' ? 'Always' : 'Own value'}</option>
              {opts.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              <option value="@new">New variable…</option>
            </Pick>
          </Row>
        )
      })}
    </Section>
  )
}

// An instance: set each variable, or connect it to a field of the CMS item in scope.
export function InstanceVars({ n, comp, scope }: { n: SNode; comp: Page; scope?: Collection }) {
  const vars = comp.vars || []
  if (!vars.length) return null
  const setProp = (id: string, value: Variable['value']) => st().updateNodes([n.id], { props: { ...n.props, [id]: value } })
  const bind = (id: string, field: string) => {
    const propBind = { ...n.propBind, [id]: field }
    if (!field) delete propBind[id]
    st().updateNodes([n.id], { propBind: Object.keys(propBind).length ? propBind : undefined })
  }
  return (
    <Section label="Variables">
      {vars.map((v) => {
        const fields = scope ? scope.fields.filter((f) => FIELDS_FOR[v.type].includes(f.type)) : []
        const bound = n.propBind?.[v.id] && scope?.fields.find((f) => f.id === n.propBind![v.id])
        return (
          <div key={v.id} className="in-var">
            <Row label={v.name}>
              {bound
                ? <span className="in-var-bound"><I.cms size={12} /> {bound.name}</span>
                : <ValueEditor type={v.type} value={n.props?.[v.id] ?? v.value} onChange={(value) => setProp(v.id, value)} />}
            </Row>
            {fields.length > 0 && (
              <Row label={<span className="in-var-sub">From {scope!.name}</span>}>
                <Pick value={n.propBind?.[v.id] || ''} onChange={(f) => bind(v.id, f)}>
                  <option value="">Not connected</option>
                  {fields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </Pick>
              </Row>
            )}
          </div>
        )
      })}
      {n.props && Object.keys(n.props).length > 0 && (
        <button className="in-chip" onClick={() => { st().checkpoint(); st().updateNodes([n.id], { props: undefined }) }}>Use component defaults</button>
      )}
    </Section>
  )
}
