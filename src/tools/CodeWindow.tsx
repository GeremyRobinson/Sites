import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useProject, useStore } from '../store'
import { cmsFiles, themeFile, componentName, exportZip, generateApp, generatePage, pageFile } from '../codegen'
import { parsePage, ParseError } from '../parse'
import { toast } from '../ui/toast'
import { useTheme } from '../ui/theme'
import { Editor, type EditorHandle } from './code/Editor'
import { FileTree } from './code/FileTree'
import { Tabs } from './code/Tabs'
import { AIPanel, type AIPanelHandle } from './code/AIPanel'
import { Terminal, type Line } from './code/Terminal'
import { canFormat, formatCode, formatError } from './code/format'
import { MODES, type Mode, type SyncError, type VFile } from './code/types'
import './code.css'

const COMPONENT = (name: string) => `type Props = {\n  children?: React.ReactNode\n}\n\nexport function ${name}({ children }: Props) {\n  return (\n    <div>\n      {children}\n    </div>\n  )\n}\n`

const HELP = `commands
  ls                    list files
  open <file>           open a file (tab completes)
  component <Name>      new component in components/
  touch <path>          new empty file
  mv <from> <to>        rename a file
  rm <path>             delete a file you made
  eject <page>          copy a page's code into components/ as a component
  page <Name>           add a page to the site
  pages                 list pages and routes
  fmt                   format the open file with Prettier
  ai <instruction>      ask the AI panel to change the open file
  libs                  list the project's libraries
  export                download the project as a Vite + React zip
  undo | redo           step through history
  theme <name>          graphite, phosphor, amber or paper
  mode <name>           auto, light or dark (auto follows the app)
  clear                 clear the terminal`

const current = () => {
  const st = useStore.getState()
  return st.projects.find((p) => p.id === st.currentId) || null
}

export function CodeWindow() {
  const project = useProject()!
  const settings = project.windows.code.settings
  const s = useStore.getState
  // Light or dark is separate from the colour theme; auto follows the app.
  const appDark = useTheme().dark
  const mode: Mode = MODES.includes(settings.mode as Mode) ? settings.mode as Mode : 'auto'
  const dark = mode === 'auto' ? appDark : mode === 'dark'
  const cycleMode = () => s().setWindowSetting('code', 'mode', MODES[(MODES.indexOf(mode) + 1) % MODES.length])

  const files: VFile[] = useMemo(() => [
    { path: 'App.tsx', content: generateApp(project), readonly: true },
    { ...themeFile(project), readonly: true },
    ...cmsFiles(project).map((f) => ({ ...f, readonly: true })),
    ...project.pages.map((pg) => ({ path: pageFile(pg), content: generatePage(pg, project), readonly: false, pageId: pg.id, component: pg.kind === 'component', tag: pg.tag })),
    ...project.files.map((f) => ({ path: f.path, content: f.content, readonly: false, id: f.id, tag: f.tag })),
  ], [project])

  const [tabs, setTabs] = useState<string[]>(() => {
    const pg = project.pages.find((p) => p.id === project.activePageId) || project.pages[0]
    return pg ? [pageFile(pg)] : ['App.tsx']
  })
  const [openPath, setOpenPath] = useState(tabs[0])
  const [errors, setErrors] = useState<Record<string, SyncError>>({})
  const [aiOpen, setAiOpen] = useState(false)
  const [formatting, setFormatting] = useState(false)
  const [lines, setLines] = useState<Line[]>([
    { kind: 'ok', text: `sites · ${project.name}` },
    { kind: 'out', text: "type 'help' for commands" },
  ])
  const editor = useRef<EditorHandle>(null)
  const aiRef = useRef<AIPanelHandle>(null)
  const started = useRef(false)
  const timers = useRef(new Map<string, { t: number; text: string }>())
  const filesRef = useRef(files)
  filesRef.current = files
  const errorsRef = useRef(errors)
  errorsRef.current = errors

  const file = files.find((f) => f.path === openPath) || files.find((f) => f.path === tabs[tabs.length - 1])
  const tabFiles = tabs.map((p) => files.find((f) => f.path === p)).filter((f): f is VFile => !!f)

  // Follow files that move (page renamed, mv) and drop ones that are gone.
  const prevFiles = useRef(files)
  useEffect(() => {
    const prev = prevFiles.current
    prevFiles.current = files
    if (prev === files) return
    const has = (p: string) => files.some((f) => f.path === p)
    const moved = (p: string) => {
      const old = prev.find((f) => f.path === p)
      return old && files.find((f) => (old.pageId && f.pageId === old.pageId) || (old.id && f.id === old.id))?.path
    }
    const fix = (p: string) => (has(p) ? p : moved(p))
    setTabs((ts) => {
      const next = [...new Set(ts.map(fix).filter((p): p is string => !!p))]
      return next.length === ts.length && next.every((p, i) => p === ts[i]) ? ts : next
    })
    setOpenPath((p) => fix(p) ?? p)
    setErrors((e) => {
      const keep = Object.fromEntries(Object.entries(e).filter(([p]) => has(p)))
      return Object.keys(keep).length === Object.keys(e).length ? e : keep
    })
  }, [files])

  const print = (...ls: Line[]) => setLines((x) => [...x, ...ls])
  const find = (p: string) => files.find((f) => f.path === p || f.path.endsWith('/' + p) || f.path === p + '.tsx' || f.path.endsWith('/' + p + '.tsx'))

  const open = (f: VFile | string) => {
    const path = typeof f === 'string' ? f : f.path
    setTabs((ts) => (ts.includes(path) ? ts : [...ts, path]))
    setOpenPath(path)
    const vf = typeof f === 'string' ? filesRef.current.find((x) => x.path === f) : f
    if (vf?.pageId) s().setActivePage(vf.pageId)
  }

  const close = (path: string) => {
    flush(path)
    const i = tabs.indexOf(path)
    const next = tabs.filter((p) => p !== path)
    setTabs(next)
    if (path === file?.path) {
      const to = next[Math.min(i, next.length - 1)]
      setOpenPath(to ?? '')
      const vf = files.find((f) => f.path === to)
      if (vf?.pageId) s().setActivePage(vf.pageId)
    }
  }

  // Page files are read back into the canvas after a short pause in typing.
  const commit = (path: string, text: string) => {
    timers.current.delete(path)
    const proj = current()
    const f = filesRef.current.find((x) => x.path === path)
    const pg = proj?.pages.find((p) => p.id === f?.pageId)
    if (!proj || !pg) return
    try {
      s().updatePage(pg.id, parsePage(text, pg, proj.pages, proj.assets, proj.cms, proj.styles))
      setErrors((e) => { if (!e[path]) return e; const { [path]: _, ...rest } = e; return rest })
    } catch (err) {
      const e = err instanceof ParseError ? { line: err.line, msg: err.message } : { line: 0, msg: String(err) }
      setErrors((x) => ({ ...x, [path]: e }))
    }
  }

  const flush = (path: string) => {
    const p = timers.current.get(path)
    if (!p) return
    window.clearTimeout(p.t)
    commit(path, p.text)
  }

  const onEdit = useCallback((path: string, text: string) => {
    const f = filesRef.current.find((x) => x.path === path)
    if (!f || f.readonly) return
    if (!started.current) { started.current = true; s().checkpoint() }
    if (f.id) { s().updateFile(f.id, { content: text }); return }
    if (!f.pageId) return
    const prev = timers.current.get(path)
    if (prev) window.clearTimeout(prev.t)
    timers.current.set(path, { text, t: window.setTimeout(() => commit(path, text), 250) })
  }, [])

  useEffect(() => () => { for (const p of [...timers.current.keys()]) flush(p) }, [])

  const format = async (): Promise<string> => {
    const f = file
    if (!f) return 'no file open'
    if (f.readonly) return `${f.path} is generated and read-only`
    if (!canFormat(f.path)) return `no formatter for ${f.path}`
    setFormatting(true)
    try {
      const out = await formatCode(f.path, editor.current?.getText() ?? f.content)
      editor.current?.replaceAll(out)
      return ''
    } catch (e) {
      const { line, msg } = formatError(e)
      return `format failed${line ? ` at line ${line}` : ''}: ${msg}`
    } finally {
      setFormatting(false)
    }
  }
  const formatAndReport = () => { format().then((m) => { if (m) toast(m) }) }

  // AI changes go through the same path as typing: page files must parse before they reach the canvas.
  const applyAI = (path: string, text: string): SyncError | null => {
    const f = filesRef.current.find((x) => x.path === path)
    if (!f || f.readonly) return { line: 0, msg: `${path} can't be edited` }
    const t = timers.current.get(path)
    if (t) { window.clearTimeout(t.t); timers.current.delete(path) }
    if (f.id) {
      s().checkpoint(); s().updateFile(f.id, { content: text })
    } else if (f.pageId) {
      const proj = current()
      const pg = proj?.pages.find((p) => p.id === f.pageId)
      if (!proj || !pg) return { line: 0, msg: 'page not found' }
      try {
        const patch = parsePage(text, pg, proj.pages, proj.assets, proj.cms, proj.styles)
        s().checkpoint(); s().updatePage(pg.id, patch)
      } catch (err) {
        return err instanceof ParseError ? { line: err.line, msg: err.message } : { line: 0, msg: String(err) }
      }
    }
    setErrors((e) => { if (!e[path]) return e; const { [path]: _, ...rest } = e; return rest })
    if (path === file?.path) editor.current?.load(text)
    return null
  }

  const run = (raw: string) => {
    const input = raw.trim()
    print({ kind: 'in', text: input })
    if (!input) return
    const [c, ...args] = input.split(/\s+/)
    const a = args.join(' ')
    const st = s()
    switch (c) {
      case 'help': print({ kind: 'out', text: HELP }); break
      case 'clear': setLines([]); break
      case 'ls': case 'tree':
        print({ kind: 'out', text: files.map((f) => `${f.pageId ? (f.component ? 'comp ' : 'page ') : f.readonly ? 'auto ' : '     '}${f.path}`).join('\n') }); break
      case 'open': case 'cat': case 'vim': case 'code': {
        const f = find(a)
        if (!f) print({ kind: 'err', text: `no such file: ${a}` })
        else open(f)
        break
      }
      case 'component': {
        const name = componentName(a || 'Component')
        const path = `components/${name}.tsx`
        if (find(path)) { print({ kind: 'err', text: `${path} already exists` }); break }
        st.addFile(path, COMPONENT(name)); open(path)
        print({ kind: 'ok', text: `created ${path}` }); break
      }
      case 'touch': {
        if (!a) { print({ kind: 'err', text: 'usage: touch <path>' }); break }
        if (find(a)) { print({ kind: 'err', text: `${a} already exists` }); break }
        st.addFile(a, ''); open(a); print({ kind: 'ok', text: `created ${a}` }); break
      }
      case 'mv': {
        const f = find(args[0] || '')
        if (!f || f.readonly || f.pageId || !args[1]) { print({ kind: 'err', text: f?.pageId || f?.readonly ? 'page files are named after their page; rename the page instead' : 'usage: mv <from> <to>' }); break }
        st.checkpoint(); st.updateFile(f.id!, { path: args[1] }); print({ kind: 'ok', text: `${f.path} → ${args[1]}` }); break
      }
      case 'rm': {
        const f = find(a)
        if (!f) print({ kind: 'err', text: `no such file: ${a}` })
        else if (f.readonly || f.pageId) print({ kind: 'err', text: 'page files go with their page; delete the page in Project settings' })
        else { st.deleteFile(f.id!); print({ kind: 'ok', text: `removed ${f.path}` }) }
        break
      }
      case 'eject': {
        const f = find(a || file?.path || '')
        if (!f?.pageId) { print({ kind: 'err', text: 'usage: eject <page file>' }); break }
        const name = componentName(project.pages.find((p) => p.id === f.pageId)!.name) + 'Section'
        const path = `components/${name}.tsx`
        st.addFile(path, f.content.replace(/^\/\/.*\n\/\/.*\n\n/, '').replace(/export default function \w+/, `export function ${name}`))
        open(path); print({ kind: 'ok', text: `copied to ${path}` }); break
      }
      case 'page': {
        if (!a) { print({ kind: 'err', text: 'usage: page <Name>' }); break }
        st.addPage(a); print({ kind: 'ok', text: `added page ${a}` }); break
      }
      case 'pages': print({ kind: 'out', text: project.pages.map((p) => `${p.path.padEnd(16)} ${p.name}`).join('\n') }); break
      case 'fmt': case 'format': case 'prettier':
        format().then((m) => print(m ? { kind: 'err', text: m } : { kind: 'ok', text: `formatted ${file?.path}` })); break
      case 'ai': {
        if (!a) { print({ kind: 'err', text: 'usage: ai <instruction>' }); break }
        if (!file) { print({ kind: 'err', text: 'open a file first' }); break }
        setAiOpen(true); aiRef.current?.run(a)
        print({ kind: 'out', text: `asking about ${file.path}; see the AI panel` }); break
      }
      case 'libs': {
        const libs = project.settings.libraries ?? []
        print({ kind: 'out', text: libs.length ? libs.join('\n') : 'no libraries yet' }); break
      }
      case 'export':
        exportZip(project).then(() => print({ kind: 'ok', text: 'exported. unzip, then: npm install && npm run dev' })); break
      case 'undo': st.undo(); print({ kind: 'ok', text: 'undone' }); break
      case 'redo': st.redo(); print({ kind: 'ok', text: 'redone' }); break
      case 'theme':
        if (!['graphite', 'phosphor', 'amber', 'paper'].includes(a)) print({ kind: 'err', text: 'themes: graphite, phosphor, amber, paper' })
        else st.setWindowSetting('code', 'theme', a)
        break
      case 'mode':
        if (!MODES.includes(a as Mode)) print({ kind: 'out', text: `mode: ${mode}${mode === 'auto' ? ` (${dark ? 'dark' : 'light'})` : ''}. set with: mode auto | light | dark` })
        else st.setWindowSetting('code', 'mode', a)
        break
      case 'npm': case 'yarn': case 'pnpm': case 'bun':
        print({ kind: 'out', text: 'the Canvas window is your dev server. run `export` to get a project you can npm install.' }); break
      case 'git':
        print({ kind: 'out', text: project.settings.repo ? `remote: ${project.settings.repo}\nrun \`export\`, then push the folder to that repo.` : 'no repo set. add one in Project settings, then `export`.' }); break
      default: print({ kind: 'err', text: `command not found: ${c}` })
    }
  }

  const complete = (cmd: string) => {
    const m = cmd.match(/^(\S+\s+)(\S*)$/)
    if (!m) return cmd
    const hits = files.map((f) => f.path).filter((p) => p.startsWith(m[2]) || p.split('/').pop()!.startsWith(m[2]))
    if (hits.length === 1) return m[1] + hits[0]
    if (hits.length > 1) print({ kind: 'out', text: hits.join('   ') })
    return cmd
  }

  // "Hero" makes components/Hero.tsx with a starter; any other path makes an empty file.
  const createFile = (raw: string) => {
    if (!raw) return
    let path = raw.replace(/^\/+/, '').replace(/^src\//, '')
    if (!path.includes('/') && !path.includes('.')) path = `components/${componentName(path)}.tsx`
    if (find(path)) { toast(`${path} already exists`); return }
    const m = path.match(/^components\/([A-Z]\w*)\.tsx$/)
    s().addFile(path, m ? COMPONENT(m[1]) : '')
    open(path)
  }
  const renameFile = (f: VFile, to: string) => {
    to = to.replace(/^\/+/, '')
    if (!to || to === f.path || !f.id) return
    if (find(to)) { toast(`${to} already exists`); return }
    s().checkpoint(); s().updateFile(f.id, { path: to })
  }

  const components = useCallback(() => filesRef.current
    .filter((f) => f.path.startsWith('components/') && /\.[jt]sx$/.test(f.path))
    .map((f) => f.path.split('/').pop()!.replace(/\.[jt]sx$/, '')), [])

  const err = file ? errors[file.path] : undefined
  const ps = `~/${project.name.toLowerCase().replace(/\s+/g, '-')} $`

  return (
    <div className={`code theme-${settings.theme} ${dark ? 'is-dark' : 'is-light'}`} style={{ fontSize: Number(settings.fontSize) }}
      onKeyDown={(e) => {
        if (e.defaultPrevented || !(e.shiftKey && e.altKey && e.code === 'KeyF')) return
        e.preventDefault(); formatAndReport()
      }}>
      <div className={`code-main ${aiOpen ? 'ai-open' : ''}`}>
        <FileTree files={files} active={file?.path} onOpen={open} onCreate={createFile} onRename={renameFile}
          onDelete={(f) => { s().deleteFile(f.id!); toast(`Deleted ${f.path}`) }} />
        <div className="code-editor-wrap">
          <Tabs tabs={tabFiles} active={file?.path} errors={errors} aiOpen={aiOpen} mode={mode} dark={dark} onCycleMode={cycleMode}
            canFormat={!!file && !file.readonly && canFormat(file.path)} formatting={formatting}
            onSelect={open} onClose={close} onFormat={formatAndReport} onToggleAI={() => setAiOpen((o) => !o)} />
          {file ? (
            <Editor ref={editor} path={file.path} doc={file.content} readonly={file.readonly} error={err ?? null}
              wrap={!!settings.wrap} lineNumbers={!!settings.lineNumbers} openPaths={tabs} components={components}
              onEdit={onEdit} onFocus={() => { started.current = false }} onBlur={flush}
              onFormat={formatAndReport} onSave={() => toast(errorsRef.current[file.path] ? 'Fix the error to update the canvas' : 'Saved')} />
          ) : (
            <div className="code-empty"><span className="code-pill">no file open</span><span>Pick a file on the left or type <b>open &lt;file&gt;</b> below.</span></div>
          )}
          <div className="code-status">
            {!file ? <span className="code-state">idle</span>
              : file.readonly ? <span className="code-state">{file.path.startsWith('cms/') ? 'auto · written from the CMS window' : file.path === 'theme.css' ? 'auto · written from colour styles in Assets' : 'auto · updates when you add or rename pages'}</span>
              : !err ? <span className="code-state ok">{file.pageId ? 'synced' : 'saved'}</span>
              : <span className="code-state bad"><span>line {err.line}: {err.msg}</span></span>}
            {file && (
              <span className="code-hints">
                {!file.readonly && <span className="k"><b>[⇧⌥F]</b> format · <b>[⌘S]</b> save · </span>}
                {file.content.split('\n').length} lines
              </span>
            )}
          </div>
        </div>
        <div className="code-ai-slot" hidden={!aiOpen}>
          <AIPanel ref={aiRef} file={file} error={err} libraries={project.settings.libraries ?? []}
            getText={() => editor.current?.getText() ?? file?.content ?? ''}
            getSelection={() => editor.current?.getSelection() ?? null}
            onApply={applyAI} onClose={() => setAiOpen(false)} />
        </div>
      </div>
      <Terminal lines={lines} ps={ps} onRun={run} onComplete={complete} onClear={() => setLines([])} />
    </div>
  )
}
