---
id: "@km/silvery/rename-content-phase"
aliases:
  - km-silvery.rename-content-phase
  - km-silvery-rename-content-phase
created_by: claude:fed8de9e
created_at: 2026-03-25T03:46:00Z
closed_at: 2026-03-25T03:56:53Z
close_reason: "Done: 46 files, zero remaining references in .ts/.tsx. CHANGELOG
  preserved. Tests: 227/229 pass (2 unrelated termless failures)."
---

# [x] Rename 'content phase' to 'render phase' across silvery codebase @km/silvery #task #P3 @claude:fed8de9e

The pipeline's 'content phase' (content-phase.ts, content-phase-adapter.ts) maps to ag.render() in the era2a design. The name should reflect this.

Scope: 178 occurrences across 43 files in silvery (zero in flexily). Includes:
- content-phase.ts → render-phase.ts
- content-phase-adapter.ts → render-phase-adapter.ts  
- content-phase-adapter-*.test.tsx → render-phase-adapter-*.test.tsx
- All imports, references, docs, CLAUDE.md, LESSONS.md, debug strings

Low priority — functional rename only, no behavior change. Do after era2a Phase 3 (ag.layout/ag.render decomposition) when the public API name is established.