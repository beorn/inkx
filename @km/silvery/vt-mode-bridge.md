---
id: "@km/silvery/vt-mode-bridge"
aliases:
  - km-silvery.vt-mode-bridge
  - km-silvery-vt-mode-bridge
created_by: Bjørn Stabell
created_at: 2026-04-02T21:08:11Z
closed_at: 2026-04-02T23:50:20Z
close_reason: Implemented. CacheBackendContext, auto-selection from mode, 8 tests.
---

# [x] Mode-agnostic cache: createApp(mode) → ListCache backend auto-selection @km/silvery #task #P1

Wire createApp({ mode }) to automatically select the correct ListCache backend for ListView.

## Architecture (layered building blocks)

Layer 0: ListCache interface — storage backend
  - TerminalCache: writes frozen items to stdout (native terminal scrollback)
  - VirtualCache: in-memory ANSI ring buffer (pane-safe, searchable)
  - ReactCache: unmounts far items, re-mounts on scroll (simplest, no ANSI capture)

Layer 1: ListDocument — unified row model
  - Addresses rows across cache + live items
  - Search spans both seamlessly
  - Source tracking (which item produced this row?)

Layer 2: TextSurface — search/hit-test/reveal facade
  - Coordinate transforms (viewport → document)
  - Surface registry for multi-pane layouts

Layer 3: ListView — React component
  - Consumes layers 0-2 via cache/navigator/search props
  - App code identical across modes

## Mode → Backend mapping

createApp({ mode: "inline" })     → TerminalCache
createApp({ mode: "fullscreen" }) → VirtualCache
createApp({ mode: "auto" })       → detect from terminal capabilities

## Mechanism

createApp() provides cache backend via React context. ListView reads context when cache={true} (boolean tier). When cache={CacheConfig} (config tier), the config is combined with the mode-selected backend. When cache={ListCache} (object tier), the app has full control.

## Each layer independently useful

- ListCache alone: raw storage for any app (logs, history)
- ListDocument alone: unified search over heterogeneous content
- TextSurface alone: abstract surface for pane/search management
- ListView: full component using all layers

No layer depends on React except Layer 3.