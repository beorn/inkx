---
id: "@km/silvery/virtual-terminal"
aliases:
  - km-silvery.virtual-terminal
  - km-silvery-virtual-terminal
created_by: claude:def7f8a1
created_at: 2026-03-17T15:32:28Z
closed_at: 2026-04-03T01:18:09Z
close_reason: >-
  Epic complete. All children closed (15 beads total).


  Architecture shipped:

  - ListView as universal scroll container with nav/cache/search props

  - Layered: ListCache → ListDocument → TextSurface → ListView → Compositions

  - Mode-agnostic: CacheBackendContext auto-selects TerminalCache/VirtualCache

  - Search: pluggable Searchable<M>, local find + repo search coexist

  - Selection: mouse select + OSC 52 clipboard

  - 5 compositions: SelectList, Console, Table, TreeView, PickerList — all
  delegate to ListView


  Stats: ~8,000 lines removed, ~2,000 added. ~100 new tests. Quality review
  8.5/10.

  Blog post updated. 3-mode demo shipped. Panes demo fixed.
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Virtual terminal (v1.5): scrollback + search + select as tea surface @km/silvery #feature #P1 @Bjørn Stabell

Complete the virtual terminal feature — ListView as the ONE component for scrollable content across all rendering modes.

## The Unified Model

ListView's `cache` prop auto-selects backend based on rendering mode:
- **Inline** → TerminalCache (frozen items written to stdout as native terminal scrollback)
- **Virtual terminal / Panes** → VirtualCache (frozen ANSI stored in ring buffer, rendered as overlays)
- **Fullscreen** → ReactCache (unmounts far items, re-mounts on scroll)

App code is identical across modes:
```tsx
<ListView items={items} cache navigator search renderItem={...} />
```

The mode flows from `createApp({ mode })` → cache strategy. No app-level decision needed.

## Layered Building Blocks

Each layer is independently useful — not internal plumbing:

- **Layer 0: ListCache** — cache interface with three backends (TerminalCache, VirtualCache, ReactCache)
- **Layer 1: ListDocument** — unified row model combining cache + live rows, search, source tracking
- **Layer 2: TextSurface** — search/hit-test/reveal facade, coordinate transforms, surface registry
- **Layer 3: ListView** — React component consuming layers 0-2 via cache/navigator/search props

## Naming Glossary (Phase 0 — do first)

| Concept | Canonical | Replaces |
|---|---|---|
| Component | ListView | VirtualList, ScrollbackView, ScrollbackList |
| Render function | renderItem | children, render |
| Stable identity | getKey | keyExtractor |
| Cache system | cache | history |
| Freeze predicate | isCacheable | isFrozen, freezeWhen, frozen |
| Cache limit | capacity | maxHistory, maxRows |
| Navigation | navigator | navigable (bool) |
| Cursor | cursorKey | cursorIndex |
| Activate | onActivate | onSelect |
| Search | search | SearchProvider+SurfaceRegistry |
| Text extraction | getText | textAdapter.getItemText |
| Live = in React tree | Cached = in ListCache | History = stored content |

## Snapshot Capture (the hard part — SOLVED)

Buffer-region grab approach:
1. Output phase paints frame → runtime knows each item's screen rect
2. When item becomes cacheable + exits viewport → capture buffer cells in its rect
3. Convert cells to ANSI strings (cellsToAnsi already exists)
4. Store in ListCache as { rows, plainTextRows, width }
5. On resize: VirtualCache marks cached items stale; re-render on scroll-into-view or evict

This captures the REAL rendered output (borders, padding, overlapping styles) without needing render-to-string.

## Item Lifecycle States

| State | Where | Searchable | Displayable |
|---|---|---|---|
| Live | React tree | Yes (getText) | Yes (full fidelity) |
| Cached | ListCache | Yes (plainTextRows) | Yes (ANSI rows from snapshot) |
| Evicted | Gone | No | No |

## Phases

**Phase 0: Naming Audit** (~1 day)
Apply unified glossary across all existing code. Rename history→cache, keyExtractor→getKey, isFrozen→isCacheable, etc.

**Phases 1-4: DONE** — ListView, HistoryBuffer, ListDocument, TextSurface, ViewportCompositor, SearchProvider, SurfaceRegistry, SearchBar, Panes demo.

**Phase 5: Cache System** (~500 LOC)
- ListCache interface with three backends (TerminalCache, VirtualCache, ReactCache)
- Buffer-region snapshot capture on cache transition
- Mode-aware auto-selection via createApp() context
- Resize: stale marking + lazy re-capture

**Phase 6: Navigator + Selection** (~400 LOC)
- ListNavigator domain object (cursor by key, wrap, programmatic)
- Selection state machine (mouse drag, shift-click)
- OSC 52 clipboard (bead: @km/silvery/selection-clipboard)
- Mouse event routing for e2e tests

**Phase 7: Deletion + Cleanup** (~800-1000 lines removed)
- DELETE ScrollbackView, ScrollbackList, VirtualView (components too thin to earn their name)
- DELETE useScrollback, useScrollbackItem (replaced by cache lifecycle)
- DELETE SearchBar as standalone component (becomes internal to ListView search)
- DELETE all exports for removed components
- Pane component (focusable boundary + border chrome)
- SplitView flexBasis workaround

No backwards compat. No deprecation wrappers. ListView replaces everything.