---
mentions:
  - km
  - Bjørn
id: "@km/tui/docs-treelens-viewtree-layering"
aliases:
  - km-tui.docs-treelens-viewtree-layering
  - km-tui-docs-treelens-viewtree-layering
created_by: Bjørn Stabell
created_at: 2026-04-07T21:30:01Z
closed_at: 2026-04-07T21:37:01Z
close_reason: "Implemented: rewrote visibility-model.md (no more
  deleted-function refs), added historical banner to per-node-view-computeds.md,
  removed legacy ColumnView/ViewNode blocks from architecture.md, added
  TreeLens/ViewLens/VisibleLens glossary entries, added LAYERING doc-comment
  block to packages/km-board/src/index.ts, added JSDoc to TreeLens interface +
  createViewLens + createVisibleLens warning React consumers to use ViewTree. No
  source-code logic changes. Commit 13e55d810."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Document TreeLens vs ViewTree layering; rewrite stale visibility-model.md @km/tui #task #P3 @Bjørn Stabell

## Document TreeLens vs ViewTree layering; rewrite stale visibility-model.md

## Why this exists

In conversation with the user during a view-mode parity investigation (@km/tui/view-mode-feature-parity, 2026-04-07), the user asked "ViewTree vs TreeLens? I didn't even know we had a lens — maybe it's old API?". Upon audit, the lens IS current (created same day as ViewTree, lower layer), but multiple steering docs are stale or missing entries that would have answered the question. New contributors will hit the same confusion.

The fix is **doc-only** — no source-code changes to the lens or ViewTree layers themselves. The layering is correct; it just isn't documented in a way that surfaces the right API for the right job.

## Current architecture (the truth)

```
TreeLens          (createViewLens, createVisibleLens)
  └── Pure data layer. No state, no signals.
      Used by: bulk computation, board-state derivation, navigation helpers,
               pane-signals reactive graph
      Files:  packages/km-board/src/{view-lens,visible-lens,tree-lens}.ts

ViewTree          (createViewTree)
  └── React-side projection of a TreeLens.
      Adds per-node signal bags via ProjectedMap.
      Used by: every React rendering path (Board, TreeNode, CardColumn, ...)
      Files:  packages/km-board/src/view-tree-projection.ts

Rule of thumb:
- React component? Use ViewTree via useNode(id).
- Reducer / selector / navigation / store / non-React? Use TreeLens directly.
```

Both were created on the same day in April 2026:

- `fabf49e8c feat(board): createViewLens — TreeLens-based view over repo` (11:56)
- `ce58aca85 feat(board): createViewTree — per-node projected ViewTree with navigation` (16:36)

The old `view-tree.ts` / `buildViewTree()` architecture was deleted in `2910f2dd8 refactor(board): delete view-tree.ts + view-snapshot.ts (1012 lines of legacy)`.

## Audit findings (stale docs)

### docs/design/visibility-model.md — fully stale (highest priority)

Every reference is to the OLD architecture:

- Line 11: `view-tree.ts — isCollapsedChild(), isDetailOnly()` — file deleted
- Lines 13, 20, 22, 26, 38: `buildViewTree()` — function deleted
- Line 24: `BoardState.foldDepths consumed by buildViewTree()` — wrong now
- Line 26: "Previously also at navigation time via now-removed walkVisibleDescendants()..." — references work that DID happen, but the rest of the doc assumes the old function still exists
- Line 52: "Remaining work: buildViewTree receives foldDepths but ignores it (`_foldDepths`)" — describes the OLD function. Same problem exists at the new layer (`view-lens.ts:40` declares foldDepths in options but never reads it), but the doc points at deleted code

**Action**: rewrite from scratch describing the current TreeLens → VisibleLens → ViewTree pipeline. Reuse the "Three Visibility Systems" framing — `isCollapsedChild` (lens construction), `foldDepths` (currently React layer via ReactiveNodeStore, see view-mode-feature-parity), `collapsedNodes` (visible-lens). Note the current "fold not in lens" caveat at the new layer, with a forward reference to @km/tui/view-mode-feature-parity for the planned cleanup.

### docs/design/per-node-view-computeds.md — stale (migration done)

Extensively references `buildViewTree` (lines 147, 188, 217, 232, 237, 246, 312, 351, 363, 380). Discusses the per-node-projection migration as if it's still being decided. The migration is done — `createViewTree` exists, ViewTree wraps a lens, per-node signals via `useNode(id)` are the canonical pattern.

**Action**: either rewrite as "how the per-node projection works (post-migration)" or mark `[historical design doc — see glossary for current state]` and link to the rewritten visibility-model.md. Probably the latter — historical context is valuable but should be clearly marked as such.

### docs/architecture.md — mixed state

Two competing descriptions in the same file:

- Lines 122-147: "ColumnView / CardView — Derived View Models (legacy, being replaced)" + ViewNode block + `buildViewTree(repo, rootId, foldDepths, ...)` signature. Old world with "Migration in progress" banner.
- Lines 168, 194, 219, 265, 267-269: TreeLens pipeline + ViewTreeProjection — correct.

**Action**: delete the legacy ColumnView/CardView/ViewNode/buildViewTree blocks. Keep the current TreeLens pipeline as the only architecture description. Remove the "migration in progress" framing — the migration is done.

### docs/glossary.md — missing TreeLens entries

Has good entries for:

- `ViewTree` (line 474) — describes the projection, useNode(id), navigation API
- `ViewNode` (line 470) — projected per-node state
- `visibility model` (lines 476-480)

But missing entries for:

- `TreeLens`
- `ViewLens` / `createViewLens`
- `VisibleLens` / `createVisibleLens`

**Action**: add three glossary entries cross-referencing ViewTree. Each entry should explicitly call out: "use ViewTree from React, use TreeLens directly only from non-React code (reducers, navigation, store)."

## Source-code action: layering doc comment

`packages/km-board/src/index.ts` exports TreeLens, createViewLens, createVisibleLens, createViewTree all at the same visibility level. There are no `@internal` markers and no doc comments explaining when to use which. From a TypeScript-completion standpoint, `useSignal(ps.visibleLens)` looks just as legitimate as `useNode(id)`.

**Not @internal** — TreeLens is used legitimately by non-React code (board-app-store.ts, state.ts, pane-signals.ts, navigation helpers). Marking it `@internal` would require ts-ignores everywhere or force unnecessary ViewTree projection overhead in bulk-compute paths.

**Better — three concrete additions**:

### 1. Layering doc comment in `packages/km-board/src/index.ts`

Above the TreeLens/ViewTree exports:

```ts
// =============================================================================
// LAYERING — choose the right API for your use case
// =============================================================================
//
//   TreeLens (createViewLens, createVisibleLens, type TreeLens)
//     └── Pure data layer. No state, no signals. Lazy caching.
//         Use directly from non-React code: bulk computation, navigation
//         helpers, board-state derivation, pane-signals reactive graph.
//
//   ViewTree (createViewTree)
//     └── React-side projection of a TreeLens. Adds per-node signal bags
//         (ProjectedMap) for incremental rendering. Components subscribe
//         to individual nodes via useNode(id) — re-renders only when THAT
//         node's view state changes.
//
//   Rule of thumb:
//     - In a React component? Use ViewTree via useNode(id).
//     - In reducer/selector/navigation/store code? Use TreeLens directly.
//
//   See: docs/design/visibility-model.md, docs/glossary.md
```

### 2. JSDoc on the TreeLens interface (`packages/km-board/src/tree-lens.ts:46`)

```ts
/**
 * Universal tree navigation interface.
 *
 * Pure data layer — no state, no signals. For React-layer per-node
 * subscriptions, use {@link ViewTree} (createViewTree) instead, which wraps
 * a TreeLens with ProjectedMap signal bags for incremental rendering.
 *
 * Use TreeLens directly only from non-React code: ...
 */
export interface TreeLens {
```

### 3. JSDoc on createViewLens / createVisibleLens factories

```ts
/**
 * Create a TreeLens-based view over a repo, scoped to a root node.
 *
 * **Layering**: this returns a {@link TreeLens} (data layer). React components
 * should not consume this directly — use {@link createViewTree} which wraps
 * it with per-node signals. This factory is for non-React code: reducers,
 * pane-signals reactive graph, navigation helpers.
 */
export function createViewLens(...) { ... }
```

## Optional: barrel split (defer)

Stronger signal would be to split the `@km/board` barrel into two sub-barrels:

- `@km/board` — top-level public exports (ViewTree-friendly stuff)
- `@km/board/lens` — TreeLens, createViewLens, createVisibleLens, lens helpers

React code imports from `@km/board`, gets ViewTree. Non-React code imports from `@km/board/lens`, gets the lens. The import path itself documents the intent.

**Defer**: this is a clean separation but it's a bigger refactor (touches every consumer's import statement). The doc-comment approach above gives 80% of the value at 5% of the cost. Revisit only if the doc-comment approach turns out to be insufficient (e.g., contributors keep importing the lens from React code despite the warnings).

## Acceptance

- `docs/design/visibility-model.md` rewritten to describe the current TreeLens → VisibleLens → ViewTree pipeline (no references to deleted `buildViewTree`, `view-tree.ts`, `walkVisibleDescendants`)
- `docs/design/per-node-view-computeds.md` either rewritten or clearly marked historical
- `docs/architecture.md` legacy ColumnView/CardView/ViewNode blocks removed; only the current pipeline description remains
- `docs/glossary.md` has new entries for `TreeLens`, `ViewLens`, `VisibleLens` with "use ViewTree from React" guidance
- `packages/km-board/src/index.ts` has a layering doc-comment block above the TreeLens/ViewTree exports
- `packages/km-board/src/tree-lens.ts` interface has JSDoc pointing at ViewTree as the React-side wrapper
- `packages/km-board/src/view-lens.ts` and `visible-lens.ts` factory functions have JSDoc warning about React-direct consumption
- A grep for "buildViewTree" in `docs/` returns zero non-historical hits

## Effort

~half a day. All text changes, no source-code logic changes. Easy to verify (grep for stale function names should be empty after).

## Related

- `km-tui.view-mode-feature-parity` (P1) — discovered the doc gaps during root-cause analysis
- `km-silvery.output-phase-perf` (P0) — perf work that should land before view-mode-feature-parity
- Old commit `2910f2dd8` — deleted view-tree.ts (the source of the stale doc references)
- Glossary entries to mirror: `ViewTree` (glossary.md:474), `ViewNode` (glossary.md:470)

