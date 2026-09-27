// Prompts for editing one file, and pulling the file back out of the reply.

export type FileKind = 'page' | 'component-page' | 'code' | 'generated'

const PAGE_RULES = `This file is synced with a visual canvas. After your edit it is parsed back into canvas layers by a strict reader, so keep to what it understands:
- keep the file shape: a default-exported function returning <main style={{ … }}> that holds one <div style={{ … }}> with the layers inside
- layers are <div>, <p>/<span>/<h1>…<h6> for text, <img>, <svg viewBox="0 0 100 100"><path /></svg>, and <a href="/route"> wrapping a layer as a link
- style is always an inline object literal whose values are numbers or 'single-quoted strings'; no variables, calls, className, hooks, state or imports
- children are only elements, plain text, or {/* Layer name */} comments before each layer
- free layers use position absolute with left/top/width/height; stacks use display 'flex' (flexDirection, gap, padding, justifyContent, alignItems); grids use display 'grid' with gridTemplateColumns 'repeat(N, 1fr)'
If a request needs something the reader can't express (hover states, media queries), say so in one sentence and make the closest version that fits.`

const COMPONENT_PAGE_RULES = PAGE_RULES.replace(
  'keep the file shape: a default-exported function returning <main style={{ … }}> that holds one <div style={{ … }}> with the layers inside',
  'keep the file shape: an exported component function that returns one <div style={{ … }}> holding its layers',
)

export function systemPrompt(kind: FileKind, explain: boolean) {
  const base = `You are editing one file of a small React 18 + TypeScript website built in Sites, a visual site builder that exports a Vite project.`
  if (explain) return `${base}\nExplain the code clearly and briefly in plain prose (short paragraphs or a short list). Do not return a rewritten file.`
  return `${base}
Return the complete updated file in exactly one \`\`\`tsx fenced code block, with no other code blocks. Before the block you may write at most two short sentences on what changed. Never elide code with comments like "rest unchanged".${kind === 'page' ? `\n\n${PAGE_RULES}` : kind === 'component-page' ? `\n\n${COMPONENT_PAGE_RULES}` : ''}`
}

export function userPrompt(o: { instruction: string; path: string; content: string; selection?: { from: number; to: number; text: string }; errors?: string; libraries?: string[] }) {
  const lang = o.path.endsWith('.css') ? 'css' : o.path.endsWith('.json') ? 'json' : 'tsx'
  let s = `File: src/${o.path}\n\n\`\`\`${lang}\n${o.content}\n\`\`\`\n`
  if (o.selection) s += `\nThe user selected lines ${o.selection.from}-${o.selection.to}; focus the change there:\n\`\`\`${lang}\n${o.selection.text}\n\`\`\`\n`
  if (o.errors) s += `\nCurrent error: ${o.errors}\n`
  if (o.libraries?.length) s += `\nLibraries available in the project: ${o.libraries.join(', ')}\n`
  return `${s}\nInstruction: ${o.instruction}`
}

// The last complete fenced block wins; a cut-off block is not treated as a file.
export function extractCode(reply: string): string | null {
  const re = /```[\w-]*[^\n]*\n([\s\S]*?)```/g
  let m: RegExpExecArray | null
  let last: string | null = null
  while ((m = re.exec(reply))) last = m[1]
  if (last !== null) return last.replace(/\s+$/, '') + '\n'
  return null
}

// The prose around the code block, for the notes line above the diff.
export const proseOf = (reply: string) => reply.replace(/```[\s\S]*?(```|$)/g, '').trim()

export const QUICK: { label: string; instruction: string; explain?: boolean; needsError?: boolean }[] = [
  { label: 'Explain', instruction: 'Explain what this file does and how it is structured.', explain: true },
  { label: 'Fix errors', instruction: 'Fix the errors in this file so it compiles and parses. Change as little as possible.', needsError: true },
  { label: 'Make responsive', instruction: 'Make this layout work well from 360px phone widths up to wide desktop screens.' },
  { label: 'Add hover states', instruction: 'Add tasteful hover and focus states to the interactive elements (links, buttons, cards).' },
]
