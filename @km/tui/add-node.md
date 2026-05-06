---
mentions:
  - km
  - claude
id: "@km/tui/add-node"
aliases:
  - km-tui.add-node
  - km-tui-add-node
created_by: claude:703e68be
created_at: 2026-02-11T15:25:34Z
closed_at: 2026-02-11T15:57:32Z
owner: bjorn@stabell.org
assignee: claude:703e68be
---

# [x] Add node function via Enter/Return (decker-style) @km/tui #feature #P2 @claude:703e68be

Enter/Return should add a new sibling node below the current one. Behavior should be similar to decker's enter behavior (which handles indentation, splitting, etc). Esc should just exit to node mode without undoing the change.

