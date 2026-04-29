---
id: "@km/silvery/ag-canvas"
aliases:
  - km-silvery.ag-canvas
  - km-silvery-ag-canvas
created_by: Bjørn Stabell
created_at: 2026-03-31T00:20:41Z
owner: bjorn@stabell.org
---

# [ ] ag-canvas: prototype, test, and ship canvas rendering for silvery @km/silvery #epic #P2

Canvas rendering target for silvery + @km/_orphan/on-canvas web client.

## Current State (2026-03-31)

**Rendering engine**: renderToCanvas() with Pretext proportional text, DOM-backed measurer, HiDPI DPR scaling, clearRect before re-render. Canvas adapter (551 LOC) + canvas module (index, input, pretext-measurer, dom-measurer).

**@km/_orphan/web client**: Full working prototype — real vault data via WebSocket, same useColumns as TUI, era2a keyboard navigation (j/k/h/l/g/G/z/Esc), zoom with history, live file sync via watcher, responsive auto-width, state preservation on resize.

**Incremental sync**: Delta protocol — server tracks mutation context, sends targeted updates/removals instead of full snapshots. File watcher falls back to full snapshot.

**Editing**: Inline card editing (e), add (a), delete (d) via WebSocket RPC. Visual edit mode with cursor indicator and mode badge.

**Mouse**: Click-to-select via ag tree hit testing (findBoardBox + renderRect). Hover highlight with throttling. Native CSS scroll (no preventDefault).

**Scroll**: Accurate scroll-to-cursor using ag tree renderRect positions. Smooth scrolling with instant mode for g/G. Scroll position preservation across re-renders.

**Content indicators**: Child count (N ▸), body indicator (···) on cards.

**Tests**: 37 passing — node-cache (15), serialize (7), input (9), remote-repo (6).

**Architecture**:
- apps/@km/_orphan/web/ (267+177+286+27 = 757 LOC): serveRepo(), createRemoteRepo(), NodeCache, serialize
- apps/@km/tui/web/ (~790 LOC): @km/canvas/tsx with BoardView + RemoteBoard, stubs, Vite config
- vendor/silvery canvas: input.ts (316 LOC) with CanvasMouseEvent, index.ts with onMouse
- 7 Node.js stubs (fs, path, os, events, child_process, bun:sqlite, async_hooks)

## Remaining (P4, future)
- era2b: Migrate to commands + signals (blocked on @silvery/commands)
- npm-package: Ship @silvery/canvas as standalone package (needs API stabilization)
- UX polish: help dialog (?), search (/), hover tooltip, expanded keybindings — in progress