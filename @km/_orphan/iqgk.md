---
id: "@km/_orphan/iqgk"
aliases:
  - km-iqgk
created_at: 2026-01-20T10:29:57Z
closed_at: 2026-01-20T11:52:12Z
---

# [x] InkX: Split pipeline.ts into phase modules @km/_orphan #task #P2

## Problem
pipeline.ts is 1,527 lines in a single file. While the 5-phase architecture is well-documented and traceable, the file size makes it harder to navigate and test individual phases.

## Location
[pipeline.ts](vendor/beorn-inkx/src/pipeline.ts)

## Solution
Split into phase modules:
- `measure-phase.ts` - Phase 1
- `layout-phase.ts` - Phase 2  
- `scroll-phase.ts` - Phase 2.5
- `content-phase.ts` - Phase 3
- `output-phase.ts` - Phase 4
- `pipeline.ts` - Orchestration only

Estimated scope: 1,527 lines → 5-6 files