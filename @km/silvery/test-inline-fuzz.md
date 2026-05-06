---
mentions:
  - km
id: "@km/silvery/test-inline-fuzz"
aliases:
  - km-silvery.test-inline-fuzz
  - km-silvery-test-inline-fuzz
created_by: claude:c9beade3
created_at: 2026-03-13T05:03:13Z
closed_at: 2026-03-13T05:38:59Z
close_reason: Added inline mode fuzz tests in
  vendor/silvery/tests/inline-fuzz.fuzz.ts — 6 test cases covering resize
  roundtrip, content changes (incremental vs full), cursor-only changes (minimal
  output), combined mutations, grow/shrink cycles, and scrollback promotion
owner: bjorn@stabell.org
---

# [x] Testing: Inline mode needs its own fuzz suite @km/silvery #task #P2

Missing property tests: resize-resize back-same state, external writes between frames, cursor-only changes, content shrink with styled blank lines, scrollback promotion + resize.

