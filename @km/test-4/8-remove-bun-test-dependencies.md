---
id: "@km/test-4/8-remove-bun-test-dependencies"
aliases:
  - km-test-4.8
  - km-test-4-8
  - "@km/test-4/8"
created_at: 2026-01-27T14:26:12Z
closed_at: 2026-01-27T15:44:32Z
---

# [x] Remove Bun test dependencies @km/test-4 #task #P2 @claude:bb984f7c

DECISION: Keep Bun test dependencies and test runner.

Reasoning:
- @km/storage package requires Bun runtime for bun:sqlite (used in 33 source files)
- @km/storage uses Worker API (3 files) which is Bun-specific
- Apps and scripts use bun:sqlite (7 files in @km/_orphan/cli, 2 in scripts)
- 45 test files still use bun:test across the codebase
- Vitest migration is incomplete (94 files migrated, 45 remaining)

Conclusion:
Keep Bun as a test runner alongside Vitest. The project needs Bun runtime for production code (bun:sqlite, Workers), so there's no benefit to removing Bun test dependencies.

This bead is documentation-only - no code changes needed.