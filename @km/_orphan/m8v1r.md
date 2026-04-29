---
id: "@km/_orphan/m8v1r"
aliases:
  - km-m8v1r
created_by: claude:f8196c1c
created_at: 2026-03-23T19:30:22Z
closed_at: 2026-03-23T22:26:11Z
close_reason: "Done: TeaNode → AgNode across 55 files in silvery,
  silvery-internal, and km-tui"
---

# [x] Rename TeaNode → AgNode across silvery codebase @km/_orphan #task #P1 @claude:fed8de9e

TeaNode falsely ties a renderer primitive to a state architecture. Rename to AgNode (Ag = silver, consistent with @silvery/ag-* naming). Update all imports, types, docs.