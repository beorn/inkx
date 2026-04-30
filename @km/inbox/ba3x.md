---
id: "@km/inbox/ba3x"
aliases:
  - km-ba3x
  - "@km/_orphan/ba3x"
created_at: 2026-01-20T07:44:22Z
closed_at: 2026-01-20T10:55:53Z
---

# [x] InkX: Split pipeline.ts into phase modules @km/_orphan #task #P2

## Problem
`vendor/beorn-inkx/src/pipeline.ts` is 1512 lines handling measure, layout, scroll, content, and output phases in one file.

## Current structure
- Measurement phase: lines 50-122
- Layout phase: lines 128-237
- Scroll phase: lines 249-401
- Content phase: lines 413-543
- Output phase: lines 1024-1142

## Proposed structure
```
src/phases/
├── measure.ts    # measurePhase()
├── layout.ts     # layoutPhase()
├── scroll.ts     # scrollPhase()
├── content.ts    # contentPhase()
└── output.ts     # outputPhase()
src/pipeline.ts   # executeRender() orchestrator only
```

## Files affected
- pipeline.ts → split into 6 files
- pipeline.test.ts → update imports
- Any other files importing phase functions