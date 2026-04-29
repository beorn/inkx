---
id: "@km/_orphan/jya1"
aliases:
  - km-jya1
created_at: 2026-01-20T14:30:44Z
closed_at: 2026-01-20T14:36:04Z
---

# [x] Test distributeSpace flex algorithm @km/_orphan #task #P1

The distributeSpace function in vendor/beorn-tui-measure/src/FlexRow.tsx (lines 171-238) is a core 70-line algorithm with integer math for flex layout. It has zero test coverage. Need to add unit tests covering: empty configs, single item, fixed width only, flex only, mixed, min/max constraints, gap accounting, remainder distribution.