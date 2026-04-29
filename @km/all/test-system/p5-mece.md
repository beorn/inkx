---
id: "@km/all/test-system/p5-mece"
aliases:
  - km-all.test-system.p5-mece
  - km-all-test-system-p5-mece
created_by: Bjørn Stabell
created_at: 2026-04-18T07:44:53Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-all.test-system.p5-mece
    depends_on_id: km-all.test-system
    type: parent-child
    created_at: 2026-04-18T00:46:11Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [ ] Phase 5: MECE reorg — consolidate tests from ~130 to ~55-60 files @km/all #task #P2

blocks:: [[@km/all/test-system]]

## Goal
Consolidate @km/tui test suite from ~130 files to ~55-60 by merging .test/.spec pairs, absorbing small repro files into domain parents, and consolidating 8 navigation files into 2.

## Context from parent bead (@km/all/test-system)
From /big MECE analysis + /pro review:
- Navigation tested across 8 overlapping files → 2 (one journey spec + unit in @km/_orphan/board)
- board-reducer.test.ts + view-navigation.test.ts should move to @km/_orphan/board
- 9 domains have split .test/.spec pairs → merge per domain
- 7 files <100 lines waste ~12s import overhead
- Demo files to delete: snapshot-demo, test-api-demo

## Execution
1. Delete redundant demo files
2. Move board-reducer.test.ts + view-navigation.test.ts to @km/_orphan/board package
3. Merge .test/.spec pairs for 9 domains (fold, collapse, filter, date, detail-pane, breadcrumb, multiselect-ops, scroll, board-edit)
4. Absorb repro files (edit-save-repro → board-edit, zoom-garble-repro → board-zoom)
5. Absorb tiny files (<100 LOC) into domain parents (action-handlers → command-contracts, board-render → card-rendering)
6. Consolidate 8 nav files → 2 (navigation.slow.spec.ts + navigation-internals in @km/_orphan/board)
7. Use vitest tags (4.1.0+) for test ownership instead of .slow/.spec file suffixes

## /complete criteria
- ls apps/@km/tui/tests/*.ts apps/@km/tui/tests/**/*.ts | wc -l → < 65
- No test files < 50 lines (all absorbed or deleted)
- grep for .test.ts + .spec.ts same base name → 0 duplicates

## Notes
This is 1-2 sessions of careful, domain-by-domain consolidation. Don't batch — each merge needs judgment about what tests are redundant vs unique. Split into sub-beads per domain if needed.