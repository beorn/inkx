# ag-canvas: Status & Pickup Guide

_Last updated: 2026-03-31_

## Current Location

`@silvery/ag-react/ui/canvas/` — 4 files, ~1,200 LOC total:

- `index.ts` (560 LOC) — `renderToCanvas()`, component re-exports, lifecycle
- `input.ts` (316 LOC) — keyboard + mouse input via hidden textarea
- `pretext-measurer.ts` (153 LOC) — Pretext-based proportional text measurement
- `dom-measurer.ts` (205 LOC) — CSS DOM-based measurement (slower, pixel-perfect)

Lives inside ag-react because it needs the React reconciler. Will become standalone `@silvery/ag-canvas` when the display list abstraction makes it framework-agnostic.

## What Works

### Rendering

- `renderToCanvas(element, canvas, options)` — full React component rendering on Canvas2D
- Proportional text via Pretext measurer (or DOM measurer for CSS parity)
- HiDPI rendering via DPR scaling
- 38 of 40 silvery UI components re-exported and canvas-safe
- Only ScrollbackList + ScrollbackView are terminal-only
- Proven at scale: 1,013 nodes, 35ms render

### Input

- Keyboard via hidden `<textarea>` (standard xterm.js/VS Code technique)
- `useInput()` hook works — same API as terminal
- Mouse events via `CanvasMouseEvent` callback (click, hover, wheel, drag)
- Focus management (Tab/Shift+Tab/Escape cycling)
- Cursor rendering (inverse block at cursor position)

### Examples

- `silvery/examples/web/canvas-proportional.html` — proportional text demo
- `silvery/examples/web/canvas-debug.html` — DOM vs canvas rect comparison diagnostic
- `silvery/examples/web/canvas-app.html` — interactive app demo
- `km/apps/km-tui/web/km-canvas.html` — full km kanban board (mock + remote mode)

## Capability Matrix (Terminal vs Canvas)

| Capability          | Terminal | Canvas              | Notes                                   |
| ------------------- | -------- | ------------------- | --------------------------------------- |
| Box/Text rendering  | ✅       | ✅                  | Identical                               |
| Layout (Flexily)    | ✅       | ✅                  | Identical                               |
| Focus management    | ✅       | ✅                  | Identical                               |
| Theme               | ✅       | ✅                  | Identical (Catppuccin default)          |
| Virtualization      | ✅       | ✅                  | Identical                               |
| useInput (keyboard) | ✅       | ✅                  | Canvas: no Kitty protocol               |
| Mouse events        | ✅ SGR   | ✅ CanvasMouseEvent | Different API, same data                |
| useApp (store)      | ✅       | ⚠️ Partial          | No pause/resume                         |
| RuntimeContext emit | ✅       | ❌                  | Blocks custom app events                |
| InputLayerProvider  | ✅       | ❌                  | Blocks modal input stacking             |
| useTerm()           | ✅       | ❌                  | Terminal-only (dims, caps)              |
| useStdout/useStderr | ✅       | ❌                  | Terminal-only                           |
| useScrollback       | ✅       | ❌                  | Terminal-only                           |
| Reactive resize     | ✅       | ⚠️ Manual           | Need resize observer                    |
| Component count     | 40       | 38                  | Missing: ScrollbackList, ScrollbackView |

## Architecture Decisions

### PlatformServices (recommended approach)

Instead of per-component adapters, inject platform services at the app runtime boundary:

```typescript
type PlatformServices = {
  repo: Repo
  persistence: Persistence // fs | localStorage | no-op
  clipboard?: ClipboardService
  opener?: (url: string) => void // Bun.spawn | window.open
  rectRegistry: RectRegistry // shared hit testing
  target: "terminal" | "canvas"
}

const app = createApp({ services, commands, keymaps })
```

### DOM Overlay for Text Editing

Browser text editing should use positioned HTML `<input>`/`<textarea>` over canvas (not pure canvas text editing). This gives IME, clipboard, selection, and accessibility for free.

### Render-Neutral Components

Goal: shared component tree renders on both terminal and canvas. The 28 km-tui files that need adapters mostly just need the same Zustand store + focus system provided on canvas.

Design doc: `km/docs/design/render-neutral-tui.md`
GPT 5.4 Pro review: `/tmp/llm-manual-design-review-render-neutral-tui-tgmt.txt`

## How to Pick Up This Work

### Running the examples

```bash
# Silvery canvas examples (no server needed)
cd vendor/silvery/examples/web && bunx vite@6
# Open: canvas-proportional.html, canvas-debug.html, canvas-app.html

# km on canvas — mock mode (no server needed)
cd apps/km-tui/web && bunx vite@6
# Open: km-canvas.html?mode=mock

# km on canvas — remote mode (needs km-web server)
bun apps/km-web/server.ts ~/Bear/Journal  # terminal 1
cd apps/km-tui/web && bunx vite@6          # terminal 2
# Open: km-canvas.html?mode=remote
```

### Next steps (ordered by impact)

1. **Extract to @silvery/ag-canvas** — move canvas code out of ag-react into standalone package
2. **PlatformServices in createApp** — inject services so terminal and canvas share one component tree
3. **RectRegistry** — shared hit testing for keyboard nav + mouse click
4. **Vertical slice** — one end-to-end flow (board render + card selection) working on both targets with shared components
5. **DOM overlay editing** — positioned input for browser text editing
6. **Display list abstraction** — target-neutral draw ops (currently canvas draws directly from the buffer)

### Key files to read first

1. This doc
2. `km/docs/design/render-neutral-tui.md` — full render-neutral plan with GPT review
3. `vendor/silvery/packages/ag-react/src/ui/canvas/index.ts` — renderToCanvas entry point
4. `vendor/silvery/CLAUDE.md` — silvery conventions and architecture
5. `../../../roadmap.md` § Track 2 / v2.0 — where canvas fits in the silvery roadmap

### Beads

- `km-silvery.ag-canvas` — tracking epic (8/10 original beads closed)
- `km-silvery.ag-canvas.shared-components` — render-neutral component work (in progress)
- `km-silvery.ag-canvas.era2b` — P4, migrate to commands + signals
- `km-silvery.ag-canvas.npm-package` — P4, ship standalone package

### Tests

```bash
# Canvas unit tests (37 passing)
bun vitest run apps/km-web/src/__tests__/                                    # 28 tests
bun vitest run --project vendor vendor/silvery/packages/ag-react/src/ui/canvas/__tests__/  # 9 tests

# Canvas rendering test (Playwright, headless)
# See km/apps/km-tui/web/ for Playwright exploration scripts
```
