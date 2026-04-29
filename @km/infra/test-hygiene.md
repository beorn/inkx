---
id: "@km/infra/test-hygiene"
aliases:
  - km-infra.test-hygiene
  - km-infra-test-hygiene
created_by: claude:3d4c9a23
created_at: 2026-02-11T16:37:45Z
closed_at: 2026-02-11T16:45:44Z
owner: bjorn@stabell.org
---

# [x] Clean up stray debug/repro test files and prevent recurrence @km/infra #task #P2

## Problem

Ad-hoc test files created during bug investigations accumulate in the repo and never get cleaned up. They run in test:fast, adding overhead and occasionally hanging (scroll-follow.test.ts had infinite loops for weeks).

## Evidence

7 stray files in apps/@km/tui/tests/ with debug/repro/analysis/profile names:

| File | Origin | Bug Fixed? | Still useful? |
|------|--------|-----------|--------------|
| cursor-right-repro.test.ts | fix: curswantY round-trip | YES (39847eb5) | Regression guard — KEEP but rename |
| curswanty-repro.test.ts | fix: stickyY capture | YES (8c2c2c0c) | Regression guard — KEEP but rename |
| curswanty-vt-repro.test.ts | fix: stickyY capture | YES (8c2c2c0c) | Overlaps curswanty-repro — probably DELETE |
| debug-incremental.test.ts | perf: cursor benchmarks | N/A (diagnostic) | Uses writeFileSync — DELETE or make .slow |
| outline-depth-debug.test.ts | fix: flexx position delta | YES (d6dd35cc) | Regression guard — KEEP but rename |
| ansi-diff-analysis.test.ts | diag: level-nav-shift | Partial | Invariant tests — KEEP |
| scroll-follow.test.ts | (unknown) | N/A | FIXED in e8d852fd — had infinite loops |

Also: cursor-profile.slow.test.ts (already fixed — renamed from .test.ts, added skipIf).

## Root Cause

The bug debugging workflow (.claude/skills/tui/fix.md) says 'write a failing test first' but doesn't say what to do with it AFTER the bug is fixed. Options:

1. Promote to regression test (rename from `*-repro.test.ts` to a proper name)
2. Delete if covered by other tests
3. Move to .slow. if it's a diagnostic tool

## Tasks

### A. Clean up existing stray files
- [ ] Review each file above, decide keep/delete/rename
- [ ] Delete debug-incremental.test.ts (diagnostic tool with writeFileSync, not a test)
- [ ] Evaluate curswanty-vt-repro.test.ts overlap with curswanty-repro.test.ts
- [ ] Rename valuable repros to proper regression test names (drop '-repro'/'-debug' suffix)

### B. Prevent recurrence — update workflows
- [ ] Update .claude/skills/tui/fix.md 'Rendering Bugs' section: after fixing a bug, the repro test must be either promoted (renamed) or deleted. Never leave *-repro.test.ts in the repo.
- [ ] Update .claude/skills/tests/tdd-workflow.md: add 'Cleanup' step after bug is fixed
- [ ] Consider adding a lint rule or pre-commit check that flags files matching *-repro.test.ts or *-debug.test.ts

### C. Convention to document
- [ ] Add to docs/dev/testing.md or test skill: 'Debug/repro test files MUST be cleaned up when the bug is fixed. Either rename to a proper regression test name or delete if redundant.'
- [ ] Naming convention: temporary investigation files should use .scratch.ts (not .test.ts) so they don't run in test suites. Only promote to .test.ts when they become permanent regression guards.