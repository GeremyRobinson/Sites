import { useEffect, useState } from 'react'
import { Seg } from './controls'

export type ThemePref = 'light' | 'dark' | 'system'
const KEY = 'sites:theme'
const media = () => window.matchMedia('(prefers-color-scheme: dark)')

const read = (): ThemePref => {
  try { const v = localStorage.getItem(KEY); if (v === 'light' || v === 'dark' || v === 'system') return v } catch { /* storage blocked */ }
  return 'system'
}

const listeners = new Set<() => void>()
let pref: ThemePref = read()

function apply() {
  const dark = pref === 'dark' || (pref === 'system' && media().matches)
  document.documentElement.setAttribute('data-sites-theme', dark ? 'dark' : 'light')
  listeners.forEach((l) => l())
}
apply()
media().addEventListener('change', () => pref === 'system' && apply())

export function setThemePref(p: ThemePref) {
  pref = p
  try { localStorage.setItem(KEY, p) } catch { /* storage blocked */ }
  apply()
}

export function useTheme() {
  const [, force] = useState(0)
  useEffect(() => {
    const l = () => force((n) => n + 1)
    listeners.add(l)
    return () => { listeners.delete(l) }
  }, [])
  return { pref, dark: document.documentElement.getAttribute('data-sites-theme') === 'dark' }
}

// Light · Dark · System, as a sliding pill.
export function ThemeSwitch() {
  const { pref: current } = useTheme()
  return (
    <div className="theme-switch">
      <Seg value={current} options={[['light', 'Light'], ['dark', 'Dark'], ['system', 'System']]} onChange={setThemePref} undo={false} />
    </div>
  )
}
