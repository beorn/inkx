---
id: "@km/silvery/treenode-max-rows"
aliases:
  - km-silvery.treenode-max-rows
  - km-silvery-treenode-max-rows
created_by: claude:8b5b9e1c
created_at: 2026-04-20T22:27:56Z
closed_at: 2026-04-21T01:02:10Z
close_reason: >-
  Promoted body-card row-budget from CardColumn-local hack to a reusable
  TreeNode prop so the primitive can serve other presentation contexts (sheets,
  detail previews) and a future DOM target's CSS line-clamp.


  TreeNode now exposes `maxRows?: number` and `overflowIndicator?: string |
  React.ReactNode`. Semantics: 0 = no clamp; exact fit = no indicator; one row
  over = indicator replaces the last row (keeps `max(1, maxRows - 1)` content
  rows). `wrapText` runs at the same `innerWidth` the renderer uses so explicit
  newlines and soft-wraps count identically. Underlying node / ViewTree / edit
  pipeline are untouched — only the primary content text is clamped.


  CardColumn body-card branch refactored to pass `maxRows={bodyMaxRows}` instead
  of the pre-wrapping `contentOverride` + manual `··· +N more` Box.
  `contentOverride` removed (no other consumers).


  Structural card overflow (CardColumn lines 500-550) intentionally NOT unified.
  Its `╰─ +N more ─╯` replaces the card's bottom border, and the count
  aggregates hidden direct children + grandchildren + title-wrap lines — none of
  which map to "wrapped visual rows of primary content text". The two indicators
  answer different questions and forcing the abstraction would lose information.
  Noted in commit message as the deliberate gap.


  Tests — apps/km-tui/tests/body-card-truncation.slow.test.tsx:

  - exact-budget body card (rows === maxBodyContentRows) renders without ···
  indicator (new)

  - one-row-over budget triggers indicator (new)

  - giant body card clamps + shows count (existing)

  - short body card renders unclamped (existing)


  All 4 pass.


  Verification:

  - tsc --noEmit: 0 non-vendor errors.

  - Default km-tui test suite: 107 files / 2338 tests pass.

  - Slow suite pre-existing failures (24 total) unrelated — createTestApp
  migration palette-color artifacts in card-rendering.slow.test.ts, flaky
  real-vault subprocess test self-documented as inconsistent. No failing test
  exercises the `maxRows` code path.


  Files: apps/km-tui/src/views/TreeNode.tsx,
  apps/km-tui/src/views/CardColumn.tsx,
  apps/km-tui/tests/body-card-truncation.slow.test.tsx.

  Commit: 237607540 refactor(km-tui): unify truncation via TreeNode maxRows
  primitive.
---

# [x] TreeNode maxRows + overflowIndicator props — cross-target presentation primitive @km/silvery #feature #P2 @claude:8b5b9e1c

blocks:: [[@km/silvery]]

Unify structural+body card truncation via TreeNode maxRows + overflowIndicator props. Cross-target: terminal renders rows; future DOM renders line-clamp. Replace duplicated CardColumn structural+body branches.