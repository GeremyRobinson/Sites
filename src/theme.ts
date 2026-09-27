// Colour and text styles: named values a project shares, with a dark-mode value for colours.
// A colour that follows a style is stored as '$' + the style's id.
import type { ColorStyle, Project, SNode, TextStyle } from './types'
import { slugify } from './cms'

export type Scheme = 'light' | 'dark'

export const styleUid = (p: string) => p + Math.random().toString(36).slice(2, 9)
export const isRef = (c: string | undefined): boolean => !!c && c.startsWith('$')
export const colorStyles = (p: { styles?: Project['styles'] } | null | undefined) => p?.styles?.colors || []
export const textStyles = (p: { styles?: Project['styles'] } | null | undefined) => p?.styles?.text || []

// The colour a value shows in a scheme. Unknown styles fall back to a neutral grey.
export function resolveColor(c: string, colors: ColorStyle[], scheme: Scheme = 'light'): string {
  if (!isRef(c)) return c
  const st = colors.find((x) => x.id === c.slice(1))
  if (!st) return '#888888'
  return scheme === 'dark' && st.dark ? st.dark : st.light
}
export const colorResolver = (colors: ColorStyle[], scheme: Scheme) => (c: string) => resolveColor(c, colors, scheme)

// Each style's CSS variable: --brand, --text-muted…, unique within the project.
export function cssVars(colors: ColorStyle[]): Map<string, string> {
  const out = new Map<string, string>()
  const used = new Set<string>()
  for (const c of colors) {
    const base = slugify(c.name) || 'color'
    let n = base
    for (let i = 2; used.has(n); i++) n = base + '-' + i
    used.add(n)
    out.set(c.id, '--' + n)
  }
  return out
}
// In code a style reads as var(--name); everything else stays as written.
export const codeColor = (colors: ColorStyle[]) => {
  const vars = cssVars(colors)
  return (c: string) => (isRef(c) ? (vars.has(c.slice(1)) ? `var(${vars.get(c.slice(1))})` : '#888888') : c)
}
// Reading code back: var(--name) → the style's reference.
export const refFromCode = (colors: ColorStyle[]) => {
  const back = new Map([...cssVars(colors)].map(([id, v]) => [v, '$' + id]))
  return (c: string) => c.replace(/^var\((--[\w-]+)\)$/, (m, v) => back.get(v) || m)
}

export function themeCss(colors: ColorStyle[]): string {
  const vars = cssVars(colors)
  const light = colors.map((c) => `  ${vars.get(c.id)}: ${c.light};`).join('\n')
  const dark = colors.filter((c) => c.dark).map((c) => `    ${vars.get(c.id)}: ${c.dark};`).join('\n')
  return `/* Colour styles, written from the canvas's Assets panel. Dark values apply when the visitor's system is dark. */
:root {
${light || '  /* no colour styles yet */'}
}
${dark ? `@media (prefers-color-scheme: dark) {\n  :root {\n${dark}\n  }\n}\n` : ''}`
}

export const TEXT_KEYS = ['fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'fontFamily', 'color'] as const
// A text style's values as a layer patch.
export const textPatch = (t: TextStyle): Partial<SNode> => ({
  fontSize: t.fontSize, fontWeight: t.fontWeight, lineHeight: t.lineHeight, letterSpacing: t.letterSpacing, fontFamily: t.fontFamily,
  ...(t.color ? { color: t.color } : {}),
})
export const matchesText = (n: SNode, t: TextStyle) =>
  n.fontSize === t.fontSize && (n.fontWeight || 400) === t.fontWeight && (n.lineHeight || 1.2) === t.lineHeight &&
  (n.letterSpacing || 0) === t.letterSpacing && (n.fontFamily || undefined) === (t.fontFamily || undefined) && (!t.color || n.color === t.color)
