---
id: "@km/tui/signals/4-panesignals-computed-viewtree-eliminate-store-for-"
aliases:
  - km-tui.signals.4
  - km-tui-signals-4
  - "@km/tui/signals/4"
created_by: Bjørn Stabell
created_at: 2026-04-05T07:52:59Z
closed_at: 2026-04-05T16:27:41Z
close_reason: All acceptance criteria pass. 20 useAppStore calls eliminated,
  layout cache deleted, buildOpCtx reads ViewSnapshot from computed. ColumnView
  elimination deferred.
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] PaneSignals + computed ViewTree — eliminate store for nav state @km/tui #task #P2 @Bjørn Stabell

## PaneSignals + Computed ViewTree

### Architecture
Each pane gets a PaneSignals object with independent signals for nav state.
A single computed signal derives the ViewTree from (repo, rootId, foldDepths).
Views subscribe via useSignal() — no useAppStore, no store selectors, no bridge.

### Baseline (2026-04-05)
30 nodes: buildViewTree 0.038ms, full layout 0.053ms
500 nodes: buildViewTree 2.9ms, full layout 5.8ms, 3x build worst-case 8.6ms
600 nodes nested: buildViewTree 4.2ms

Current worst-case: 3 redundant tree builds per mutation = 8.6ms for 500 nodes.
Target: 1 cached build via computed() = ~2.9ms (3x faster).

### PaneSignals type
- sel: SelectionStore (already signals)
- rootId: signal
- rootPath: signal
- foldDepths: signal
- collapsedNodes: signal
- viewMode: signal
- view: computed ViewSnapshot (tree + index + lazy columns/walkOrder)

### ViewSnapshot
- tree: ViewNode (the tree)
- index: Map (O(1) lookup, built at construction)
- columns: tree.children (lazy getter)
- walkOrder: DFS (lazy + cached)
- classify(id): parent walk for cursor ancestry

### What gets deleted (~215 lines)
- ColumnView/CardView types (enrichment moves to ViewNode)
- deriveColumnsFromRepo/deriveColumnsWithTree
- buildViewIndex, buildNodeIndex
- Layout cache in buildOpCtx
- Selection adapter auto-refresh
- 14 separate buildViewTree call sites to 1 computed

### Migration phases
1. Create PaneSignals + ViewSnapshot types (additive)
2. Create createPaneSignals() factory with computed view
3. Add sync effect: pane signals to store (compat shim)
4. Migrate Board.tsx nav reads to useSignal
5. Migrate Board.tsx to read columns from view.columns
6. Migrate action handlers to write pane signals directly
7. Delete redundant call sites, ColumnView, layout cache

### Acceptance
- grep useAppStore.*rootId/foldDepths/collapsedNodes in src/ = 0 hits
- grep ColumnView in src/ = 0 hits (or only type re-export)
- bun vitest run apps/@km/tui/tests/ = all pass
- bench: single build at or below baseline buildViewTree time