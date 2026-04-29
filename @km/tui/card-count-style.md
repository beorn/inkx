---
id: "@km/tui/card-count-style"
aliases:
  - km-tui.card-count-style
  - km-tui-card-count-style
created_by: claude:124bfbe5
created_at: 2026-02-12T22:29:32Z
closed_at: 2026-02-12T23:41:46Z
---

# [x] Card count: only show when folded, style same as title @km/tui #feature #P3

Card child count should match title styling: if title is dimmed, count should be dimmed too. Currently count has its own fixed style (white/not-dimmed) regardless of the title's appearance. Count should inherit the same color and dim state as the card title.