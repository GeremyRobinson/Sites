import { useState } from 'react'
import { PROVIDERS, setAI, useAI, type AIConfig, type ProviderId } from '../ai/settings'
import { testAI } from '../ai/providers'
import { Row, Section } from '../ui/controls'
import { I } from '../ui/icons'

type Status = { kind: 'idle' | 'busy' | 'ok' | 'err'; text: string }

// Project settings section for the Code window's AI panel. Settings are per browser, not per project.
export function AISettings() {
  const ai = useAI()
  const [status, setStatus] = useState<Status>({ kind: 'idle', text: '' })

  const patch = <K extends 'anthropic' | 'openai' | 'bridge'>(k: K, v: Partial<AIConfig[K]>) => {
    setAI((c) => ({ ...c, [k]: { ...c[k], ...v } }))
    setStatus({ kind: 'idle', text: '' })
  }

  const test = async () => {
    setStatus({ kind: 'busy', text: 'Testing…' })
    try { setStatus({ kind: 'ok', text: await testAI() }) } catch (e) { setStatus({ kind: 'err', text: e instanceof Error ? e.message : String(e) }) }
  }

  const field = (label: string, value: string, onChange: (v: string) => void, o: { secret?: boolean; placeholder?: string; mono?: boolean } = {}) => (
    <label className="fr"><span className="fr-label">{label}</span>
      <span className="fr-value">
        <input className={o.mono ? 'mono' : undefined} type={o.secret ? 'password' : 'text'} value={value} placeholder={o.placeholder}
          spellCheck={false} autoComplete="off" onChange={(e) => onChange(e.target.value)} />
      </span>
    </label>
  )

  return (
    <Section label="AI">
      <Row label="Provider">
        {/* A plain select dressed as a row value; browser settings, so it stays out of undo history. */}
        <span className="pk">
          <select value={ai.provider} aria-label="Provider" onChange={(e) => { setAI({ provider: e.target.value as ProviderId }); setStatus({ kind: 'idle', text: '' }) }}>
            {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <I.updown />
        </span>
      </Row>

      {ai.provider === 'anthropic' && <>
        {field('API key', ai.anthropic.key, (v) => patch('anthropic', { key: v }), { secret: true, placeholder: 'sk-ant-…', mono: true })}
        {field('Model', ai.anthropic.model, (v) => patch('anthropic', { model: v }), { placeholder: 'claude-sonnet-5', mono: true })}
      </>}

      {ai.provider === 'openai' && <>
        {field('Base URL', ai.openai.baseUrl, (v) => patch('openai', { baseUrl: v }), { placeholder: 'https://api.openai.com/v1', mono: true })}
        {field('API key', ai.openai.key, (v) => patch('openai', { key: v }), { secret: true, placeholder: 'optional for local servers', mono: true })}
        {field('Model', ai.openai.model, (v) => patch('openai', { model: v }), { placeholder: 'model id', mono: true })}
        <p className="set-note">Any server with <span className="mono">/v1/chat/completions</span>: OpenAI, OpenRouter, LM Studio (<span className="mono">http://127.0.0.1:1234/v1</span>), Ollama (<span className="mono">http://127.0.0.1:11434/v1</span>).</p>
      </>}

      {ai.provider === 'bridge' && <>
        {field('Bridge URL', ai.bridge.url, (v) => patch('bridge', { url: v }), { placeholder: 'http://127.0.0.1:4317', mono: true })}
        {field('Token', ai.bridge.token, (v) => patch('bridge', { token: v }), { secret: true, placeholder: 'printed by the bridge', mono: true })}
        <p className="set-note">Run <span className="mono">node bridge/claude-code-bridge.mjs</span> in the Sites folder and paste the token it prints. Set <span className="mono">SITES_AI_CMD</span> to use another CLI.</p>
      </>}

      <div className="set-acts">
        <button className="btn" disabled={status.kind === 'busy'} onClick={test}>Test connection</button>
        <span className={`set-status ${status.kind}`} role="status">{status.text}</span>
      </div>
      <p className="set-note">Keys stay in this browser's storage; they are never saved in the project or its export.</p>
    </Section>
  )
}
