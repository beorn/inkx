---
id: "@km/rev-0203/2-reduce-cognitive-complexity-in-132-flagged-functio"
aliases:
  - km-rev-0203.2
  - km-rev-0203-2
  - "@km/rev-0203/2"
created_at: 2026-02-03T15:13:17Z
closed_at: 2026-02-04T11:57:38Z
---

# [x] Reduce cognitive complexity in 132 flagged functions @km/rev-0203 #task #P3

oxlint reports 132 functions exceeding cognitive complexity threshold.

Run: bun lint:complexity
Top offenders (by complexity score):
- packages/@km/storage/src/repo-loader.ts
- packages/@km/storage/src/watch/sync.ts
- packages/@km/storage/src/store.ts
- apps/@km/tui/src/views/Board.tsx
- apps/@km/_orphan/cli/src/commands/bd.ts

Approach: Use /code clean on individual files.
Extract helper functions, simplify control flow, reduce nesting.