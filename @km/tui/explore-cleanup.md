---
id: "@km/tui/explore-cleanup"
aliases:
  - km-tui.explore-cleanup
  - km-tui-explore-cleanup
created_by: claude:499eee95
created_at: 2026-02-13T18:27:46Z
closed_at: 2026-02-13T18:45:28Z
---

# [x] Restructure explore-* tests: merge valuable, /tmp for generation @km/tui #task #P1

82 explore-* test files = 47% of TUI tests (14k lines, 736 tests). These auto-generated files from /explore sessions cause massive import overhead (66s test:fast vs 15s target).

## Changes needed

### 1. /explore skill: write to /tmp/@km/_orphan/explore-*
Explore-generated tests should go to /tmp/@km/_orphan/explore-<session>/ during generation, NOT apps/@km/tui/tests/. They're temporary investigation files.

### 2. Merge valuable tests into regular suite
Review the 82 explore-* files. Tests that catch real bugs should be merged into the relevant regular test file (e.g., explore-fold-delete → fold tests, explore-undo-redo → undo tests). Use the cluster analysis:
- undo-redo: 4 files → merge into existing undo test
- view-mode: 5 files → merge into view-modes/
- selection: 5 files → merge into board-selection.spec.ts
- fold: 6 files → merge into fold tests  
- search: 4 files → merge into search tests
- embed: 4 files → merge into embed tests
- detail-pane: 4 files → merge into detail-pane tests
- batch: 3 files → merge into batch-ops tests
- Remaining 47 files: triage individually

### 3. Delete non-valuable tests
Tests that just exercise navigation without assertions, or that duplicate existing coverage, should be deleted.

### 4. Update /explore skill
Update .claude/skills/explore/ to:
- Write generated tests to /tmp/@km/_orphan/explore-<date>/
- After exploration, ask which tests to keep
- Kept tests get merged into proper test files with descriptive names

## Acceptance
- [ ] 0 explore-* files in apps/@km/tui/tests/
- [ ] Valuable regression tests preserved in regular files
- [ ] /explore skill updated to use /tmp
- [ ] test:fast < 30s (stretch: < 15s)