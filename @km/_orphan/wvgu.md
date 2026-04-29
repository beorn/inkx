---
id: "@km/_orphan/wvgu"
aliases:
  - km-wvgu
created_at: 2026-01-20T10:39:07Z
closed_at: 2026-01-20T12:48:48Z
---

# [x] Test inkx in non-TTY environments @km/_orphan #task #P3

Ink PR #854 adds terminal-size fallback for piped processes (non-TTY environments).

Test scenarios:
1. inkx output when piped to another process
2. Running in CI environments
3. Running without a terminal attached
4. Graceful degradation behavior

Reference: https://github.com/vadimdemedes/ink/pull/854