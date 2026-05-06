---
mentions:
  - km
  - claude
id: "@km/silvery/output-context"
aliases:
  - km-silvery.output-context
  - km-silvery-output-context
created_by: claude:c9beade3
created_at: 2026-03-14T15:21:39Z
closed_at: 2026-03-14T23:30:04Z
close_reason: "Consolidated mode and termRows into OutputContext. Added mode and
  termRows as per-frame fields to the OutputContext interface (set in
  createOutputPhase closure and bare outputPhase before each frame). Removed
  separate mode/termRows params from 9 internal functions:
  handleScrollbackPromotion, inlineCursorSuffix, inlineIncrementalRender,
  inlineFullRender, bufferToAnsi (mode only), changesToAnsi (mode only),
  verifyOutputEquivalence, verifyAccumulatedOutput, verifyTerminalEquivalence.
  Public API (outputPhase signature, OutputPhaseFn, createOutputPhase)
  unchanged. All 1636 tests pass (9 pre-existing xterm.js API failures
  unrelated)."
owner: bjorn@stabell.org
assignee: claude:c9beade3
---

# [x] Introduce OutputContext type — consolidate termRows, mode, caps threading @km/silvery #task #P3 @claude:c9beade3

Currently termRows/maxRows is threaded through 8 functions. Introduce typed context objects: Viewport { cols, rows }, TerminalCapabilities { osc66, cpr, truecolor }, OutputContext { viewport, caps, mode, prevPhysicalFrame }. Deeper win: separate virtual render, physical frame clip, and ANSI emission stages. See docs/lessons/testing-escape-hatches.md.

