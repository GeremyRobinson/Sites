import { useRef, useState } from 'react'
import { useProject, useStore } from '../store'
import { LIBRARIES, exportZip } from '../codegen'
import { readText } from '../ui/files'
import { toast } from '../ui/toast'
import { ConfirmButton } from '../ui/ConfirmButton'
import { AISettings } from './AISettings'
import { Section } from '../ui/controls'
import { I } from '../ui/icons'

export function SettingsWindow() {
  const project = useProject()!
  const s = useStore.getState
  const [busy, setBusy] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)
  const libs = project.settings.libraries || []
  const set = (patch: Partial<typeof project.settings>) => s().updateProject((p) => ({ ...p, settings: { ...p.settings, ...patch } }))

  const doExport = async () => {
    setBusy(true)
    try { await exportZip(project); toast('Exported') } finally { setBusy(false) }
  }

  const importFiles = async (files: FileList) => {
    let n = 0
    for (const f of Array.from(files)) {
      if (!/\.(tsx?|jsx?|css|json|md)$/i.test(f.name)) continue
      const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name
      const path = rel.includes('/src/') ? rel.slice(rel.indexOf('/src/') + 5) : `components/${f.name}`
      s().addFile(path, await readText(f))
      n++
    }
    toast(n ? `Imported ${n} file${n === 1 ? '' : 's'} into Code` : 'No code files found')
  }

  return (
    <div className="set">
      <Section label="Project">
        <label className="fr"><span className="fr-label">Name</span>
          <span className="fr-value"><input key={project.name} defaultValue={project.name} spellCheck={false} onBlur={(e) => s().updateProject((p) => ({ ...p, name: e.target.value || p.name }))} /></span>
        </label>
        <label className="fr"><span className="fr-label">Site title</span>
          <span className="fr-value"><input key={project.settings.siteTitle} defaultValue={project.settings.siteTitle} spellCheck={false} onBlur={(e) => set({ siteTitle: e.target.value })} /></span>
        </label>
        <textarea className="field set-notes" rows={2} key={project.id} defaultValue={project.description} placeholder="Notes: what this site is for" aria-label="Notes"
          onBlur={(e) => s().updateProject((p) => ({ ...p, description: e.target.value }))} />
      </Section>

      <Section label="Pages" aside={<button className="btn ghost sm set-aside" onClick={() => s().addPage(`Page ${project.pages.length + 1}`)}>+ Add page</button>}>
        {project.pages.map((pg) => (
          <div key={pg.id} className="fr set-page">
            <input className="set-page-name" aria-label="Page name" key={pg.id + pg.name} defaultValue={pg.name} spellCheck={false} onBlur={(e) => s().updatePage(pg.id, { name: e.target.value || pg.name })} />
            <input className="set-page-path mono" aria-label="Page path" key={pg.id + pg.path} defaultValue={pg.path} spellCheck={false} onBlur={(e) => s().updatePage(pg.id, { path: e.target.value.startsWith('/') ? e.target.value : '/' + e.target.value })} />
            <button className="set-x" title="Delete page" aria-label={`Delete ${pg.name}`} disabled={project.pages.length < 2} onClick={() => s().deletePage(pg.id)}>
              <I.close size={14} />
            </button>
          </div>
        ))}
      </Section>

      <Section label="Libraries" aside={<span className="tag">{libs.length} on</span>}>
        <p className="set-note">Added to the exported package.json, so your code files can import them.</p>
        <div className="lib-grid">
          {LIBRARIES.map((l) => {
            const on = libs.includes(l.id)
            return (
              <button key={l.id} className={`lib ${on ? 'on' : ''}`} aria-pressed={on} title={l.snippet}
                onClick={() => set({ libraries: on ? libs.filter((x) => x !== l.id) : [...libs, l.id] })}>
                <span className="lib-top"><b className="mono">{l.id}</b><i className="lib-on" /></span>
                <span className="lib-what">{l.what}</span>
                <span className="lib-ver mono">{l.version}</span>
              </button>
            )
          })}
        </div>
      </Section>

      <AISettings />

      <Section label="Export">
        <p className="set-note">Downloads a Vite + React + TypeScript project with every page, component and asset.</p>
        <div className="set-acts"><button className="btn primary" disabled={busy} onClick={doExport}>{busy ? 'Exporting…' : 'Download .zip'}</button></div>
      </Section>

      <Section label="GitHub">
        <label className="fr"><span className="fr-label">Repository</span>
          <span className="fr-value"><input className="mono" placeholder="github.com/you/site" spellCheck={false} key={project.settings.repo} defaultValue={project.settings.repo} onBlur={(e) => set({ repo: e.target.value })} /></span>
        </label>
        <p className="set-note">Export, unzip, then <span className="mono">git init && git remote add origin …</span> and push. Direct push from Sites is next on the list.</p>
      </Section>

      <Section label="Import code">
        <p className="set-note">Bring in components from an AI-generated or existing project to fine-tune them in Code.</p>
        <div className="set-acts">
          <button className="btn" onClick={() => importRef.current?.click()}>Choose folder…</button>
          <input ref={importRef} type="file" hidden multiple {...({ webkitdirectory: '' } as object)} onChange={(e) => { if (e.target.files) importFiles(e.target.files); e.target.value = '' }} />
        </div>
      </Section>

      <Section label="Danger">
        <div className="set-acts"><ConfirmButton className="btn danger" label="Delete project" confirmLabel="Click again to delete for good" onConfirm={() => s().deleteProject(project.id)} /></div>
      </Section>
    </div>
  )
}
