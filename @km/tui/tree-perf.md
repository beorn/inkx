---
id: "@km/tui/tree-perf"
aliases:
  - km-tui.tree-perf
  - km-tui-tree-perf
created_by: Bjørn Stabell
created_at: 2026-04-08T06:52:23Z
closed_at: 2026-04-08T08:36:11Z
close_reason: "Core refactoring complete. 2 follow-up items remain open:
  node-visual-spec (review) and tree-walk-reuse (P3 survey)."
---

# [x] Tree perf: output phase + hierarchical node state @km/tui #epic #P1 @Bjørn Stabell

## Completed (2026-04-08)

### LOC Impact
- 13 files changed, +966 / -413 (net +553)
- 2 files deleted (tree-concerns.ts superseded)
- 2 new files (reduced-signals.ts, golden-visual-state.test.ts)

### Commits (11)
1. fix: symlink task toggle reads target status + golden visual tests
2. feat: reduced signal engine — tree.ancestors/descendants + batch
3. feat: wire reduced signals as shadow alongside existing sync
4. feat: cut over cursorInDescendant reads to reduced signals
5. refactor: purge old cursorInDescendant sync
6. feat: add editingDescendant reduced signal, cut over expansion reads
7. refactor: delete tree-concerns.ts (superseded) + edge case tests
8. fix: address Pro review findings (5 fixes)
9. fix: invertOperation → invertTreeOp rename
10. perf(silvery): thread inheritedBg/Fg to eliminate O(depth) parent walks
11. style: apply oxfmt formatting

### Test Results
- Fast suite: 216 files, 5755 tests, all passing
- 27 engine unit tests + 12 golden visual tests
- Slow suite: pre-existing failures (visual mode, breadcrumb ANSI, fuzz) — not from our changes

### Architecture
- ReducedSignalStore: standalone engine with tree.ancestors/descendants + batch() + counts-not-booleans
- 3 reduced signals: cursorDescendant, selectedAncestor, editingDescendant
- Components read O(1) pre-computed signals instead of O(depth) tree walks
- findInheritedBg/Fg threaded O(1) through render tree (silvery)