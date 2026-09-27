import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react'
import { EditorView } from '@codemirror/view'
import { Compartment, EditorState, Transaction } from '@codemirror/state'
import { setDiagnostics, type Diagnostic } from '@codemirror/lint'
import { baseExtensions, External, minimalChange, numbersExt, readonlyExt, wrapExt } from './setup'

export interface EditorHandle {
  getText: () => string
  // Selected lines, if there is a non-empty selection.
  getSelection: () => { from: number; to: number; text: string } | null
  // An undoable edit that flows through onEdit like typing (used by Format).
  replaceAll: (text: string) => void
  // Loads text as if it came from outside (used after AI apply).
  load: (text: string) => void
  focus: () => void
}

interface Props {
  path: string
  doc: string
  readonly: boolean
  wrap: boolean
  lineNumbers: boolean
  error: { line: number; msg: string } | null
  openPaths: string[]
  components: () => string[]
  onEdit: (path: string, text: string) => void
  onFocus: (path: string) => void
  onBlur: (path: string) => void
  onFormat: () => void
  onSave: () => void
}

// One EditorView for the window; each open tab keeps its own EditorState (undo history, selection, scroll).
export const Editor = forwardRef<EditorHandle, Props>(function Editor(p, ref) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView>()
  const states = useRef(new Map<string, EditorState>())
  const scrolls = useRef(new Map<string, number>())
  const cur = useRef(p.path)
  const props = useRef(p)
  props.current = p
  const [c] = useState(() => ({ wrap: new Compartment(), nums: new Compartment(), ro: new Compartment() }))
  const [blurs, setBlurs] = useState(0)

  const makeState = (path: string, doc: string) => {
    const q = props.current
    return EditorState.create({
      doc,
      extensions: [
        baseExtensions(path, {
          onFormat: () => props.current.onFormat(),
          onSave: () => props.current.onSave(),
          components: () => props.current.components(),
        }),
        c.wrap.of(wrapExt(q.wrap)),
        c.nums.of(numbersExt(q.lineNumbers)),
        c.ro.of(readonlyExt(q.readonly)),
        EditorView.updateListener.of((u) => {
          if (u.docChanged && u.transactions.some((tr) => tr.docChanged && !tr.annotation(External))) {
            props.current.onEdit(cur.current, u.state.doc.toString())
          }
          if (u.focusChanged) {
            if (u.view.hasFocus) props.current.onFocus(cur.current)
            else { props.current.onBlur(cur.current); setBlurs((n) => n + 1) }
          }
        }),
      ],
    })
  }

  useEffect(() => {
    const v = new EditorView({ state: makeState(p.path, p.doc), parent: host.current! })
    view.current = v
    return () => { v.destroy(); view.current = undefined }
  }, [])

  // Switch tabs: stash the old state, restore or create the new one.
  useEffect(() => {
    const v = view.current
    if (!v || cur.current === p.path) return
    states.current.set(cur.current, v.state)
    scrolls.current.set(cur.current, v.scrollDOM.scrollTop)
    cur.current = p.path
    const saved = states.current.get(p.path)
    v.setState(saved ?? makeState(p.path, p.doc))
    v.dispatch({ effects: [c.wrap.reconfigure(wrapExt(p.wrap)), c.nums.reconfigure(numbersExt(p.lineNumbers)), c.ro.reconfigure(readonlyExt(p.readonly))] })
    const top = scrolls.current.get(p.path)
    if (top) requestAnimationFrame(() => { v.scrollDOM.scrollTop = top })
  }, [p.path])

  useEffect(() => {
    view.current?.dispatch({ effects: [c.wrap.reconfigure(wrapExt(p.wrap)), c.nums.reconfigure(numbersExt(p.lineNumbers)), c.ro.reconfigure(readonlyExt(p.readonly))] })
  }, [p.wrap, p.lineNumbers, p.readonly])

  // Forget closed tabs.
  useEffect(() => {
    for (const k of [...states.current.keys()]) if (!p.openPaths.includes(k)) { states.current.delete(k); scrolls.current.delete(k) }
  }, [p.openPaths.join('\n')])

  // Outside changes (canvas, undo, rename) land here unless you're mid-edit or the file has an error to fix.
  useEffect(() => {
    const v = view.current
    if (!v) return
    if (!p.readonly && (v.hasFocus || p.error)) return
    const now = v.state.doc.toString()
    if (now === p.doc) return
    v.dispatch({ changes: minimalChange(now, p.doc), annotations: [External.of(true), Transaction.addToHistory.of(false)] })
  }, [p.doc, p.error, p.path, p.readonly, blurs])

  useEffect(() => {
    const v = view.current
    if (!v) return
    const diags: Diagnostic[] = []
    if (p.error) {
      const n = Math.min(Math.max(1, p.error.line || 1), v.state.doc.lines)
      const line = v.state.doc.line(n)
      diags.push({ from: line.from, to: line.to, severity: 'error', message: p.error.msg, source: p.path.endsWith('.tsx') ? 'sites' : undefined })
    }
    v.dispatch(setDiagnostics(v.state, diags))
  }, [p.error?.line, p.error?.msg, p.path])

  useImperativeHandle(ref, () => ({
    getText: () => view.current?.state.doc.toString() ?? '',
    getSelection: () => {
      const v = view.current
      if (!v) return null
      const r = v.state.selection.main
      if (r.empty) return null
      const a = v.state.doc.lineAt(r.from)
      const b = v.state.doc.lineAt(r.to)
      return { from: a.number, to: b.number, text: v.state.sliceDoc(a.from, b.to) }
    },
    replaceAll: (text) => {
      const v = view.current
      if (!v) return
      const now = v.state.doc.toString()
      if (now !== text) v.dispatch({ changes: minimalChange(now, text), userEvent: 'input.format' })
    },
    load: (text) => {
      const v = view.current
      if (!v) return
      const now = v.state.doc.toString()
      if (now !== text) v.dispatch({ changes: minimalChange(now, text), annotations: [External.of(true)] })
    },
    focus: () => view.current?.focus(),
  }), [])

  return <div className="code-cm" ref={host} />
})
