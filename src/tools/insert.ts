import { activeViewPage, useStore } from '../store'
import type { SNode } from '../types'

// Drop new layers into the middle of the current artboard and bring the canvas forward.
export function insertCentered(nodes: SNode[]) {
  const st = useStore.getState()
  const p = st.projects.find((x) => x.id === st.currentId)
  const pg = activeViewPage()
  if (!p || !pg) return
  const offset = (pg.nodes.length % 6) * 16
  st.addNodes(nodes.map((n) => ({ ...n, x: Math.round((pg.width - n.w) / 2) + offset, y: Math.round((pg.height - n.h) / 2) + offset })))
  if (!p.windows.canvas.open) st.toggleWindow('canvas', true)
}
