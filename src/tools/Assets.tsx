// Assets: the project's colour styles (with dark values) and text styles, in the canvas's left panel.
import { useState } from 'react'
import { activeViewPage, useProject, useStore } from '../store'
import type { ColorStyle, TextStyle } from '../types'
import { ColorDot, Scrub, Toggle } from '../ui/controls'
import { fontFamilyOf } from '../ui/files'
import { ConfirmButton } from '../ui/ConfirmButton'
import { resolveColor } from '../theme'

const st = useStore.getState
const toHex = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c : /^#[0-9a-f]{3}$/i.test(c) ? '#' + [...c.slice(1)].map((x) => x + x).join('') : '#000000')

// A plain colour value: hex text and a native well. Styles can't point at other styles.
function Hex({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <span className="cd">
      <input className="cd-hex mono" key={value} defaultValue={value.toUpperCase()} onFocus={(e) => e.target.select()}
        onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== value) { st().checkpoint(); onChange(v) } else e.target.value = value.toUpperCase() }}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
      <label className="cd-dot" style={{ background: value }}>
        <input type="color" value={toHex(value)} onFocus={() => st().checkpoint()} onChange={(e) => onChange(e.target.value)} />
      </label>
    </span>
  )
}

export function Assets() {
  const project = useProject()!
  const colors = project.styles?.colors || []
  const texts = project.styles?.text || []
  const [open, setOpen] = useState<string | null>(null)
  const scheme = project.windows.canvas.settings.scheme === 'dark' ? 'dark' : 'light'

  const newColor = () => {
    const id = st().addColorStyle({ name: `Color ${colors.length + 1}`, light: '#111111' })
    setOpen(id)
  }
  // A new text style starts from the selected text layer, and that layer follows it.
  const newText = () => {
    const pg = activeViewPage()
    const sel = pg?.nodes.find((n) => n.type === 'text' && st().selection.includes(n.id))
    const id = st().addTextStyle({
      name: sel ? sel.name : `Text ${texts.length + 1}`,
      fontSize: sel?.fontSize || 16, fontWeight: sel?.fontWeight || 400, lineHeight: sel?.lineHeight || 1.2, letterSpacing: sel?.letterSpacing || 0,
      fontFamily: sel?.fontFamily, color: sel?.color,
    })
    if (sel) st().updateNodes([sel.id], { textStyle: id })
    setOpen(id)
  }

  return (
    <div className="as">
      <div className="cv-panel-head"><span>Colors</span><button className="link" onClick={newColor} title="New colour style">+</button></div>
      <div className="cv-list">
        {!colors.length && <div className="cv-empty">Named colours for the whole site, each with an optional dark mode value.</div>}
        {colors.map((c) => <ColorRow key={c.id} c={c} open={open === c.id} onToggle={() => setOpen(open === c.id ? null : c.id)} scheme={scheme} />)}
      </div>
      <div className="cv-panel-head"><span>Text</span><button className="link" onClick={newText} title="New text style (from the selected text)">+</button></div>
      <div className="cv-list">
        {!texts.length && <div className="cv-empty">Save a text layer's size, weight and spacing to reuse it. Select a text layer, then +.</div>}
        {texts.map((t) => <TextRow key={t.id} t={t} open={open === t.id} onToggle={() => setOpen(open === t.id ? null : t.id)} />)}
      </div>
    </div>
  )
}

function ColorRow({ c, open, onToggle, scheme }: { c: ColorStyle; open: boolean; onToggle: () => void; scheme: 'light' | 'dark' }) {
  const project = useProject()!
  const uses = project.pages.reduce((k, pg) => k + pg.nodes.filter((n) => [n.fill, n.color, n.stroke, n.shadow?.color].includes('$' + c.id)).length + (pg.background === '$' + c.id ? 1 : 0), 0)
  const up = (patch: Partial<ColorStyle>) => st().updateColorStyle(c.id, patch)
  return (
    <div className={`as-item ${open ? 'open' : ''}`}>
      <button className="cv-li as-row" onClick={onToggle} aria-expanded={open}>
        <i className={`cpop-sw ${c.dark ? 'split' : ''}`} style={{ background: c.light, ...(c.dark ? { '--dark': c.dark } as React.CSSProperties : {}) }} />
        <span className="grow ellipsis">{c.name}</span>
        <span className="cv-li-meta mono">{resolveColor('$' + c.id, [c], scheme).toUpperCase()}</span>
      </button>
      {open && (
        <div className="as-edit">
          <input className="as-name" key={c.id + c.name} defaultValue={c.name} aria-label="Style name" spellCheck={false}
            onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== c.name) { st().checkpoint(); up({ name: v }) } else e.target.value = c.name }}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
          <div className="fr"><span className="fr-label">Light</span><span className="fr-value"><Hex value={c.light} onChange={(light) => up({ light })} /></span></div>
          <div className="fr">
            <span className="fr-label">Dark</span>
            <span className="fr-value">
              {c.dark && <Hex value={c.dark} onChange={(dark) => up({ dark })} />}
              <Toggle on={!!c.dark} label="Dark mode value" onChange={(on) => { st().checkpoint(); up({ dark: on ? '#f0f0f0' : undefined }) }} />
            </span>
          </div>
          <div className="as-foot">
            <span>{uses ? `Used by ${uses} layer${uses === 1 ? '' : 's'}` : 'Not used yet'}</span>
            <ConfirmButton className="as-del" label="Delete" confirmLabel="Delete style?" onConfirm={() => st().deleteColorStyle(c.id)} />
          </div>
        </div>
      )}
    </div>
  )
}

function TextRow({ t, open, onToggle }: { t: TextStyle; open: boolean; onToggle: () => void }) {
  const project = useProject()!
  const fonts = project.assets.filter((a) => a.kind === 'font')
  const uses = project.pages.reduce((k, pg) => k + pg.nodes.filter((n) => n.textStyle === t.id).length, 0)
  const up = (patch: Partial<TextStyle>) => st().updateTextStyle(t.id, patch)
  return (
    <div className={`as-item ${open ? 'open' : ''}`}>
      <button className="cv-li as-row" onClick={onToggle} aria-expanded={open}>
        <span className="as-aa" style={{ fontWeight: t.fontWeight, fontFamily: t.fontFamily ? `'${t.fontFamily}', var(--font)` : undefined }}>Aa</span>
        <span className="grow ellipsis">{t.name}</span>
        <span className="cv-li-meta mono">{t.fontSize}/{t.fontWeight}</span>
      </button>
      {open && (
        <div className="as-edit">
          <input className="as-name" key={t.id + t.name} defaultValue={t.name} aria-label="Style name" spellCheck={false}
            onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== t.name) { st().checkpoint(); up({ name: v }) } else e.target.value = t.name }}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
          {fonts.length > 0 && (
            <div className="fr"><span className="fr-label">Font</span>
              <span className="fr-value">
                <select className="as-select" value={t.fontFamily || ''} onChange={(e) => { st().checkpoint(); up({ fontFamily: e.target.value || undefined }) }}>
                  <option value="">Sites Sans</option>
                  {fonts.map((f) => <option key={f.id} value={fontFamilyOf(f)}>{fontFamilyOf(f)}</option>)}
                </select>
              </span>
            </div>
          )}
          <Scrub label="Size" value={t.fontSize} min={1} range={[8, 120]} onChange={(fontSize) => up({ fontSize })} />
          <Scrub label="Weight" value={t.fontWeight} min={400} max={700} step={10} range={[400, 700]} onChange={(fontWeight) => up({ fontWeight })} />
          <div className="in-pair">
            <Scrub label="Line" value={t.lineHeight} min={0.5} step={0.05} onChange={(lineHeight) => up({ lineHeight })} />
            <Scrub label="Track" value={t.letterSpacing} step={0.1} onChange={(letterSpacing) => up({ letterSpacing })} />
          </div>
          <div className="fr"><span className="fr-label">Color</span><span className="fr-value"><ColorDot value={t.color || 'none'} allowNone onChange={(v) => up({ color: v === 'none' ? undefined : v })} /></span></div>
          <div className="as-foot">
            <span>{uses ? `Used by ${uses} layer${uses === 1 ? '' : 's'}` : 'Not used yet'}</span>
            <ConfirmButton className="as-del" label="Delete" confirmLabel="Delete style?" onConfirm={() => st().deleteTextStyle(t.id)} />
          </div>
        </div>
      )}
    </div>
  )
}
