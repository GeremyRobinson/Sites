import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { newNode, useProject, useStore } from '../store'
import type { Asset } from '../types'
import { fileToAsset, fontFamilyOf, registerFont } from '../ui/files'
import { toast } from '../ui/toast'
import { insertCentered } from './insert'
import { Section } from '../ui/controls'

const TEXT_PRESETS = [
  { name: 'Display', fontSize: 96, fontWeight: 400, lineHeight: 1, letterSpacing: -3, w: 900, text: 'Display' },
  { name: 'Heading', fontSize: 48, fontWeight: 500, lineHeight: 1.1, letterSpacing: -1, w: 700, text: 'Heading' },
  { name: 'Subheading', fontSize: 24, fontWeight: 400, lineHeight: 1.3, letterSpacing: 0, w: 560, text: 'Subheading' },
  { name: 'Body', fontSize: 16, fontWeight: 400, lineHeight: 1.5, letterSpacing: 0, w: 480, text: 'Body text. Double-click to edit.' },
  { name: 'Caption', fontSize: 12, fontWeight: 400, lineHeight: 1.4, letterSpacing: 0, w: 240, text: 'Caption', color: '#8f8f8f' },
  { name: 'Label', fontSize: 12, fontWeight: 500, lineHeight: 1.2, letterSpacing: 0.5, w: 200, text: 'LABEL', mono: true },
]

// Tabs as a segmented pill. Switching tabs is view state, so it stays out of undo history.
function Tabs<T extends string>({ value, options, onChange }: { value: T; options: [T, ReactNode][]; onChange: (v: T) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const thumb = useRef<HTMLElement>(null)
  const i = options.findIndex((o) => o[0] === value)
  useLayoutEffect(() => {
    const el = ref.current
    const t = thumb.current
    if (!el || !t) return
    const place = () => {
      const b = el.querySelectorAll<HTMLElement>('.seg-opt')[i]
      if (!b) return
      t.style.transform = `translateX(${b.offsetLeft}px)`
      t.style.width = `${b.offsetWidth}px`
    }
    place()
    const ro = new ResizeObserver(place)
    ro.observe(el)
    return () => ro.disconnect()
  }, [i, options.length])
  return (
    <div className="seg" ref={ref} role="tablist">
      <i className="seg-thumb" ref={thumb} />
      {options.map(([v, l]) => (
        <button key={v} role="tab" aria-selected={value === v} className={`seg-opt ${value === v ? 'on' : ''}`} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  )
}

export function MediaWindow() {
  const project = useProject()!
  const cols = Number(project.windows.media.settings.columns) || 3
  const [tab, setTab] = useState<'images' | 'text' | 'fonts'>('images')
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const s = useStore.getState

  const upload = async (files: FileList | File[]) => {
    let n = 0
    for (const f of Array.from(files)) {
      const a = await fileToAsset(f)
      if (!a) { toast(`Can't use ${f.name}`); continue }
      s().addAsset(a)
      if (a.kind === 'font') registerFont(a)
      n++
    }
    if (n) toast(`Added ${n} file${n === 1 ? '' : 's'}`)
  }

  const images = project.assets.filter((a) => a.kind === 'image')
  const texts = project.assets.filter((a) => a.kind === 'text')
  const fonts = project.assets.filter((a) => a.kind === 'font')

  const insertImage = (a: Asset) => {
    const k = Math.min(1, 480 / (a.w || 400))
    insertCentered([newNode('image', { assetId: a.id, name: a.name.replace(/\.[^.]+$/, ''), w: Math.round((a.w || 400) * k), h: Math.round((a.h || 300) * k) })])
  }
  const insertText = (text: string, over: object = {}) =>
    insertCentered([newNode('text', { text, w: 480, h: Math.max(24, Math.ceil(text.length / 50) * 24), fontSize: 16, lineHeight: 1.5, ...over })])

  const counts = { images: images.length, text: texts.length, fonts: fonts.length }
  const label = (t: 'images' | 'text' | 'fonts', name: string) => <>{name}{counts[t] > 0 && <span className="media-count">{counts[t]}</span>}</>

  return (
    <div className="media">
      <div className="media-tabs">
        <Tabs value={tab} onChange={setTab} options={[['images', label('images', 'Images')], ['text', label('text', 'Text')], ['fonts', label('fonts', 'Fonts')]]} />
      </div>
      <div className="media-body">
        <div
          className={`drop ${over ? 'over' : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => input.current?.click()}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.current?.click() } }}
          onDragOver={(e) => { e.preventDefault(); setOver(true) }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files) }}
        >
          <span className="drop-plus" aria-hidden>+</span>
          <span className="drop-text">Drop {tab === 'images' ? 'images' : tab === 'fonts' ? 'font files' : '.txt or .md files'} here</span>
          <span className="drop-sub">or click to upload</span>
          <input ref={input} type="file" multiple hidden
            accept={tab === 'images' ? 'image/*' : tab === 'fonts' ? '.ttf,.otf,.woff,.woff2' : '.txt,.md,text/*'}
            onChange={(e) => { if (e.target.files) upload(e.target.files); e.target.value = '' }} />
        </div>

        {tab === 'images' && images.length > 0 && (
          <div className="media-grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {images.map((a) => (
              <div key={a.id} className="media-item">
                <div className="media-cell" draggable title="Click to add, or drag onto the canvas"
                  onDragStart={(e) => e.dataTransfer.setData('application/x-sites-asset', a.id)}
                  onClick={() => insertImage(a)}>
                  <img src={a.data} alt="" />
                  <button className="del" onClick={(e) => { e.stopPropagation(); s().deleteAsset(a.id) }}>Remove</button>
                </div>
                <div className="media-name">{a.name}</div>
              </div>
            ))}
          </div>
        )}
        {tab === 'images' && !images.length && <p className="media-note">No images yet. You can also drop images straight onto the canvas.</p>}

        {tab === 'text' && (
          <>
            <Section label="Styles">
              {TEXT_PRESETS.map(({ name, w, ...p }) => (
                <button key={name} className="preset" onClick={() => insertCentered([newNode('text', { ...p, name, w, h: Math.round(p.fontSize * p.lineHeight) })])}>
                  <span className="preset-name" style={{ fontSize: Math.min(p.fontSize, 28), fontWeight: p.fontWeight, letterSpacing: Math.max(p.letterSpacing / 2, -1), fontVariationSettings: p.mono ? '"MONO" 100' : undefined }}>{name}</span>
                  <span className="preset-meta mono">{p.fontSize}/{p.lineHeight}</span>
                </button>
              ))}
            </Section>
            {texts.length > 0 && (
              <Section label="Uploaded">
                {texts.map((a) => (
                  <div key={a.id} className="preset">
                    <button className="preset-main" onClick={() => insertText(a.data.trim())}>
                      <div>{a.name}</div>
                      <div className="preset-sub">{a.data.trim().slice(0, 90)}{a.data.length > 90 ? '…' : ''}</div>
                    </button>
                    <button className="btn ghost sm preset-x" onClick={() => s().deleteAsset(a.id)}>Remove</button>
                  </div>
                ))}
              </Section>
            )}
          </>
        )}

        {tab === 'fonts' && (
          <Section label="Families">
            <div className="preset static"><span className="preset-name" style={{ fontSize: 20 }}>Sites Sans</span><span className="preset-meta">ABC Areal, built in</span></div>
            {fonts.map((a) => (
              <div key={a.id} className="preset static">
                <span className="preset-name" style={{ fontFamily: `'${fontFamilyOf(a)}'`, fontSize: 20 }}>{fontFamilyOf(a)}</span>
                <button className="btn ghost sm preset-x" onClick={() => s().deleteAsset(a.id)}>Remove</button>
              </div>
            ))}
            <p className="media-note">Uploaded fonts show up in the Font menu of the canvas properties panel.</p>
          </Section>
        )}
      </div>
    </div>
  )
}
