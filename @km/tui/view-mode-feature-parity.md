---
id: "@km/tui/view-mode-feature-parity"
aliases:
  - km-tui.view-mode-feature-parity
  - km-tui-view-mode-feature-parity
created_by: Bjørn Stabell
created_at: 2026-04-07T20:32:01Z
closed_at: 2026-04-16T01:25:21Z
close_reason: "Fixed: columnFilters threaded to ColumnsView/ListView/TabsView.
  MemoizedTreeCard now accepts remainingDepth for recursive rendering. +N
  filtered footer in all views. Unskipped filter persistence test. Tests:
  column-rendering.test.ts (78/78), filter.test.ts (unskipped),
  navigation.slow.spec.ts (174/174). Commit d5aba56e3."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] View mode feature parity: fold/filter/max-lines/etc only work in 'cards' mode @km/tui #bug #P1 @Bjørn Stabell

# View mode feature parity: fold/filter/max-lines/etc only work in 'cards' mode

## Reported

User report (2026-04-07): "folding (at least) only seems to work in the 'cards' view mode (not in cols, tabs, ...)" — and on follow-up: "also check against other operations too (like max lines, filtering, etc)"

## Root cause

The alternate views (`ColumnsView`, `ListView`, `TabsView`) consume the **TreeLens directly** (`useSignal(ps.visibleLens)` → `lens.children(colId)`), while the cards view (`Board.tsx` → `CardColumn.tsx` → `TreeNode.tsx`) consumes **ViewTree** with per-node `useNode(id)` subscriptions. The two layers were built the same day in `vendor/silvery`-adjacent @km/_orphan/board work:

- `fabf49e8c feat(board): createViewLens — TreeLens-based view over repo` (2026-04-05 11:56)
- `ce58aca85 feat(board): createViewTree — per-node projected ViewTree with navigation` (2026-04-05 16:36)

`ViewTree` is the React-side projection of `TreeLens` — it adds per-node signal bags via `ProjectedMap` and a `nodes()` iterator. The cards view fully adopted ViewTree; the alternate views were never migrated and still use the lens directly.

This means:
- The alternate views are **structurally flat** — `lens.children(colId)` is one level deep, so they show one row per top-level card and never recurse into card children
- They have no per-card incremental rendering (no `useNode(id)` subscriptions)
- Per-card fold state lives in `ReactiveNodeStore` and is read inside `TreeNode` only — alternate views can't see it
- Board-level `columnFilters` (text + property) is computed in `Board.tsx` and passed only to `CardColumn` — alternate views don't get the prop
- Body truncation / max lines is implemented inside `TreeNode` — alternate views render `MemoizedTreeCard` which is single-row and has no body

The user's report is correct in symptom but the architectural cause is broader than fold: **the alternate views are stuck on the wrong layer of the rendering stack**.

## What works in alternate views today

- Column collapse — handled in `visible-lens.ts` (`collapsedNodes` option), all views consume the visible lens, all views honor it
- Task-status filter — same path
- Hidden nodes (`hiddenNodeIds`) — same path
- Cursor highlighting — `MemoizedTreeCard` subscribes to cursor signals individually

## What's broken

- **Per-node fold / sticky fold** in non-cards modes → no effect (no children rendered to fold)
- **Board-level column filters** (text + property) → silently ignored (`columnFilters` prop not threaded)
- **`+N filtered` footer** → only in cards
- **Body truncation / max lines** → only in cards
- **Recursive card descendants** → never rendered

## The fix (B-revised)

Graduate the alternate views to consume `ViewTree`, the same way cards view does. This puts them on the same incremental-rendering footing as cards view and makes fold + per-card state reactive without lens rebuilds.

### Step 1: Lift `nodes()` onto `TreeLens` (symmetry cleanup)

Today the iteration primitives are split asymmetrically:

| Layer | Iteration API |
|---|---|
| `TreeLens` | `walkOrder: readonly string[]` (eager array) |
| `ViewTree` | `nodes(opts?: { from?, reverse? }): IterableIterator<string>` (lazy iterator) |

`ViewTree.nodes()` already delegates to `lens.nextInWalk()` / `prevInWalk()` internally — it just lives at the wrong layer. Lift it onto `TreeLens` itself (~5 LOC + 1 test) so both layers expose the same iteration shape. `walkOrder` stays for callers that want the eager array; `nodes(opts)` becomes the canonical iterator.

### Step 2: Alternate views switch from raw lens to ViewTree

In each of `ColumnsView.tsx`, `ListView.tsx`, `TabsView.tsx`:

- Replace `useSignal(ps.visibleLens)` + `lens.children(colId)` with `viewTree.nodes({ from: colId })`
- Use `useNode(id)` for per-card subscription so per-card fold/state changes trigger only that row's re-render — same incremental pattern as cards view
- Iterate the visible subtree, applying fold filtering at iteration time:
  - Walk parent chain per yielded ID
  - Skip if any ancestor has `foldDepths.get(ancestorId) === 0`
  - Track depth (parent-chain length to the column root) for indentation
- Render each card via `TreeNode` instead of `MemoizedTreeCard` — gives each row body content, max lines, all the per-card features cards view has

### Step 3: Thread `columnFilters` to alternate views

In `Board.tsx`, the per-mode dispatch currently only passes `columnFilters` to `Column`. Pass it to `ColumnsView` / `ListView` / `TabsView` as well. The alternate views consume the filtered subset the same way `CardColumn` does (`filteredCardIds` overlay on top of the lens-derived list).

### Step 4: Tests

Minimum 9 behavioral tests (3 ops × 3 alternate views):
- Fold a card in `columns` view → children hidden in column tree
- Fold a card in `list` view → children hidden in flat list
- Fold a card in `tabs` view → children hidden in active tab
- Filter cards in `columns` view → filtered count, "+N filtered" footer
- Filter cards in `list` view → same
- Filter cards in `tabs` view → same
- Set max lines in `columns` view → cards truncate
- Set max lines in `list` view → cards truncate
- Set max lines in `tabs` view → cards truncate

Plus `H` (fold-all) and `L` (unfold-all) regression in cards view to make sure the lift didn't break the cards path.

### What stays unchanged

- `view-lens.ts` and `visible-lens.ts` — no API changes, no foldDepths consumption (fold stays at React layer for perf reasons documented in the bead)
- `ReactiveNodeStore` — same per-node fold signals
- `TreeNode.tsx` — already correct, just gets new consumers
- `MemoizedTreeCard` — could be deleted after the migration, or kept for non-tree use cases (one-line summaries elsewhere)
- Cards view rendering path — unchanged

### Effort

~half a day to a day:
- Lift `nodes()` to `TreeLens`: 5 LOC + 1 test
- Migrate 3 view files to `viewTree.nodes()` + `useNode()`: ~50 LOC each (~150 total)
- Thread `columnFilters` through 3 view dispatches in `Board.tsx`: ~15 LOC
- 9-12 behavioral tests: ~200 LOC
- Documentation update (`docs/design/data-model.md`, CLAUDE.md if needed): ~30 lines

### Risk

Medium-low. Each view's migration is independent — they can land in separate commits. The tests catch regressions per view. Cards view is unaffected (all cards-view code paths stay the same).

## Why this isn't trivial

Two tempting shortcuts that don't actually work:

1. **"Just push fold into the lens."** Tempting but bad: filter text changes on every keystroke, and if filters live in the lens, every keystroke rebuilds `walkOrder`, the children cache, and the visible-lens cache. That kills the per-node incremental rendering optimization that makes cards view fast. The current architecture (lens = structure, ViewTree + ReactiveNodeStore = React-layer reactivity) is intentional. The fix is to put alternate views on the same React-layer footing as cards view, not to invert the architecture.

2. **"Just swap MemoizedTreeCard for TreeNode in alternate views."** Closer, but it doesn't solve the iteration problem. The alternate views need a way to walk the visible subtree (the recursive equivalent of what `TreeNode` does internally for cards view). `viewTree.nodes({ from: colId })` is exactly that primitive — it already exists, it just needs to be the basis of the alternate-view iteration.

## Why we waited (the perf concern)

User's note: "i'd like to finish the perf work first as this may impact perf too". This is correct — switching the alternate views to ViewTree means each card row gets a per-node subscription. For boards with hundreds of visible items in flat-list view, that's hundreds of new subscribers. The current `km-silvery.output-phase-perf` and `km-tui.cursor-perf-2026-04-07` work is finding hot paths in the cards-view rendering pipeline; we should land those optimizations first so the alternate-view migration inherits them, instead of potentially regressing the perf baseline.

**Order of operations**:
1. Land `km-silvery.output-phase-perf` (P0) — silvery output phase optimization
2. Land `km-tui.cursor-perf-2026-04-07` (P1) — cursor j-press latency
3. Re-baseline cursor benchmarks
4. THEN start this bead (`km-tui.view-mode-feature-parity`)
5. Re-run benchmarks to confirm no regression in cards view, baseline new flat-view performance

## Acceptance

- Pressing fold/unfold on a card in `columns`/`list`/`tabs` view hides/shows its children
- `H` (fold-all) and `L` (unfold-all) work in all four view modes
- Sticky fold persists across view-mode switches in all four modes
- Column filters (text + property) apply to all four view modes with `+N filtered` footer
- Body truncation / max lines works for cards in all four modes
- Cards view performance is unchanged (cursor j-press latency, render frame time)
- Alternate views render at acceptable performance for boards with 100+ visible items
- 9+ behavioral tests cover fold, filter, max-lines across alternate views

## Related

- `km-silvery.output-phase-perf` (P0) — must land first
- `km-tui.cursor-perf-2026-04-07` (P1) — must land first
- `km-tui.sticky-fold` — closed in this session, sticky-fold logic that the alternate views don't honor
- `km-tui.hierarchical-node-state` (P1) — related node-state refactor that touches the same reactive layer; coordinate scope when this lands
- `km-silvery.virtualinline-parity` — different concern (silvery rendering parity), not view-mode parity

## Discovery notes

- `view-lens.ts:40` declares `foldDepths: Map<string, number>` in `ViewLensOptions` but **never reads it** — it's been a stub since the original commit `fabf49e8c`. Either delete it (clearer API) or wire it in (lens-level fold, see "Why we waited").
- `view-tree-projection.ts:80,187` — `ViewTree.nodes(opts?)` is the lazy iterator that should be the basis of alternate-view iteration.
- `Board.tsx:847-886` — `columnFilters` is computed externally because filter text changes on every keystroke; rebuilding the lens per keystroke would invalidate `walkOrder` and the children cache.
- `Board.tsx:504-528` — cards view path passes `filteredCardIds`/`totalCardCount`/`hiddenDescendantCount` to `Column`. Alternate views (`Board.tsx:537,545,553`) get nothing.
- `ColumnsView.tsx:79,81` — `lens.children(colId)` one-level deep, then `.map(repo.getNode)` per ID
- `ListView.tsx:84,183` — `lens.children(colId)` one-level deep; `children={EMPTY_CHILDREN}` literally hardcoded so `MemoizedTreeCard` never recurses
- `TabsView.tsx:67-70` — same pattern as ColumnsView