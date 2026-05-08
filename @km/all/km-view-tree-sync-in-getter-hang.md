# `km view` hangs after sustained navigation — `tree.sync` in state-read getter #bug #P0

## Symptom

`bun km view <vault>` becomes progressively slower and eventually hangs after a few minutes of navigation. Initial load is fine; degrades over time. User-reported 2026-05-08 from `bjorn-session` while iterating on cursor-occurrence-path WIP.

## Root cause (diagnosed)

`apps/km-tui/src/board/board-app.ts:181-183` (uncommitted at time of report) calls `tree.sync(visibleLens)` from inside `getStateBoard()`:

```ts
const visibleLens = board?.signals?.viewTree.viewTree ?? ...
const visibleLens = board?.signals?.visibleLens()
if (visibleLens) {
  tree.sync(visibleLens)   // ← in a hot state-read getter
}
```

`getStateBoard()` is invoked by every selector / view that calls `store.getState()` — many times per frame. `tree.sync()` walks every tracked node in the projection (`packages/km-board/src/projected-map.ts`) and recomputes per-node `ViewNodeState`, then writes signals; subscribers may re-read state, cascading more syncs.

The proper sync is already wired as an alien-signals `effect()` at `apps/km-tui/src/state/board-app-store.ts:631-634` that runs once when `visibleLens` changes. The new in-getter call duplicates it on every read.

Why the failure mode is "after a while": components call `tree.track(id)` via `useNode(id)` as the user navigates. Tracked-node count grows monotonically. Per-frame work scales as `tracked_nodes × state_reads_per_frame`. Above some threshold, per-frame work exceeds the frame budget → hang.

## Secondary contributor (same getter)

Lines 252-260 of the same getter call `findDescendantPath(tree, hint.cursorCardNodeId, cursor_)` — unbounded recursive DFS over the hint card's full subtree. Stale hint + large embed subtree = full subtree walk on every state read.

## Fix

1. Remove the `tree.sync(visibleLens)` block from `getStateBoard()`. The effect at `board-app-store.ts:631` already covers it — if there's a case where it's stale at read time, fix the effect's trigger instead of syncing in a getter.
2. Bound or hoist `findDescendantPath` — at minimum cache the path↔hint pair so it isn't recomputed on every read; ideally don't run it from a getter at all.

## Acceptance

- `tree.sync(...)` is not called from any state-read getter. Search: `grep -rn "tree\.sync\|viewTree\.sync" apps/km-tui/src/` shows only the alien-signals effect at `board-app-store.ts:631`.
- Failing test before the fix: a soak test that navigates the board for N keypresses on a vault with deeply nested embeds; the fix takes per-keypress time from O(tracked_nodes) to O(1).
- Manual: 5+ min of `bun km view ~vault` with active navigation does not hang. Verified in TTY, not just headless driver.
- Linked tracking: see also `@km/tui/explore-km-view-invariants` (claimed on `@agent/4`) — fix may interact with the runtime invariant explorer.

## Provenance

- Reported: 2026-05-08 by user (`bjorn-session` on `@agent/3`).
- Likely introduced in the cursor-occurrence-path WIP that landed in main's working tree alongside `apps/km-tui/src/render-invariants.ts`.
