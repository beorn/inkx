---
mentions:
  - km
id: "@km/inbox/test-3"
aliases:
  - km-test-3
  - "@km/_orphan/test-3"
created_at: 2026-01-27T13:39:36Z
closed_at: 2026-01-27T19:58:39Z
---

# [x] bun tap waits for all tests to finish before showing output @km/_orphan #bug #P2

When running parallel TUI mode, mdtest streams properly but bun:fast and bun:slow don't show any output until all tests complete.

**Investigation**: Tried using pseudo-TTY (pty) to make Bun think it's in a terminal:

- Used `script -q /dev/null bun test` to create pty
- Bun still outputs only final summary, no incremental progress
- Even 5+ second test runs don't show streaming output

**Root cause**: Bun test runner doesn't support incremental output. Available reporters:

- junit: writes to file after all tests complete
- dots: streams dots but no test names/TAP format
- default: shows only final summary

**Possible solutions**:

1. Parse bun's dots reporter (--reporter=dots) line-by-line
  - Pro: Streams as tests complete
  - Con: No test names, just dots
2. Request streaming TAP reporter from Bun team (upstream)
3. Document as known limitation

**Status**: Blocked by Bun not having streaming reporter with test names.

