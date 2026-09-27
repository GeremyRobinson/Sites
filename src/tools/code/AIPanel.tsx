import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { streamAI } from '../../ai/providers'
import { describeAI, useAI } from '../../ai/settings'
import { extractCode, proseOf, QUICK, systemPrompt, userPrompt, type FileKind } from '../../ai/prompt'
import { diffStats, hunks, lineDiff } from './diff'
import type { SyncError, VFile } from './types'
import { I } from '../../ui/icons'

export interface AIPanelHandle { run: (instruction: string) => void }

interface Props {
  file?: VFile
  error?: SyncError
  libraries: string[]
  getText: () => string
  getSelection: () => { from: number; to: number; text: string } | null
  onApply: (path: string, text: string) => SyncError | null
  onClose: () => void
}

type Proposal = { path: string; before: string; after: string }

const kindOf = (f: VFile): FileKind => (f.readonly ? 'generated' : f.pageId ? (f.component ? 'component-page' : 'page') : 'code')

export const AIPanel = forwardRef<AIPanelHandle, Props>(function AIPanel(p, ref) {
  const ai = useAI()
  const [instruction, setInstruction] = useState('')
  const [useSel, setUseSel] = useState(true)
  const [busy, setBusy] = useState(false)
  const [reply, setReply] = useState('')
  const [explain, setExplain] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const abort = useRef<AbortController | null>(null)
  const outRef = useRef<HTMLDivElement>(null)
  const props = useRef(p)
  props.current = p

  useEffect(() => () => abort.current?.abort(), [])
  useEffect(() => { if (busy) outRef.current?.scrollTo(0, 1e9) }, [reply, busy])
  useEffect(() => { if (proposal) outRef.current?.scrollTo(0, 0) }, [proposal])

  const run = async (text: string, opts: { explain?: boolean } = {}) => {
    const q = props.current
    const f = q.file
    const instr = text.trim()
    if (!instr || busy) return
    if (!f) { setErr('Open a file first.'); return }
    abort.current?.abort()
    const ctl = new AbortController()
    abort.current = ctl
    const before = q.getText()
    const sel = useSel ? q.getSelection() : null
    setBusy(true); setReply(''); setErr(null); setNote(null); setProposal(null); setExplain(!!opts.explain)
    let out = ''
    try {
      await streamAI({
        system: systemPrompt(kindOf(f), !!opts.explain),
        prompt: userPrompt({ instruction: instr, path: f.path, content: before, selection: sel ?? undefined, errors: q.error ? `line ${q.error.line}: ${q.error.msg}` : undefined, libraries: q.libraries }),
        file: f.path,
        content: before,
        signal: ctl.signal,
        onText: (t) => { out += t; setReply(out) },
      })
      if (opts.explain) return
      const code = extractCode(out)
      if (code === null) setNote('The reply had no code block, so there is nothing to apply.')
      else if (code === before || code === before + '\n') setNote('No changes suggested.')
      else if (f.readonly) setNote(`${f.path} is generated from your pages and can't be edited.`)
      else setProposal({ path: f.path, before, after: code })
    } catch (e) {
      if (ctl.signal.aborted) setNote('Stopped.')
      else setErr(e instanceof Error ? e.message : String(e))
    } finally {
      if (abort.current === ctl) abort.current = null
      setBusy(false)
    }
  }

  useImperativeHandle(ref, () => ({ run: (t) => { setInstruction(t); run(t) } }))

  const apply = () => {
    if (!proposal) return
    const e = p.onApply(proposal.path, proposal.after)
    if (e) { setErr(`Not applied. ${e.line ? `Line ${e.line}: ` : ''}${e.msg}`); return }
    setProposal(null); setReply(''); setErr(null); setNote(`Applied to ${proposal.path}.`)
  }

  const ops = useMemo(() => (proposal ? lineDiff(proposal.before, proposal.after) : []), [proposal])
  const stats = diffStats(ops)
  const prose = proposal ? proseOf(reply) : ''
  const showRaw = busy || explain || (!proposal && reply)

  return (
    <aside className="code-ai" aria-label="AI">
      <div className="code-ai-head">
        <span className="code-ai-tag">AI</span>
        <span className="code-ai-meta" title={describeAI(ai)}>{describeAI(ai)}</span>
        <button className="code-x" title="Close AI panel" aria-label="Close AI panel" onClick={p.onClose}><I.close /></button>
      </div>
      <div className="code-ai-quick">
        {QUICK.map((qa) => (
          <button key={qa.label} className="code-pill" disabled={busy || !p.file} onClick={() => { setInstruction(qa.instruction); run(qa.instruction, { explain: qa.explain }) }}>{qa.label}</button>
        ))}
      </div>
      <div className="code-ai-ask">
        <textarea value={instruction} rows={3} spellCheck={false} placeholder={p.file ? `Change ${p.file.path}…` : 'Open a file'}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); run(instruction) } }} />
        <div className="code-ai-row">
          <label className="code-ai-check"><input type="checkbox" checked={useSel} onChange={(e) => setUseSel(e.target.checked)} /> selection</label>
          {busy
            ? <button className="code-pill" onClick={() => abort.current?.abort()}>Stop</button>
            : <button className="code-pill solid" disabled={!instruction.trim() || !p.file} onClick={() => run(instruction)}>Run <kbd>⌘↵</kbd></button>}
        </div>
      </div>
      <div className="code-ai-out" ref={outRef}>
        {err && <div className="code-ai-err">{err}</div>}
        {note && <div className="code-ai-note">{note}</div>}
        {busy && !reply && <div className="code-ai-note">waiting for {ai.provider === 'bridge' ? 'the bridge' : 'the model'}…</div>}
        {showRaw && reply && <pre className="code-ai-reply">{reply}{busy && <span className="code-ai-caret" />}</pre>}
        {proposal && (
          <div className="code-diff">
            {prose && <p className="code-ai-prose">{prose}</p>}
            <div className="code-diff-head">
              <span>{proposal.path}</span>
              <span><b className="add">+{stats.added}</b> <b className="del">−{stats.removed}</b></span>
            </div>
            <div className="code-diff-body">
              {hunks(ops).map((h, i) => h.kind === 'skip'
                ? <div key={i} className="code-diff-skip">··· {h.count} unchanged</div>
                : h.ops.map((o, j) => (
                  <div key={`${i}-${j}`} className={`code-diff-line ${o.t === '+' ? 'add' : o.t === '-' ? 'del' : ''}`}>
                    <span className="code-diff-n">{o.t === '+' ? '' : o.a}</span>
                    <span className="code-diff-n">{o.t === '-' ? '' : o.b}</span>
                    <span className="code-diff-s">{o.t}</span>
                    <span className="code-diff-t">{o.text || ' '}</span>
                  </div>
                )))}
            </div>
            <div className="code-diff-acts">
              <button className="code-pill solid" onClick={apply}>Apply</button>
              <button className="code-pill" onClick={() => { setProposal(null); setNote('Discarded.') }}>Discard</button>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
})
