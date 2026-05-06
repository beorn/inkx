---
mentions:
  - km
  - claude
id: "@km/tui/fold-boundary"
aliases:
  - km-tui.fold-boundary
  - km-tui-fold-boundary
created_by: claude:97b8de73
created_at: 2026-02-23T00:30:41Z
closed_at: 2026-02-23T01:20:37Z
owner: bjorn@stabell.org
assignee: claude:97b8de73
---

# [x] Bell + message when fold/unfold has no effect @km/tui #feature #P2 @claude:97b8de73

Ring a bell and show 'too much content' when unfolding would result in too many items. Ring a bell if folding doesn't result in any change (reached the end). Don't continue folding level beyond this - no negative or super big folding levels.

