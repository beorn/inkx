---
id: "@km/tui/sel-reader-migration"
aliases:
  - km-tui.sel-reader-migration
  - km-tui-sel-reader-migration
created_by: Bjørn Stabell
created_at: 2026-04-18T15:27:31Z
---

# [ ] Reader migration + deferred toggle/remove patterns (sel-migration Phase 5) @km/tui #task #P2

blocks:: [[@km/silvery/selection-focus-plateau]]

Follow-up to @km/tui/sel-migration (which closed with 175/178 writer sites migrated).

## Remaining work

### 1. Deferred toggle/remove patterns (3 sites)
Phase 2/3 left 3 writer sites unmigrated because the Selection union doesn't directly express toggle/remove without reading current state:
- apps/@km/tui/src/board/board-app.ts:1081 — Ctrl-click toggle
- apps/@km/tui/src/board/board-actions.ts:1165 — SELECT_NODE_TOGGLE
- apps/@km/tui/src/board/board-actions.ts:1175 — SELECT_NODE_REMOVE

Options:
- (a) Add toggleNodeSelect(id) / removeNodeSelect(id) helpers that read current ids and dispatch a new nodesSelect(...)
- (b) Extend Selection union with toggle / remove operation variants
- (c) Keep the imperative sel.node.select([id], true) / sel.node.remove(id) as escape hatches

Recommended: (a) — keeps the Selection union a pure target-state, adds two thin helpers on top.

### 2. Reader migration (77 sites)
The original sel-migration plan deferred 77 reader sites (ctx.sel.node.cursor(), ctx.sel.text(), ctx.sel.node.ids()). These continue to work as projection over @silvery/selection. Migrating them would require exposing getSelection(): Selection on OpCtx that materializes the current state as a Selection union. Optional — not blocking any feature.

### 3. Writer-method deletion in @silvery/selection (deferred from Phase 4)
The original bead spec called for deleting select/edit/deselect/remove/clear/toggle methods from @silvery/selection. Our projection-over-store design keeps them as the IMPLEMENTATION of dispatchSelection; fully deleting requires a silvery-side redesign where Selection is a first-class store. Out of scope here; tracked separately.

## /complete criteria
- 3 TODO(@km/tui/sel-migration) comments removed
- rg 'sel\.node\.(select|remove|toggle)' apps/@km/tui/src/ → 0
- Tests pass