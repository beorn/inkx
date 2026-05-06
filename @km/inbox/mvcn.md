---
mentions:
  - km
id: "@km/inbox/mvcn"
aliases:
  - km-mvcn
  - "@km/_orphan/mvcn"
created_at: 2026-01-20T10:38:20Z
closed_at: 2026-01-20T10:54:45Z
---

# [x] Add rapid keystroke handling tests to inkx @km/_orphan #task #P1

Ink PR #782 (22 comments, still open after 4+ months) addresses rapid keypress dropping in automation/testing scenarios.

Test scenarios:

1. Rapid keypresses in automated tests
2. Paste operations (bracketed paste)
3. Unicode edge cases (variation selectors, surrogate pairs)
4. Incomplete escape sequences (buffered parsing)

This is important for reliable testing infrastructure.

