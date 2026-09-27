import { useEffect, useState } from 'react'

// Two-step button: first click arms it, second click runs it. Avoids browser confirm() dialogs.
export function ConfirmButton({ label, confirmLabel, onConfirm, className }: { label: string; confirmLabel: string; onConfirm: () => void; className?: string }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 3000)
    return () => clearTimeout(t)
  }, [armed])
  return (
    <button className={className} style={armed ? { color: 'var(--danger)' } : undefined} onClick={() => (armed ? onConfirm() : setArmed(true))}>
      {armed ? confirmLabel : label}
    </button>
  )
}
