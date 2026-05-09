---
aliases:
  - km-tui.cursor-render-scope-regression
  - km-tui-cursor-render-scope-regression
created_at: 2026-05-09T01:25:15.293Z
---

# cursor-render-scope blew from ≤12 to 74 nodes (vertical-cursor-down keeps full-tree render) #bug #P1

## Symptom

`apps/km-tui/tests/cursor-render-scope.test.ts:31` — "plain vertical cursor movement keeps TreeNode rendering local" — fails with `expected 74 to be less than or equal to 12`. After a single `cursor_down`, the renderer touches 74 nodes instead of the expected ≤12 — the full board, not a local slice.

Action history:

```
1. command(cursor_down)
```

Board state:

```
cursor: task-1
selection: [task-1]
view: cards
overlay: null
visible: [board, col-a, task-0, task-0-child-a, task-0-child-b, task-1, task-1-child-a, task-1-child-b, task-2, task-2-child-a, ...(77 total)]
```

The "scope" rendered touches every visible node rather than the previous-cursor + next-cursor neighborhood.

## Suspect

Same `e58f0fab4 feat(km-tui): cursor-occurrence-path WIP + render invariants + worktree groom` WIP — the cursor-occurrence-path projection appears to invalidate the entire render scope on cursor change instead of marking only the (old, new) cursor neighborhood dirty. The render-scope gate is the canary that catches this; it would otherwise show up as a perf regression.

Sibling bead: `@km/tui/cursor-visible-once-on-enter` (same suspect commit, different invariant). They may share a root cause.

## Acceptance

- Single `cursor_down` action results in ≤12 TreeNode renders on the canonical 5-column / 25-card test board.
- Test passes without raising the threshold.
- Cursor-visibility invariants (sibling bead) also stay green.

Diagnosis only — fix belongs with the cursor-occurrence-path author. Filed during chief's `test:fast` triage assignment.
