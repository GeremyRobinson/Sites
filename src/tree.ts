import type { Page, SNode } from './types'

export const childrenOf = (nodes: SNode[], parentId?: string) => nodes.filter((n) => (n.parentId || undefined) === (parentId || undefined))

export const byId = (nodes: SNode[]) => new Map(nodes.map((n) => [n.id, n]))

export function descendantIds(nodes: SNode[], id: string): Set<string> {
  const out = new Set<string>()
  const walk = (pid: string) => { for (const n of nodes) if (n.parentId === pid && !out.has(n.id)) { out.add(n.id); walk(n.id) } }
  walk(id)
  return out
}

export function ancestors(nodes: SNode[], id: string): SNode[] {
  const map = byId(nodes)
  const out: SNode[] = []
  let cur = map.get(id)
  while (cur?.parentId) { const p = map.get(cur.parentId); if (!p || out.includes(p)) break; out.push(p); cur = p }
  return out
}

export const parentOf = (nodes: SNode[], n: SNode) => (n.parentId ? nodes.find((x) => x.id === n.parentId) : undefined)

// A child of a stack or grid sits in the flow; its x/y are ignored.
export const inFlow = (nodes: SNode[], n: SNode) => {
  const p = parentOf(nodes, n)
  return !!p && (p.layout === 'stack' || p.layout === 'grid')
}

export const isContainer = (n: SNode) => n.type === 'frame'

// Drops ids whose ancestor is also in the list, so subtrees are handled once.
export function topmost(nodes: SNode[], ids: string[]): string[] {
  const set = new Set(ids)
  return ids.filter((id) => !ancestors(nodes, id).some((a) => set.has(a.id)))
}

// Copies subtrees with fresh ids, keeping internal parent links.
export function cloneSubtrees(nodes: SNode[], ids: string[], makeId: () => string): SNode[] {
  const roots = topmost(nodes, ids)
  const include = new Set<string>()
  for (const r of roots) { include.add(r); descendantIds(nodes, r).forEach((d) => include.add(d)) }
  const remap = new Map<string, string>()
  for (const n of nodes) if (include.has(n.id)) remap.set(n.id, makeId())
  return nodes.filter((n) => include.has(n.id)).map((n) => ({
    ...structuredClone(n),
    id: remap.get(n.id)!,
    parentId: n.parentId && remap.has(n.parentId) ? remap.get(n.parentId) : n.parentId,
  }))
}

// Moves nodes (with their descendants) to sit among newParent's children at index.
export function moveInto(nodes: SNode[], ids: string[], newParent: string | undefined, index: number): SNode[] {
  const moving = new Set(ids)
  const siblings = childrenOf(nodes, newParent).filter((n) => !moving.has(n.id))
  const before = siblings[index]
  const moved = nodes.filter((n) => moving.has(n.id)).map((n) => ({ ...n, parentId: newParent }))
  const rest = nodes.filter((n) => !moving.has(n.id))
  const at = before ? rest.indexOf(before) : rest.length
  return [...rest.slice(0, at), ...moved, ...rest.slice(at)]
}

// Component pages that this component (transitively) uses, to stop an instance nesting itself.
export function componentUses(pages: Page[], compId: string, seen = new Set<string>()): Set<string> {
  const pg = pages.find((p) => p.id === compId)
  if (!pg || seen.has(compId)) return seen
  seen.add(compId)
  for (const n of pg.nodes) if (n.type === 'instance' && n.componentId) componentUses(pages, n.componentId, seen)
  return seen
}
