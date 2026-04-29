---
id: "@km/_orphan/lkm5"
aliases:
  - km-lkm5
created_at: 2026-01-21T14:54:15Z
closed_at: 2026-01-21T15:46:14Z
---

# [x] TUI keyboard unresponsive after render @km/_orphan #bug #P0

After 'km view' renders, keyboard is completely unresponsive - cannot press Ctrl+C or navigate with j/k keys. The N+1 query fix (batch getChildCountsBatch) was applied but keyboard still doesn't work. Debug log shows isRawModeSupported but stdin may not be properly set up for raw mode input handling.