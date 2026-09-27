import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../store'
import { isRef, resolveColor } from '../theme'
import type { ColorStyle } from '../types'
import { I } from './icons'

// Shared controls: rounded rows with the label on the left and the value on the right.

const checkpoint = () => useStore.getState().checkpoint()

// A number row. Drag anywhere on the row to scrub; click the value to type.
// With a range, the row fills from the left like a slider and ends in a handle bar.
export function Scrub({ label, value, onChange, step = 1, min, max, range, mixed, unit, title }: {
  label: ReactNode; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number
  range?: [number, number]; mixed?: boolean; unit?: string; title?: string
}) {
  const s = useRef<{ x: number; v: number; started: boolean; w: number } | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const clamp = (v: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v))
  const round = (v: number) => Math.round(v * 100) / 100
  const frac = range && !mixed ? Math.min(1, Math.max(0, (value - range[0]) / (range[1] - range[0]))) : null
  return (
    <div
      className={`sc ${frac !== null ? 'sc-range' : ''}`}
      title={title}
      style={frac !== null ? ({ '--f': frac } as React.CSSProperties) : undefined}
      onPointerDown={(e) => {
        if (e.button !== 0 || e.target === input.current) return
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        s.current = { x: e.clientX, v: value, started: false, w: Math.max(40, e.currentTarget.clientWidth - 88) }
      }}
      onPointerMove={(e) => {
        const d = s.current
        if (!d) return
        const dx = e.clientX - d.x
        if (!d.started) {
          if (Math.abs(dx) < 3) return
          d.started = true
          e.currentTarget.classList.add('sc-drag')
          checkpoint()
        }
        // Ranged rows track the pointer across their width; open rows move one step per 2px.
        const next = range
          ? d.v + (dx / d.w) * (range[1] - range[0]) * (e.shiftKey ? 0.1 : 1)
          : d.v + Math.round(dx / 2) * step * (e.shiftKey ? 10 : 1)
        onChange(clamp(round(Math.round(next / step) * step)))
      }}
      onPointerUp={(e) => {
        const d = s.current
        s.current = null
        e.currentTarget.classList.remove('sc-drag')
        if (d && !d.started) { input.current?.focus(); input.current?.select() }
      }}
    >
      {frac !== null && <i className="sc-fill" />}
      <span className="sc-label">{label}</span>
      <input
        ref={input}
        className="sc-input mono"
        placeholder={mixed ? 'Mixed' : undefined}
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur()
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault()
            checkpoint()
            onChange(clamp(round(value + (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1))))
          }
        }}
        onBlur={(e) => {
          const v = parseFloat(e.target.value)
          if (!isNaN(v) && v !== value) { checkpoint(); onChange(clamp(v)) }
          else e.target.value = mixed ? '' : String(round(value))
        }}
        key={mixed ? 'mixed' : value}
        defaultValue={mixed ? '' : round(value)}
      />
      {unit && <span className="sc-unit">{unit}</span>}
    </div>
  )
}

// Pill switch.
export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} className={`tg ${on ? 'on' : ''}`} onClick={() => onChange(!on)}>
      <i />
    </button>
  )
}

// Segmented pill. A thumb slides to the chosen option.
export function Seg<T extends string>({ value, options, onChange, size, undo = true }: {
  value: T | undefined; options: [T, ReactNode, string?][]; onChange: (v: T) => void; size?: 'sm'; undo?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const thumb = useRef<HTMLElement>(null)
  const i = options.findIndex((o) => o[0] === value)
  useLayoutEffect(() => {
    const el = ref.current
    const t = thumb.current
    if (!el || !t) return
    const place = () => {
      const b = el.querySelectorAll<HTMLElement>('.seg-opt')[i]
      if (!b) { t.style.opacity = '0'; return }
      t.style.opacity = '1'
      t.style.transform = `translateX(${b.offsetLeft}px)`
      t.style.width = `${b.offsetWidth}px`
    }
    place()
    const ro = new ResizeObserver(place)
    ro.observe(el)
    return () => ro.disconnect()
  }, [i, options.length])
  return (
    <div className={`seg ${size === 'sm' ? 'seg-sm' : ''}`} ref={ref} role="radiogroup">
      <i className="seg-thumb" ref={thumb} />
      {options.map(([v, l, title]) => (
        <button key={v} role="radio" aria-checked={value === v} className={`seg-opt ${value === v ? 'on' : ''}`} title={title}
          onClick={() => { if (value !== v) { if (undo) checkpoint(); onChange(v) } }}>{l}</button>
      ))}
    </div>
  )
}

// A labelled row: label left, anything right.
export function Row({ label, children, className = '', title }: { label: ReactNode; children: ReactNode; className?: string; title?: string }) {
  return (
    <div className={`fr ${className}`} title={title}>
      <span className="fr-label">{label}</span>
      <span className="fr-value">{children}</span>
    </div>
  )
}

// A select dressed as a row value, with a small up/down chevron.
export function Pick({ value, onChange, children, title }: { value: string; onChange: (v: string) => void; children: ReactNode; title?: string }) {
  return (
    <span className="pk" title={title}>
      <select value={value} onChange={(e) => { checkpoint(); onChange(e.target.value) }}>{children}</select>
      <I.updown />
    </span>
  )
}

const toHex = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c : /^#[0-9a-f]{3}$/i.test(c) ? '#' + [...c.slice(1)].map((x) => x + x).join('') : '#000000')

// Colour row value: hex text (or the style's name) and a round swatch that opens the colour popover.
export function ColorDot({ value, onChange, allowNone }: { value: string; onChange: (v: string) => void; allowNone?: boolean }) {
  const colors = useStore((st) => st.projects.find((p) => p.id === st.currentId)?.styles?.colors) || NO_COLORS
  const [open, setOpen] = useState(false)
  const dot = useRef<HTMLButtonElement>(null)
  const none = value === 'none' || value === 'transparent'
  const style = isRef(value) ? colors.find((c) => c.id === value.slice(1)) : undefined
  const shown = none ? undefined : resolveColor(value, colors)
  return (
    <span className="cd">
      {allowNone && !none && <button className="cd-x" onClick={() => { checkpoint(); onChange('none') }} title="Remove"><I.close size={14} /></button>}
      {isRef(value)
        ? <button className="cd-style" onClick={() => setOpen(true)} title="Colour style">{style?.name || 'Missing style'}</button>
        : <input className="cd-hex mono" key={value} defaultValue={none ? 'None' : value.toUpperCase()}
            onFocus={(e) => e.target.select()}
            onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== value && v !== 'None') { checkpoint(); onChange(v) } else e.target.value = none ? 'None' : value.toUpperCase() }}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />}
      <button ref={dot} className={`cd-dot ${none ? 'none' : ''} ${style?.dark ? 'split' : ''}`} aria-label="Pick a colour" aria-expanded={open}
        style={none ? undefined : { background: shown, ...(style?.dark ? { '--dark': style.dark } as CSSProperties : {}) }} onClick={() => setOpen(!open)} />
      {open && <ColorPop anchor={dot.current} value={value} onChange={onChange} onClose={() => setOpen(false)} />}
    </span>
  )
}

const NO_COLORS: ColorStyle[] = []

// The colour popover: a custom colour, the project's colour styles, and making a style from the current colour.
function ColorPop({ anchor, value, onChange, onClose }: { anchor: HTMLElement | null; value: string; onChange: (v: string) => void; onClose: () => void }) {
  const colors = useStore((st) => st.projects.find((p) => p.id === st.currentId)?.styles?.colors) || NO_COLORS
  const ref = useRef<HTMLDivElement>(null)
  const [naming, setNaming] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: -999, top: -999 })
  const raw = value === 'none' || value === 'transparent' ? '#ffffff' : resolveColor(value, colors)
  useLayoutEffect(() => {
    const r = anchor?.getBoundingClientRect()
    const el = ref.current
    if (!r || !el) return
    const w = el.offsetWidth
    const h = el.offsetHeight
    setPos({ left: Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)), top: r.bottom + 8 + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 8) : r.bottom + 8 })
  }, [anchor, colors.length, naming])
  useEffect(() => {
    const down = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node) && !anchor?.contains(e.target as Node)) onClose() }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('keydown', key, true)
    return () => { window.removeEventListener('pointerdown', down, true); window.removeEventListener('keydown', key, true) }
  }, [anchor, onClose])
  const pick = (v: string) => { checkpoint(); onChange(v) }
  return createPortal(
    <div ref={ref} className="cpop" style={pos} role="dialog" aria-label="Colour">
      <div className="cpop-custom">
        <label className="cpop-well" style={{ background: raw }}>
          <input type="color" value={toHex(raw)} onFocus={checkpoint} onChange={(e) => onChange(e.target.value)} aria-label="Custom colour" />
        </label>
        <input className="cpop-hex mono" key={raw} defaultValue={raw.toUpperCase()} aria-label="Hex"
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          onBlur={(e) => { const v = e.target.value.trim(); if (v && v.toUpperCase() !== raw.toUpperCase()) pick(v) }} />
      </div>
      <div className="cpop-head"><span>Styles</span>{isRef(value) && <button className="cpop-link" onClick={() => pick(raw)}>Detach</button>}</div>
      <div className="cpop-list">
        {!colors.length && <p className="cpop-empty">Save colours you use often. Styles can have a dark mode value.</p>}
        {colors.map((c) => (
          <button key={c.id} className={`cpop-row ${value === '$' + c.id ? 'on' : ''}`} onClick={() => pick('$' + c.id)}>
            <i className={`cpop-sw ${c.dark ? 'split' : ''}`} style={{ background: c.light, ...(c.dark ? { '--dark': c.dark } as CSSProperties : {}) }} />
            <span className="grow ellipsis">{c.name}</span>
            <span className="cpop-val mono">{c.light.toUpperCase()}</span>
          </button>
        ))}
      </div>
      {!isRef(value) && (naming
        ? <input className="field cpop-name" autoFocus placeholder="Style name" onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setNaming(false) }}
            onBlur={(e) => {
              const name = e.target.value.trim()
              setNaming(false)
              if (!name) return
              const id = useStore.getState().addColorStyle({ name, light: raw })
              onChange('$' + id)
            }} />
        : <button className="cpop-add" onClick={() => setNaming(true)}><I.plus size={12} /> Create style</button>)}
    </div>,
    document.body,
  )
}

// Small uppercase section label over a hairline.
export function Section({ label, aside, children, className = '' }: { label: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`sec ${className}`}>
      <header className="sec-head"><span>{label}</span>{aside}</header>
      <div className="sec-body">{children}</div>
    </section>
  )
}
