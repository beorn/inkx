---
mentions:
  - km
id: "@km/tui/focus-cardlike"
aliases:
  - km-tui.focus-cardlike
  - km-tui-focus-cardlike
created_by: Bjørn Stabell
created_at: 2026-04-08T06:35:51Z
closed_at: 2026-04-09T05:59:54Z
close_reason: "Complete. Legacy expandedEditCardId purged (commit d3dc1c229).
  editingDescendant + cursorDescendant reduced signals are the sole drivers of
  cardlike behavior in CardColumn.tsx and TreeNode.tsx. depth===0 remains for
  styling only (bold title, body detection, parent-of-cursor highlight) — NOT
  card detection. Verified: grep expandedEditCardId → 0 hits."
owner: bjorn@stabell.org
---

# [x] Use silvery focus system to define cardlike/editable containers @km/tui #feature #P2

Use silvery focusScope / focus system to define which tree nodes act as "cardlike" containers — the focusable entities that take on editing/selected/cursor visual treatment.

Currently card-ness is implicit from depth (depth 2 = card). Silvery focus scopes could make it explicit: a focusScope wraps a node that can be focused, edited, expanded. The focus system then drives:

- Which node gets the "active container" treatment (border, bg, expand)
- Which node captures keyboard input in edit mode
- Which node shows breadcrumb border when a descendant has cursor

This decouples "cardlike behavior" from tree depth, enabling:

- Sub-items that expand to card-like containers when focused (already partial: "card-like frame when selected")
- Columns that act as cards in tabs view
- Board root that acts as a card in list view
- Nested cards (card within card) if needed

Depends on: @km/tui/hierarchical-node-state (reduced signals provide the state), @km/tui/node-visual-spec (visual rules define what "cardlike" means).

Explore: how silvery focusScope maps to the container concept. Does focusScope already have the right semantics, or does it need extending?

