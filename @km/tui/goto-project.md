---
mentions:
  - km
  - claude
id: "@km/tui/goto-project"
aliases:
  - km-tui.goto-project
  - km-tui-goto-project
created_by: claude:949598cc
created_at: 2026-02-11T20:21:30Z
closed_at: 2026-02-18T08:01:58Z
owner: bjorn@stabell.org
assignee: claude:5f0aee02
---

# [x] P shortcut: go to project for embedded links (follow link, zoom to grandparent, select embed) @km/tui #feature #P3 @claude:5f0aee02

Add a 'P' keybinding that follows embedded links to show them in context. When cursor is on a node with link_to (an embed), pressing P should: 1) Resolve the link target, 2) Zoom to the grandparent of the link target (so you see it in board context), 3) Select the embedded link's target node. This gives 'go to project/source' functionality for embeds — you can see where the original lives and navigate from there.

