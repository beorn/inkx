---
mentions:
  - km
  - claude
id: "@km/silvery/era2a-2-paint"
aliases:
  - km-silvery.era2a-2-paint
  - km-silvery-era2a-2-paint
created_by: claude:fed8de9e
created_at: 2026-03-25T03:51:50Z
closed_at: 2026-03-25T06:06:02Z
close_reason: "Phase 2 complete: term.paint() + term.frame on all 3 Term
  variants (node, headless, emulator). RenderAdapter removed from public barrel
  exports. 10 new tests (3 skipped — termless env). CLAUDE.md + pipeline docs
  updated. Remaining adapter.flush() in pipeline/index.ts:412 is internal to
  ag-term (executeRenderAdapter for browser targets)."
owner: bjorn@stabell.org
assignee: claude:fed8de9e
---

# [x] Era2a Phase 2: term.paint() — wraps RenderAdapter.flush @km/silvery #task #P1 @claude:fed8de9e

Add paint method to Term, wrapping existing RenderAdapter.flush.

- ag-term/src/ansi/term.ts — add paint(frame, prev?) method to Term type; calls existing flush logic
- ag-term/src/render-adapter.ts — flush(buffer, prev) becomes internal to paint; no longer public
- ag-term/src/ansi/term.ts — add term.screen field (TextFrame, set after each paint)

**Delete**: Remove public flush() from RenderAdapter. Remove any public RenderAdapter exports that expose flush. Remove docs/examples mentioning flush.
**/complete**: grep for \.flush\( in consumer code (outside render-adapter.ts internals) → 0 hits. grep for RenderAdapter export → 0 hits in public API. Docs/examples show term.paint() not flush().

Depends on Phase 1 (TextFrame).
Design: era2a/rendering.md §Rendering Pipeline

