---
mentions:
  - km
id: "@km/inbox/eait"
aliases:
  - km-eait
  - "@km/_orphan/eait"
created_at: 2026-01-20T14:30:40Z
closed_at: 2026-01-20T14:51:47Z
---

# [x] mdtest: Add tests for shell.ts (security-critical) @km/_orphan #task #P2

High: shell.ts exports shellEscape(), buildScript(), buildHookScript() with zero direct tests.

**Security concern:**
shellEscape() handles shell injection prevention. Without tests, edge cases may have vulnerabilities.

**Functions to test:**

1. shellEscape(s: string) - escapes strings for safe shell use
- Test special chars: $, `, ', ", newlines
- Test safe passthrough: alphanumeric, /, ., :, -
5. buildScript(commands, opts, envFile, cwdFile, funcFile)
- Test state loading from files
- Test block options (cwd, env)
- Test state saving
10. buildHookScript(hookName, envFile, cwdFile, funcFile)
- Test hook existence check
- Test state loading/saving

**Files:**

- vendor/beorn-mdtest/src/shell.ts:39-114
- vendor/beorn-mdtest/tests/ (add shell.test.ts)

