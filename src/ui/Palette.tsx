import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Command } from './commands'
import { score } from './commands'
import { enter } from './motion'
import { I } from './icons'

// ⌘K: every action in the app, searchable, with its shortcut beside it.
export function Palette({ commands, onClose }: { commands: Command[]; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const panel = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)

  const results = useMemo(() => {
    const r = commands.map((c) => ({ c, s: Math.max(score(q, c.label), score(q, `${c.group} ${c.label}`) - 5, c.hint ? score(q, c.hint) - 10 : -1) }))
      .filter((x) => x.s >= 0)
    if (q) r.sort((a, b) => b.s - a.s)
    return r.map((x) => x.c).slice(0, 60)
  }, [q, commands])

  useLayoutEffect(() => {
    enter(panel.current)
  }, [])
  useLayoutEffect(() => { list.current?.querySelector('.pal-item.on')?.scrollIntoView({ block: 'nearest' }) }, [i])

  const run = (c?: Command) => { if (!c) return; onClose(); setTimeout(c.run, 0) }
  let lastGroup = ''

  return (
    <div className="palette-veil" onPointerDown={onClose}>
      <div className="palette" ref={panel} onPointerDown={(e) => e.stopPropagation()}>
        <div className="pal-top">
          <I.search style={{ color: 'var(--mute)', flex: 'none' }} />
          <input autoFocus value={q} placeholder="Type a command, page, component or tool"
            onChange={(e) => { setQ(e.target.value); setI(0) }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setI((x) => Math.min(results.length - 1, x + 1)) }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setI((x) => Math.max(0, x - 1)) }
              else if (e.key === 'Enter') { e.preventDefault(); run(results[i]) }
              else if (e.key === 'Escape') { e.preventDefault(); onClose() }
            }} />
          <span className="pal-count">{String(results.length).padStart(2, '0')}</span>
        </div>
        <div className="pal-list" ref={list}>
          {results.length === 0 && <div className="pal-empty">Nothing matches “{q}”.</div>}
          {results.map((c, k) => {
            const head = !q && c.group !== lastGroup ? (lastGroup = c.group) : null
            return (
              <div key={c.id}>
                {head && <div className="pal-group">{head}</div>}
                <button className={`pal-item ${k === i ? 'on' : ''}`} onPointerMove={() => setI(k)} onClick={() => run(c)}>
                  <i className={`sw ${c.tag ? 'sw-' + c.tag : 'sw-none'}`} />
                  <span className="grow">{c.label}</span>
                  {c.hint && <span className="pal-hint">{c.hint}</span>}
                  {q && <span className="pal-hint">{c.group}</span>}
                  {c.keys && <kbd>{c.keys}</kbd>}
                </button>
              </div>
            )
          })}
        </div>
        <div className="pal-foot"><b>[↑↓]</b> move · <b>[⏎]</b> run · <b>[esc]</b> close</div>
      </div>
    </div>
  )
}
