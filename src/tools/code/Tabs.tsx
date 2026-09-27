import type { Mode, VFile } from './types'
import { fileName } from './types'
import { I } from '../../ui/icons'

const NEXT: Record<Mode, Mode> = { auto: 'light', light: 'dark', dark: 'auto' }

// Auto: sun and moon. Light: a sun. Dark: a crescent.
function ModeIcon({ mode }: { mode: Mode }) {
  if (mode === 'light') return <I.sun />
  if (mode === 'dark') return <I.moon />
  return <I.auto />
}

interface Props {
  tabs: VFile[]
  active?: string
  errors: Record<string, unknown>
  canFormat: boolean
  formatting: boolean
  aiOpen: boolean
  mode: Mode
  dark: boolean
  onSelect: (f: VFile) => void
  onClose: (path: string) => void
  onFormat: () => void
  onToggleAI: () => void
  onCycleMode: () => void
}

export function Tabs({ tabs, active, errors, canFormat, formatting, aiOpen, mode, dark, onSelect, onClose, onFormat, onToggleAI, onCycleMode }: Props) {
  return (
    <div className="code-tabs">
      <div className="code-tabs-scroll" role="tablist">
        {tabs.map((f) => (
          <div key={f.path} role="tab" aria-selected={f.path === active} title={f.path}
            className={`code-tabx ${f.path === active ? 'on' : ''} ${errors[f.path] ? 'bad' : ''}`}
            onClick={() => onSelect(f)}
            onMouseDown={(e) => { if (e.button === 1) e.preventDefault() }}
            onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); onClose(f.path) } }}>
            {f.tag && <i className="code-tagdot" style={{ background: `var(--t-${f.tag})` }} />}
            <span className="code-tabx-name">{fileName(f.path)}</span>
            <button className="code-tabx-x" title="Close" aria-label={`Close ${f.path}`} onClick={(e) => { e.stopPropagation(); onClose(f.path) }}><I.close size={14} /></button>
          </div>
        ))}
      </div>
      <div className="code-tabs-acts">
        <button className="code-x code-mode" onClick={onCycleMode}
          title={`${mode === 'auto' ? `Auto (${dark ? 'dark' : 'light'}), follows the app` : mode === 'light' ? 'Light' : 'Dark'} · click for ${NEXT[mode]}`}
          aria-label={`Mode: ${mode}. Switch to ${NEXT[mode]}`}>
          <ModeIcon mode={mode} />
        </button>
        <button className="code-pill" disabled={!canFormat || formatting} title="Format (⇧⌥F)" onClick={onFormat}>{formatting ? 'Formatting…' : 'Format'}</button>
        <button className={`code-pill ${aiOpen ? 'on' : ''}`} aria-pressed={aiOpen} title="AI panel" onClick={onToggleAI}>AI</button>
      </div>
    </div>
  )
}
