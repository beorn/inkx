---
mentions:
  - km
  - Bjørn
id: "@km/tui/auto-derive-selected"
aliases:
  - km-tui.auto-derive-selected
  - km-tui-auto-derive-selected
created_by: Bjørn Stabell
created_at: 2026-04-09T07:22:19Z
closed_at: 2026-04-09T07:39:56Z
close_reason: "Selection writes consolidated to single source of truth in
  setSelection(). Removed hydrateDescendantSelection() and dual prev-tracking.
  hydrate() now calls setSelection() once after rebind. From 6 scattered manual
  writes to 1 centralized writer. 5833/5833 tests pass. Commit 9e7bd3440. Note:
  full computed-from-store auto-derivation requires reactive-graph rebind
  invalidation fix (separate concern)."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Auto-derive node.selected from sel store — eliminate dual writes @km/tui #task #P2 @Bjørn Stabell

## What

Make `reduced.get(id).selected` a computed signal reading from `sel.node.ids().has(id)` instead of 6 manual `.selected(true/false)` writes in reactive.ts.

## Why

Currently NodeStore signals and @silvery/selection store are two sources of truth. setSelection() manually writes `.selected(true/false)` on each node. This should be auto-derived — one source of truth.

## Prerequisite

- selection.7 must land first (10 remaining test failures from sel migration)

## Acceptance Criteria

- [ ] `grep '\.selected(true)' apps/km-tui/src/state/reactive.ts → 0`
- [ ] `grep '\.selected(false)' apps/km-tui/src/state/reactive.ts → 0`
- [ ] `node.selected` is a computed signal, not a writable one
- [ ] setSelection() deleted or reduced to no-op
- [ ] expandSelectionWithDescendants logic preserved (descendants still visually selected)
- [ ] All tests pass

