---
id: "@km/tui/anchor-focus-selection"
aliases:
  - km-tui.anchor-focus-selection
  - km-tui-anchor-focus-selection
created_by: claude:f53c94c1
created_at: 2026-03-29T05:13:35Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tui.anchor-focus-selection
    depends_on_id: km-tui
    type: parent-child
    created_at: 2026-04-15T12:19:02Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [ ] Selection as anchor/focus Paths (design doc vision) @km/tui #feature #P4

blocks:: [[@km/tui]]

Replace positional multi-selection (multiSelected Set + colIndex/cardIndex/nodeIndex) with the anchor/focus Path model from docs/design/visual-navigation.md. Single cursor: anchor === focus. Range select: anchor stays, focus moves. Path.compare gives ordering. This eliminates SelectionCtx's dependency on view-level columns/indices — selection becomes pure tree arithmetic.