// Minimal Server-Sent Events reader for fetch responses.
export interface SSEvent { event: string; data: string }

export async function* readSSE(res: Response, signal?: AbortSignal): AsyncGenerator<SSEvent> {
  if (!res.body) throw new Error('Empty response body')
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  const onAbort = () => { reader.cancel().catch(() => {}) }
  signal?.addEventListener('abort', onAbort)
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true }).replace(/\r\n?/g, '\n')
      let cut: number
      while ((cut = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, cut)
        buf = buf.slice(cut + 2)
        const ev = parseBlock(block)
        if (ev) yield ev
      }
    }
    const ev = parseBlock(buf)
    if (ev) yield ev
  } finally {
    signal?.removeEventListener('abort', onAbort)
  }
}

function parseBlock(block: string): SSEvent | null {
  let event = 'message'
  const data: string[] = []
  for (const line of block.split('\n')) {
    if (!line || line.startsWith(':')) continue
    const i = line.indexOf(':')
    const field = i < 0 ? line : line.slice(0, i)
    const value = i < 0 ? '' : line.slice(i + 1).replace(/^ /, '')
    if (field === 'event') event = value
    else if (field === 'data') data.push(value)
  }
  return data.length ? { event, data: data.join('\n') } : null
}
