import { useSyncExternalStore } from 'react'

// Provider settings live in this browser only (localStorage), never in the project, which gets exported.
export type ProviderId = 'anthropic' | 'openai' | 'bridge'

export interface AIConfig {
  provider: ProviderId
  anthropic: { key: string; model: string }
  openai: { baseUrl: string; key: string; model: string }
  bridge: { url: string; token: string }
}

export const PROVIDERS: { id: ProviderId; label: string }[] = [
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'openai', label: 'OpenAI-compatible' },
  { id: 'bridge', label: 'Local CLI (Claude Code, etc.)' },
]

const KEY = 'sites:ai'

export const DEFAULT_AI: AIConfig = {
  provider: 'anthropic',
  anthropic: { key: '', model: 'claude-sonnet-5' },
  openai: { baseUrl: 'https://api.openai.com/v1', key: '', model: '' },
  bridge: { url: 'http://127.0.0.1:4317', token: '' },
}

const read = (): AIConfig => {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT_AI
    const v = JSON.parse(raw) as Partial<AIConfig>
    return {
      provider: v.provider && PROVIDERS.some((p) => p.id === v.provider) ? v.provider : DEFAULT_AI.provider,
      anthropic: { ...DEFAULT_AI.anthropic, ...v.anthropic },
      openai: { ...DEFAULT_AI.openai, ...v.openai },
      bridge: { ...DEFAULT_AI.bridge, ...v.bridge },
    }
  } catch {
    return DEFAULT_AI
  }
}

let current: AIConfig | null = null
const listeners = new Set<() => void>()

export const getAI = (): AIConfig => (current ??= read())

export function setAI(patch: Partial<AIConfig> | ((c: AIConfig) => AIConfig)) {
  const prev = getAI()
  current = typeof patch === 'function' ? patch(prev) : { ...prev, ...patch }
  try { localStorage.setItem(KEY, JSON.stringify(current)) } catch { /* storage blocked: keep it for this session */ }
  listeners.forEach((l) => l())
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) { current = read(); l() } }
  window.addEventListener('storage', onStorage)
  return () => { listeners.delete(l); window.removeEventListener('storage', onStorage) }
}

export const useAI = () => useSyncExternalStore(subscribe, getAI)

// A short label for the panel header, like "anthropic · claude-sonnet-5".
export function describeAI(c: AIConfig) {
  if (c.provider === 'anthropic') return `anthropic · ${c.anthropic.model || 'no model'}`
  if (c.provider === 'openai') return `${hostOf(c.openai.baseUrl)} · ${c.openai.model || 'no model'}`
  return `cli · ${hostOf(c.bridge.url)}`
}

const hostOf = (u: string) => { try { return new URL(u).host } catch { return u || 'no url' } }
