---
id: "@km/silvery/unicode-tests"
aliases:
  - km-silvery.unicode-tests
  - km-silvery-unicode-tests
created_by: claude:474834b0
created_at: 2026-03-09T21:59:05Z
closed_at: 2026-03-09T23:49:09Z
close_reason: 40 unicode tests exist at tests/unicode/unicode.test.tsx covering
  CJK, emoji, combining chars, RTL. All pass.
owner: bjorn@stabell.org
---

# [x] Unicode test suite: CJK, emoji, combining chars, RTL @km/silvery #task #P3

Test CJK wide chars (2-cell), emoji (skin tone, ZWJ, flags), combining marks, and RTL text. Verify correct cell width calculation and truncation.