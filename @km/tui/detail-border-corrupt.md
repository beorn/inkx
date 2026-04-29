---
id: "@km/tui/detail-border-corrupt"
aliases:
  - km-tui.detail-border-corrupt
  - km-tui-detail-border-corrupt
created_by: claude:a5c7f7de
created_at: 2026-02-14T15:06:57Z
closed_at: 2026-02-14T15:11:55Z
---

# [x] Detail pane: left column card borders corrupted when detail pane open @km/tui #bug #P2 @claude:a5c7f7de

When zoomed into @next in /tmp/vt, pressing space to open the detail pane causes the left column's rounded box borders to be corrupted/misaligned. The border characters on the left edge of cards appear garbled. Repro: bun km view /tmp/vt → zoom into @next → press space to open detail pane → left column borders are broken.