import { useEffect, useState } from 'react'

const listeners = new Set<(m: string) => void>()
export const toast = (m: string) => listeners.forEach((l) => l(m))

export function Toaster() {
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => {
    let t: number
    const l = (m: string) => { setMsg(m); clearTimeout(t); t = window.setTimeout(() => setMsg(null), 1800) }
    listeners.add(l)
    return () => { listeners.delete(l) }
  }, [])
  return msg ? <div className="toast">{msg}</div> : null
}
