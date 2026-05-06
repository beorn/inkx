---
mentions:
  - km
id: "@km/silvery/theme-v4-stripInlineColors"
aliases:
  - km-silvery.theme-v4-stripInlineColors
  - km-silvery-theme-v4-stripInlineColors
created_by: Bjørn Stabell
created_at: 2026-04-19T17:59:05Z
closed_at: 2026-04-25T07:38:42Z
close_reason: "Evaluation complete (km 09c7284b9): kept as-is, documented in
  selection-style.ts. The mechanism is already context-based
  (InlineRenderContext flag, not prop-drilled) and the per-view shouldStripColor
  conditions encode view-local 'is this row on a forced-color surface?'
  judgments that auto-derivation can't replace — search-highlight and
  decoration-based dim aren't visible from ancestor color props. The
  TreeNode/NodeView divergence in shouldStripColor (tc != null guard) is
  intentional: TreeNode supports an ANSI16 fallback path where isSelected can
  occur without a title color override; NodeView always has one.
  Selection-style.ts gap note updated to record the decision."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.theme-v4-stripInlineColors
    depends_on_id: km-all.sterling
    type: parent-child
    created_at: 2026-04-24T16:14:48Z
    created_by: claude:5e447b66
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-all.sterling
---

# [x] Phase 4: km-tui stripInlineColors prop tidy-up @km/silvery #task #P4

blocks:: [[@km/all/sterling]]

Evaluate whether stripInlineColors can be derived from context instead of explicit prop threading. Small. Might land as 'kept as-is, documented'.

