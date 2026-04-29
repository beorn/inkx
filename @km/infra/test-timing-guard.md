---
id: "@km/infra/test-timing-guard"
aliases:
  - km-infra.test-timing-guard
  - km-infra-test-timing-guard
created_by: claude:3d4c9a23
created_at: 2026-02-11T16:38:00Z
closed_at: 2026-02-11T16:45:42Z
---

# [x] Add test:fast timing guard — alarm when >15s @km/infra #task #P0

## Problem

test:fast had an infinite-loop test (scroll-follow.test.ts) that went undetected for weeks, making test:fast take 120s+ instead of <15s. No guard caught this because nothing checks test:fast timing.

Also: ad-hoc debug/repro test files (cursor-profile, curswanty-vt-repro, ansi-diff-analysis, etc.) accumulate without cleanup. These are created during debugging sessions but never removed after the bug is fixed.

## Solution

### 1. Timing guard in test:fast wrapper
Add a timing wrapper that prints a WARNING and suggests creating a P0 bead when test:fast exceeds 15s wall-clock. Options:
- Shell wrapper in package.json: `test:fast` runs vitest and checks $SECONDS
- Vitest reporter plugin: custom reporter that emits timing at end
- Post-test script: `infra/test-perf/check-timing.ts` called after vitest

### 2. Stray test file detection
Add a check (in test review skill or as a lint rule) that flags test files with 'repro', 'debug', 'profile', 'analysis' in their name that are older than 2 weeks. These should either be:
- Promoted to proper regression tests (renamed without debug/repro suffix)
- Deleted (the bug is fixed, the repro is no longer needed)
- Marked .slow.test.ts (if they need real vault data)

### 3. Update skills
- test skill: document the 15s target prominently, add timing check instructions
- commit skill: session-end verification should include timing awareness

## Current ad-hoc test files
- ansi-diff-analysis.test.ts — ANSI diff invariant tests (has value, rename?)
- cursor-right-repro.test.ts — curswantY bug repro (bug is fixed)
- curswanty-repro.test.ts — stickyY bug repro (bug is fixed)
- curswanty-vt-repro.test.ts — vault-specific repro with console.log (stale)
- debug-incremental.test.ts — incremental render debug (has value?)
- outline-depth-debug.test.ts — outline depth regression (has value?)

## Acceptance criteria
- [ ] test:fast prints WARNING if >15s
- [ ] Skill docs updated with timing target
- [ ] Ad-hoc test files triaged (keep/delete/rename)