---
mentions:
  - km
id: "@km/silvery/paint-clear-selectablemode-purge"
aliases:
  - km-silvery.paint-clear-selectablemode-purge
  - km-silvery-paint-clear-selectablemode-purge
created_by: claude:cc081a9a
created_at: 2026-04-27T20:23:06Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.paint-clear-selectablemode-purge
    depends_on_id: km-silvery.paint-clear-l5-final
    type: parent-child
    created_at: 2026-04-27T13:23:06Z
    created_by: claude:cc081a9a
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery.paint-clear-l5-final
closed_at: 2026-05-08T16:59:42.600Z
closeReason: "Deleted ambient selectableMode state/API; selectability now
  travels on cell write payloads. Audit: rg
  setSelectableMode|getSelectableMode|_selectableMode returned no matches.
  Tests: vendor selection/render-plan/selection-theme group (92), root tsc,
  vendor tsc."
---

# [x] Paint-clear Step 2 — delete selectableMode state machine from RenderSink + buffer @km/silvery #task #P1 ^paint-clear-selectablemode-purge

blocks:: [[@km/silvery/paint-clear-l5-final]]

From dual-pro review (Gemini 3 Pro insight, 2026-04-27): Now that selectableMode is threaded top-down via NodeRenderState (Step 1a), the state-machine API on RenderSink/TerminalBuffer is redundant. Delete: setSelectableMode() from RenderSink interface, the global selectableMode state from TerminalBuffer, and have emitSetCell/emitPaintFill/emitRestyleRegion accept selectable: boolean explicitly via CellAttrs. Aligns with cross-platform brief — pure-data ops, no implicit state. Reference: /tmp/llm-cc081a9a-review-three-pieces-of-mjjw.txt lines 302-322.

L5 selection plateau linkage, 2026-05-08: this bead is the canonical ambient-state cleanup for selectable cells. Do not create a duplicate selection-focus child for this. Close it only when selectable state is explicit per cell/render op or quarantined behind a non-authoritative compatibility adapter, and tests prove render-plan/direct-render parity without relying on TerminalBuffer._selectableMode.

