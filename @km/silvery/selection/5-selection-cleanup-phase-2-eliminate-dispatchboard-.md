---
mentions:
  - km
id: "@km/silvery/selection/5-selection-cleanup-phase-2-eliminate-dispatchboard-"
aliases:
  - km-silvery.selection.5
  - km-silvery-selection-5
  - "@km/silvery/selection/5"
created_by: Bjørn Stabell
created_at: 2026-04-04T23:05:03Z
closed_at: 2026-04-04T23:05:20Z
owner: bjorn@stabell.org
---

# [x] Selection cleanup Phase 2 — eliminate dispatchBoard SELECT + cursorNodeId write path @km/silvery #task #P1

## What remains

The new sel.* store is wired and working, but the old write path still exists:
keyboard/mouse → dispatchBoard("SELECT") → board-reducer → cursorNodeId → sync bridge → sel.node.select()

This roundabout should be:
keyboard/mouse → sel.node.select() directly

### Specific remnants

| Pattern                               | Count    | Fix                                                                 |
| ------------------------------------- | -------- | ------------------------------------------------------------------- |
| cursorNodeId                          | 299 refs | Replace writes with sel.node.select(), reads with sel.node.cursor() |
| dispatchBoard("SELECT")               | 87 refs  | Replace with sel.node.select([id])                                  |
| editLevel / selectionLevel            | 13 refs  | Replace with sel.kind or SelectionLevel helper from sel             |
| SelectionLevel types                  | 12 refs  | Derive from sel store, not separate helper                          |
| useSyncExternalStore                  | 11 refs  | Replace with signal-store useSignalStore hook                       |
| Zustand imports                       | 8 refs   | Replace with signal-store imports                                   |
| syncCursor / ReactiveNodeStore bridge | 5 refs   | Remove bridge — sel signals are the source                          |
| board-reducer SELECT action           | 2 refs   | Delete from reducer — sel handles it                                |

### Method

/refactor migrate — batch-refactor for mechanical patterns, then manual edge cases.

1. Delete SELECT from board-reducer (break intentionally)
2. Replace 87 dispatchBoard("SELECT") with sel.node.select()
3. Remove cursorNodeId from BoardPaneState (break)
4. Fix 299 refs — reads become sel.node.cursor(), writes become sel.node.select()
5. Remove sync bridge (alien-signals effect that syncs sel → cursorNodeId)
6. Remove SelectionLevel helper — derive from sel
7. Replace remaining useSyncExternalStore with signal-store
8. Remove any remaining zustand imports

### Acceptance

```
grep -r "cursorNodeId" apps/km-tui/src/ --include="*.ts" → 0 hits
grep -r "dispatchBoard.*SELECT" apps/km-tui/src/ → 0 hits
grep -r "editLevel" apps/km-tui/src/ → 0 hits  
grep -r "useSyncExternalStore" apps/km-tui/src/ → 0 hits
grep -r "from.*zustand" apps/km-tui/src/ vendor/silvery/packages/ → 0 hits
grep -r "syncCursor" apps/km-tui/src/ → 0 hits
bun run test:fast → all pass (minus pre-existing silvery failures)
```

