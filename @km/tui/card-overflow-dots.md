---
mentions:
  - km
id: "@km/tui/card-overflow-dots"
aliases:
  - km-tui.card-overflow-dots
  - km-tui-card-overflow-dots
created_by: claude:a5c7f7de
created_at: 2026-02-14T21:52:58Z
closed_at: 2026-02-14T22:16:09Z
owner: bjorn@stabell.org
---

# [x] Card overflow: single ... indicator at end of card @km/tui #feature #P3

Card overflow indicators (... at bottom of truncated cards) should: 1) Use ... (or center dots ···) instead of current indicator, 2) If multiple heading levels each produce ..., collapse into a single ... at the end of the card. Current behavior may show multiple ... lines when multiple headings overflow.

