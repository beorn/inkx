---
mentions:
  - km
  - claude
id: "@km/tui/embed-resolve"
aliases:
  - km-tui.embed-resolve
  - km-tui-embed-resolve
created_by: claude:36393b5d
created_at: 2026-02-19T15:20:43Z
closed_at: 2026-02-19T16:17:15Z
owner: bjorn@stabell.org
assignee: claude:36393b5d
---

# [x] Embedded nodes show raw IDs instead of resolved content @km/tui #bug #P2 @claude:36393b5d

Embed references \![[^sourceId]] in detail pane body show as raw short IDs (e.g., BKK8N7QA) instead of resolving to the target node's content. Likely link_to resolution not happening during parse, or body rendering not following link_to.

