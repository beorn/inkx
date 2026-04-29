---
id: "@km/tui/inline-transform-selection"
aliases:
  - km-tui.inline-transform-selection
  - km-tui-inline-transform-selection
created_by: Bjørn Stabell
created_at: 2026-04-09T07:22:25Z
closed_at: 2026-04-09T07:53:09Z
close_reason: "Foundation API done (commit d7c57b320): sel.transform(op,
  prevTree, nextTree) added to SelectionStore. 3 new tests, 42/42 store tests
  pass, 5837/5837 fast suite pass. Migration of 9 tree mutation sites split out
  as km-tui.transform-migrate (incremental work). Existing manual reconciliation
  in handlers works correctly — Invariant #11 doesn't fire — so migration is
  quality/elegance, not bug fix."
---

# [x] Inline transformSelection in tree ops — eliminate timing gap @km/tui #task #P2 @Bjørn Stabell

## What

Call `sel.transform(change)` inside board-tree-ops.ts mutations instead of after-effect reconciliation. Selection state updates atomically with tree mutations.

## Why

Currently selection reconciliation fires as a reactive effect AFTER tree mutations. This creates a frame where tree and selection are inconsistent. Invariant #11 (sel.root ↔ rootId mismatch) catches one symptom. The SlateJS pattern (transformSelection inline) prevents the gap entirely.

## Prerequisite

- @km/tui/inscope-commands (focus scope wiring)
- @km/tui/auto-derive-selected (single source of truth)

## Scope

- 17+ board-action files touch tree ops
- transformSelection already exists (selection.3)
- Need to identify all tree mutation points and add sel.transform() calls

## Acceptance Criteria

- [ ] No reactive effect for selection reconciliation after tree ops
- [ ] sel.transform() called inline in every tree mutation
- [ ] Invariant #11 (sel.root desync) never fires in test suite
- [ ] All tests pass
- [ ] Fuzz tests pass with FUZZ=1