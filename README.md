# Sites

A React project builder. Lay out pages on a visual canvas with nested stacks, grids and components, refine the code in a terminal-style editor (with an optional AI assistant), and export a clean Vite + React + TypeScript project to push to GitHub.

```
npm install
npm run dev
```

## Layout
- Outside a project: a grid of your projects.
- Inside a project: movable, resizable windows in a workspace, opened from the dock (⌥1–4). ⌘K opens a command palette with every action, page, component and shortcut.
  1. Code: file tree, tabs, editor and a terminal (`help` lists commands). Page and component files stay in sync with the canvas both ways.
  2. Canvas: frames, stacks, grids, text, shapes, pen and components. Press `?` for shortcuts.
  3. Media & Text: images, text styles, fonts
  4. Project: pages, libraries, AI providers, export, GitHub repo, import code

Each window has its own Settings menu in its title bar.

## Canvas
- Layers form a tree. A frame's layout is Free, Stack (row or column, gap, padding, distribute, align, wrap) or Grid (columns, gap, padding).
- Width and height are Fixed, Fill (take the space the parent gives) or Fit (hug the content).
- Drag a layer inside a stack or grid to reorder it; drag it over another frame to move it in. The layers panel supports the same by drag and drop.
- ⌥⌘K turns the selection into a component. Components are pages of their own (`components/Name.tsx`) and can contain other components. Double-click an instance to edit its component; ⌥⌘B detaches it.

## Theme
Light (white), dark (black) or system, from the switch in the top bar.

## Font
Everything uses ABC Areal Superfamily Variable (`public/fonts`). The `MONO` axis at 100 is used for code; 0 for everything else.
To swap fonts, replace the file and edit the `@font-face` block at the top of `src/styles.css`.

## Where things live
- `src/store.ts` project state, undo/redo, saved to IndexedDB
- `src/tree.ts` helpers for the layer tree
- `src/codegen.ts` canvas to JSX, library list, and the zip export
- `src/parse.ts` page and component JSX back to canvas layers
- `src/tools/` the windows; `canvasActions.ts` holds actions shared by shortcuts, panels and the palette
- `src/ui/` workspace, windows, command palette, motion, project grid

## AI
Project settings > AI picks a provider: Anthropic (API key), any OpenAI-compatible endpoint, or a local CLI such as Claude Code through `bridge/claude-code-bridge.mjs` (see `bridge/README.md`). Keys stay in the browser's local storage and are never written into the project or its export. The AI panel in the Code window shows a diff before anything is applied.

## Hosting
Every push to `main` builds the app and publishes it to GitHub Pages (`.github/workflows/deploy.yml`) at https://geremyrobinson.github.io/Sites/. Nothing needs installing to use it: open the link.
