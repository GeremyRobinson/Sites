// Prettier runs in the browser, loaded on first use so it stays out of the first bundle.
export const canFormat = (path: string) => /\.(tsx?|jsx?|mjs|cjs|css|json)$/i.test(path)

export async function formatCode(path: string, code: string): Promise<string> {
  const prettier = await import('prettier/standalone')
  const opts = { printWidth: 100, singleQuote: true, semi: false, trailingComma: 'all' as const }
  if (/\.css$/i.test(path)) {
    const css = await import('prettier/plugins/postcss')
    return prettier.format(code, { ...opts, parser: 'css', plugins: [css] })
  }
  if (/\.json$/i.test(path)) {
    const [babel, estree] = await Promise.all([import('prettier/plugins/babel'), import('prettier/plugins/estree')])
    return prettier.format(code, { parser: 'json', plugins: [babel, estree] })
  }
  if (!canFormat(path)) throw new Error(`No formatter for ${path.split('/').pop()}`)
  const [ts, estree] = await Promise.all([import('prettier/plugins/typescript'), import('prettier/plugins/estree')])
  return prettier.format(code, { ...opts, parser: 'typescript', plugins: [ts, estree] })
}

// Prettier syntax errors carry a location; turn them into "Line n: message".
export function formatError(e: unknown): { line: number; msg: string } {
  const err = e as { loc?: { start?: { line?: number } }; message?: string }
  const line = err?.loc?.start?.line ?? 0
  const msg = String(err?.message || e).split('\n')[0].replace(/\s*\(\d+:\d+\)\s*$/, '')
  return { line, msg }
}
