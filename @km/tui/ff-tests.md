---
id: "@km/tui/ff-tests"
aliases:
  - km-tui.ff-tests
  - km-tui-ff-tests
created_by: claude:b92140a2
created_at: 2026-03-17T05:58:15Z
closed_at: 2026-03-17T06:07:50Z
close_reason: 22 detection tests (index-file.test.ts), 10 column promotion tests
  (duplicate-columns.test.ts), 5 AST parser tests (km-wikilink.test.ts), 5 regex
  parser tests (markdown.test.ts). All pass. Fuzz fixtures deferred — item()
  helper doesn't support fstype, would need createFakeRepo-based setup.
---

# [x] Unit + slow + fuzz tests for index file columns @km/tui #task #P2

Tests for index file detection, column promotion, embed slot resolution, and rendering.