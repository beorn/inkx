---
id: "@km/_orphan/fxk2"
aliases:
  - km-fxk2
created_at: 2026-01-20T14:30:32Z
closed_at: 2026-01-20T14:51:47Z
---

# [x] mdtest: Add tests for PtySession @km/_orphan #task #P2

High: PtySession (vendor/beorn-mdtest/src/ptySession.ts) has zero unit tests.

**Impact:**
- PtySession is the DEFAULT session type on POSIX (macOS, Linux)
- ~257 lines of untested code handling PTY subprocess management
- OSC 133 detection, output stripping, timeout handling all untested

**Currently:**
Only indirect coverage via .test.md integration tests.

**Need:**
- Unit tests for PtySession.execute()
- Tests for OSC 133 marker detection
- Tests for timeout and signal handling
- Tests for stripAnsi option

**Files:**
- vendor/beorn-mdtest/src/ptySession.ts (implementation)
- vendor/beorn-mdtest/tests/ (add ptySession.test.ts)