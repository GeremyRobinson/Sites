export type NodeType = 'frame' | 'text' | 'rect' | 'ellipse' | 'image' | 'path' | 'instance'
export type Layout = 'free' | 'stack' | 'grid'
export type SizeMode = 'fixed' | 'fill' | 'fit'
export type Breakpoint = 'desktop' | 'tablet' | 'phone'
export type TagColor = 'yellow' | 'blue' | 'pink' | 'orange' | 'green' | 'violet'

export interface SNode {
  id: string
  type: NodeType
  name: string
  x: number
  y: number
  w: number
  h: number
  rotation: number
  opacity: number
  fill: string
  stroke: string
  strokeWidth: number
  radius: number
  hidden?: boolean
  locked?: boolean
  // tree: children point at their parent; order among siblings is array order
  parentId?: string
  wMode?: SizeMode
  hMode?: SizeMode
  tag?: TagColor
  // frame layout
  layout?: Layout
  dir?: 'row' | 'column'
  gap?: number
  pad?: number
  align?: 'start' | 'center' | 'end' | 'stretch'
  justify?: 'start' | 'center' | 'end' | 'between'
  wrap?: boolean
  cols?: number
  // instance of a component
  componentId?: string
  // text
  text?: string
  fontSize?: number
  fontWeight?: number
  lineHeight?: number
  letterSpacing?: number
  color?: string
  textAlign?: 'left' | 'center' | 'right'
  mono?: boolean
  fontFamily?: string
  // image
  assetId?: string
  fit?: 'cover' | 'contain'
  // path, in a 0..100 unit box
  d?: string
  // link to another page, or to a web address
  link?: string
  href?: string
  newTab?: boolean
  // named styles: a text style this layer follows (colours reference styles as '$' + id)
  textStyle?: string
  textTransform?: 'uppercase' | 'lowercase' | 'capitalize'
  textDecoration?: 'underline' | 'line-through'
  alt?: string
  // effects
  shadow?: { x: number; y: number; blur: number; spread?: number; color: string }
  blur?: number
  bgBlur?: number
  clip?: boolean // frames clip their content unless this is false
  cursor?: 'pointer' | 'default' | 'text' | 'grab'
  hover?: { opacity?: number; scale?: number; y?: number; fill?: string; color?: string }
  appear?: { opacity?: number; y?: number; scale?: number; duration?: number; delay?: number }
  // inside a component: which of this layer's properties come from the component's variables
  use?: { text?: string; fill?: string; color?: string; image?: string; visible?: string; link?: string }
  // on an instance: the value of each variable, and variables connected to CMS fields
  props?: Record<string, string | number | boolean>
  propBind?: Record<string, string>
  // CMS: a frame that repeats its first child once per item of a collection
  list?: { collection: string; limit?: number; sort?: string; desc?: boolean }
  // CMS: the collection field this text or image shows (inside a list, or on a collection's page)
  bind?: string
  // changes made in the tablet and phone views; each view inherits from the one above it
  bp?: { tablet?: Partial<SNode>; phone?: Partial<SNode> }
}

// A narrower view of a page. Present means shown on the canvas and exported as a breakpoint.
export interface View {
  width: number
  height: number
}

// A component's variable: something each instance can set, like a title or a colour.
export type VarType = 'text' | 'color' | 'image' | 'toggle' | 'link' | 'number'
export interface Variable {
  id: string
  name: string
  key: string
  type: VarType
  value: string | number | boolean
}

export interface Page {
  id: string
  kind?: 'page' | 'component'
  vars?: Variable[]
  // a page shown once per item of this collection, at path/:slug
  collection?: string
  tag?: TagColor
  name: string
  path: string
  width: number
  height: number
  background: string
  nodes: SNode[]
  views?: { tablet?: View; phone?: View }
}

export interface CodeFile {
  id: string
  path: string
  content: string
  tag?: TagColor
}

export interface Asset {
  id: string
  name: string
  kind: 'image' | 'font' | 'text'
  mime: string
  data: string // data URL, or raw text for text assets
  w?: number
  h?: number
}

export type ToolId = 'code' | 'canvas' | 'media' | 'cms' | 'settings'

export interface WinState {
  open: boolean
  x: number
  y: number
  w: number
  h: number
  z: number
  maximized?: boolean
  settings: Record<string, string | number | boolean>
}

// CMS: collections of items with typed fields, like a small spreadsheet per content type.
export type FieldType = 'text' | 'long' | 'image' | 'number' | 'date' | 'link' | 'toggle' | 'color'
export interface Field {
  id: string
  name: string
  key: string
  type: FieldType
}
export interface CmsItem {
  id: string
  slug: string
  draft?: boolean
  values: Record<string, string | number | boolean | undefined>
}
export interface Collection {
  id: string
  name: string
  slug: string
  fields: Field[]
  items: CmsItem[]
}

// Named colours with an optional dark-mode value, and named text looks.
export interface ColorStyle {
  id: string
  name: string
  light: string
  dark?: string
}
export interface TextStyle {
  id: string
  name: string
  fontSize: number
  fontWeight: number
  lineHeight: number
  letterSpacing: number
  fontFamily?: string
  color?: string
}

export interface Project {
  id: string
  name: string
  description: string
  createdAt: number
  updatedAt: number
  pages: Page[]
  files: CodeFile[]
  assets: Asset[]
  cms?: Collection[]
  styles?: { colors: ColorStyle[]; text: TextStyle[] }
  settings: {
    siteTitle: string
    font: string
    accent: string
    repo: string
    libraries?: string[]
    viewsFitted?: boolean
    // tablet and phone fit themselves to desktop live (stored one-off fits were dropped)
    viewsAuto?: boolean
    // the starter guide project
    guide?: boolean
  }
  windows: Record<ToolId, WinState>
  activePageId: string
  tiled?: boolean
}
