---
mentions:
  - km
  - Bjørn
id: "@km/silvery/sel-p5-km-migrate"
aliases:
  - km-silvery.sel-p5-km-migrate
  - km-silvery-sel-p5-km-migrate
created_by: Bjørn Stabell
created_at: 2026-04-03T21:38:52Z
closed_at: 2026-04-04T20:21:51Z
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Selection Phase 3: km migration — /refactor clean cut @km/silvery #task #P1 @Bjørn Stabell

Replace ALL legacy selection state in @km/tui. /refactor workflow: break intentionally, no compat wrappers, tsc errors guide all work.

## Method (/refactor)

1. Wire createSelection(app) into km board-app
2. Delete all legacy selection fields (cursorNodeId, multiSelected, selectionAnchor, inlineEditBlock, selectAllLevel, visualMode, visualAnchor)
3. Delete CursorStore (cursor-store.ts, cursor-context.tsx)
4. Delete old selection helpers (keyboard-helpers.ts selection parts, selection.ts, selection-engine.ts)
5. Fix all tsc errors — ~47 files, ~500 references. One session, break-then-fix.
6. Wire views: sel.node.cursor, agNode.selected (per-node signals)
7. Wire commands: sel.kind for when conditions
8. Wire board-actions: sel.node.select/extend/collapse/remove
9. Wire text editing: sel.text.edit/select/deselect
10. Wire board-specific: extendHorizontal, cursorCardId, cursorColumnId as km app code

## Delete (all of these must be GONE, not deprecated)

- apps/@km/tui/src/state/cursor-store.ts
- apps/@km/tui/src/cursor-context.tsx
- apps/@km/tui/src/state/selection.ts (replace with @silvery/selection import)
- cursorNodeId field from BoardPaneState
- multiSelected field from PerPaneUIFields
- selectionAnchor field from PerPaneUIFields
- inlineEditBlock field from PerPaneUIFields
- selectAllLevel field from PerPaneUIFields
- visualMode / visualAnchor fields
- selectionLevel / editLevel helpers
- CursorStore type and factory
- useSyncExternalStore selection hooks

## NO compat wrappers

No re-exports. No "Selection.cursor(sel) = sel.node.cursor" bridges. No deprecated aliases. Clean cut.

## /complete (ALL must pass)

```
grep -r "cursorNodeId" apps/km-tui/src/ → 0 hits
grep -r "multiSelected" apps/km-tui/src/ → 0 hits
grep -r "selectionAnchor" apps/km-tui/src/ → 0 hits
grep -r "inlineEditBlock" apps/km-tui/src/ → 0 hits
grep -r "selectAllLevel" apps/km-tui/src/ → 0 hits
grep -r "CursorStore" apps/km-tui/src/ → 0 hits
grep -r "cursor-store" apps/km-tui/src/ --include="*.ts" → 0 hits (import refs)
grep -r "cursor-context" apps/km-tui/src/ --include="*.ts" → 0 hits
grep -r "selectionLevel\|editLevel" apps/km-tui/src/ → 0 hits
grep -r "useSyncExternalStore" apps/km-tui/src/ → 0 hits (selection-related)
ls apps/km-tui/src/state/cursor-store.ts → does NOT exist
ls apps/km-tui/src/cursor-context.tsx → does NOT exist
grep "createSelection" apps/km-tui/src/ → >0 hits (new store wired in)
grep "sel\\.node\\.cursor\\|sel\\.node\\.ids\\|sel\\.text" apps/km-tui/src/ → >0 hits
bun run test:fast → all pass
bun run test:ci → all pass
```

