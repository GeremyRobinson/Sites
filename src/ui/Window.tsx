import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useStore } from '../store'
import type { ToolId, WinState } from '../types'
import { enter } from './motion'
import { Pick, Scrub, Section, Toggle } from './controls'
import { I } from './icons'

export interface SettingDef {
  key: string
  label: string
  type: 'bool' | 'number' | 'select'
  options?: string[]
  min?: number
  max?: number
}

const MIN_W = 240
const MIN_H = 160

interface Props {
  id: ToolId
  win: WinState
  title: ReactNode
  focused: boolean
  bounds: { w: number; h: number }
  settings?: SettingDef[]
  className?: string
  children: ReactNode
}

export function Window({ id, win, title, focused, bounds, settings, className, children }: Props) {
  const { setWindow, focusWindow, toggleWindow, setWindowSetting } = useStore.getState()
  const [showSettings, setShowSettings] = useState(false)
  const drag = useRef<{ mx: number; my: number; x: number; y: number; w: number; h: number; edge: string } | null>(null)
  const el = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => { enter(el.current) }, [])

  const start = (e: React.PointerEvent, edge: string) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    focusWindow(id)
    drag.current = { mx: e.clientX, my: e.clientY, x: win.x, y: win.y, w: win.w, h: win.h, edge }
    const move = (ev: PointerEvent) => {
      const d = drag.current!
      const dx = ev.clientX - d.mx
      const dy = ev.clientY - d.my
      if (edge === 'move') {
        setWindow(id, {
          maximized: false,
          x: Math.round(Math.min(Math.max(d.x + dx, -d.w + 80), bounds.w - 80)),
          y: Math.round(Math.min(Math.max(d.y + dy, 0), bounds.h - 30)),
        })
        return
      }
      let { x, y, w, h } = d
      if (edge.includes('e')) w = Math.max(MIN_W, d.w + dx)
      if (edge.includes('s')) h = Math.max(MIN_H, d.h + dy)
      if (edge.includes('w')) { w = Math.max(MIN_W, d.w - dx); x = d.x + d.w - w }
      if (edge.includes('n')) { h = Math.max(MIN_H, d.h - dy); y = Math.max(0, d.y + d.h - h) }
      setWindow(id, { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), maximized: false })
    }
    const up = () => {
      drag.current = null
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const rect = win.maximized ? { left: 0, top: 0, width: bounds.w, height: bounds.h } : { left: win.x, top: win.y, width: win.w, height: win.h }

  return (
    <div
      ref={el}
      className={`win ${focused ? 'focused' : ''} ${className || ''}`}
      style={{ ...rect, zIndex: win.z }}
      onPointerDownCapture={() => focusWindow(id)}
    >
      <div className="win-bar" onPointerDown={(e) => start(e, 'move')} onDoubleClick={() => setWindow(id, { maximized: !win.maximized })}>
        <div className="win-title">{title}</div>
        {settings && (
          <button className={`win-btn ${showSettings ? 'on' : ''}`} title="Window settings" onPointerDown={(e) => e.stopPropagation()} onClick={() => setShowSettings((v) => !v)}>
            <I.more />
          </button>
        )}
        <button className="win-btn" title={win.maximized ? 'Restore' : 'Fill workspace'} onPointerDown={(e) => e.stopPropagation()} onClick={() => setWindow(id, { maximized: !win.maximized })}>
          {win.maximized
            ? <I.restore />
            : <I.maximize />}
        </button>
        <button className="win-btn" title="Close" onPointerDown={(e) => e.stopPropagation()} onClick={() => toggleWindow(id, false)}>
          <I.close />
        </button>
      </div>
      {showSettings && settings && (
        <div className="win-prefs" onPointerDown={(e) => e.stopPropagation()}>
          <Section label="Window">
            {settings.map((s) => {
              const v = win.settings[s.key]
              if (s.type === 'number') return <Scrub key={s.key} label={s.label} value={Number(v)} min={s.min} max={s.max} range={[s.min ?? 0, s.max ?? 100]} onChange={(x) => setWindowSetting(id, s.key, Math.round(x))} />
              return (
                <div key={s.key} className="fr">
                  <span className="fr-label">{s.label}</span>
                  <span className="fr-value">
                    {s.type === 'bool' && <Toggle on={!!v} label={s.label} onChange={(x) => setWindowSetting(id, s.key, x)} />}
                    {s.type === 'select' && (
                      <Pick value={String(v)} onChange={(x) => setWindowSetting(id, s.key, x)}>
                        {s.options!.map((o) => <option key={o} value={o}>{o[0] === '#' ? o.toUpperCase() : o[0].toUpperCase() + o.slice(1)}</option>)}
                      </Pick>
                    )}
                  </span>
                </div>
              )
            })}
          </Section>
        </div>
      )}
      <div className="win-body" onPointerDown={() => showSettings && setShowSettings(false)}>{children}</div>
      {!win.maximized && ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map((edge) => (
        <div key={edge} className={`rz rz-${edge}`} onPointerDown={(e) => start(e, edge)} />
      ))}
    </div>
  )
}
