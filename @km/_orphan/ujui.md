---
id: "@km/_orphan/ujui"
aliases:
  - km-ujui
created_at: 2026-01-18T23:00:09Z
closed_at: 2026-01-18T23:17:49Z
---

# [x] Verify ListView uses full column height @km/_orphan #bug #P2

User reported ListView only uses about half the available height. Changes were made to fix height calculation (was subtracting too much). MUST REPRODUCE: Use e2e testing or headless ttyd+Playwright to capture screenshot of ListView. Verify list uses full terminal height minus top/bottom bars. Test with board having many items to trigger scrolling.