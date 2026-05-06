---
mentions:
  - next
  - someday
  - km
  - claude
id: "@km/tui/duplicate-embeds"
aliases:
  - km-tui.duplicate-embeds
  - km-tui-duplicate-embeds
created_by: claude:8f007ba9
created_at: 2026-02-19T18:54:10Z
closed_at: 2026-02-19T19:04:43Z
owner: bjorn@stabell.org
assignee: claude:8f007ba9
---

# [x] Import: @next/@someday have duplicate embed references @km/tui #bug #P2 @claude:8f007ba9

@next.md and @someday.md contain identical 205 embed lists. Additionally, 14 pairs of consecutive duplicate embeds (same ![[...]] line repeated). These are km board views overlaid on imports — need deduplication or separate handling.

