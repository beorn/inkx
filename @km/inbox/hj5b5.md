---
id: "@km/inbox/hj5b5"
aliases:
  - km-hj5b5
  - "@km/_orphan/hj5b5"
created_at: 2026-01-27T13:59:32Z
closed_at: 2026-01-27T14:00:10Z
assignee: claude:7ce6f6bf
---

# [x] tap CLI doesn't accept explicit file paths, only globs @km/_orphan #bug #P2 @claude:7ce6f6bf

When running:
```bash
bun tap packages/km-agent/tests/harness.test.ts packages/km-beads/tests/deps.test.ts
```

It reports: ✓ 0 tests: 0 passed, 0 failed, 0 skipped

**Root cause**: findFiles() in cli/runner.ts:31-42 treats all arguments as glob patterns. Explicit file paths don't match when passed to Glob.scan().

**Expected**: Should accept both:
- Explicit paths: packages/@km/_orphan/agent/tests/harness.test.ts
- Glob patterns: packages/**/*.test.ts

**Fix**: Check if argument is an existing file, if so add directly, otherwise treat as glob.