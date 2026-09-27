import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, crosshairCursor } from '@codemirror/view'
import { Annotation, EditorState, type Extension } from '@codemirror/state'
import { history, historyKeymap, defaultKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching, foldGutter, foldKeymap, indentOnInput, syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete'
import { search, searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { lintGutter, lintKeymap } from '@codemirror/lint'
import { javascript } from '@codemirror/lang-javascript'
import { tags as t } from '@lezer/highlight'
import { jsxCompletions } from './complete'

// Marks transactions that load text from outside (canvas edits, AI apply) so they aren't echoed back.
export const External = Annotation.define<boolean>()

// Classes only; colours come from the theme variables in code.css.
const classes = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.definitionKeyword, t.operatorKeyword, t.modifier, t.self], class: 't-kw' },
  { tag: [t.string, t.special(t.string), t.regexp, t.character], class: 't-str' },
  { tag: [t.number, t.bool, t.null, t.atom], class: 't-num' },
  { tag: [t.tagName, t.standard(t.tagName)], class: 't-tag' },
  { tag: [t.attributeName, t.propertyName, t.definition(t.propertyName)], class: 't-attr' },
  { tag: [t.typeName, t.className, t.namespace, t.standard(t.typeName)], class: 't-type' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], class: 't-fn' },
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], class: 't-com' },
  { tag: [t.punctuation, t.bracket, t.angleBracket, t.separator, t.derefOperator], class: 't-pun' },
  { tag: [t.operator, t.compareOperator, t.arithmeticOperator, t.logicOperator], class: 't-op' },
  { tag: t.invalid, class: 't-bad' },
])

export function languageFor(path: string): Extension {
  if (/\.(tsx|ts|mts)$/.test(path)) return javascript({ jsx: /x$/.test(path), typescript: true })
  if (/\.(jsx|js|mjs|cjs|json)$/.test(path)) return javascript({ jsx: /x$/.test(path) })
  return []
}

export interface Hooks {
  onFormat: () => void
  onSave: () => void
  components: () => string[]
}

// Everything except the settings-bound parts (wrap, line numbers, read-only), which live in compartments.
export function baseExtensions(path: string, hooks: Hooks): Extension[] {
  // Language data must return the same source object each time, or completion restarts on every update.
  const completions = [{ autocomplete: jsxCompletions(hooks.components) }]
  return [
    highlightSpecialChars(),
    history(),
    foldGutter({ markerDOM: (open) => { const s = document.createElement('span'); s.className = 'cm-fold'; s.textContent = open ? '−' : '+'; return s } }),
    lintGutter(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    EditorState.tabSize.of(2),
    indentOnInput(),
    syntaxHighlighting(classes),
    bracketMatching(),
    closeBrackets(),
    autocompletion({ icons: false }),
    EditorState.languageData.of(() => completions),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightActiveLineGutter(),
    highlightSelectionMatches(),
    search({ top: true }),
    keymap.of([
      { key: 'Mod-s', preventDefault: true, run: () => { hooks.onSave(); return true } },
      { key: 'Shift-Alt-f', preventDefault: true, run: () => { hooks.onFormat(); return true } },
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...completionKeymap,
      ...lintKeymap,
      indentWithTab,
    ]),
    languageFor(path),
  ]
}

export const wrapExt = (on: boolean): Extension => (on ? EditorView.lineWrapping : [])
export const numbersExt = (on: boolean): Extension => (on ? lineNumbers() : [])
export const readonlyExt = (on: boolean): Extension => [EditorState.readOnly.of(on)]

// Smallest single change that turns a into b, so cursor and scroll stay put on outside updates.
export function minimalChange(a: string, b: string) {
  let s = 0
  const max = Math.min(a.length, b.length)
  while (s < max && a.charCodeAt(s) === b.charCodeAt(s)) s++
  let e = 0
  while (e < max - s && a.charCodeAt(a.length - 1 - e) === b.charCodeAt(b.length - 1 - e)) e++
  return { from: s, to: a.length - e, insert: b.slice(s, b.length - e) }
}
