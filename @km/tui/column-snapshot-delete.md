---
mentions:
  - km
id: "@km/tui/column-snapshot-delete"
aliases:
  - km-tui.column-snapshot-delete
  - km-tui-column-snapshot-delete
created_by: Bjørn Stabell
created_at: 2026-04-09T07:48:41Z
owner: bjorn@stabell.org
---

# [ ] Delete ColumnSnapshot — web canvas + tests use lens directly @km/tui #task #P3

## Why

ColumnSnapshot (formerly DerivedColumn, formerly ColumnView) is a materialized DTO that exists only because:

1. @km/canvas/tsx (web target) can't subscribe to reactive signals
2. Test fixtures (storybook.tsx, board-fixtures.ts) construct mock columns

Both are legitimate consumers, but they could use the lens-shaped data directly instead of a parallel ColumnSnapshot type. One less abstraction.

## Goal

Delete the ColumnSnapshot interface. Web canvas reads column data from the lens API directly. Test fixtures construct lens-compatible objects (or use a lighter helper).

## Dependencies

May depend on @km/tui/detail-unify-real if detail view still uses ColumnSnapshot via deriveColumnsFromRepo.

## /complete

\`\`\`bash
rg 'ColumnSnapshot' --glob '!.beads' --glob '!docs' --glob '!*.md' -t ts -c | wc -l  # 0
rg 'deriveColumnsFromRepo' --glob '!.beads' -t ts -c | wc -l  # 0 (or moved to lens helper)
bun tsc --noEmit  # pass
bun run test:fast  # pass
\`\`\`

