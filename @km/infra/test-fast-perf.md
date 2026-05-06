---
mentions:
  - km
  - claude
id: "@km/infra/test-fast-perf"
aliases:
  - km-infra.test-fast-perf
  - km-infra-test-fast-perf
created_by: claude:3d4c9a23
created_at: 2026-02-11T16:31:01Z
closed_at: 2026-02-11T16:38:20Z
owner: bjorn@stabell.org
assignee: claude:3d4c9a23
---

# [x] Fix test:fast performance regression (<10s target) and add test:changed @km/infra #task #P2 @claude:3d4c9a23

## Problem

test:fast used to run in <10s but now takes ~50s+ (clean CPU). packages/ tests run in 3.4s, but apps/@km/tui/ alone takes ~120s when run solo (or dominates the parallel pool).

The 5s target in docs is aspirational but <10s is the real goal. Something regressed — likely the growing number of TUI test files (47 fast files) each creating expensive testEnv/createBoardDriver fixtures.

## Root Causes to Investigate

1. **apps/@km/tui/ dominance**: 47 fast test files, 900 test calls, 88 testEnv calls in board.spec.ts alone. Each testEnv creates a full React render tree. These may have gotten heavier as inkx/flexx grew.
2. **cursor-profile.test.ts** (apps/@km/tui/tests/): NOT a test — it's a profiling tool that opens real vault at /tmp/vt, has console.log everywhere, and fails when vault data is stale. Should be excluded from test:fast (rename to .slow.test.ts or .bench.ts).
3. **Vitest startup/import overhead**: Even packages/ takes 3.4s wall for 4.1s of test execution — most time is in transform (5.3s) and import (15.6s). The module graph may have grown.
4. **Worker pool contention**: Multiple Claude sessions can accidentally run test:fast concurrently, causing 28-minute runs at 8% CPU. No guard against this.

## Tasks

### A. Add test:changed (quick win)

- [ ] Add `"test:changed": "bun vitest run --changed --exclude='**/*.slow.*' --exclude='vendor/**'"` to package.json
- [ ] Update .claude/skills/tests/SKILL.md to recommend test:changed during iteration, test:fast before commit
- [ ] Update CLAUDE.md Commands section

### B. Fix cursor-profile.test.ts

- [ ] Rename to cursor-profile.slow.test.ts (or .bench.ts) — it uses real vault, console.log, and fails on stale data
- [ ] Add skipIf(!existsSync(VAULT_PATH)) guard

### C. Profile test:fast to find regression

- [ ] Run test:fast:html with perf tracking to get per-file timing
- [ ] Identify which TUI test files are slowest
- [ ] Check if testEnv/createBoardDriver setup cost has grown (compare with git blame on board-test.ts helpers)
- [ ] Check vitest transform/import time — is the module graph bloated?

### D. Reduce TUI test overhead (if needed after profiling)

- [ ] Consider shared fixtures for files with >15 testEnv calls (board-edit.spec.ts: 28, board-navigation.spec.ts: 29, board-selection.spec.ts: 28, board-view.spec.ts: 23, inline-edit.spec.ts: 24)
- [ ] Check if board.spec.ts (88 calls, 2023 lines) can share more fixtures across its journey tests
- [ ] Consider vitest --pool=threads vs --pool=forks tradeoff

### E. Guard against concurrent runs

- [ ] Consider a lockfile or PID check in test:fast to warn if another vitest is already running

## DI Compliance (from review)

- 12x new Database(':memory:') in @km/storage fast tests (acceptable for low-level storage)
- 6x test.skip() left in committed tests (cli.slow.test.ts:820/832/848/866, board.spec.ts:366, cursor-stability.spec.ts:92)
- Console output in cursor-profile.test.ts and curswanty-vt-repro.test.ts

## Reference

- packages/ run: 3.4s (baseline, fine)
- apps/@km/tui/tests/: ~120s solo (the bottleneck)
- apps/@km/_orphan/cli + apps/@km/_orphan/repl: fast
- Concurrent vitest processes cause catastrophic slowdown (28min at 8% CPU)

