---
id: "@km/rev-docs-0126"
aliases:
  - km-rev-docs-0126
  - "@km/_orphan/rev-docs-0126"
created_at: 2026-01-26T16:39:31Z
closed_at: 2026-01-26T16:50:04Z
---

# [x] Code review: docs @km/rev-docs-0126 #epic #P2

# Documentation Review - 2026-01-26

## Summary

**0 critical, 4 high, 7 medium, 3 low**

---

## High (causes bugs or confusion)

1. **ADR-002 file paths wrong** - docs/adr/002-domain-objects-refactor.md:128 claims `.km/cache/data.db` but actual location is `.km/state.db` directly in `.km/`
2. **createBoard() doesn't exist** - docs/02-architecture.md:69 references `createBoard()` factory which doesn't exist; only `createBoardState()` is exported
3. **Circular deprecation note** - CLAUDE.md:554 says "Repo/createRepo() is legacy API. Use Repo/createRepo() for new code" (contradicts itself)
4. **Timing contradiction** - CLAUDE.md:166 claims "24 second feedback loop" but line 145 says target is <5 seconds

## Medium (tech debt / doc drift)

5. **ADR-002 implementation status outdated** - docs/adr/002-domain-objects-refactor.md:659 - Phase 4 complete but Phase 1 still marked "In Progress"
6. **Command system types missing** - docs/02-architecture.md:169 - Cmd/When/Binding types not found in codebase
7. **Non-existent file reference** - .claude/skills/react-optimization.md:265 references non-existent CardColumn.tsx
8. **Stale bead: mdtest-inprocess** - in_progress for 28+ hours without update
9. **Stale bead: @km/_orphan/test-failures** - in_progress for 25+ hours, 90 remaining failures
10. **Duplicate bead: @km/_orphan/test-nav** - superseded by @km/_orphan/test-failures
11. **Internal doc inconsistency** - ADR-002 vs 03-storage.md disagree on file paths

## Low (style/minor)

12. **Inconsistent link format** - .claude/skills/tui-design.md uses @docs/ prefix
13. **Duplicate research files** - @km/tui-eval/1-analyze-tui1-layout-pain-points & .2 analyze same bugs
14. **Research files in .beads/** - 8+ inkx/inkz docs that are research, not issues

---

## Quick Wins

1. Fix CLAUDE.md line 554 - clarify deprecation note
2. Fix CLAUDE.md line 166 - change "24 second" to "<5 second"
3. Update react-optimization.md - fix CardColumn.tsx reference
4. Close @km/_orphan/test-nav bead - superseded by @km/_orphan/test-failures

## Larger Refactors

1. ADR-002 rewrite - update file paths and implementation status
2. Command system documentation - document actual types or remove aspirational examples
3. Bead housekeeping - update/close stale beads, consolidate research files
