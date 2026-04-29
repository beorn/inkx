---
id: "@km/tui/reactive-viewtree"
aliases:
  - km-tui.reactive-viewtree
  - km-tui-reactive-viewtree
created_by: Bjørn Stabell
created_at: 2026-04-09T14:31:06Z
---

# [ ] Reactive ViewTree — derive from repo+foldDepths as computed signal @km/tui #task #P2

## What

ViewTree is currently built imperatively via deriveColumns() etc. and stored in the store. Making it a computed signal from (repo, rootId, foldDepths) eliminates the refresh ceremony and stale-walk-order bugs.

## Scope (selection.8-10)

This is the "Reactive ViewTree" seam from the quality plateau roadmap:
- selection.8: ViewTree as computed signal — eliminates refreshSelTree, stale walk order
- selection.9: Eliminate Zustand bridge — useSignal for React components
- selection.10: Per-node view state as reactive overlays on repo tree — eliminates ViewTree as parallel structure

## Why

Currently:
- ViewTree is a parallel structure mirroring repo
- Updates are imperative — deriveColumns() runs on various triggers
- Stale views cause invariant #12 (ViewTree root matches rootId) to fire
- The reactive tree already has per-node signals (cursor, selected, etc.) — ViewTree should layer on top, not be a separate structure

## Why Deferred

- Biggest structural change (3-5 sessions)
- Requires rebind invalidation fix (@km/tui/rebind-invalidate) as prerequisite  
- Touches selection adapter + store construction
- High risk of subtle bugs

## Prerequisite

- @km/tui/rebind-invalidate (rebind must invalidate computeds)

## Acceptance Criteria

- [ ] ViewTree is a computed signal derived from repo+foldDepths
- [ ] No refreshSelTree or manual refresh calls
- [ ] Zustand bridge for sel tree removed (use useSignal directly)
- [ ] Per-node view state is reactive overlay on repo tree
- [ ] Invariant #12 never fires
- [ ] All tests pass