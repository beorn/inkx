---
aliases:
  - km-silvery.selection-focus-plateau.direct-cell-write-audit
  - km-silvery-selection-focus-plateau-direct-cell-write-audit
created_at: 2026-05-08T15:28:25.611Z
closed_at: 2026-05-08T16:59:42.617Z
closeReason: "Direct-write audit completed: RenderSink, BufferSink, PlanSink,
  TerminalBuffer clear/fill/scroll/copy, decoration snapshots, selection theme
  fixture. Remaining direct APIs are intentional CellPatch writers:
  setCell/fill/scrollRegion/emit* with explicit selectable policy. Tests:
  92-vendor selection group; rg selectableMode API clean."
---

# [x] L5: audit direct cell writes for explicit selectability #P1

Audit every code path that writes cells outside normal Text emission and give it an explicit selectability policy.

Acceptance criteria:

- Inventory RenderSink, TerminalBuffer, BufferSink, selection-renderer, backdrop/clear/fill/restyle, overlay, border, padding, and runtime escape hatches.
- Structural writes are non-selectable by construction: clears, fills, padding, borders, layout blanks, overlays, and chrome.
- Text writes derive selectability from semantic text origin and userSelect state.
- Selection overlays preserve underlying text semantics; visual inverse/restyle does not create selectable content.
- Close reason includes the rg/audit commands used and the final list of remaining intentional direct-write APIs.

