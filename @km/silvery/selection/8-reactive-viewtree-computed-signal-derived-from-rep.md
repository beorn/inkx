---
id: "@km/silvery/selection/8-reactive-viewtree-computed-signal-derived-from-rep"
aliases:
  - km-silvery.selection.8
  - km-silvery-selection-8
  - "@km/silvery/selection/8"
created_by: Bjørn Stabell
created_at: 2026-04-05T07:40:38Z
closed_at: 2026-04-05T07:52:23Z
---

# [x] Reactive ViewTree — computed signal derived from repo+foldDepths @km/silvery #task #P2

Replace the manually-cached ViewTree (rebuilt in buildOpCtx per key event) with a computed signal derived from (repo.version, rootId, foldDepths, hiddenNodeIds). Eliminates refreshSelTree() and the stale walk order class of bugs.

## Design (jotai-zustand#7 pattern)
Signals at the bottom, store API as convenience:
- repo.version → signal (already exists as getSnapshot())
- viewTree → computed(repo.version, rootId, foldDepths) 
- walkOrder → computed(viewTree) — sel adapter reads this
- React reads via useSignal(computed) — no Zustand selector bridge

## What it eliminates
- refreshSelTree() helper and all 7+ call sites
- _selVersion bridge effect (Pattern 3 anti-pattern)
- stale walk order after repo mutations (entire bug class)
- buildOpCtx layout cache (replaced by computed memoization)

## Depends on
- useSignal() hook in @silvery/signals (subscribe React to a computed)
- repo.version exposed as alien-signal (currently getSnapshot() number)

## See also
- jotai-zustand#7: signals-at-bottom architecture
- docs/lessons/op-signal-boundary.md: Pattern 2 (DERIVED) over Pattern 3 (EFFECT)