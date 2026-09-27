import type { SNode } from '../types'

// A 3×3 field of points for placing a stack's or grid's children: top, middle or bottom by left, centre or right.
// Rows and columns map onto the main and cross axes, so the same point means the same spot whatever the direction.

type Pos = 'start' | 'center' | 'end'
const P: Pos[] = ['start', 'center', 'end']

export function AlignMatrix({ frame, onChange }: {
  frame: SNode
  onChange: (patch: Pick<SNode, 'justify' | 'align'>) => void
}) {
  const grid = frame.layout === 'grid'
  const row = !grid && frame.dir === 'row'
  const justify = frame.justify || 'start'
  const align = frame.align || 'start'
  // In a column stack, rows are the main axis; in a row stack and a grid, columns are.
  const mainIsRows = !grid && !row
  const spread = !grid && justify === 'between'
  const stretch = align === 'stretch'
  const on = (r: number, c: number) => {
    const main = mainIsRows ? r : c
    const cross = mainIsRows ? c : r
    return (spread || P[main] === justify) && (stretch || P[cross] === align)
  }
  const pick = (r: number, c: number) => {
    const main = P[mainIsRows ? r : c]
    const cross = P[mainIsRows ? c : r]
    onChange({ justify: spread ? 'between' : main, align: stretch ? 'stretch' : cross })
  }
  const names = ['Top', 'Middle', 'Bottom']
  const cols = ['left', 'centre', 'right']
  return (
    <div className={`am ${mainIsRows ? 'am-col' : 'am-row'}`} role="grid" aria-label="Alignment">
      {[0, 1, 2].map((r) => [0, 1, 2].map((c) => (
        <button
          key={`${r}${c}`}
          className={`am-cell ${on(r, c) ? 'on' : ''}`}
          title={`${names[r]} ${cols[c]}`}
          aria-pressed={on(r, c)}
          onClick={() => pick(r, c)}
        >
          {on(r, c)
            ? <span className="am-bars" style={{ alignItems: ['flex-start', 'center', 'flex-end'][mainIsRows ? c : r] }}><i /><i /><i /></span>
            : <span className="am-dot" />}
        </button>
      )))}
    </div>
  )
}
