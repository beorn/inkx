---
id: "@km/tui/raw-embed-ids"
aliases:
  - km-tui.raw-embed-ids
  - km-tui-raw-embed-ids
created_by: claude:8f007ba9
created_at: 2026-02-19T16:52:06Z
closed_at: 2026-02-19T17:25:03Z
owner: bjorn@stabell.org
assignee: claude:8f007ba9
---

# [x] Expanded sections show raw Asana embed IDs instead of task titles @km/tui #bug #P1 @claude:8f007ba9

Expanding Inbox section reveals hundreds of items with raw IDs instead of task titles. Three patterns: 688309546998762-pers-prod#^1209600947800994, user-346577585145-bj-rn-stabell#^1210093006850265, ^1k4a. These are unresolved embed references (\![[...]]) that should show the target task's title. Screenshots: /tmp/explore-screenshots/10-inbox-expanded.png, 14-someday-inbox-expanded.png, 16-inbox-bottom.png