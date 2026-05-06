---
mentions:
  - km
  - Bjørn
id: "@km/tui/tab-first-child"
aliases:
  - km-tui.tab-first-child
  - km-tui-tab-first-child
created_by: Bjørn Stabell
created_at: 2026-04-01T15:04:57Z
closed_at: 2026-04-01T15:38:20Z
close_reason: Fixed. indent/outdent now targets the edited sub-item (via
  inlineEditBlock.nodeId), not the parent card. First-child guard prevents
  indent when no previous sibling.
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Tab on first child of card indents entire card (should be no-op with bell) @km/tui #bug #P1 @Bjørn Stabell

Steps:

1. Enter on a card with subitems → edit mode
2. Enter → creates new subitem before existing one
3. Tab on this new first-child subitem → entire card disappears (reparented into parent card)

Expected: Tab on a first child (no previous sibling to indent under) should be a no-op with visual bell. Tab should only affect the selected sub-item, never the card itself.

