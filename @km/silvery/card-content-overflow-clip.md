---
aliases:
  - km-silvery.card-content-overflow-clip
  - km-silvery-card-content-overflow-clip
created_at: 2026-05-08T21:10:57.549Z
closed_at: 2026-05-08T21:11:42.495Z
closeReason: >-
  Fixed in vendor/silvery commit f93f1e15 + km commit 0e24fbcbc on branch wt7
  (worktree slot wt7).


  ROOT CAUSE

  Long unbreakable tokens like paths (`/Users/beorn/Code/...`),

  identifiers (`very_long_snake_name`), or scoped names

  (`namespace::class::method`) are unbreakable from the legacy

  wrapText algorithm's perspective — only space and hyphen counted

  as break boundaries. Tokens wider than the card's inner content

  area pinned the parent Box's min-content at `naturalWidth`,

  blocking flexbox shrinkage and causing text to paint past the card

  border into adjacent columns or the page background. When the

  card was selected, the bg fill stopped at the bordered Box but the

  overflowing text was visible against the page bg — the user's

  reported visual.


  FIX SHAPE

  Smart wrap (option 1 from user) — extend silvery's wrap algorithm

  with a SECONDARY break-point predicate `isSoftBreakPoint` that

  recognizes `/`, `\`, `.`, `_`, `:` as soft break opportunities.

  Hard boundaries (space, hyphen) still take precedence. When no

  hard break fits on the current line, the algorithm wraps AFTER

  the separator (e.g. `path/` ends one line, `to` starts the next).


  The min-content path in `nodes.ts:measureFunc` uses the same

  predicate so flexily reports a wrap-aware min-content matching

  what wrapText will actually emit. This is what unblocks shrinkage

  and makes the layout-level fix complete (wrap correctness alone

  isn't enough — flexbox needed to know the column could shrink).


  User's two-fix design: (1) smart wrap at separators is now the

  default behavior; (2) truncate fallback when wrap is genuinely

  impossible was already silvery's existing `wrap="truncate"`

  behavior — the bug was that wrap="wrap" couldn't break paths at

  all, not that there was no truncate alternative.


  VERIFICATION

  - 12 unit tests in vendor/silvery/tests/features/wrap-soft-break.test.tsx
    (path /, absolute path, dotted namespace, snake_case, double-colon,
    Windows backslash, hard-break preference, char-wrap fallback,
    no-wrap-when-fits, offset-preserving slices)
  - 5 acceptance tests in apps/km-tui/tests/card-content-soft-wrap.slow.test.tsx
    (cell-level boundary check on rendered cards with .claude/skills/...,
    absolute paths, snake_case identifiers, dotted namespaces, content visibility)
  - Both pass at SILVERY_STRICT=2

  - Manual repro (long path token in card title, narrow column) shows
    title now stays within column bounds; before fix it bled into adjacent
    column's content.

  NOT REGRESSED

  - All 2585 km-tui fast tests pass (134 files)

  - All 12 wrap-related vendor tests pass (osc8, themed-provider,
  nested-flexgrow, soft-break)

  - 37 vendor test failures + 15 km-tui slow test failures predate this work
    (verified by inspecting tests — they involve cursor navigation, selection
    fragments with no separators, golden-snapshot worktree-path drift).

  FILES CHANGED

  - vendor/silvery/packages/ag-term/src/unicode.ts (+isSoftBreakPoint,
  soft-break tracker
    in wrapTextWithMeasurer + wrapTextWithOffsets)
  - vendor/silvery/packages/ag-react/src/reconciler/nodes.ts (min-content uses
    separator-aware segment width)
  - vendor/silvery/tests/features/wrap-soft-break.test.tsx (new, 12 tests)

  - apps/km-tui/tests/card-content-soft-wrap.slow.test.tsx (new, 5 acceptance
  tests)


  Worktree wt7 will be merged to main by the lead session.
---

# [x] card content overflows past selected-bg bounds — long unbreakable tokens escape clip #bug #P2

