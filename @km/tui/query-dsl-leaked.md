---
mentions:
  - km
  - claude
id: "@km/tui/query-dsl-leaked"
aliases:
  - km-tui.query-dsl-leaked
  - km-tui-query-dsl-leaked
created_by: claude:8f007ba9
created_at: 2026-02-19T16:52:09Z
closed_at: 2026-02-19T17:44:24Z
owner: bjorn@stabell.org
assignee: claude:8f007ba9
---

# [x] Internal query DSL and Rules config visible to user in sections @km/tui #bug #P2 @claude:8f007ba9

Scrolling to top of expanded Inbox shows raw query: 'Inbox km.add:: ./inbox/** km.add:: due:past -status:done...' Also, detail pane shows 'Rules  default: true, add:' as metadata. Internal configuration should be hidden. Screenshots: /tmp/explore-screenshots/16-inbox-bottom.png, 22-narrow-detail.png

