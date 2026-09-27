import type { LucideIcon, LucideProps } from 'lucide-react'
import {
  AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignStartHorizontal, AlignStartVertical,
  ArrowDown, ArrowRight, ChevronDown, ChevronLeft, ChevronUp, ChevronsUpDown, Circle, CodeXml, Component, Database, Ellipsis, File,
  FlipHorizontal2, FlipVertical2, Frame, Grid2x2, Hand, Image, LayoutGrid, Maximize2, Minimize2, Minus, MousePointer2,
  PenTool, Play, Plus, Search, Settings2, Shapes, Square, StretchHorizontal, StretchVertical, Sun, SunMoon, Moon, Type, X,
} from 'lucide-react'

// One icon set for the whole app: lucide, 16px, 1.5 stroke, colour from the text around it.
const wrap = (C: LucideIcon, size = 16) => {
  const W = (p: LucideProps) => <C size={size} strokeWidth={1.5} aria-hidden {...p} />
  W.displayName = C.displayName
  return W
}

export const I = {
  select: wrap(MousePointer2), frame: wrap(Frame), stack: wrap(StretchHorizontal), stackRow: wrap(StretchVertical), grid: wrap(Grid2x2),
  text: wrap(Type), shapes: wrap(Shapes), components: wrap(Component), hand: wrap(Hand),
  rect: wrap(Square), ellipse: wrap(Circle), image: wrap(Image), path: wrap(PenTool), instance: wrap(Component), list: wrap(Database), page: wrap(File),
  play: wrap(Play), minus: wrap(Minus), plus: wrap(Plus), flipX: wrap(FlipHorizontal2), flipY: wrap(FlipVertical2),
  right: wrap(ArrowRight, 12), down: wrap(ArrowDown, 12),
  alignLeft: wrap(AlignStartVertical), alignHCenter: wrap(AlignCenterVertical), alignRight: wrap(AlignEndVertical),
  alignTop: wrap(AlignStartHorizontal), alignVCenter: wrap(AlignCenterHorizontal), alignBottom: wrap(AlignEndHorizontal),
  close: wrap(X), more: wrap(Ellipsis), maximize: wrap(Maximize2), restore: wrap(Minimize2),
  back: wrap(ChevronLeft, 14), home: wrap(LayoutGrid, 14), search: wrap(Search), updown: wrap(ChevronsUpDown, 12), twisty: wrap(ChevronDown, 12), up: wrap(ChevronUp, 12),
  sun: wrap(Sun, 14), moon: wrap(Moon, 14), auto: wrap(SunMoon, 14),
  code: wrap(CodeXml, 14), canvas: wrap(Frame, 14), media: wrap(Image, 14), cms: wrap(Database, 14), settings: wrap(Settings2, 14),
}
