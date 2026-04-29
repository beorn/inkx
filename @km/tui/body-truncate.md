---
id: "@km/tui/body-truncate"
aliases:
  - km-tui.body-truncate
  - km-tui-body-truncate
created_by: claude:a5c7f7de
created_at: 2026-02-14T15:59:22Z
closed_at: 2026-02-14T16:04:22Z
---

# [x] Body text truncated mid-line instead of at line boundary; should show more when space available @km/tui #bug #P2

When viewing /tmp/vt/CLAUDE.md as a board, the Description body card shows text like 'This project uses bd...' truncated in the middle of the second line. Two issues: (1) Truncation should happen at line boundaries, not mid-line. (2) When there's vertical space available in the column, body text should show more content instead of truncating early. Need heuristics for how much to show based on available space.