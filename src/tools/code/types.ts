import type { TagColor } from '../../types'

export interface VFile {
  path: string
  content: string
  readonly: boolean
  id?: string
  pageId?: string
  component?: boolean
  tag?: TagColor
}

export type SyncError = { line: number; msg: string }

export const fileName = (path: string) => path.split('/').pop() || path

export const MODES = ['auto', 'light', 'dark'] as const
export type Mode = (typeof MODES)[number]
