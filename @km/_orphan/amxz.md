---
id: "@km/_orphan/amxz"
aliases:
  - km-amxz
created_at: 2026-01-22T07:57:26Z
closed_at: 2026-01-22T08:00:06Z
---

# [x] Design iteration 2: FSEvents coalescing fix @km/_orphan #task #P2

The FSEvents coalescing test reveals files are missed when events coalesce to directory events. Need to ensure directory events trigger full subdirectory scans.