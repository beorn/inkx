---
id: "@km/_orphan/6rjn"
aliases:
  - km-6rjn
created_at: 2026-01-18T23:00:08Z
closed_at: 2026-01-18T23:17:44Z
---

# [x] Verify ColumnsView truncated content fix @km/_orphan #bug #P2

User reported ColumnsView has truncated content. Changes were made to revert to simpler width distribution using integer math instead of FlexRow. MUST REPRODUCE: Use e2e testing or headless ttyd+Playwright to capture screenshot of ColumnsView with multiple columns. Verify content is not truncated/clipped. Test with board having 4+ columns and 8+ cards per column.