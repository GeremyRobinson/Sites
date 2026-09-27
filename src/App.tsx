import { useEffect } from 'react'
import { useStore } from './store'
import { ProjectGrid } from './ui/ProjectGrid'
import { Workspace } from './ui/Workspace'

export default function App() {
  const loaded = useStore((s) => s.loaded)
  const currentId = useStore((s) => s.currentId)
  useEffect(() => { useStore.getState().load() }, [])
  if (!loaded) return null
  return currentId ? <Workspace /> : <ProjectGrid />
}
