---
mentions:
  - km
  - claude
id: "@km/silvery/compat-autogen"
aliases:
  - km-silvery.compat-autogen
  - km-silvery-compat-autogen
created_by: claude:73d7a332
created_at: 2026-03-12T17:18:38Z
closed_at: 2026-03-12T23:35:37Z
close_reason: "Auto-generated ink compat tests from upstream via codemod. 34
  vitest files, 10,361 lines, 21 fixtures. 804/813 (98.9%) Ink tests pass, 32/32
  Chalk. Docs updated: CLAUDE.md, ANALYSIS.md, RESULTS.md, AUDIT.md."
owner: bjorn@stabell.org
assignee: claude:73d7a332
---

# [x] Auto-generate ink compat tests from upstream via codemod @km/silvery #task #P2 @claude:73d7a332

Auto-generate all ink compat vitest tests from upstream ink repo via codemod transforms. No hand-ported tests checked in — generate on-the-fly and run.

## Approach

1. Add a codegen step to compat-check.ts that transforms ink's ava tests to vitest
2. Codemod rewrites: ava→vitest imports, t.is→expect().toBe, t.true→expect().toBe(true), etc.
3. Replace ink imports with silvery compat imports
4. Replace PTY term() helper with silvery's run()+termless for interactive tests
5. Generated tests go to a temp dir (not checked in)
6. Delete existing hand-ported tests — the generated ones replace them

## PTY tests (118 pending)

The PTY tests use node-pty to spawn fixture processes. We translate them to use silvery's createTermless() + run() which provides the same capabilities without process spawning.

