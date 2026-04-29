---
id: "@km/tui/link-title"
aliases:
  - km-tui.link-title
  - km-tui-link-title
created_by: claude:fcaad2fa
created_at: 2026-02-18T15:04:09Z
closed_at: 2026-02-19T16:17:15Z
---

# [x] Cards show raw link IDs (^12031...) instead of resolved target titles @km/tui #bug #P2 @claude:fcaad2fa

Cards with link_to set show raw caret-ID content (e.g., ^1203128650780856) instead of resolving to the link target's title. In Asana, these show as 'Tax projects' etc. The card renderer should detect link nodes and display the target node's content/title instead of the raw link reference. Seen in: Waiting column of imports/asana FAMILY SPRINT board.