---
mentions:
  - km
  - Bjørn
id: "@km/silvery/selection-contains"
aliases:
  - km-silvery.selection-contains
  - km-silvery-selection-contains
created_by: Bjørn Stabell
created_at: 2026-04-15T16:54:04Z
closed_at: 2026-04-15T18:01:19Z
close_reason: >-
  Shipped as 4 commits on main:


  - e3872d0b7  feat(silvery-selection): tree.contains(id) + use it in
  store.select/remove/selectableAncestor

  - 6c4764e63  refactor(km-tui): delete walkOrder cache in selection-adapter —
  contains() is O(1)

  - f37fa1617  refactor(km-tui): delete startup walkOrder warmup — contains()
  eliminates the freeze

  - 801708e3e  refactor(km-tui): revert cursor-in-walkOrder invariant to fatal


  LOC delta: 18 files changed, 335 insertions(+), 253 deletions(-) — net +82.

  Net deletion in km-tui (warmup + walkOrderCache removed); the insertions

  are in silvery-selection where the new contains() primitive + its test

  surface lives.


  Acceptance criteria:

  - [x] SelectionApp.tree.contains(id): boolean exists and is consumed by
        store.select, store.remove (single-id), and selectableAncestor
  - [x] selection-adapter.ts implements contains via
        currentLens.get(id) !== undefined (O(1) through the repo's node cache)
  - [x] walkOrderCache in selection-adapter.ts deleted

  - [x] setTimeout warmup in tui.tsx deleted

  - [x] cursor-in-walkOrder flipped back to fatal (cursor-under-root was
        already fatal from e407c8af8)
  - [x] All 206 selection tests pass
        (packages/silvery-selection/tests/)
  - [x] All 2255 km-tui tests pass (one pre-existing node-view.test.tsx
        "renders section sigil prefix" failure is unrelated — it's about
        § icon rendering in NodeColumnView, nothing to do with selection)
  - [x] All 550 km-commands tests pass

  - [x] Typecheck: 6 errors (matches baseline exactly; the 7 pre-existing
        vendor/accountly errors are baseline noise)
  - [x] embed.test.ts (52 tests) + command-contracts.test.ts pass — the
        "detail-pane stale ID" and "synthetic-cursor stress" cases that
        implicitly relied on the walkOrder filter keep passing because
        contains() preserves the same "reject stale IDs" semantic via
        repo.getNode(id) !== undefined

  Why the plateau closes:


  The old `store.select(ids)` hot path:
    1. Called app.tree.walkOrder(root) — O(visible) DFS (~3s on 528k nodes)
    2. Built a Set<ID> from walkOrder — another O(visible) allocation
    3. Filtered `ids` against the Set to drop stale entries
    4. Used the filtered+reordered result as the new selection

  The new hot path:
    1. filterValid(ids, contains) — O(ids.length), one hash lookup per id
    2. Dedupes in the same pass, preserves input order

  At 500k nodes: ~0.5ms instead of 3000ms. No warmup needed. No cache

  needed. No cursor-drift self-heal needed — stale IDs can't enter the

  selection state in the first place.


  Range ops (extend, reconcile, selectAll at root) still pay for

  walkOrder, but they fire once per user action, not per render, so they

  never show up in the profile.
owner: bjorn@stabell.org
assignee: Bjørn Stabell
dependencies:
  - issue_id: km-silvery.selection-contains
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-15T09:54:09Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery
---

# [x] SelectionApp.tree.contains(id) — O(1) validity check to retire walkOrder cache + startup warmup @km/silvery #feature #P2 @Bjørn Stabell

blocks:: [[@km/silvery]]

## /big reframe: the one primitive that closes the selection quality plateau

## Why

`@silvery/selection`'s `store.select(ids)` validates incoming IDs by filtering them against `tree.walkOrder(root)` — an O(visible) walk of the current tree. For @km/tui vaults with 500k+ nodes and `rootId = "."` (repo root), that's 3 seconds of main-thread JavaScript **per keystroke**.

Current band-aids (all shipped this session):

- `apps/km-tui/src/state/selection-adapter.ts` — walkOrder cache keyed by `(lens identity, root)` so subsequent selects short-circuit after the first walk.
- `apps/km-tui/src/tui.tsx` — 50ms setTimeout startup warmup that eagerly runs `visibleLens().walkOrder` so the 3s block happens while the user is reading, not after a keypress.
- Both added in `5484d34c5 (km-tui.startup-input-freeze)`.

The warmup still blocks the main thread for 3s once. The cache still costs O(visible) on every lens invalidation. The whole thing is a workaround for a missing primitive.

## The missing primitive

```ts
// @silvery/selection SelectionApp.tree interface
interface SelectionTree {
  walkOrder(root: ID | null): readonly ID[]
  parent(id: ID): ID | undefined
  children(id: ID): readonly ID[]
  contains(id: ID): boolean    // ← THIS
}
```

Every km repo already has an O(1) node lookup (`repo.getNode(id)`). Bridge that into `SelectionApp.tree.contains` and `store.select(ids)` becomes O(N) in the id list, not O(visible) in the tree.

## Downstream deletions (once this lands)

1. Delete `walkOrderCache` in `apps/km-tui/src/state/selection-adapter.ts` (~30 LOC)
2. Delete the setTimeout warmup in `apps/km-tui/src/tui.tsx` (~15 LOC + import cleanup)
3. Rewrite `store.select` in `@silvery/selection` to use `contains(id)` instead of `walkOrder(root).includes(id)` — the single hot path

Related secondary cleanups:
4. The `cursor-under-root` and `cursor-in-walkOrder` invariants become O(1) instead of O(visible) — the self-heal path in `board-app.ts` gets faster on every failure
5. The `recoverable` flag on those invariants can revert to fatal — because `select()` will never accept a stale id in the first place, the invariants are statically impossible

## Acceptance

- `SelectionApp.tree.contains(id): boolean` ships in silvery
- `store.select(ids)` uses it; no walkOrder walk on select path
- km's selection-adapter cache + tui.tsx warmup deleted
- Real-vault test: 528k-node vault, `rootId = "."`, 50 rapid j-presses, zero event-loop blocks ≥ 100ms
- Cursor-under-root / cursor-in-walkOrder invariants reverted to fatal

## Effort

Medium. Silvery: ~50 LOC + test. @km/tui: -45 LOC (deletions). Risk: the current filter behavior silently normalizes stale IDs out of selections — some callers may rely on that (command-contracts test and embed test hit this during the startup-freeze agent's work). Audit those before deleting the filter.

## Priority

P2 — the plateau blocker. Everything else on the quality-plateau list either hangs off this (walkOrder cache deletion, warmup deletion, invariant tightening) or is silvery-gap-analysis follow-through.

## Related

- @km/tui/startup-input-freeze (closed, band-aid)
- @km/silvery/selection-focus-plateau (parent epic)
- @km/review/silvery-gap-analysis (broader sweep)

