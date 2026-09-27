import { useEffect, useRef, useState } from 'react'

export type Line = { kind: 'in' | 'out' | 'err' | 'ok'; text: string }

interface Props {
  lines: Line[]
  ps: string
  onRun: (cmd: string) => void
  onComplete: (cmd: string) => string
  onClear: () => void
}

export function Terminal({ lines, ps, onRun, onComplete, onClear }: Props) {
  const [cmd, setCmd] = useState('')
  const [hist, setHist] = useState<string[]>([])
  const [hi, setHi] = useState(-1)
  const termRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { termRef.current?.scrollTo(0, 1e9) }, [lines])

  return (
    <div className="term">
      <div className="term-scroll" ref={termRef} onClick={() => { if (!window.getSelection()?.toString()) inputRef.current?.focus() }}>
        {lines.map((l, i) => (
          <div key={i} className={`term-line t-${l.kind}`}>
            {l.kind === 'in' ? <><span className="term-ps">{ps}</span> {l.text}</> : l.text}
          </div>
        ))}
        <div className="term-line term-input">
          <span className="term-ps">{ps}</span>
          <input ref={inputRef} value={cmd} spellCheck={false} autoComplete="off" aria-label="Terminal"
            onChange={(e) => setCmd(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { const c = cmd.trim(); if (c) { setHist((h) => [...h, c]); setHi(-1) } onRun(cmd); setCmd('') }
              else if (e.key === 'Tab') { e.preventDefault(); setCmd(onComplete(cmd)) }
              else if (e.key === 'ArrowUp') { e.preventDefault(); const i = hi < 0 ? hist.length - 1 : Math.max(0, hi - 1); if (hist[i]) { setHi(i); setCmd(hist[i]) } }
              else if (e.key === 'ArrowDown') { e.preventDefault(); const i = hi + 1; if (hi >= 0 && i < hist.length) { setHi(i); setCmd(hist[i]) } else { setHi(-1); setCmd('') } }
              else if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); onClear() }
            }} />
        </div>
      </div>
      <div className="term-foot code-hints" aria-hidden>
        <b>[⏎]</b>&nbsp;run · <b>[tab]</b>&nbsp;complete · <b>[↑↓]</b>&nbsp;history · <b>[⌃L]</b>&nbsp;clear · <b>help</b>&nbsp;for commands
      </div>
    </div>
  )
}
