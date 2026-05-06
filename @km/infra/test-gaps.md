---
mentions:
  - km
  - claude
id: "@km/infra/test-gaps"
aliases:
  - km-infra.test-gaps
  - km-infra-test-gaps
created_by: claude:c9beade3
created_at: 2026-03-14T00:12:16Z
closed_at: 2026-03-19T17:31:15Z
close_reason: "Fixed: (1) targeted STRICT whitelist replacing 10 blanket
  suppressions, (2) fuzz vitest project added to test:all, (3) test:daily script
  with 8 phases, (4-6) zoom bg-color assertion tests. Test:
  board-zoom.slow.spec.ts (6 new tests)."
owner: bjorn@stabell.org
assignee: claude:21c57d63
---

# [x] Test infrastructure gaps: STRICT suppression, missing CI, manual-only fuzz @km/infra #epic #P1 @claude:21c57d63

## Problem

SILVERY_STRICT catches rendering regressions but blanket-suppresses all errors. Fuzz tests are manual-only. No CI. The user's manual `SILVERY_STRICT=1 km view` is more effective at finding bugs than the entire automated test suite.

## Tasks

1. **Stop blanket-suppressing STRICT errors** — fail tests on new mismatches, whitelist only specific known issues
2. **Add fuzz tests to test:all** — they're fast and catch real bugs
3. **Add test:daily** — comprehensive suite that runs everything (fuzz, strict, slow, vendor)
4. **Add zoom + bg color assertions** — cell-level verification in zoom-garble tests
5. **Add breadcrumb edge test** — verify no black space at column 0 after zoom
6. **Add selection bleed test** — verify bg color doesn't leak to non-selected cards

## Bugs driving this

- Black space at left edge of breadcrumb bar after zoom_outwards
- Blue selection background bleed onto non-selected items after zoom
- Both caught manually by user, not by any automated test

