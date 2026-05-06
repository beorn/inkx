---
mentions:
  - km
  - claude
id: "@km/inbox/8pib7"
aliases:
  - km-8pib7
  - "@km/_orphan/8pib7"
created_at: 2026-01-27T13:48:01Z
closed_at: 2026-01-27T13:56:36Z
assignee: claude:7ce6f6bf
---

# [x] Parallel TUI: bun test results don't stream, appear all at once @km/_orphan #bug #P2 @claude:7ce6f6bf

When running parallel TUI mode, mdtest streams properly but bun:fast and bun:slow don't show any output until all tests complete.

**Root cause**: Bun test runner doesn't support TAP reporter. Available reporters:

- junit: writes to file, only complete after all tests finish
- dots: streams dots but no test names/TAP format

**Current implementation**: runBunTap() uses junit reporter, waits for process exit, converts XML to TAP (lines 30-60 in producers/bun.ts)

**Possible solutions**:

1. Parse bun's default output line-by-line to generate TAP incrementally
2. Use --reporter=dots and convert dots to minimal TAP
3. Request TAP reporter from Bun team (upstream feature request)
4. Document limitation: bun tests buffer, mdtest streams

**Blocked by**: Bun not having streaming TAP reporter

