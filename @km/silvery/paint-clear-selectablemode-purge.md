---
id: "@km/silvery/paint-clear-selectablemode-purge"
aliases:
  - km-silvery.paint-clear-selectablemode-purge
  - km-silvery-paint-clear-selectablemode-purge
created_by: claude:cc081a9a
created_at: 2026-04-27T20:23:06Z
---

# [ ] Paint-clear Step 2 — delete selectableMode state machine from RenderSink + buffer @km/silvery #task #P3

blocks:: [[@km/silvery/paint-clear-l5-final]]

From dual-pro review (Gemini 3 Pro insight, 2026-04-27): Now that selectableMode is threaded top-down via NodeRenderState (Step 1a), the state-machine API on RenderSink/TerminalBuffer is redundant. Delete: setSelectableMode() from RenderSink interface, the global selectableMode state from TerminalBuffer, and have emitSetCell/emitPaintFill/emitRestyleRegion accept selectable: boolean explicitly via CellAttrs. Aligns with cross-platform brief — pure-data ops, no implicit state. Reference: /tmp/llm-cc081a9a-review-three-pieces-of-mjjw.txt lines 302-322.