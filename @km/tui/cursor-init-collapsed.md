---
id: "@km/tui/cursor-init-collapsed"
aliases:
  - km-tui.cursor-init-collapsed
  - km-tui-cursor-init-collapsed
created_by: claude:a5c7f7de
created_at: 2026-02-14T21:46:19Z
closed_at: 2026-02-14T21:46:30Z
---

# [x] Cursor placed on invisible card when first column is collapsed at init @km/tui #bug #P2

testEnv/testEnvWithRepo always place cursor on first column's first card, even when that column is collapsed. Fixed with computeInitialCursor() helper that skips collapsed columns.