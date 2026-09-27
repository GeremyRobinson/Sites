import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import { snippetCompletion } from '@codemirror/autocomplete'

const TAGS = 'div section main header footer nav article aside a p span h1 h2 h3 h4 h5 h6 img button ul ol li svg path form input label textarea select option figure figcaption video br hr strong em small code pre blockquote'.split(' ')

const ATTRS = 'className style onClick onChange onSubmit onMouseEnter onMouseLeave href src alt title key id role type value placeholder disabled target rel viewBox d fill stroke strokeWidth width height aria-label'.split(' ')

const STYLE_KEYS = ('position top right bottom left zIndex display flexDirection flexWrap flex flexGrow flexShrink flexBasis gap rowGap columnGap alignItems alignSelf justifyContent justifyItems ' +
  'gridTemplateColumns gridTemplateRows gridColumn gridRow width height minWidth minHeight maxWidth maxHeight margin marginTop marginRight marginBottom marginLeft ' +
  'padding paddingTop paddingRight paddingBottom paddingLeft background backgroundColor backgroundImage backgroundSize backgroundPosition color opacity ' +
  'border borderTop borderRight borderBottom borderLeft borderColor borderWidth borderStyle borderRadius boxShadow outline overflow overflowX overflowY ' +
  'fontFamily fontSize fontWeight fontStyle fontVariationSettings lineHeight letterSpacing textAlign textDecoration textTransform whiteSpace wordBreak ' +
  'objectFit objectPosition transform transformOrigin transition animation cursor pointerEvents userSelect aspectRatio inset filter backdropFilter mixBlendMode').split(' ')

const HOOKS = 'useState useEffect useRef useMemo useCallback useReducer useContext useLayoutEffect useId useTransition useDeferredValue'.split(' ')

const tagOptions: Completion[] = TAGS.map((label) => ({ label, type: 'type', boost: ['div', 'p', 'a', 'img', 'section'].includes(label) ? 2 : 0 }))
const attrOptions: Completion[] = ATTRS.map((label) => ({ label, type: 'property' }))
const styleOptions: Completion[] = STYLE_KEYS.map((label) => ({ label, type: 'property', detail: 'style' }))
const reactOptions: Completion[] = [
  ...HOOKS.map((label) => ({ label, type: 'function', detail: 'react' })),
  snippetCompletion('const [${value}, set${Value}] = useState(${initial})', { label: 'useState', type: 'keyword', detail: 'snippet' }),
  snippetCompletion('useEffect(() => {\n\t${}\n}, [${deps}])', { label: 'useEffect', type: 'keyword', detail: 'snippet' }),
  snippetCompletion("style={{ ${} }}", { label: 'style', type: 'keyword', detail: 'snippet' }),
  snippetCompletion('export function ${Name}() {\n\treturn (\n\t\t<div>${}</div>\n\t)\n}', { label: 'component', type: 'keyword', detail: 'snippet' }),
]

// JSX tags after "<", attributes inside an open tag, style keys inside style={{ }}, and React hooks elsewhere.
export function jsxCompletions(components: () => string[]) {
  return (ctx: CompletionContext): CompletionResult | null => {
    const before = ctx.state.sliceDoc(Math.max(0, ctx.pos - 400), ctx.pos)
    const tag = before.match(/<\/?([A-Za-z][\w.]*)?$/)
    if (tag) {
      const from = ctx.pos - (tag[1]?.length ?? 0)
      return { from, options: [...tagOptions, ...components().map((label) => ({ label, type: 'class', boost: 3 }))], validFor: /^[\w.]*$/ }
    }
    const word = ctx.matchBefore(/[\w$-]*/)
    if (!word || (word.from === word.to && !ctx.explicit)) return null
    // Inside style={{ … }} with no closing }} yet: offer style keys at key position.
    const style = before.match(/style=\{\{([^{}]*)$/)
    if (style && /(^|[,{]\s*|\n\s*)[\w$]*$/.test(style[1])) return { from: word.from, options: styleOptions, validFor: /^[\w$]*$/ }
    // Inside an open JSX tag: offer attributes.
    const open = before.match(/<[A-Za-z][\w.]*(\s+[^<>]*)?$/)
    if (open && /\s[\w-]*$/.test(before) && !/=\s*\{[^}]*$/.test(open[1] || '') && !/=\s*["'][^"']*$/.test(open[1] || '')) {
      return { from: word.from, options: attrOptions, validFor: /^[\w-]*$/ }
    }
    return { from: word.from, options: reactOptions, validFor: /^[\w$]*$/ }
  }
}
