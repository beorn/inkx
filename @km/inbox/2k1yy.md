---
id: "@km/_orphan/2k1yy"
aliases:
  - km-2k1yy
created_by: claude:8fc35754
created_at: 2026-03-03T07:34:30Z
closed_at: 2026-03-03T07:53:11Z
owner: bjorn@stabell.org
---

# [x] Composable Region + Matcher API for termless @km/_orphan #feature #P1

Replace ~27 flat matchers with composable region selectors (screen/scrollback/buffer/viewport/row/cell/range) + generic matchers (toContainText/toBeBold/toHaveFg etc). Playwright-inspired WHERE x WHAT composition.