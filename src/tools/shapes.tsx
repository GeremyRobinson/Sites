// Preset shapes for the canvas Shapes menu. Paths live in a 100 × 100 box.
const poly = (n: number, inner?: number) => {
  const pts: string[] = []
  const steps = inner ? n * 2 : n
  for (let i = 0; i < steps; i++) {
    const r = inner && i % 2 ? inner : 50
    const a = (Math.PI * 2 * i) / steps - Math.PI / 2
    pts.push(`${(50 + r * Math.cos(a)).toFixed(2)} ${(50 + r * Math.sin(a)).toFixed(2)}`)
  }
  return 'M' + pts.join(' L') + ' Z'
}

export type Preset = { name: string; kind: 'rect' | 'ellipse' | 'path'; d?: string; radius?: number; line?: boolean; key?: string }

export const PRESETS: Preset[] = [
  { name: 'Rectangle', kind: 'rect', key: 'R' },
  { name: 'Rounded', kind: 'rect', radius: 24 },
  { name: 'Oval', kind: 'ellipse', key: 'O' },
  { name: 'Triangle', kind: 'path', d: 'M50 0 L100 100 L0 100 Z' },
  { name: 'Diamond', kind: 'path', d: 'M50 0 L100 50 L50 100 L0 50 Z' },
  { name: 'Hexagon', kind: 'path', d: poly(6) },
  { name: 'Star', kind: 'path', d: poly(5, 20) },
  { name: 'Burst', kind: 'path', d: poly(12, 38) },
  { name: 'Arrow', kind: 'path', d: 'M0 38 L58 38 L58 12 L100 50 L58 88 L58 62 L0 62 Z' },
  { name: 'Plus', kind: 'path', d: 'M36 0 L64 0 L64 36 L100 36 L100 64 L64 64 L64 100 L36 100 L36 64 L0 64 L0 36 L36 36 Z' },
  { name: 'Blob', kind: 'path', d: 'M54 2 C80 4 99 24 96 52 C93 78 72 99 46 96 C20 93 2 74 5 47 C8 22 28 0 54 2 Z' },
  { name: 'Line', kind: 'path', d: 'M0 50 L100 50', line: true },
  { name: 'Wave', kind: 'path', d: 'M0 50 C12 10 25 10 37 50 C50 90 62 90 75 50 C87 10 100 10 100 30', line: true },
]

export const flipPath = (d: string, axis: 'x' | 'y') =>
  d.replace(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g, (_, x, y) =>
    axis === 'x' ? `${(100 - parseFloat(x)).toFixed(2)} ${y}` : `${x} ${(100 - parseFloat(y)).toFixed(2)}`)

export function PresetIcon({ p, size = 28 }: { p: Preset; size?: number }) {
  return (
    <svg viewBox="-4 -4 108 108" width={size} height={size} aria-hidden>
      {p.kind === 'rect' && <rect x="0" y="0" width="100" height="100" rx={p.radius ? 22 : 0} fill="currentColor" />}
      {p.kind === 'ellipse' && <ellipse cx="50" cy="50" rx="50" ry="50" fill="currentColor" />}
      {p.kind === 'path' && <path d={p.d} fill={p.line ? 'none' : 'currentColor'} stroke={p.line ? 'currentColor' : 'none'} strokeWidth={p.line ? 8 : 0} strokeLinecap="round" />}
    </svg>
  )
}
