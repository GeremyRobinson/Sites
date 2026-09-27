import type { ReactNode } from 'react'

// Small muted label for counts and meta, e.g. "3 pages · 1 component".
export function Tag({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`tag ${className}`}>{children}</span>
}
