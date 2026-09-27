// Line diff via longest common subsequence, with common prefix and suffix trimmed first.
export type DiffOp = { t: ' ' | '-' | '+'; text: string; a?: number; b?: number }

const MAX_CELLS = 4_000_000

export function lineDiff(before: string, after: string): DiffOp[] {
  const a = before.replace(/\n$/, '').split('\n')
  const b = after.replace(/\n$/, '').split('\n')
  let pre = 0
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++
  let suf = 0
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++
  const am = a.slice(pre, a.length - suf)
  const bm = b.slice(pre, b.length - suf)
  const out: DiffOp[] = []
  for (let i = 0; i < pre; i++) out.push({ t: ' ', text: a[i], a: i + 1, b: i + 1 })

  const n = am.length
  const m = bm.length
  if (n * m > MAX_CELLS) {
    // Too big to compare line by line: show the middle as replaced.
    am.forEach((text, i) => out.push({ t: '-', text, a: pre + i + 1 }))
    bm.forEach((text, j) => out.push({ t: '+', text, b: pre + j + 1 }))
  } else {
    // lcs[i][j] = LCS length of am[i..] and bm[j..], stored flat.
    const w = m + 1
    const lcs = new Uint32Array((n + 1) * w)
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        lcs[i * w + j] = am[i] === bm[j] ? lcs[(i + 1) * w + j + 1] + 1 : Math.max(lcs[(i + 1) * w + j], lcs[i * w + j + 1])
      }
    }
    let i = 0
    let j = 0
    while (i < n || j < m) {
      if (i < n && j < m && am[i] === bm[j]) { out.push({ t: ' ', text: am[i], a: pre + i + 1, b: pre + j + 1 }); i++; j++ }
      else if (j < m && (i >= n || lcs[i * w + j + 1] >= lcs[(i + 1) * w + j])) { out.push({ t: '+', text: bm[j], b: pre + j + 1 }); j++ }
      else { out.push({ t: '-', text: am[i], a: pre + i + 1 }); i++ }
    }
  }
  for (let k = 0; k < suf; k++) {
    const ai = a.length - suf + k
    const bi = b.length - suf + k
    out.push({ t: ' ', text: a[ai], a: ai + 1, b: bi + 1 })
  }
  return out
}

export type Hunk = { kind: 'ops'; ops: DiffOp[] } | { kind: 'skip'; count: number }

// Collapses long unchanged runs, keeping a few lines of context around each change.
export function hunks(ops: DiffOp[], context = 3): Hunk[] {
  const keep = ops.map(() => false)
  ops.forEach((op, i) => {
    if (op.t === ' ') return
    for (let k = Math.max(0, i - context); k <= Math.min(ops.length - 1, i + context); k++) keep[k] = true
  })
  const out: Hunk[] = []
  let i = 0
  while (i < ops.length) {
    if (keep[i]) {
      const run: DiffOp[] = []
      while (i < ops.length && keep[i]) run.push(ops[i++])
      out.push({ kind: 'ops', ops: run })
    } else {
      let count = 0
      while (i < ops.length && !keep[i]) { count++; i++ }
      out.push({ kind: 'skip', count })
    }
  }
  return out
}

export const diffStats = (ops: DiffOp[]) => ({
  added: ops.filter((o) => o.t === '+').length,
  removed: ops.filter((o) => o.t === '-').length,
})
