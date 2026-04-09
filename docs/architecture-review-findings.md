# Architecture Review Findings

**Historical snapshot (2026-04-02).** All five simplification opportunities have been addressed — see km-all.simplification epic (closed). This document preserves the pre-refactor analysis for reference.

Three-pass architectural review of the km codebase. Evidence-based with grep counts and file paths from before the ViewNode unification.

## Pass 1: Inventory

### Type Taxonomy

**Node types (7 total, 3 redundant)**

- `KNode` — packages/km-core/src/interfaces/node.ts — canonical data node, used everywhere
- `TNode` — packages/km-core/src/types.ts — KNode + recursive children/depth. **Duplicate** copy at apps/km-repl/src/board-types.ts (drifted: has `title: string | null`, lacks `fstype`)
- `ViewNode` — packages/km-board/src/view-tree.ts — explicit visual tree (migration Phase 2a complete)
- `CardView` — apps/km-tui/src/types.ts — KNode + resolvedNode/isBody. **Overlaps** ViewNode card-level nodes
- `ColumnSnapshot` — apps/km-tui/src/hooks/use-columns.ts — column header + KNode[]. Non-reactive materialization for tests/canvas
- *(CompatDerivedColumn — deleted, was backward-compat bridge)*
- `LayoutNode` — apps/km-tui/src/board-types.ts — pane layout tree (separate domain, no redundancy)

Inline AST types (14 types in apps/km-tui/src/text/inline-ast-types.ts) are a separate domain.

**Position/Cursor types (7, with duplication)**

- `Position` — packages/km-core/src/interfaces/position.ts — tree slot {parentId, childIdx}
- `CursorState` — apps/km-tui/src/cursor-store.ts — derived {cursorNodeId, cursorCardNodeId, cursorColumnNodeId, selectionLevel} *(legacy — see [selection-model.md](design/selection-model.md): `sel.node.cursor`, `sel.kind`)*
- `CursorStore` — apps/km-tui/src/cursor-store.ts — custom pub/sub *(legacy — deleted in sel.* migration, see [selection-model.md](design/selection-model.md))*
- `CursorPosition` — apps/km-tui/src/driver.ts — physical terminal {x, y} (different domain)
- `cursorNodeId` on BoardState — **3 separate definitions**: packages/km-board/src/board-types.ts, apps/km-tui/src/board-types.ts, apps/km-repl/src/board-types.ts *(migrating to `sel.node.cursor`)*
- `deriveCursorAncestors()` — apps/km-tui/src/cursor-store.ts — legacy parent chain walk
- `deriveCursorPath()` — packages/km-board/src/view-tree.ts — ViewNode parent pointer walk (new)

**Key redundancy**: 3 BoardState definitions have drifted (km-tui added SET_COLLAPSED_NODES, removed selectedNodes; km-repl is fundamentally different with tree-in-state).

### State Ownership

| State | Owner | Derived By | Read By |
|-------|-------|-----------|---------|
| cursorNodeId (→ `sel.node.cursor`) | BoardState (3 defs) | CursorStore *(legacy, deleted)* via deriveCursorAncestors (legacy) or deriveCursorPath (ViewNode) | ~100+ places |
| foldDepths | BoardState | buildViewTree, countVisibleNodes, driver.ts | view-navigation, use-columns, board-reducer, persistence |
| collapsedNodes | BoardState | board-reducer via TOGGLE_COLLAPSE | view-navigation, board-layout, board-app-store |
| node data | Repo (SQLite) | deriveColumnsFromRepo, buildViewTree | every layer |
| rootId | BoardState | board-reducer via SET_ROOT/ZOOM_IN | navigation, rendering, cursor derivation |
| columns/cards | derived (not stored) | use-columns.ts (legacy) AND view-tree.ts (new) | Board, CardColumn, TreeNode components |

### Special Case Counts

**Body-related** (12 files, ~142 total occurrences)
- `isBody`: 7 files, ~21 occurrences
- `extractBody()`: 7 files, ~30 occurrences
- `__body__` prefix: 12 files, ~46 occurrences
- `bodyNode`/`bodyNodes`: ~8 files, ~45 occurrences
- Hotspots: view-navigation.ts (40+), use-columns.ts (22), cursor-store.ts (9)
- **Key redundancy**: `splitBodyAndColumns()` in view-navigation.ts reimplements `extractBody()` from @km/tree

**Embed-related** (41 files, ~200+ occurrences)
- `symlink_to`: 40 files, ~150 occurrences
- `resolvedEmbed` (ViewNode): 2 files, ~10
- `resolvedNode` (CardView): 5 files, ~22
- **Key redundancy**: 3 independent embed resolution paths (CardView.resolvedNode, ViewNode.resolvedEmbed, embed-display.ts resolveEmbed())

**Collapse-related** (26 files)
- `isCollapsedChild()`: **duplicated** between view-tree.ts and use-columns.ts
- `isWellKnownMetadataSection()`: **duplicated** between same two files
- `collapsedNodes` state: ~20 files, ~80 occurrences

**Cursor hint** (concentrated in 3 files)
- `cursorCardNodeId`: ~8 files, ~35 occurrences
- `cursorColumnNodeId`: ~7 files, ~25 occurrences
- 3 separate equivalence checks in board-app-store.ts comparing legacy vs ViewNode

## Pass 2: Flows

### Read Flow (file.md -> screen)

Files: repo-loader.ts -> discovery.ts -> parser.ts -> ast2nodes.ts -> repo-loader.ts -> link-resolution.ts -> db-rules.ts -> repo.ts -> use-columns.ts -> Board.tsx

Type chain: `string` -> `Root` (mdast) -> `KNode[]` -> `Event[]` -> SQLite rows -> `KNode[]` -> ViewLens -> React elements -> ANSI

Re-derivations:
1. **extractBody called 3x per board render** — once in deriveColumnsFromRepo for root, once in kNodeToDerivedColumn per column, once in deriveColumnsIncremental
2. **parseHeadingRules called multiple times** — at AST parse time (interpretHeadingRules) and again in use-columns.ts (getCollapseRules, kNodeToDerivedColumn)
3. **KNode item decomposition/recomposition** — item:{list, task:{marker, status}} decomposed to flat SQL columns on write, recomposed on read
4. **WIP limits extracted twice** — extractWipLimits scans all columns, then each column also checks rules.limit

Complexity hotspots:
- H1 merge (mergeH1IntoFileNode) — first H1 merged into file node, creates special cases throughout
- Folder-index file expansion (~100 lines of special-case logic)
- Virtual body column — synthetic `__body__<rootId>` node doesn't exist in repo
- Two parallel pipeline architectures — sync generators (repo-loader) and async generators (pipeline.ts)

### Edit Flow (keypress -> file write)

Files: board-app.ts -> command-bridge.ts -> board-actions.ts -> board-actions-edit.ts -> repo.ts -> db-ops.ts -> emitter.ts -> sync.ts -> event-handlers.ts -> writequeue.ts

Re-derivations:
1. **Entire file re-serialized on any field change** — single node update triggers getSubtree -> nodesToMarkdown for the whole file
2. **N mutations cause N version bumps** — batch edits (multi-select status cycle) each bump version independently

Special cases:
- Embeds: toggle task status on embed updates the TARGET node, not the embed
- Recurrence: toggling recurring task to "done" clones task with next due date (one keystroke, two mutations)

### Navigate Flow (cursor movement)

Files: board-app.ts -> board-actions.ts -> view-navigation.ts -> cursor-store.ts

**THE major re-derivation hotspot:**
1. **extractBody re-derived on EVERY navigation** — navigateVertical/Horizontal call splitBodyAndColumns(), duplicating what useColumns already computed
2. **Cursor classified twice** — once in view-navigation.ts (isAtBoardLevel/isAtColumnLevel/etc.), again in cursor-store.ts (deriveCursorAncestors)
3. **findAncestorAtDepth walks parent chain from scratch** — called multiple times per navigation, no caching
4. **filterMeaningfulBody mirrors view layer** — comment says "Mirrors the view layer's meaningfulBody filter"
5. **ViewNode tree built but partially used** — exists in OpCtx but legacy navigation still primary

### Sync Flow (external edit -> TUI)

Files: watcher.ts -> worker-bridge.ts -> sync.ts -> reconcile.ts -> applier.ts -> update-handler.ts -> emitter.ts -> repo.ts -> use-columns.ts

Re-derivations:
1. **Complete file re-parse on any change** — even one-line edit triggers full parseMarkdownWithLinks
2. **Re-scans entire directory** — chokidar identifies changed files, but reconcile re-stats every file in the directory
3. **Two reconciliation implementations** — repo-loader.ts reconcileFilesystem (initial) and watch/reconcile.ts (runtime)
4. **Heartbeat reconciliation** — periodic 60s full reconcile as safety net (third path)
5. **repo.touch() clears entire children cache** — even one-file change busts all cached children

## Pass 3: Composition

### Cross-Cutting Concerns (by file count)

1. **Embeds** — 41 files (deepest, spans all layers)
2. **Cursor/Selection** — 35 files (most pervasive in TUI)
3. **Fold** — 30 files
4. **Collapse** — 26 files
5. **Hidden nodes** — 22 files
6. **Undo** — 20 files (two competing mechanisms)
7. **Body detection** — 12 files
8. **Move mode** — 11 files
9. **Edit mode** — 7 files
10. **Search** — 3 files (most isolated)

Top 3 files per concern:
- Embeds: packages/km-storage/ (20+ files), use-columns.ts, view-tree.ts
- Cursor: board-app-store.ts (69), view-navigation.ts (48), board-actions.ts (40)
- Fold: use-columns.ts (31), board-actions.ts (23), board-reducer.ts (18)
- Collapse: use-columns.ts (11), board-actions.ts (12), view-tree.ts
- Hidden: view-navigation.ts (75!), hidden.ts (18), board-actions.ts (13)
- Undo: board-actions.ts (46), undoable-repo.ts (~30), undo-stack.ts (~25)
- Body: view-navigation.ts (48), use-columns.ts (22), cursor-store.ts (9)

### Plugin Factorability

**Easy to extract** (isolated state, clear boundaries):
- Search — 3 files, already modular
- Move mode — 11 files, clear action shape (MOVE_START/COMMIT/CANCEL)
- Edit mode — 7 files, clear enter/exit transitions
- Hidden nodes — core logic in hidden.ts (194 lines), natural filter middleware

**Hard to extract** (deeply entangled):
- Cursor/Selection — IS the core coordination point, every action reads/writes it
- Fold — 4-way entanglement with undo, navigation, view derivation, persistence
- Embeds — fundamental data model property spanning all layers
- Undo — two competing mechanisms (imperative UndoStack + TEA history-plugin), must intercept all mutations

**Already being addressed by ViewNode**:
- Body detection — ViewNode.isBody flag
- Collapse (rule-based) — ViewNode mirrors collapse filtering
- Cursor classification — deriveCursorPath() via parent pointers
- Navigation — ViewNode-based functions exist alongside legacy

### ViewNode Coverage

**Fully solved**: role assignment, body detection, embed visual resolution, detail-only filtering, parent pointers (O(1) ancestry), deduplication

**Partially solved**: cursor classification (parallel validation mode), navigation (ViewNode functions exist but legacy still primary)

**Not solved**: undo, fold (buildViewTree has unused `_foldDepths` parameter), hidden nodes (not filtered in tree), runtime collapse toggle, WIP limits, per-column memoization (ViewNode rebuilds full tree; use-columns.ts has per-column cache that avoids this)

### Top 5 Simplification Opportunities

**1. Unify column derivation — eliminate use-columns.ts duplication**
- Now: use-columns.ts (772 lines) and view-tree.ts (476 lines) duplicate isCollapsedChild, isDetailOnly, deduplicateByFsPath, createVirtualBodyNode, expandIndexFileColumns
- Target: ViewLens is sole authority; use-columns.ts provides non-reactive materialization via deriveColumnsFromRepo()
- Impact: ~400 lines removed, derivation drift bug class eliminated
- ViewNode status: IS the Phase 3 target

**2. Unify cursor classification — replace deriveCursorAncestors with ViewNode**
- Now: deriveCursorAncestors (150 lines in cursor-store.ts), deriveCursorIndices (use-columns.ts), parallel validation (board-app-store.ts)
- Target: viewIndex.get(sel.node.cursor) + walk parent pointers (~20 lines)
- Impact: ~180 lines removed, 3 files simplified, classification disagreement bug class eliminated
- ViewNode status: parallel validation active, ready once equivalence proven

**3. Simplify navigation via ViewNode tree**
- Now: view-navigation.ts (1292 lines) — legacy repo-walking (lines 78-730) + ViewNode-based (lines 732-1180)
- Target: ViewNode navigation only, delete legacy functions
- Impact: ~500 lines removed, view-navigation.ts: 1292 -> ~700 lines
- ViewNode status: ViewNode functions exist but need equivalence validation

**4. Consolidate undo mechanisms**
- Now: imperative UndoStack (117 lines) + undoable-repo (3 files, ~250 lines) + TEA history-plugin (~250 lines) + manual undo entries scattered in board-actions.ts (~50 lines)
- Target: single unified undo system with auto-recording + cursor/fold state capture
- Impact: ~200 lines removed, 6+ files simplified
- ViewNode status: not addressed (orthogonal)

**5. Filter hidden nodes in ViewNode tree**
- Now: hiddenNodeIds threaded through OpCtx, NavState, view-navigation.ts (75 occurrences), board-actions.ts (13)
- Target: buildViewTree() excludes hidden nodes; navigation never sees them
- Impact: ~50 lines of filtering removed from view-navigation.ts, 5+ files simplified
- ViewNode status: natural Phase 3b extension

### Gravity Well

The most entangled file is apps/km-tui/src/board/board-actions.ts (2647 lines) — touches 8 of 10 cross-cutting concerns. It is the single biggest simplification target but cannot be addressed directly. Completing opportunities 1-3 (ViewNode unification) reduces its dependency surface; opportunity 4 (undo consolidation) removes ~50 lines of manual undo entries from it.
