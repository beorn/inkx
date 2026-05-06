---
mentions:
  - km
  - Bjørn
id: "@km/tui/expand-on-subedit"
aliases:
  - km-tui.expand-on-subedit
  - km-tui-expand-on-subedit
created_by: Bjørn Stabell
created_at: 2026-04-01T14:42:28Z
closed_at: 2026-04-01T15:03:55Z
close_reason: "Fixed: card now expands when editing sub-items via cardNodeId
  tracking in inlineEditBlock + editingCardNodeId reactive signal in TreeNode"
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Editing a sub-item should expand the full card, not just the sub-item @km/tui #bug #P2 @Bjørn Stabell

When editing a card title, the entire card expands to show all content. But when editing a section/sub-item within a card, only that sub-item is shown — the rest of the card stays collapsed. Expected: entering edit mode on any node within a card should expand and show the full card.

