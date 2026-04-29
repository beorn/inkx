---
id: "@km/tui/detail-tags-empty"
aliases:
  - km-tui.detail-tags-empty
  - km-tui-detail-tags-empty
created_by: claude:d697f216
created_at: 2026-02-25T13:36:29Z
closed_at: 2026-02-25T20:10:45Z
---

# [x] Detail pane: tag children show as empty # without names @km/tui #bug #P1

In tags view, the folder detail pane shows child items under each tag as just '#' without the tag name. Likely: child content starts with #tagname, InlineText parser recognizes it as a tag sigil, but the sigil rendering strips the name in context.