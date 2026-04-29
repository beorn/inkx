---
id: "@km/silvery/adapter-divergent"
aliases:
  - km-silvery.adapter-divergent
  - km-silvery-adapter-divergent
created_by: claude:c9beade3
created_at: 2026-03-13T04:36:30Z
closed_at: 2026-03-13T05:26:39Z
close_reason: "Fixed: Added comprehensive divergence documentation header to
  content-phase-adapter.ts — lists all differences from content-phase.ts and
  future direction"
---

# [x] content-phase-adapter.ts is a divergent second renderer — document or unify @km/silvery #task #P3

content-phase-adapter.ts is essentially a separate renderer with simplified semantics (no incremental, different clipping/text/border logic). Bugs fixed in terminal renderer can be missed in adapter. Either embrace as experimental and document, or refactor to share target-agnostic paint core. Found by GPT 5.4 pro.