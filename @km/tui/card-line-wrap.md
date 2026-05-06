---
mentions:
  - km
  - claude
id: "@km/tui/card-line-wrap"
aliases:
  - km-tui.card-line-wrap
  - km-tui-card-line-wrap
created_by: claude:36393b5d
created_at: 2026-02-19T15:11:23Z
closed_at: 2026-02-19T18:46:23Z
owner: bjorn@stabell.org
assignee: claude:8f007ba9
---

# [x] Card title word-wrap breaks mid-expression @km/tui #bug #P2 @claude:8f007ba9

Card title wraps incorrectly: 'US$ 3k x 4 = $12k + $400-700/mo' breaks after '$12k' leaving '+' orphaned on next line. The wrap should keep the + with adjacent content.

