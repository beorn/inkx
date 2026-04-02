# km Architecture

km turns markdown files into a structured, queryable knowledge system. This doc covers the full system: building blocks, layers, data flows, and composition model. For silvery (the TUI framework), see [vendor/silvery/docs/architecture.md](../vendor/silvery/docs/architecture.md).

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
  embed_source?: string   // points to another node (embeds)
  fstype?: string         // "repo" | "folder" | "file" | "mdsection"
  rules?: SectionRules    // parsed km.* directives (collapse, color, limit)
}

const KNode = {
  isItem(node): boolean     // node.item != null — structural, cursor target
  isBlock(node): boolean    // node.item == null — leaf content
  isOutline(node): boolean  // type === "h" && item != null — creates hierarchy
  isListItem(node): boolean // type !== "h" && item != null — bullet/task
  isTask(node): boolean     // node.item?.task != null
  isEmbed(node): boolean    // has embed_source
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
  cursorNodeId: string | null     // single source of truth for cursor
  foldDepths: Map<string, number> // per-node fold depth overrides
  collapsedNodes: Set<string>     // collapsed column headers
  navHistory: NavHistoryEntry[]   // back/forward navigation
  moveMode: boolean               // m + destination workflow
}
```

Key design: **no tree data in state**. Navigation and rendering query Repo on demand. Visual layout (columns, cards, cursor indices) is derived at render time — never stored.

### BoardAction / CommandAction

`BoardAction` — discriminated union dispatched to the reducer (`SELECT`, `TOGGLE_FOLD`, `ZOOM_IN`, etc.). `CommandAction` — higher-level user intent (verbs, nav, edits, text ops, dialog ops) dispatched through the command system. Defined in `@km/commands`.

### ColumnView / CardView — Derived View Models

Derived (not stored) representations for rendering. `ColumnView` = a section heading with its cards. `CardView` = a KNode enriched with resolved embed data and body classification.

```typescript
interface ColumnView { node: KNode; cardNodes: CardView[]; rules?: SectionRules; isVirtual?: boolean }
interface CardView extends KNode { resolvedNode?: KNode; isBody: boolean; hasBodyChildren: boolean }
```

### ViewNode — Explicit Visual Tree

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
- `@km/tree` — Tree mutations via TreeMutator interface (splitNode, merge, indent, outdent)
- `@km/board` — BoardState + reducer, ViewNode tree. ID-based, no tree traversal.
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
buildViewTree -> viewNodeToColumnViews -> ColumnView[]
  | @km/board (ViewNode tree), apps/km-tui/src/hooks/use-columns.ts (React hook)
React render: Board -> CardColumn -> TreeNode -> silvery Box/Text
  | silvery pipeline
ANSI output: incremental buffer diff -> terminal
```

### Edit: Keypress -> File

```
User presses key (e.g., 'x' to toggle task status)
  | silvery useInput -> key normalization -> binding resolution
CommandAction dispatched to handler
  | board-actions.ts router -> focused handler
Handler calls Repo mutation (e.g., repo.updateNode(id, changes))
  | SQLite update + file write (bidirectional sync)
  | repo emits version bump
useSyncExternalStore triggers -> useColumns re-derives -> re-render
```

### Navigate: Cursor Movement

```
User presses j/k/h/l
  | binding resolves to cursorMove command
ViewNode navigation computes target nodeId
  | view-navigation.ts: traverses ViewNode tree (parent pointers, sibling arrays)
Dispatch SELECT action with target nodeId + cached viewIndex
  | board reducer updates cursorNodeId
classifyCursorFromViewIndex derives cursorCardNodeId + cursorColumnNodeId
  | O(1) ViewNode lookup + parent pointer walk
Components re-render via useSyncExternalStore (only 2 cards: old + new cursor)
```

### Sync: External Edit -> TUI

```
User edits file in vim/nvim
  | file watcher (chokidar, 5s debounce)
Reconcile: parse file, diff KNodes against DB
  | emit node-added/node-changed/node-removed events
SQLite state updated -> repo.touch() -> version bump
useColumns re-derives -> re-render
  | cursor validation: if cursorNodeId was deleted, fall back to parent/sibling
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

**Embeds**: A node with `embed_source` displays the referenced node's content in its visual position. The visual parent (embed slot) differs from the data parent (source file). ViewNode resolves this by storing `resolvedEmbed` and using the visual parent for its `parent` pointer.

## Composition Model

### Current: Imperative Handlers

```
Keypress -> CommandAction -> board-actions.ts (2600 lines) -> handler -> Repo mutation + state update
```

Action handlers receive an `ActionCtx` — a large context object re-derived on each keypress with columns, cursor indices, node references, ViewNode tree, and 30+ methods. Cross-cutting concerns (undo, embeds, body detection, hidden nodes, fold) are woven throughout the handlers.

### ViewNode as Single Authority

The ViewNode tree (in ActionCtx as `viewTree` and `viewIndex`) is the single authoritative derivation of visual roles, cursor classification, and navigation. Column derivation (`useColumns`) delegates to `buildViewTree + viewNodeToColumnViews`. Hidden nodes are filtered at tree construction time. Cursor classification uses `classifyCursorFromViewIndex` (O(1) lookup + parent walk). Navigation traverses ViewNode parent/children pointers directly.

### Target: TEA State Machines + Plugin Slices

Following the [TEA state machine design](design/tea-state-machines.md):

```
Board.apply(state, op) -> [state, effects]
```

Operations and effects are serializable data. The reducer is pure. Cross-cutting concerns become middleware — each a `(state, op, next) -> [state, effects]` function that can be understood, tested, and composed independently.

### SlateJS Alignment

| SlateJS | km (current) | km (target) |
|---------|-------------|-------------|
| `Editor` | board-app-store + ActionCtx | `Board` — single state machine |
| `Element` / `Text` | KNode (item/block) | KNode (unchanged) |
| `Path` | cursorNodeId + classifyCursorFromViewIndex | `cursorPath: string[]` via ViewNode |
| `Operation` | BoardAction + CommandAction | `BoardOp` — unified discriminated union |
| `Transform` | board-actions.ts (2600 lines) | Per-concern handlers, composed via pipeline |
| `Plugin` | (hardcoded throughout) | Middleware: `(state, op, next) -> [state, effects]` |

## Related Docs

- [principles.md](principles.md) — Philosophy: composability, code for humans, governance
- [design/data-model.md](design/data-model.md) — KNode tree, items vs blocks, board hierarchy
- [design/tea-state-machines.md](design/tea-state-machines.md) — TEA vision and phase plan
- [design/architecture-layers.md](design/architecture-layers.md) — Domain/Operations/Application layers
- [Silvery architecture](../vendor/silvery/docs/architecture.md) — TUI framework internals
- [The Silvery Way](../vendor/silvery/docs/guide/the-silvery-way.md) — Component principles
