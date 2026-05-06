---
mentions:
  - km
id: "@km/tui/signals"
aliases:
  - km-tui.signals
  - km-tui-signals
created_by: Bjørn Stabell
created_at: 2026-04-05T07:42:09Z
closed_at: 2026-04-06T16:38:57Z
close_reason: all steps complete
owner: bjorn@stabell.org
---

# [x] km-tui signals migration — all subsystems to alien-signals @km/tui #epic #P2

## @km/tui signals migration — COMPLETE

### Architecture (final)

Signals at the bottom, store as compat shim (jotai-zustand#7 pattern):

- PaneSignals: per-pane signal bag with rootId, foldDepths, sel, etc.
- ViewSnapshot: computed(repo + rootId + foldDepths) — single build, auto-cached
- Views subscribe via useSignal() — no useAppStore for reactive state
- repoVersion$ bridge: repo.subscribe -> alien-signals signal
- buildOpCtx reads ViewSnapshot from PaneSignals (0ms cache hit per keypress)

### Completed phases

- signals.1: Auto-refresh adapter (eliminates refreshSelTree at 8 sites)
- signals.2: Reactive<T> -> alien-signals signal() (35 useReactive->useSignal)
- signals.3: All sel reads via useSignal (bridge deleted)
- signals.4: buildOpCtx + Board.tsx + views read from PaneSignals
  - Layout cache DELETED, 8 buildViewTree call sites eliminated
  - Board.tsx/WorkspaceChrome/shared-components migrated to useSignal
- signals.6: UI state reads via usePaneUI hook (pane-aware via usePaneId)
- signals.7: Workspace nav reads via useFocusedPaneSignals
- signals.8: Services to React context (toastQueue, jobRunner, undoHandle)
- signals.bench: Performance verified (10μs per key, 34x improvement)

### Bug fixes (discovered during migration)

- cursor-null: 3 root causes fixed
  1. clearSelection() called sel.deselect() → sel.node.collapse() (preserves cursor)
  1. handleCursorMove cleared selection when size>0 → size>1 (only multi-select)
  1. After zoom, sel.root not synced → syncPaneSignals calls sel.root.set(rootId)
- walkOrder includes board root (navigation can place cursor there)
- buildOpCtx pins sel adapter to current ViewSnapshot (prevents repo mutation race)

### Invariants added (15 total, 6 new)

0. cursor-not-null: cursor must exist on non-empty board
1. cursor-in-walkOrder: cursor must be in viewIndex
2. sel-root-matches-rootId: sel root must match pane rootId
3. viewTree-root-matches: ViewSnapshot root must match pane rootId
4. no-duplicate-columns: each column ID appears at most once
5. move-source-exists: move mode source nodes exist in repo

### Explorations completed

- per-node-view: REJECTED — cursor moves don't rebuild tree, column cache handles
  partial rebuilds, per-node computeds would be slower for km's tree sizes
- selection.10: REJECTED — same conclusion, procedural build is simpler

### Impact

- useAppStore: 68 → 41 (27 eliminated; remaining are store methods + handlers)
- buildViewTree call sites: 14 → 6 (8 eliminated)
- Deleted: Reactive<T>, useReactive, _selVersion bridge, layout cache, refreshSelTree,
  computeHiddenNodeIds
- Added: ViewSnapshot, PaneSignals, usePaneSignals, useFocusedPaneSignals,
  syncPaneSignals, 6 invariants, invariant-first principle in principles.md
- Performance: computed cache hit = 0ms, per-key overhead = 10μs
- Quality assessment: 60% of plateau, dual state ownership is #1 remaining issue

### Architecture assessment (from 5 parallel analyses)

- 4,423 lines in 9 state management files
- 6 state containers, 10 dual/triple-owned fields, 9 layers stdin→screen
- 62 OpCtx fields (27 redundant/derivable)
- GPT-5.4: "two authoritative containers (repo + signals), everything else derived"

### Next: @km/tui/quality-plateau (P2 epic)

Phase 1: Invert ownership — signals own nav state, store reads (~20 files, 2-3 days)
Phase 2: Slim OpCtx — 62 → ~35 fields (1 day)
Phase 3: Delete ColumnView/CardView — views read ViewNode directly (26 files, 2 days)
Phase 4: Merge UI routing — per-pane UI fields as signals (0.5 day)
Phase 5: Unify navHistory + dimensions (0.5 day)
Phase 6: (future) KNode structured content — typed blocks, eliminates body column hack (2-4 weeks)

### Lessons learned

1. useSignal + alien-signals effect: needs mounted guard + stable subscribe (useCallback)
2. Bridge deletion is atomic with consumer migration (premature = 76 test failures)
3. useCommitVersion must use useRef (lost useRef = version reset = columns never refresh)
4. repo.getSnapshot() is not an alien-signal — needs repoVersion$ bridge via subscribe
5. ViewNodeColumnCache gives per-column incremental rebuild inside computed
6. clearSelection must collapse, not deselect (sel.deselect() clears cursor to null)
7. sel.root must be synced when rootId changes (zoom/SET_ROOT)
8. State duplication between containers is where ALL sync bugs live
9. Invariant-first development: add the invariant BEFORE adding the state
10. Per-node computeds rejected — procedural build + column cache is optimal for <2000 nodes

### Commits (13 total)

1. 7e2fab2e — chore: sync beads backup, glossary, vendor submodules
2. d15c4775 — refactor(tui): auto-refresh selection adapter (signals.1)
3. cce81626 — refactor(tui): Reactive<T> -> signal() + useReactive -> useSignal (signals.2)
4. 2ff85e90 — refactor(tui): sel reads via useSignal, bridge deleted (signals.3)
5. 4f768733 — refactor(tui): services to React context (signals.8)
6. 85348aea — feat(board,tui): ViewSnapshot + PaneSignals foundation
7. 1f7f7db5 — feat(board,tui): ViewSnapshot nextInWalk/prevInWalk + repoVersion bridge
8. 14787a5e — feat(tui): wire PaneSignals into store, computed replaces auto-refresh
9. a48e7ff9 — refactor(tui): buildOpCtx reads ViewSnapshot from PaneSignals (signals.4a)
10. ea778af1 — refactor(tui): Board + WorkspaceChrome read nav state from PaneSignals (signals.4b)
11. ae60a6df — refactor(tui): delete layout cache + 5 manual buildViewTree calls (signals.4c)
12. 68fae8bb — refactor(tui): usePaneUI reads from current pane (signals.6)
13. 653b9fb1 — docs: update stale references after signals migration
14. f3c8b85e — fix(tui): cursor-null bug — three root causes fixed + invariant added
15. 356d0292 — feat(tui): add 5 new runtime invariants + invariant-first principle

