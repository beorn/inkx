---
id: "@km/silvery/visual-regression"
aliases:
  - km-silvery.visual-regression
  - km-silvery-visual-regression
created_by: claude:474834b0
created_at: 2026-03-09T21:59:07Z
---

# [ ] Visual regression testing via termless @km/silvery #task #P3

Use @termless/test for snapshot-based visual regression: feed silvery ANSI output through real terminal backends, assert colors/cursor/modes. Depends on termless being ready.