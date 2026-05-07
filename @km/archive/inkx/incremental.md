---
mentions:
  - km
  - claude
id: "@km/inkx/incremental"
aliases:
  - km-inkx.incremental
  - km-inkx-incremental
created_at: 2026-02-05T00:15:20Z
closed_at: 2026-02-05T12:21:31Z
assignee: claude:b53ef7e4
---

# [x] Incremental rendering bugs (INKX_STRICT failures) @km/inkx #feature #P2 @claude:b53ef7e4

4 INKX_STRICT=1 incremental render mismatches remain, all in apps/@km/tui/tests/board.spec.ts:

- Render #7: MISMATCH at (0, 3)
- Render #8: MISMATCH at (0, 3)
- Render #3: MISMATCH at (13, 3)
- Render #4: MISMATCH at (13, 3)

These are unhandled errors (not test failures), meaning the incremental renderer produces different pixels than a fresh render at these coordinates. The inkx test suite (vendor/beorn-inkx/tests/) is fully clean - all 1562 tests pass with INKX_STRICT=1.

Goal: fix all 4 mismatches so INKX_STRICT can be the default.

