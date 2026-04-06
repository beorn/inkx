# km Architecture

km turns markdown files into a structured, queryable knowledge system. This doc covers the full system: building blocks, layers, data flows, and composition model. For silvery (the TUI framework), see [vendor/silvery/docs/architecture.md](../vendor/silvery/docs/architecture.md).

## Heritage

km's architecture borrows deliberately from systems that solved hard problems well. Each influence shapes a specific part of the stack:

**SlateJS** — tree operations and selection. km's tree layer is a direct descendant: atomic operations with `inverse()`, stable node IDs (not fragile index paths), `TreeMutator` interface, normalize-after-mutation via plugins. The selection system follows Slate's `Editor.apply(op)` pattern: tree ops transform selection inline, one transaction, atomic undo. Key difference: Slate mutates in place; km's transitions are pure `(state, op) → [state, effects]`.

**ProseMirror** — document model rigor. Polymorphic selection types (TextSelection, NodeSelection, CellSelection as plugin). Bookmarks for mapping selection through document changes. Transaction-based state updates. The `Selection.transform(sel, op)` concept directly inspired our `transformSelection(sel, op, prevTree, nextTree)`.

**tldraw** — pointer interaction architecture. Hierarchical state machine with 18 states in the SelectTool. Pointing states (before drag threshold) resolve to action states (after threshold). Signals for reactive state (`@tldraw/state`), state machine for decisions. Our improvement: pure function state machine (testable without a full Editor) instead of OOP StateNode classes with side effects.

**Decker** (our own) — lessons from what went wrong. State in three places (DOM + Zustand + closures), browser-inconsistent HTML5 drag events, imperative handlers impossible to debug. Motivated: one state atom, pure state machine, no HTML5 DnD, own pointer pipeline from primitives.

**The Elm Architecture (TEA)** — the universal pattern. Every interactive subsystem is `(state, op) → [state, effects]`. Operations and effects are serializable data. Machines compose via effects. Enables testing, replay, undo, portability (terminal + browser), AI automation.

**alien-signals** — reactive primitives. Thin, fast, exact dependency tracking. Used everywhere: selection store, per-node reactive state (withReactive in km-storage), signal-store (Zustand replacement). One reactive system instead of three.

**React** — rendering. silvery's custom reconciler produces an ag node tree (not DOM). Same component model, same hooks, same mental model. But layout (flexily) and output (ANSI terminal buffer) are fully owned.

See [docs/design/selection-landscape.md](design/selection-landscape.md) for detailed comparisons with tldraw, ProseMirror, Excalidraw, Figma, VS Code, DOM Selection API, and AppKit/UIKit.

## Reactive Model

alien-signals provides the reactive primitives (signals, computed, effect). The codebase targets two patterns and restricts a third:

1. **DIRECT** (preferred) — a store method reads signals, calls a pure function, writes the result to its own signals. The method is the pure→reactive boundary. External code calls the method; it never writes signals directly.
2. **DERIVED** (clean) — a `computed` signal reads from other signals and transforms the value. No writes, no side effects, always consistent.
3. **EFFECT** (restricted) — an effect watches one signal and writes another. This pattern is reserved for cross-system boundaries where two stores genuinely can't merge (e.g., the selection store writing `agNode.selected` on silvery's render tree). Every bridge, init race, and double-write bug in km's history originated from pattern 3.

The rule: one writer per signal. If two stores need to stay in sync, one derives from the other via `computed` — not via an effect that writes back. See [lessons/op-signal-boundary.md](lessons/op-signal-boundary.md) for the full case study and decision framework.

## Building Blocks

Every piece of the system is built from a small set of domain objects. Like [SlateJS](https://docs.slatejs.org/concepts), each is a clean interface with a namespace of static helpers.

### KNode — The Universal Node

Every piece of content is a `KNode` — a flat record with parent-child links. Defined in `@km/core` ([packages/km-core/src/interfaces/node.ts](../packages/km-core/src/interfaces/node.ts)).

```typescript
interface KNode {
  id: string              // ULID
  type: string            // "h" | "p" | "code" | "quote" | "table" | "hr" | ...
  item?: ItemData         // present = structural (cursor target, has children)
  parent_id: string       // parent reference
  parent_idx: number      // sibling order
  content: string         // text content
  title: string           // display title (materialized)
  symlink_to?: string   // points to another node (embeds)
  fstype?: string         // "repo" | "folder" | "file" | "mdsection"
  rules?: SectionRules    // parsed km.* directives (collapse, color, limit)
}

const KNode = {
  isItem(node): boolean     // node.item != null — structural, cursor target
  isBlock(node): boolean    // node.item == null — leaf content
  isOutline(node): boolean  // type === "h" && item != null — creates hierarchy
  isListItem(node): boolean // type !== "h" && item != null — bullet/task
  isTask(node): boolean     // node.item?.task != null
  isEmbed(node): boolean    // has symlink_to
}
```

The single most important distinction: **Item** (`item: {}`) = structural, has children, cursor target. **Block** (no `item`) = leaf content, not selectable. `ItemData` holds list marker and task status.

### Position — Where in the Tree

```typescript
interface Position { parentId: string; childIdx: number }
const Position = { of, first, last, equals }
```

### Repo — The Data Store

Factory: `createRepo(path)`. Disposable (sync cleanup). Defined in `@km/storage` ([packages/km-storage/src/repo.ts](../packages/km-storage/src/repo.ts)).

```typescript
interface Repo {
  // Queries (cached, fast)
  getNode(id): KNode | null
  getChildren(parentId): KNode[]
  getNodesBatch(ids): Map<string, KNode>

  // Mutations (emit events for sync + undo)
  addNode(parentId, node): string
  updateNode(id, changes): void
  moveNode(id, newParentId, sortOrder): void
  deleteNode(id): void

  // Subscription (drives React re-renders)
  subscribe(listener): () => void
  getSnapshot(): number  // version counter, increments on mutation

  watch(): Watcher       // file sync
}
```

### BoardState — Navigation State

Pure data, no methods. Updated via reducer. Defined in `apps/km-tui/src/board-types.ts`.

```typescript
interface BoardState {
  rootId: string | null           // current zoom root
  // cursor: sel.node.cursor() — sole authority, not stored in BoardState
  foldDepths: Map<string, number> // per-node fold depth overrides
  collapsedNodes: Set<string>     // collapsed column headers
  navHistory: NavHistoryEntry[]   // back/forward navigation
  moveMode: boolean               // m + destination workflow
}
```

Key design: **no tree data in state**. Navigation and rendering query Repo on demand. Visual layout (columns, cards, cursor indices) is derived at render time — never stored.

### BoardReducerOp / KmOp

`BoardReducerOp` — discriminated union dispatched to the reducer (`SELECT`, `TOGGLE_FOLD`, `ZOOM_IN`, etc.). `KmOp` — higher-level user intent (verbs, nav, edits, text ops, dialog ops) dispatched through the command system. Defined in `@km/commands`.

### ColumnView / CardView — Derived View Models (legacy, being replaced)

> **Migration in progress**: ColumnView/CardView/ViewNode are being replaced by the **TreeLens + Projection** architecture. See `bd show km-tui.tree-lenses` for the design. The new architecture uses one node type (KNode) through all layers, with enrichments as computed lens methods and per-node projection signals for React. Components will use `useProjection(id)` instead of reading from ColumnView/ViewNode.

Derived (not stored) representations for rendering. `ColumnView` = a section heading with its cards. `CardView` = a KNode enriched with resolved embed data and body classification.

```typescript
interface ColumnView { node: KNode; cardNodes: CardView[]; rules?: SectionRules; isVirtual?: boolean }
interface CardView extends KNode { resolvedNode?: KNode; isBody: boolean; hasBodyChildren: boolean }
```

### ViewNode — Explicit Visual Tree (legacy, being replaced by TreeLens)

The authoritative visual tree. Every navigation, cursor classification, and column derivation goes through ViewNode. Defined in `@km/board` ([packages/km-board/src/view-tree.ts](../packages/km-board/src/view-tree.ts)). Each node carries its visual role, parent pointer, and resolved embed data. Hidden nodes are filtered at tree construction time.

```typescript
type ViewRole = "board" | "body-column" | "column" | "card" | "subitem"

interface ViewNode {
  id: string; role: ViewRole; node: KNode | null
  parent: ViewNode | null; children: ViewNode[]
  isBody: boolean; resolvedEmbed?: KNode; rules?: SectionRules
}
```

`buildViewTree(repo, rootId, foldDepths, cache?, hiddenNodeIds?)` builds the tree with per-column caching. `buildViewIndex(tree)` provides O(1) lookup. `classifyCursorFromViewIndex(index, nodeId)` derives cursor card/column/selection level. `viewNodeToColumnViews(tree)` produces ColumnView[] for React rendering.

## Five Layers

```
APP        apps/km-tui, km-cli, km-repl         UI, state machines, commands
BOARD      @km/board, @km/commands               cursor, selection, fold, navigation
TREE       @km/tree                              tree mutations via TreeMutator interface
STORAGE    @km/storage                           SQLite, events, file sync, watch
FS         @km/markdown + filesystem             parse/serialize, source of truth
```

Each layer calls only the layer below. UI never touches filesystem. All mutations emit events (enables sync, undo, multi-window).

### Package Map

**Core** (domain -> operations -> application):
- `@km/core` — KNode, Position, ItemData, task status, metadata extraction. Pure functions.
- `@km/markdown` — Parser: markdown <-> KNode (stateless, no DB)
- `@km/storage` — Repo: SQLite CRUD, file sync, watch, events. Depends on core + markdown.
- `@km/tree` — Tree mutations via TreeMutator interface (split, merge, indent, outdent)
- `@km/board` — BoardState + reducer, TreeLens pipeline (ViewLens → VisibleLens → ViewTreeProjection). ID-based.
- `@km/commands` — Command registry, keybindings, context-aware dispatch

**Apps**: `@km/tui` (TUI), `@km/cli-app` (CLI commands), `@km/repl` (interactive REPL), `@km/web` (web API server)

**Vendor** (git submodules, standalone repos):
- `silvery` — React TUI framework ([architecture](../vendor/silvery/docs/architecture.md))
- `flexily` — Pure JS flexbox layout engine (Yoga-compatible)
- `termless` — Headless terminal testing
- `loggily` — Structured logging with optional chaining
- `vimonkey` — Fuzz testing for Vitest
- `bearly` — Claude Code tools (tribe, llm, recall, tty)

## Data Flows

### Read: File -> Screen

```
file.md on disk
  | chokidar/watcher detects
@km/markdown parser: markdown -> km-ast -> KNode[]
  | packages/km-markdown/src/ast2nodes.ts
@km/storage pipeline: parse -> apply -> resolve -> insert into SQLite
  | repo-loader.ts, pipeline.ts
Repo.getChildren(rootId) -> KNode[]
  | cached, O(1) per call
PaneSignals.visibleLens (computed): createViewLens -> createVisibleLens -> ViewTreeProjection
  | @km/board lens pipeline, auto-cached by alien-signals
Board.tsx: columnIds from lens.children(rootId), components self-resolve via useNode(id)
  | silvery pipeline
ANSI output: incremental buffer diff -> terminal
```

### Edit: Keypress -> File

```
User presses key (e.g., 'x' to toggle task status)
  | silvery useInput -> key normalization -> binding resolution
KmOp dispatched to handler
  | board-actions.ts router -> focused handler
Handler calls Repo mutation (e.g., repo.updateNode(id, changes))
  | SQLite update + file write (bidirectional sync)
  | repo emits version bump
repoVersion$ signal bumps -> computed visibleLens invalidates -> useSignal re-renders
```

### Navigate: Cursor Movement

```
User presses j/k/h/l
  | binding resolves to cursorMove command
ViewTreeProjection navigation computes target nodeId
  | view-navigation.ts: tree.next(id) / tree.prev(id) / tree.children(id)
Dispatch SELECT action with target nodeId
  | sel.node.select([targetId])
classifyCursorFromLens derives cursorCardNodeId + cursorColumnNodeId
  | O(1) lens parent walk
Components re-render via useSignal(sel.node.cursor) (only 2 cards: old + new cursor)
```

### Sync: External Edit -> TUI

```
User edits file in vim/nvim
  | file watcher (chokidar, 5s debounce)
Reconcile: parse file, diff KNodes against DB
  | emit node-added/node-changed/node-removed events
SQLite state updated -> repo.touch() -> repoVersion$ signal bumps
computed visibleLens rebuilds -> useSignal re-renders
  | cursor validation: if sel.node.cursor was deleted, fall back to parent/sibling
```

## Visual Roles

A node's visual role is determined by its **depth from the zoom root** — not by its type:

| Depth | Role | Appearance |
|-------|------|------------|
| 0 | Board root | Fullscreen, no chrome |
| 1 | Column | Header bar |
| 2 | Card | Bordered box (title + sub-items + body) |
| 3+ | Sub-item | Indented line; expands when selected |

This is a **rendering rule, not data**. The same KNode renders as a column when zoomed out and as the board root when zoomed in. ViewNode makes this explicit — each node carries its `ViewRole`, derived from tree position.

**Body content**: Non-outline direct children of root (paragraphs, tasks, embeds before the first heading) render in a virtual "Description" column. Determined by `extractBody()` at derivation time.

**Embeds**: A node with `symlink_to` displays the referenced node's content in its visual position. The visual parent (embed slot) differs from the data parent (source file). ViewNode resolves this by storing `resolvedEmbed` and using the visual parent for its `parent` pointer.

## Composition Model

### Current: Imperative Handlers

```
Keypress -> KmOp -> board-actions.ts (2600 lines) -> handler -> Repo mutation + state update
```

Action handlers receive an `OpCtx` — a context object re-derived on each keypress with `columnId`, cursor indices, `card`, `tree` (ViewTreeProjection), and 30+ methods. Cross-cutting concerns (undo, embeds, body detection, hidden nodes, fold) are woven throughout the handlers.

### ViewTreeProjection as Single Authority

The ViewTreeProjection (in OpCtx as `tree`) is the single authoritative derivation of visual roles, cursor classification, and navigation. Each pane's `PaneSignals.visibleLens` is a computed alien-signal — one build, auto-cached. `buildOpCtx` derives `columnId` and `card` from the tree directly (board mode) or via `deriveDetailColumns` (detail mode). Board.tsx reads column IDs via `useSignal(ps.visibleLens)`. Components take string IDs and self-resolve via `useNode(id)`. Cursor classification uses `classifyCursorFromLens` (O(1) lookup + parent walk). Navigation traverses the tree's `next/prev/parent/children` methods.

### Target: TEA State Machines + Plugin Slices

Following the [TEA state machine design](design/tea-state-machines.md):

```
Board.apply(state, op) -> [state, effects]
```

Operations and effects are serializable data. The reducer is pure. Cross-cutting concerns become middleware — each a `(state, op, next) -> [state, effects]` function that can be understood, tested, and composed independently.

### SlateJS Alignment

| SlateJS | km (current) | km (target) |
|---------|-------------|-------------|
| `Editor` | board-app-store + OpCtx | `Board` — single state machine |
| `Element` / `Text` | KNode (item/block) | KNode (unchanged) |
| `Path` | sel.node.cursor + classifyCursorFromViewIndex | `cursorPath: string[]` via ViewNode |
| `Operation` | BoardReducerOp + KmOp | `KmOp` — unified discriminated union (done) |
| `Transform` | board-actions.ts (2600 lines) | Per-concern handlers, composed via pipeline |
| `Plugin` | (hardcoded throughout) | Middleware: `(state, op, next) -> [state, effects]` |

## Related Docs

- [principles.md](principles.md) — Philosophy: composability, code for humans, governance
- [design/data-model.md](design/data-model.md) — KNode tree, items vs blocks, board hierarchy
- [design/tea-state-machines.md](design/tea-state-machines.md) — TEA vision and phase plan
- [design/architecture-layers.md](design/architecture-layers.md) — Domain/Operations/Application layers
- [Silvery architecture](../vendor/silvery/docs/architecture.md) — TUI framework internals
- [The Silvery Way](../vendor/silvery/docs/guide/the-silvery-way.md) — Component principles
