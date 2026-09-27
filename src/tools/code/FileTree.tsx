import { useMemo, useState } from 'react'
import type { VFile } from './types'
import { fileName } from './types'

interface Props {
  files: VFile[]
  active?: string
  onOpen: (f: VFile) => void
  onCreate: (raw: string) => void
  onRename: (f: VFile, to: string) => void
  onDelete: (f: VFile) => void
}

export function FileTree({ files, active, onOpen, onCreate, onRename, onDelete }: Props) {
  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)

  const dirs = useMemo(() => {
    const groups = new Map<string, VFile[]>()
    for (const f of files) {
      const d = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : ''
      groups.set(d, [...(groups.get(d) || []), f])
    }
    return [...groups.entries()].sort(([a], [b]) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)))
  }, [files])

  return (
    <aside className="code-tree">
      <div className="code-tree-head">src/</div>
      {dirs.map(([d, fs]) => (
        <div key={d}>
          {d && <div className="code-dir">{d}/</div>}
          {fs.map((f) => (
            <div key={f.path} className="code-file-row">
              {renaming === f.path ? (
                <input autoFocus defaultValue={f.path} spellCheck={false}
                  onBlur={(e) => { onRename(f, e.target.value.trim()); setRenaming(null) }}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(null) }} />
              ) : (
                <>
                  <button className={`code-file ${f.path === active ? 'on' : ''}`} style={{ paddingLeft: d ? 20 : 8 }} title={f.path}
                    onClick={() => onOpen(f)} onDoubleClick={() => f.id && setRenaming(f.path)}>
                    <span className="code-file-name">
                      <i className="code-tagdot" style={f.tag ? { background: `var(--t-${f.tag})` } : undefined} />
                      <span className="code-file-label">{fileName(f.path)}</span>
                    </span>
                    {f.pageId && <span className="code-gen">{f.component ? 'comp' : 'page'}</span>}
                    {f.readonly && <span className="code-gen">auto</span>}
                  </button>
                  {f.id && <button className="code-file-act" title="Rename" onClick={() => setRenaming(f.path)}>mv</button>}
                  {f.id && <button className="code-file-act" title="Delete" onClick={() => onDelete(f)}>rm</button>}
                </>
              )}
            </div>
          ))}
        </div>
      ))}
      {creating ? (
        <input autoFocus placeholder="components/Name.tsx" spellCheck={false}
          onBlur={(e) => { onCreate(e.target.value.trim()); setCreating(false) }}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setCreating(false) }} />
      ) : (
        <button className="code-file code-new" onClick={() => setCreating(true)}>+ new file</button>
      )}
    </aside>
  )
}
