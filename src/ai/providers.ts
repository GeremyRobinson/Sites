import { getAI, type AIConfig } from './settings'
import { readSSE } from './sse'

export interface AIRequest {
  system: string
  prompt: string
  // Passed to the local bridge for context; the prompt already contains the file.
  file?: string
  content?: string
  signal?: AbortSignal
  onText: (chunk: string) => void
}

const trimSlash = (u: string) => u.trim().replace(/\/+$/, '')

// Turns fetch failures into something a person can act on.
function netError(e: unknown, where: string): Error {
  if (e instanceof DOMException && e.name === 'AbortError') return e
  const msg = e instanceof Error ? e.message : String(e)
  if (/failed to fetch|networkerror|load failed/i.test(msg)) {
    return new Error(`Could not reach ${where}. The network may be blocked here (sandboxed viewer, CORS, or the server is not running).`)
  }
  return e instanceof Error ? e : new Error(msg)
}

async function httpError(res: Response, where: string): Promise<Error> {
  let detail = ''
  try {
    const text = await res.text()
    try {
      const j = JSON.parse(text)
      detail = j?.error?.message || j?.error || j?.message || text
    } catch { detail = text }
  } catch { /* body unreadable */ }
  return new Error(`${where} ${res.status}${detail ? `: ${String(detail).slice(0, 400)}` : ''}`)
}

async function post(url: string, headers: Record<string, string>, body: unknown, where: string, signal?: AbortSignal) {
  let res: Response
  try {
    res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal })
  } catch (e) { throw netError(e, where) }
  if (!res.ok) throw await httpError(res, where)
  return res
}

const anthropicHeaders = (c: AIConfig) => ({
  'x-api-key': c.anthropic.key.trim(),
  'anthropic-version': '2023-06-01',
  'anthropic-dangerous-direct-browser-access': 'true',
})

async function anthropic(c: AIConfig, r: AIRequest) {
  if (!c.anthropic.key.trim()) throw new Error('No Anthropic API key. Add one in Project settings under AI.')
  const res = await post('https://api.anthropic.com/v1/messages', anthropicHeaders(c), {
    model: c.anthropic.model.trim() || 'claude-sonnet-5',
    max_tokens: 64000,
    stream: true,
    system: r.system,
    messages: [{ role: 'user', content: r.prompt }],
  }, 'Anthropic', r.signal)
  for await (const ev of readSSE(res, r.signal)) {
    if (ev.event === 'ping') continue
    let j: { type?: string; delta?: { type?: string; text?: string; stop_reason?: string }; error?: { message?: string } }
    try { j = JSON.parse(ev.data) } catch { continue }
    if (j.type === 'content_block_delta' && j.delta?.type === 'text_delta' && j.delta.text) r.onText(j.delta.text)
    else if (j.type === 'error') throw new Error(`Anthropic: ${j.error?.message || 'stream error'}`)
    else if (j.type === 'message_delta' && j.delta?.stop_reason === 'refusal') throw new Error('The model declined this request.')
    else if (j.type === 'message_stop') break
  }
}

async function openai(c: AIConfig, r: AIRequest) {
  const base = trimSlash(c.openai.baseUrl)
  if (!base) throw new Error('No base URL. Set one in Project settings under AI.')
  if (!c.openai.model.trim()) throw new Error('No model. Set one in Project settings under AI.')
  const headers: Record<string, string> = c.openai.key.trim() ? { authorization: `Bearer ${c.openai.key.trim()}` } : {}
  const res = await post(`${base}/chat/completions`, headers, {
    model: c.openai.model.trim(),
    stream: true,
    messages: [{ role: 'system', content: r.system }, { role: 'user', content: r.prompt }],
  }, base, r.signal)
  for await (const ev of readSSE(res, r.signal)) {
    if (ev.data === '[DONE]') break
    let j: { choices?: { delta?: { content?: string } }[]; error?: { message?: string } }
    try { j = JSON.parse(ev.data) } catch { continue }
    if (j.error) throw new Error(j.error.message || 'stream error')
    const t = j.choices?.[0]?.delta?.content
    if (t) r.onText(t)
  }
}

async function bridge(c: AIConfig, r: AIRequest) {
  const base = trimSlash(c.bridge.url)
  if (!c.bridge.token.trim()) throw new Error('No bridge token. Run node bridge/claude-code-bridge.mjs and paste the token it prints into Project settings under AI.')
  const res = await post(`${base}/run`, { authorization: `Bearer ${c.bridge.token.trim()}` }, {
    prompt: `${r.system}\n\n${r.prompt}`, file: r.file, content: r.content,
  }, `the bridge at ${base}`, r.signal)
  for await (const ev of readSSE(res, r.signal)) {
    if (ev.event === 'done') break
    let j: { text?: string; error?: string }
    try { j = JSON.parse(ev.data) } catch { continue }
    if (ev.event === 'error' || j.error) throw new Error(j.error || 'bridge error')
    if (j.text) r.onText(j.text)
  }
}

export async function streamAI(r: AIRequest, c = getAI()) {
  if (c.provider === 'anthropic') return anthropic(c, r)
  if (c.provider === 'openai') return openai(c, r)
  return bridge(c, r)
}

async function get(url: string, headers: Record<string, string>, where: string) {
  let res: Response
  try { res = await fetch(url, { headers }) } catch (e) { throw netError(e, where) }
  if (!res.ok) throw await httpError(res, where)
  return res.json().catch(() => ({}))
}

// Checks credentials without generating anything. Resolves to a one-line status.
export async function testAI(c = getAI()): Promise<string> {
  if (c.provider === 'anthropic') {
    if (!c.anthropic.key.trim()) throw new Error('Add an API key first.')
    const model = c.anthropic.model.trim() || 'claude-sonnet-5'
    const j = await get(`https://api.anthropic.com/v1/models/${encodeURIComponent(model)}`, anthropicHeaders(c), 'Anthropic')
    return `Connected. ${j.display_name || model} is available.`
  }
  if (c.provider === 'openai') {
    const base = trimSlash(c.openai.baseUrl)
    if (!base) throw new Error('Add a base URL first.')
    const j = await get(`${base}/models`, c.openai.key.trim() ? { authorization: `Bearer ${c.openai.key.trim()}` } : {}, base)
    const ids: string[] = Array.isArray(j.data) ? j.data.map((m: { id: string }) => m.id) : []
    const model = c.openai.model.trim()
    if (!model) return `Connected. ${ids.length} models listed; pick one.`
    return ids.length && !ids.includes(model) ? `Connected, but ${model} is not in the ${ids.length} models listed.` : `Connected. ${model} is available.`
  }
  const base = trimSlash(c.bridge.url)
  if (!c.bridge.token.trim()) throw new Error('Paste the token the bridge printed first.')
  const j = await get(`${base}/health`, { authorization: `Bearer ${c.bridge.token.trim()}` }, `the bridge at ${base}`)
  return `Connected. Bridge runs ${j.cmd || 'its CLI'}.`
}
