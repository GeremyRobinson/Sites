import type { Asset } from '../types'
import { uid } from '../store'

const readAs = (file: File, how: 'url' | 'text') =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    how === 'url' ? r.readAsDataURL(file) : r.readAsText(file)
  })

const imageSize = (src: string) =>
  new Promise<{ w: number; h: number }>((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth || 400, h: img.naturalHeight || 300 })
    img.onerror = () => resolve({ w: 400, h: 300 })
    img.src = src
  })

export async function fileToAsset(file: File): Promise<Asset | null> {
  const name = file.name
  if (file.type.startsWith('image/')) {
    const data = await readAs(file, 'url')
    const { w, h } = await imageSize(data)
    return { id: uid('a_'), name, kind: 'image', mime: file.type, data, w, h }
  }
  if (/\.(ttf|otf|woff2?)$/i.test(name)) {
    const data = await readAs(file, 'url')
    return { id: uid('a_'), name, kind: 'font', mime: file.type || 'font/ttf', data }
  }
  if (file.type.startsWith('text/') || /\.(md|txt)$/i.test(name)) {
    return { id: uid('a_'), name, kind: 'text', mime: 'text/plain', data: await readAs(file, 'text') }
  }
  return null
}

export const readText = (file: File) => readAs(file, 'text')

// Register uploaded fonts with the browser so text layers can use them.
const loaded = new Set<string>()
export function registerFont(a: Asset) {
  if (a.kind !== 'font' || loaded.has(a.id)) return
  loaded.add(a.id)
  const family = fontFamilyOf(a)
  new FontFace(family, `url(${a.data})`).load().then((f) => document.fonts.add(f)).catch(() => loaded.delete(a.id))
}
export const fontFamilyOf = (a: Asset) => a.name.replace(/\.[^.]+$/, '')
