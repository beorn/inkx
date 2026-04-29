---
id: "@km/tui/asana-section-to-oi"
aliases:
  - km-tui.asana-section-to-oi
  - km-tui-asana-section-to-oi
created_by: claude:36393b5d
created_at: 2026-02-18T23:43:25Z
closed_at: 2026-02-19T01:58:33Z
---

# [x] Convert Asana section headings to oi nodes during import @km/tui #feature #P3

O3 recommendation: For imported Asana data with flat li lists, provide tooling to convert section headings (like 'Tasks', 'Next', 'Done') into oi nodes. This creates multi-column board layouts naturally, reducing the frequency of flat single-column boards that cause navigation issues. Currently Asana sections import as body content (p/h nodes), not as structural outline items.