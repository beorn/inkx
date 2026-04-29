---
id: "@km/_orphan/jdo67"
aliases:
  - km-jdo67
created_by: claude:73d7a332
created_at: 2026-03-11T07:23:24Z
closed_at: 2026-03-24T06:59:39Z
close_reason: Already done — all silvery tests use createTermless() or
  createRenderer(). No PTY-spawned tests found. Only Bun.spawn usage is for
  build verification (not TUI testing).
---

# [x] Adopt createTermless() across silvery test suite @km/_orphan #feature #P2 @claude:4929065a

Convert existing PTY-based tests and add termless coverage for scrollback, resize, and inline mode. createTermless() from @silvery/test wraps createTerm(createXtermBackend(), dims) for ergonomic in-process terminal emulation testing.

Tasks:
1. Convert all PTY-spawned tests to in-process createTermless() (faster, deterministic)
2. Add termless tests for scrollback promotion (currently missing ╰ bottom borders)
3. Add termless tests for terminal resize + reflow
4. Add termless tests for inline mode output phase (content capping, cursor tracking)
5. Add termless tests for ScrollbackList freeze/promote cycle
6. Consider adding resize support to createTerm(backend, dims) — needs emulator.resize() + re-render trigger