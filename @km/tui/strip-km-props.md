---
id: "@km/tui/strip-km-props"
aliases:
  - km-tui.strip-km-props
  - km-tui-strip-km-props
created_by: claude:8f007ba9
created_at: 2026-02-19T19:11:39Z
closed_at: 2026-02-19T21:38:06Z
owner: bjorn@stabell.org
assignee: claude:8f007ba9
---

# [x] Section cards show km.color:: and km.collapse:: system props in card title @km/tui #bug #P3 @claude:8f007ba9

Section oi nodes have content like 'Waiting km.color:: yellow' which renders verbatim on the card. The text pipeline strips km.* in rich mode, but the card title may not be going through processText. Fix: ensure all card title rendering uses processText with rich mode, or add a display-level strip for km.* props.