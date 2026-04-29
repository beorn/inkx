---
id: "@km/all/layer-violations"
aliases:
  - km-all.layer-violations
  - km-all-layer-violations
created_by: claude:fed8de9e
created_at: 2026-03-30T05:52:05Z
closed_at: 2026-03-30T06:22:39Z
close_reason: "Fixed: moved 7 utility functions from @km/tree to @km/core,
  updated all consumers (no re-exports). 1701 tests pass."
---

# [x] Fix km package layer violations @km/all #bug #P2

Layer violations found in km packages audit (2026-03-29). The only structural violation is @km/storage importing from @km/tree (Infrastructure importing from Operations layer). This dependency is also undeclared in @km/storage's package.json. Suggested fix: move index-file utility functions down to @km/core or create a shared @km/core/index-file module.