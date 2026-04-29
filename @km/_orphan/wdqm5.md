---
id: "@km/_orphan/wdqm5"
aliases:
  - km-wdqm5
created_by: claude:ceb7c9cb
created_at: 2026-03-27T21:02:47Z
closed_at: 2026-03-27T21:54:21Z
close_reason: 54 instances migrated to shared fixtures across 14 files, -80 lines
---

# [x] Migrate tests to shared fixtures + further consolidation @km/_orphan #task #P3 @claude:ceb7c9cb

Phase 2 of @km/_orphan/dssa8. Infrastructure is in place (item.simpleBoard/multiColBoard/nestedBoard, navigateTo, CLAUDE.md best practices). Remaining work:

## Shared fixture migration (22 instances)
Replace verbatim `item("board", item("col1", item("1a"), item("1b"), item("1c")))` with `item.simpleBoard` in:
- inline-edit.slow.spec.ts (3x)
- board-edit.slow.spec.ts (4x)
- columns-view.slow.test.ts (3x)
- keyboard-navigation.slow.test.tsx (1x)
- alignment.test.ts (3x)
- driver.test.tsx (2x)
- board-nav.slow.spec.ts (4x)
- toast.spec.ts (1x)
- visual.test.ts (1x)

Also find+replace multiColBoard and nestedBoard patterns.

## Further file consolidation (111 → ~80)
Domain merge candidates identified in @km/_orphan/dssa8 audit notes.

## Journey test conversion
Top 7 files with 35-61 testEnv() calls — convert 1-step tests to 3-5 step journeys where fixtures are identical.

## Metrics
- testEnv() calls: 1,408 → target <1,000
- Test files: 111 → target ~80
- Shared fixture adoption: 0 → 22+