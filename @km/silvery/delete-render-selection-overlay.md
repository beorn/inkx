---
propsRaw:
  ts: "renderSelectionOverlay legacy ANSI overlay — replaced by
    composeSelectionCells + applySelectionToBuffer @km/silvery #task #P3
    @claude:5e447b66"
props:
  blocked-by:
    type: link
    target: km-silvery
id: "@km/silvery/delete-render-selection-overlay"
aliases:
  - km-silvery.delete-render-selection-overlay
  - km-silvery-delete-render-selection-overlay
created_at: 2026-04-21T05:57:03Z
closed_at: 2026-04-24T22:38:48Z
close_reason: "Both migrations landed and verified. Selection:
  vendor/silvery@5d8d8f9a (or equivalent 2494636b from parallel session) +
  trailing-cell fix at 18dc8845. Search highlight + bar:
  vendor/silvery@c4a0c9fd, d9d6bbaf, 7474f193. 124/124 selection+search tests
  pass with SILVERY_STRICT=1. km submodule pointer at d6dd9c8b6."
started_at: 2026-04-24T20:58:30Z
assignee: claude:5e447b66
dependencies:
  - issue_id: km-silvery.delete-render-selection-overlay
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-24T16:14:21Z
    created_by: claude:5e447b66
    metadata: "{}"
---

# [x] Delete silvery selection-renderer. ^delete-render-selection-overlay

blocks:: [[@km/silvery]]

