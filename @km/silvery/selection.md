---
mentions:
  - silvery
  - km
id: "@km/silvery/selection"
aliases:
  - km-silvery.selection
  - km-silvery-selection
created_by: Bjørn Stabell
created_at: 2026-04-03T20:22:26Z
closed_at: 2026-04-15T19:18:38Z
close_reason: "Grooming 2026-04-15: historical status doc. All 15 sub-beads
  (selection.1-.15, silvery.1) are closed. Selection package work complete.
  Ongoing selection tracking lives in km-silvery.selection-focus-plateau
  (canonical epic)."
owner: bjorn@stabell.org
---

# [x] @silvery/selection — unified selection model for silvery apps @km/silvery #feature #P1

## @silvery/selection — unified selection model for silvery apps

### Completed

- P1-P5: Pure transitions, store, pointer gestures, keyboard, km migration
- P6: Undo + op() proxy
- P7: Docs + demo
- P8: Legacy cleanup
- selection.1: Remove Zustand from sel (alien-signals only)
- selection.2: Generic SubSelection + invariants
- selection.3: transformSelection (SlateJS pattern)
- selection.5: Eliminate dispatchBoard SELECT
- selection.6: Quality plateau — sel owns cursor, cursorNodeId eliminated (-147 LOC, -5 abstractions)

### In progress

- selection.7: Fix remaining 10 test failures from sel migration

### Next: Reactive architecture (signals-at-bottom)

The selection migration proved signals work. Now extend to the view layer:

- selection.8: Reactive ViewTree — computed signal from repo+foldDepths (eliminates refreshSelTree, stale walk order)
- selection.9: Eliminate Zustand bridge — useSignal for React components (eliminates _selVersion)
- selection.10: Per-node view state as reactive overlays on repo tree (eliminates ViewTree as parallel structure)
- silvery.1: Per-node interactive signals (selected/hovered/armed/focused on ag nodes)

Design reference: jotai-zustand#7 — signals at the bottom, store API as convenience layer

