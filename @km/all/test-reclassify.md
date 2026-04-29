---
id: "@km/all/test-reclassify"
aliases:
  - km-all.test-reclassify
  - km-all-test-reclassify
created_by: Bjørn Stabell
created_at: 2026-04-09T14:26:51Z
closed_at: 2026-04-09T20:27:20Z
close_reason: "Absorbed into km-all.test-system per user request ('all under
  test-system bead'). Audit completed. REWRITE bucket: 5/8 rewritten, 3 already
  migrated. FREEZE bucket: testEnv @deprecated + 11 FREEZE headers. RELOCATE
  bucket: audit was wrong — all 6 files are genuine Layer 5 integration tests
  that cannot cleanly relocate (they drive the Board UI via createBoardDriver).
  Reclassified to REWRITE (rewrite from scratch against lower-layer primitives)
  or FREEZE. All further work consolidated in parent bead."
---

# [x] Test reclassification — migrate/rewrite/relocate/freeze audit @km/all #task #P2

## Problem

The test-migrate work (@km/all/test-migrate) is hitting a mechanical plateau at ~60%. The remaining files can't migrate because they:
1. White-box inspect internal state (store.getState, navigator.stickyX, workspace.panes.has)
2. Test implementation details rather than user behavior (deriveColumnsFromRepo, findCardBorderProblems regexes)
3. Need terminal-level features (mouse clicks, bell, palette colors, expectNodeBorder)
4. Are unit tests disguised as integration tests

**The plateau is a quality signal, not a technical limitation.**

Expanding createTestApp to support these features would perpetuate white-box testing. Instead, reclassify each test file into one of four buckets:

- **MIGRATE**: Verifies user-visible behavior with supported API → createTestApp
- **REWRITE**: Inspects state but could verify via screen → rewrite black-box, then createTestApp
- **RELOCATE**: Unit test disguised as integration → move to @km/storage, @km/_orphan/board, or @km/markdown
- **FREEZE**: Genuinely needs testEnv's rich API → keep but mark no-new-additions

## Scope

Audit all 53 slow test files in apps/@km/tui/tests/. Categorize each. For RELOCATE and REWRITE buckets, create sub-beads. Stop mechanical migration beyond the straightforward cases (~60%).

## Design: Four-Bucket Classification

### MIGRATE (target: ~30 files)
Behavioral tests that verify user-visible screen output or persistence. Use supported API only.
Examples: board-nav, collapse, fold, breadcrumb, board-zoom (most tests), cursor-prefetch (navigation tests).

### REWRITE (target: ~10 files)
Tests that check internal state but could check screen output. Rewrite black-box, then migrate.
Examples:
- detail-pane.slow.spec.ts — `store.getState().workspace.panes.has("main-detail")` → `app.expectScreen("DETAIL VIEW")`
- dialog-lifecycle.slow.test.ts — `store.getState().ui.datePrompt` → `app.expect("#date-prompt-dialog").toExist()`
- error-loading-cards.slow.test.ts — `store.getState().workspace.panes.has("main-detail")` → screen check
- escape-layering.slow.test.ts — `store.getState().sel.node.ids()` → `app.expect("[data-selected]").toHaveCount(n)`

### RELOCATE (target: ~5 files)
Unit tests masquerading as integration tests. Move to the right package.
Examples:
- fold.slow.test.ts — fold reducer tests → packages/@km/_orphan/board/tests/
- board-zoom.slow.spec.ts — deriveColumnsFromRepo unit tests → packages/@km/_orphan/board/tests/
- sticky-cursor.slow.test.ts (12 tests) — navigator.stickyX/stickyY → packages/@km/_orphan/board/tests/navigator.test.ts
- scroll.slow.spec.ts (some tests) — scroll calculation → packages/@km/_orphan/board/tests/

### FREEZE (target: ~8 files)
Genuinely need testEnv's rich API. Keep on testEnv with @deprecated comment.
Examples:
- pty-integration.slow.spec.ts — PTY-specific, excluded from CI
- production-entry.slow.spec.ts — entry-point smoke test
- real-vault.slow.test.ts — needs createRepo + loadFiles
- Files using board.bell, board.getStatus, board.click, board.expectNodeBorder

## Tasks

### Phase 1: Audit (1 day)
- [ ] Classify all 53 files into MIGRATE/REWRITE/RELOCATE/FREEZE
- [ ] Document classification in this bead
- [ ] Spot-check 5 files from each bucket to validate classification

### Phase 2: Complete MIGRATE bucket (2-3 days)
- [ ] Finish mechanical migration for all MIGRATE files
- [ ] Target: ~30 files migrated (currently at 19)
- [ ] Run all on both backends (`TEST_BACKEND=termless`)

### Phase 3: RELOCATE bucket (3-5 days)
- [ ] Move unit tests to correct packages
- [ ] Delete redundant copies in apps/@km/tui/tests/
- [ ] Verify per-package test runs pass

### Phase 4: REWRITE bucket (5-7 days)
- [ ] Rewrite store-inspection tests as screen-based
- [ ] Migrate the rewrites to createTestApp
- [ ] Verify behavior preserved

### Phase 5: FREEZE testEnv (1 day)
- [ ] Add @deprecated JSDoc to testEnv and testEnvWithRepo
- [ ] Document in apps/@km/tui/tests/CLAUDE.md: "new tests use createTestApp"
- [ ] Add lint rule or CI check: no new testEnv imports

## /complete criteria

- All 53 files classified in this bead
- MIGRATE bucket: 100% migrated
- RELOCATE bucket: 100% moved to correct packages
- REWRITE bucket: 100% rewritten and migrated
- FREEZE bucket: @deprecated marked
- `grep -c "testEnv" apps/km-tui/tests/` shows only FREEZE files
- All tests pass on `bun run test:ci`
- `TEST_BACKEND=termless bun run test:slow` passes for MIGRATE+REWRITE

## Notes

This bead is the followup to @km/all/test-migrate. It represents the *real* quality win: every test at the right layer with the right verification style.

The plateau analysis (via /big) showed that the mechanical migration hits ~60% ceiling. Breaking that ceiling requires this reclassification work — expanding createTestApp would perpetuate the anti-pattern.

Key insight: "Missing features in createTestApp are features, not bugs" — the gaps force tests to be rewritten at the right layer.