# Architecture Knowledge -- arch agent

Last updated: 2026-04-12

## Package Map

### apps/ (Application layer -- private, workspace-only)

| Package | Location | Purpose | Key deps |
|---------|----------|---------|----------|
| `@km/cli-app` | `apps/km-cli` | Main CLI entry point (`bun km <subcommand>`) | `@km/storage`, `@km/commands`, `@silvery/commander` |
| `@km/tui` | `apps/km-tui` | TUI board view -- cards, columns, detail pane, inline edit | `@km/commands`, `@km/core`, `@km/markdown`, `@km/storage`, `@km/tree`, `@silvery/ag-react`, `@silvery/selection`, `@silvery/theme` |
| `@km/repl` | `apps/km-repl` | Interactive REPL for scripting/debugging | `@km/storage`, `@km/core` |
| `@km/web` | `apps/km-web` | Web server (early stage) | `@km/storage` |

### packages/ (Domain layer -- private, workspace-only)

| Package | Location | Layer | Purpose | Key deps |
|---------|----------|-------|---------|----------|
| `@km/core` | `packages/km-core` | Foundation | KNode type, Position, ItemData, events, config, task status, metadata extraction | `loggily`, `nanoevents` |
| `@km/markdown` | `packages/km-markdown` | Parser | Parse/serialize markdown to/from KNode records (stateless, no DB) | `@km/core`, mdast, micromark, ulid, yaml |
| `@km/storage` | `packages/km-storage` | Storage | SQLite CRUD, file sync, watcher, events, Repo factory | `@km/core`, `@km/markdown`, `alien-signals` |
| `@km/tree` | `packages/km-tree` | Tree | Node tree structure, queries, mutations (split/merge/indent/outdent), operations, history, normalization | `@km/core` |
| `@km/board` | `packages/km-board` | Board | BoardState, TreeLens pipeline (ViewLens, VisibleLens, ViewTreeProjection), grid navigation, cursor classification | `@km/core`, `@km/tree`, `@silvery/ag-react` |
| `@km/commands` | `packages/km-commands` | Commands | Command registry, keybindings, context-aware dispatch, KmOp types | `@km/board`, `@km/core` |
| `@km/beads` | `packages/km-beads` | Beads | bd-compatible issue tracking on km data | `@km/core`, `@km/storage` |
| `@km/agent` | `packages/km-agent` | Agent | Claude SDK agent integration | `@km/core`, `@km/storage` |
| `@km/connector-caldav` | `packages/km-connector-caldav` | Connector | CalDAV/CardDAV sync | -- |
| `@km/infra` | `packages/km-infra` | Infra | Shared config: oxlint, oxfmt, vitest setup, typecheck baseline | -- |
| `@silvery/selection` | `packages/silvery-selection` | Selection | Pure selection state machine (node selection, sub-selection, pointer gestures) | `alien-signals` |

### vendor/ (Git submodules -- standalone repos)

| Package | Location | Version | npm Scope | Public? | Purpose |
|---------|----------|---------|-----------|---------|---------|
| `silvery` | `vendor/silvery` | 0.17.4 | `silvery`, `@silvery/*` | Public (barrel + ansi + color + commander) | React TUI framework -- reconciler, components, theme, layout, 5-phase pipeline |
| `flexily` | `vendor/flexily` | 0.6.0 | `flexily` | Public | Pure JS flexbox layout (Yoga-compatible, zero deps) |
| `loggily` | `vendor/loggily` | 0.7.0 | `loggily` | Public | Debug/log/span, disabled logs skip evaluation via `?.`, zero deps |
| `vimonkey` | `vendor/vimonkey` | 0.2.4 | `vimonkey` | Public | Fuzz testing with auto-shrinking + chaos streams for Vitest |
| `termless` | `vendor/termless` | 0.6.0 (core) | `@termless/*` | Public | Headless terminal testing (like Playwright for terminals), 11+ backends |
| `vterm` | `vendor/vterm` | -- | `vt100.js`, `vt220.js`, `vterm.js` | Public | Terminal emulator monorepo: VT100, VT220, modern |
| `bearly` | `vendor/bearly` | -- | `@bearly/*` | Partly public | Claude Code tools: tribe, github, tty, recall, llm, refactor, worktree |
| `accountly` | `vendor/accountly` | 0.2.0 | `@beorn/accountly` | Private | Multi-account credential switching |
| `tap` | `vendor/tap` | 0.3.0 | `@beorn/tap` | Private | TAP stream merge + format conversion |
| `watcher-chaos` | `vendor/watcher-chaos` | 0.2.0 | `@beorn/watcher-chaos` | Private | Chaos file watcher for testing |
| `terminfo.dev` | `vendor/terminfo.dev` | -- | -- | Private | Terminal capability database + probes |

### vendor/internal/ (Private design docs, not published)

- `vendor/internal/silvery` -- silvery design docs, mockups, prototypes, roadmap (git submodule)
- `vendor/internal/bearly` -- bearly/tribe design docs (tracked in km repo)
- `vendor/internal/loggily` -- loggily design docs
- `vendor/internal/market` -- marketing materials

### Silvery internal packages (within vendor/silvery/packages/)

All at version 0.17.3, private (bundled into silvery barrel):

| Package | What |
|---------|------|
| `@silvery/ag` | Core types -- AgNode, BoxProps, keys, focus |
| `@silvery/ag-react` | React reconciler, hooks, UI components |
| `@silvery/ag-term` | Terminal runtime, ANSI output, 5-phase rendering pipeline |
| `@silvery/create` | App composition -- pipe(), withApp, withCommands, TEA store, createSlice() |
| `@silvery/headless` | Pure state machines -- SelectList, Readline (no React) |
| `@silvery/theme` | 38 palettes, ThemeProvider, useTheme, theme CLI |
| `@silvery/test` | Testing -- virtual renderer, locators, assertions |
| `@silvery/commands` | Command registry, keymaps, invocation |
| `@silvery/scope` | Structured concurrency -- createScope(), disposal |
| `@silvery/signals` | Reactive signals (alien-signals wrapper) |
| `@silvery/model` | Optional DI model factories |
| `@silvery/ink` | Ink/Chalk compatibility layer |

Stale/empty package directories in `vendor/silvery/packages/` (no package.json, only dist/node_modules): `tea`, `ui`, `examples`.

## Layer Boundaries

Canonical diagram (matches `docs/architecture.md#layers`):

```
APP        apps/km-tui, km-cli, km-repl, km-web
COMMANDS   @km/commands
BOARD      @km/board
TREE       @km/tree          @km/storage
PARSER     @km/markdown
CORE       @km/core
FILESYSTEM .md files (source of truth)
```

**Dependency rules:**
- Dependencies flow downward. Each package imports only from packages on its row or below.
- `@km/tree` and `@km/storage` are peer layers -- both depend on `@km/core`, neither on the other. `@km/storage` depends on `@km/markdown` (for file parsing); `@km/tree` does not.
- UI never touches filesystem directly; all mutations go through Repo.
- All mutations emit events (enables sync, undo, multi-window).
- `@km/board` depends on `@km/tree`, `@km/core`, and `@silvery/ag-react`. No longer depends on `@km/markdown` (layer violation fixed: `NodeRules`/`parseHeadingRules` moved to `@km/core`).
- `@km/commands` depends on `@km/board` and `@km/core` but NOT on `@km/storage` or `@km/markdown`.
- `@km/storage` depends on `@km/core` and `@km/markdown` but NOT on `@km/tree` or `@km/board`.

**Cross-cutting dependency on silvery:** `@km/board` depends on `@silvery/ag-react` for `PositionRegistry`/`ScrollRect` (grid navigation). This is the only direct silvery dependency in the domain packages (besides `@km/tui` which naturally depends on the full rendering stack).

**Pure text utilities in @km/core:** `PROP_REGEX`, `extractKVProperties`, `parseHeadingRules`, `ParsedHeading`, `ExtractedProp` live in `@km/core/heading-rules.ts`. These are consumed by `@km/board`, `@km/tree`, and `@km/markdown`. The duplicate `SectionRules` type was unified with the existing `NodeRules` type in `@km/core/types.ts`.

**Vendor dependency chain:**
```
@silvery/color (zero deps)
  -> @silvery/ansi (+ string-width)
    -> @silvery/theme
      -> @silvery/ag (core types)
        -> @silvery/ag-react (+ react-reconciler)
          -> @silvery/ag-term (+ flexily)
            -> @silvery/create (+ @silvery/headless, @silvery/commands)
              -> silvery barrel (re-exports everything)
```

## Composition Patterns

### App composition with pipe()

silvery apps are assembled by composing a base app with plugins via `pipe()`:

```ts
// In apps/km-tui/src/driver.ts:
import { pipe, withCommands } from "@silvery/create/plugins"

const appWithCmd = pipe(
  baseApp,
  withCommands({ commands, keymap })
)
```

**Current state in km-tui:** The board app (`apps/km-tui/src/board/board-app.ts`) uses a large monolithic `createBoardApp()` factory that does not yet use the full `pipe()` chain. There's a TODO to migrate to `pipe(createApp(), withFocus(), withCommands(), withBoard())`.

### Factory function convention

All domain objects are created by factory functions returning plain objects:

```ts
export function createRepo(path, options?) -> Repo
export function createScope(name?, parent?) -> Scope
export function createTerm(options?) -> Term
function createViewLens(repo, config) -> TreeLens
function createVisibleLens(viewLens, config) -> TreeLens
function createViewTree() -> ViewTree
```

### Explicit DI pattern

Dependencies injected via options object with `inject`:

```ts
const repo = createRepo(path, {
  inject: { db: mockDb, fileTree: memFs }
})
```

### `using` cleanup (TC39 Explicit Resource Management)

Resources implement `Symbol.dispose` for automatic cleanup at scope exit:

```ts
using repo = createRepo(path)
await using sync = withSync(repo)
// cleanup runs automatically in reverse order
```

### `run()` -- app lifecycle

`run(app, events)` in `@silvery/ag-term/src/renderer.ts` starts the silvery render loop. Three overloads: sync (string array), sync (iterable), async (async iterable). This is the entry point that renders a React tree to the terminal.

### `createTerm()` -- terminal abstraction

`createTerm()` in `@silvery/ag-term/src/ansi/term.ts` creates the `Term` abstraction. Four variants: real (stdin/stdout), headless (no output), termless (emulator mode), and dimensions-only.

### `withSync()` decorator

`withSync(config?)` in `packages/km-storage/src/watch/sync.ts` wraps a Repo with filesystem sync, watcher setup, and heartbeat scheduling. Returns an async disposable.

### Decorator composition for TreeMutator

```ts
withHistory(withNormalization(treeMutator))
```

Each `with*` plugin overrides methods (like `validate()`) and chains to the previous implementation.

## Data Model

### KNode -- The Universal Node

Defined in `packages/km-core/src/interfaces/node.ts`. Every piece of content is a KNode:

```ts
interface KNode {
  id: string              // ULID
  type: string            // "h" | "p" | "code" | "quote" | "table" | "hr" | ...
  item?: ItemData         // present = structural (cursor target, has children)
  parent_id: string       // "." = workspace root
  parent_idx: number      // fractional index for sibling order
  content: string         // text content
  title: string           // display title (materialized)
  name: string            // slug/identifier
  embed_of?: string       // cache: sole-content embed target id
  fstype?: string         // "repo" | "folder" | "file" | "mdsection"
  rules?: NodeRules       // parsed km.* directives
}

interface ItemData {
  list?: string           // "-", "*", "+", "1.", etc.
  task?: { marker: TaskMarker; status: TaskStatus }
}
```

**Item vs Block distinction:** The single most important distinction.
- **Item** (`item: { ... }`) -- structural node, has children, cursor target, participates in outliner ops
- **Block** (no `item` field) -- leaf content, not selectable, part of parent's body

Type guards (SlateJS namespace pattern): `KNode.isItem()`, `KNode.isBlock()`, `KNode.isOutline()`, `KNode.isListItem()`, `KNode.isTask()`, `KNode.isEmbed()`

### km-ast vs KNode

Parser-time types that map to KNode in storage:

| km-ast | KNode | What |
|--------|-------|------|
| `oi` (outline item) | `type: "h", item: {}` | Section heading |
| `li` (list item) | `type: "p", item: { list?, task? }` | Bullet/task |
| `p` | `type: "p"` (no item) | Paragraph |
| `code`, `quote`, `table`, `hr` | matching type (no item) | Block content |

### Board Hierarchy (positional roles, not typed)

```
Board Root (depth 0)  -- fstype: "repo" or "folder"
  Column (depth 1)    -- type: "h", item: {} (direct child of root)
    Card (depth 2)    -- item: { ... } (child of column, bordered box)
      Sub-item (3+)   -- item: { ... } (indented line, expands when selected)
      Body block      -- no item (dimmed text before first sub-item)
```

**Role is positional, not typed.** The same KNode type renders as column, card, or sub-item depending on depth from the board root. Zooming changes the root, which changes roles.

### Body Content

"Body" = block content before the first sub-item within a parent. Extracted by `extractBody(children)` which splits children into `{ body, items }`. Body blocks render dimmed below card titles.

### View Models

| Model | Source | Adds |
|-------|--------|------|
| `ViewNode` | KNode via ViewTree | `viewType` (ViewRole), `childIds`, `parentId`, `display` (resolved embed), `isBody`, `rules` |
| `ViewRole` / `ViewType` | Tree depth | `"board"`, `"body-column"`, `"column"`, `"card"`, `"subitem"` |
| `TreeLens` | Universal nav interface | `get(id)`, `children(id)`, `parent(id)`, `nextInWalk(id)`, `prevInWalk(id)`, `walkOrder`, `role(id)`, `isBody(id)` |

### TreeLens Pipeline

Three-layer derivation from raw repo to React-consumable view:

```
repo (raw KNodes in SQLite)
  -> createViewLens(repo, { rootId, hiddenNodeIds, foldDepths })
       Scopes to root, applies structural exclusions, resolves embeds, computes roles
  -> createVisibleLens(viewLens, { collapsedNodes, taskStatusFilter, cardFilter })
       Applies column collapse, task status filtering, card-level predicates
  -> createViewTree()
       Wraps lens with ProjectedMap per-node signal bags for React
```

**Layering rule:** React components use `ViewTree` via `useNode(id)`. Non-React code (reducers, selectors, navigation) uses `TreeLens` directly.

### Tree Operations (SlateJS-inspired)

7 atomic operations in `packages/km-tree/src/operations.ts`:
`insert_node`, `remove_node`, `set_node`, `move_node`, `split_node`, `merge_node`, `set_selection`

Every operation is invertible via `inverse(op)`. High-level mutations emit operations via `onOp` callback, enabling undo without reimplementing logic.

### Tree Traversal

`KTree.nodes(tree, rootId, opts?)` is the composable primitive for tree iteration. Options: `match` (which nodes to yield), `into` (which subtrees to descend), `reverse`, `at` (skip-to), `mode` ("all" | "highest" | "lowest"). `match` and `into` are orthogonal -- match never affects descent, into never affects yielding.

## State Machines

### TEA Pattern

Every interactive subsystem follows: `(state, op) -> [state, effects]`

- **op** -- serializable data dispatched to `.apply()`. Named after consuming machine: `BoardOp`, `TreeOp`, `PlainTextOp`.
- **effect** -- side-effect instruction returned alongside new state (persist, notify, clipboard, dispatch). Machine never executes effects -- runtime does.
- **change** -- persisted record of what changed (e.g., `node_created`, `node_moved`).

### Unified pipeline

```
event -> command/handler -> op -> apply(state, op) -> [state, effects]
                                        |                    |
                                      state              changes
                                        ^                    |
                                  signals update <- persist + notify
```

### createSlice() and op() proxy

**`createSlice()`** (in `@silvery/create`) takes a handler map, infers the op union, and produces a typed `apply()` dispatcher:

```ts
const Selection = createSlice(() => initialState, {
  toggle(state, { id }) { ... },
  clear(state) { return { ...state, nodes: [] } },
})
Selection.apply(state, { op: "toggle", id: "abc" })
```

**`op()` proxy** intercepts method calls and routes through `apply()` as serializable data. The method name IS the op type, the arguments ARE the op data. Enables undo/tracing/recording without changing the calling code.

### Currently implemented machines

| Machine | Status | Location |
|---------|--------|----------|
| `applyBoard()` (board navigation reducer) | Shipped (Phase 2a) | `apps/km-tui/src/board/board-reducer.ts` |
| `PlainText.apply()` (readline editing) | Designed, partially shipped | `vendor/silvery/packages/headless/` |
| `Selection` (pure state machine) | Shipped | `packages/silvery-selection/src/apply.ts` |
| `Dialog.apply()` | Not yet implemented | -- |
| `Search.apply()` | Not yet implemented | -- |
| `Tree.apply()` | Not yet implemented (tree mutations still imperative via Repo) | -- |

### Kill ring pattern

PlainText.apply never reads the kill ring. It emits `kill_ring_push` effects when text is killed. The command layer resolves kill ring content and produces `{ type: "yank", text }` ops. This preserves the pure `(state, op) -> [state, effects]` signature.

## Invariants

### Tree invariants

1. **Items can have children, blocks cannot** -- `item != null` is the prerequisite for `getChildren()`
2. **parent_id "." means root** -- board root uses "." as parent_id (not null)
3. **parent_idx determines sibling order** -- fractional indexing for insertions without renumbering
4. **Cursor must point to existing node** -- invariant check `cursor-exists`
5. **Cursor must be under board root** -- invariant check `cursor-under-root`

### Rendering invariants (SILVERY_STRICT)

- **Incremental = fresh render** -- incremental rendering must produce identical output to full re-render. Violations indicate dirty flag bugs.
- **Cursor visibility** -- cursor node must be visible on screen after navigation
- **Border integrity** -- border characters must not be overwritten by content

Levels: `SILVERY_STRICT=1` (default in tests, end-of-test checks), `SILVERY_STRICT=2` (every-action checks)

### Selection invariants

- `cursor` is always in `ids` (or both are null for idle/board mode)
- `anchor` is always in `ids` (or null)
- All selected nodes are siblings (same parent) -- no cross-branch selection
- Selection is contiguous (no gaps)
- Node operations clear sub-selection (`sel.sub`)

### Validation

Post-mutation invariant checking gated by `KM_STRICT=1`. Each `with*` plugin overrides `validate()`:

```ts
tree.validate()       // plugin override chain -- throws on bad state
tree.withBatch(fn)    // defer validate until batch ends
```

## Cross-Package Contracts

### silvery promises km

- **React reconciler** (`@silvery/ag-react`) -- produces ag node tree from React elements
- **5-phase rendering pipeline** (`@silvery/ag-term`) -- layout (flexily) -> render (to buffer) -> output (ANSI diff)
- **Composition API** (`@silvery/create`) -- `pipe()`, `withApp()`, `withCommands()`, `createSlice()`, `op()` proxy
- **Component library** -- Box, Text, TextInput, TextArea, SelectList, VirtualList, ListView, Static, ScrollbackView
- **Theme system** (`@silvery/theme`) -- 38 palettes, semantic tokens (`$primary`, `$muted`), typography presets
- **Focus management** -- tree-based focus with spatial navigation and focus scopes
- **Input handling** -- `useInput()` hook, LIFO input layer stack, chord sequences
- **Layout feedback** -- `useBoxRect()` synchronous during render (no second pass)
- **Testing** (`@silvery/test`) -- `createRenderer()`, virtual rendering, locators, assertions, snapshots
- **Structured concurrency** (`@silvery/scope`) -- `createScope()`, disposal, child task tracking

### flexily promises silvery

- Yoga-compatible flexbox layout API (measure, compute positions/sizes)
- Zero-allocation hot path design
- Fingerprint-based cache (matching fingerprint = skip subtree)
- Scroll offset and sticky positioning support

### loggily promises everyone

- `createLogger(namespace)` returns a logger with `debug?.()`, `info?.()`, `warn?.()`, `error?.()`, `span?.()`
- Disabled logs skip argument evaluation entirely via optional chaining (`?.`)
- Zero deps, ~3KB
- `DEBUG=namespace:*` env var controls which namespaces are active
- `DEBUG_LOG=/path` redirects output to file (required for TUI apps)

### @silvery/selection promises km

- Pure selection state machine: `createSelection(app)` returns a store
- Node selection: `sel.node.cursor`, `sel.node.anchor`, `sel.node.ids` (computed signals)
- Sub-selection: `sel.text()`, `sel.path()`, `sel.crop()` (polymorphic slot)
- Drag lifecycle: `sel.drag.start()`, `sel.drag.end()`, `sel.drag.cancel()`
- Root scoping: `sel.root.set(id)`, `sel.root.up()`
- Pure transitions: `applySelect()`, `applyExtend()`, `applyReconcile()` -- testable without React

### @km/tree promises @km/board

- `KTree.nodes(tree, rootId, opts?)` -- composable tree iteration
- 7 atomic operations with `inverse()`
- `withHistory()` decorator for undo/redo
- `withNormalization()` decorator for schema enforcement
- `extractBody(children)` -> `{ body, items }` split
- Type guards: `KNode.isItem()`, `KNode.isOutline()`, etc.

## Vendor Submodule Topology

### 9 submodules (git submodule status)

| Submodule | Repo | Public? | Dependencies |
|-----------|------|---------|--------------|
| `vendor/silvery` | beorn/silvery | Public | flexily (layout), react (reconciler), alien-signals |
| `vendor/flexily` | beorn/flexily | Public | Zero deps |
| `vendor/loggily` | beorn/loggily | Public | Zero deps |
| `vendor/vimonkey` | beorn/vimonkey | Public | vitest (peer) |
| `vendor/termless` | beorn/termless | Public | vterm.js, xterm.js, various emulator backends |
| `vendor/vterm` | beorn/vterm | Public | Zero deps (pure TS) |
| `vendor/bearly` | beorn/bearly | Partly (tribe, github public) | Various (claude SDK, alien-signals, etc.) |
| `vendor/internal/silvery` | beorn/silvery-internal | Private | -- (docs only) |
| `vendor/terminfo.dev` | beorn/terminfo.dev | Private | termless, vterm |

Note: `vendor/accountly`, `vendor/tap`, `vendor/watcher-chaos` are NOT git submodules -- they are tracked directly in the km repo.

### Cross-vendor dependency graph

```
flexily (zero deps)
  <- silvery (layout engine)

loggily (zero deps)
  <- @km/core (logging)

vterm.js, vt100.js, vt220.js (zero deps)
  <- termless backends

alien-signals (external)
  <- @silvery/signals (wrapper)
  <- @silvery/selection
  <- @km/storage (withReactive)

react + react-reconciler (external)
  <- @silvery/ag-react (reconciler)
```

### Workspace resolution

The km root `package.json` uses `overrides` to map npm package names to workspace copies:
```json
"silvery": "$silvery",
"@silvery/ag": "$@silvery/ag",
"flexily": "$flexily",
"loggily": "$loggily",
"vt100.js": "file:vendor/vterm/packages/vt100",
```

This ensures local development uses the workspace versions while vendor packages can publish with npm version dependencies.

## Design Decisions

### Why factory functions, not classes

- **Type friction**: Classes don't compose with plain objects -- can't JSON.stringify, can't spread without losing methods, can't pass through IPC
- **Interoperability**: Every class instance needs special handling for common operations
- **TypeScript algebraic types** work great with plain objects
- **No `this` binding** issues (callbacks lose context in classes)
- **No inheritance coupling** -- compose via wiring
- **Exception**: Classes extending EventEmitter (`WriteQueue`, `FileSystemWatcher`, `WorkerWatcher`) or Error subclasses are acceptable for infrastructure

### Why `using` cleanup

- No resource leaks (database connections, file handles, scopes)
- Clear ownership (creator responsible for cleanup)
- Predictable teardown order (reverse of creation)
- Lifecycle management IS dependency management

### Why explicit DI

- No hidden coupling (who initialized it? when?)
- Parallelizable tests (no shared state)
- Swappable implementations (mockDb, memFs)
- No lazy singletons -- pass `db` as param, not `getDb()` accessor

### Why no globals

- Module-level `let` state is banned
- Factory functions own all state in closures
- **One exception**: `tuiEvents` EventEmitter in `apps/km-tui/src/tui.tsx` -- app-level event bus for TUI refresh events, scoped to app layer only

### Why TEA state machines

- **Testable**: call the function, assert the result, no mocks
- **Replayable**: serialize operations for time-travel debugging, undo/redo
- **Portable**: same machines work in terminal, browser, tests, AI automation
- **Composable**: plugins wrap `.apply()` as middleware
- **Collaborative**: serializable operations can be sent over the network (CRDT/OT future)

### Why ID-based addressing (not paths)

- SlateJS uses index-based paths (`[0, 1, 2]`) which shift on structural changes
- km uses stable ULID node IDs that survive structural changes
- Makes collaboration simpler (no path rebasing)
- `Point` is `{ nodeId, offset }` not `{ path, offset }`

### Why domain interfaces (type + namespace)

- SlateJS pattern: each concept is both a TypeScript interface and a namespace of pure functions
- Consumers write `Selection.includes(sel, id)`, not `sel.includes(id)`
- Autocomplete-driven design: type `KNode.` to discover all operations
- Uses TypeScript declaration merging (interface + const sharing the same name)
- Three domain building blocks: domain objects (stateful, factory-created), domain interfaces (type + pure functions), domain types (plain data shapes)

### Why structural branching, not physical

- View code decides rendering based on structural properties (`type`, `content`, `children`, `item`) -- never on `fstype`
- Nodes can come from markdown files, Asana imports, inline creation, or any future source
- Physical branching would break for different node sources
- Exception: cosmetic hints (icons) may use `fstype`

### Reactive model: DIRECT > DERIVED > EFFECT

- **DIRECT** (preferred): store method reads signals, calls pure function, writes result
- **DERIVED** (clean): `computed` signal reads from other signals, no writes
- **EFFECT** (restricted): watches one signal and writes another -- reserved for cross-system boundaries. Every bridge/race/double-write bug originated from pattern 3. Rule: one writer per signal.

## Anti-Patterns

### Tried and failed

1. **State in three places** (Decker lesson): DOM + Zustand + closures leads to impossible-to-debug inconsistencies. Fix: one state atom, pure state machine.

2. **HTML5 drag events** (Decker lesson): `dragstart`/`dragover`/`drop`/`dragend` fire in different orders across browsers. Fix: own pointer pipeline from primitives (`pointerdown`/`pointermove`/`pointerup`).

3. **Bare `walkTree` conflating filtering and pruning**: The old `walkTree` function mixed "what to yield" with "what subtrees to skip." Fix: `KTree.nodes()` with orthogonal `match` and `into` predicates.

4. **Standalone helper functions instead of domain namespaces**: DFS traversal was reimplemented 3 times because the canonical one wasn't discoverable on the namespace. Fix: autocomplete test -- operations must be discoverable via `Namespace.`.

5. **Computed signals that write other signals (effect bridges)**: Init races and double-write bugs. Fix: one writer per signal; cross-system coordination via DIRECT pattern (method calls pure function, writes own signals).

6. **Imperative Zustand mutations for everything**: Scattered state updates impossible to test or replay. Partially fixed: board reducer (`applyBoard()`) shipped. Full TEA migration ongoing.

7. **`Box theme={{}}` for background changes**: Re-resolves ALL `$tokens` -- performance trap. Fix: use `backgroundColor` prop directly for bg-only changes.

8. **Manual DFS instead of `KTree.nodes()`**: Every time someone writes a manual tree walk, it gets filtering/pruning wrong. Use the canonical primitive.

9. **Working around vendor bugs instead of fixing them**: Vendor packages are git submodules -- fix bugs directly in `vendor/`. Workarounds accumulate and become harder to remove.

10. **DECSTBM scroll regions for inline scrollback**: Lines get DISCARDED, not preserved. Re-learned 5+ times.

### Banned patterns

- `class` for domain objects (use factory functions)
- `Action` as a type name (use `*Op`)
- Bare `bun test` (use `bun run test:fast` or `bun vitest run <dir>`)
- `require()` (ESM only)
- `process.exit()` (use AbortController + using/await)
- `git stash`, `git reset --hard`, `git checkout .`, `git restore`, `git clean -f`
- Module-level `let` state (no globals/singletons)
- `dimColor` for cascading dim (doesn't cascade to children -- pass `dim` prop)

## Inconsistencies Found

### Version mismatches in docs/packages.md

1. **All silvery internal packages**: `docs/packages.md` lists versions like `0.5.1`--`0.5.3` but actual versions are all `0.17.3`. This applies to: `@silvery/ag`, `@silvery/ag-react`, `@silvery/ag-term`, `@silvery/create`, `@silvery/headless`, `@silvery/theme`, `@silvery/test`, `@silvery/commands`, `@silvery/scope`, `@silvery/signals`, `@silvery/model`, `@silvery/ink`.

2. **`@silvery/ansi`**: docs say `0.3.4`, actual is `0.17.3`.

3. **`@silvery/color`**: docs say `0.1.2`, actual is `0.17.3`.

4. **`@silvery/commander`**: docs say `0.8.2`, actual is `0.17.5`.

5. **`@silvery/examples`**: docs say `0.5.6`, but this is a stale/empty directory (no package.json, only LICENSE + node_modules).

6. **`silvery` barrel**: docs say `0.17.2`, actual is `0.17.4`.

7. **`flexily`**: docs say `0.5.2`, actual is `0.6.0`.

8. **`loggily`**: docs say `0.6.1`, actual is `0.7.0`.

9. **`vimonkey`**: docs say `0.2.1`, actual is `0.2.4`.

10. **`@termless/core`**: docs say `0.6.0`, actual is `0.6.0` (correct, but listed as a separate package when it's actually the root package of the termless repo, not in a `packages/core/` subdirectory).

### Stale package directories in vendor/silvery/packages/

- `tea/` -- has only `dist/` and `node_modules/`, no `package.json` or `src/`. TEA functionality has been moved into `@silvery/create`. Docs still reference `@silvery/tea` in some places (glossary mentions "silvery's `@silvery/tea`").
- `ui/` -- has only `node_modules/`, no `package.json` or `src/`. Not mentioned in current docs.
- `examples/` -- has only `LICENSE` and `node_modules/`, no `package.json` or `src/`.

### Layer boundary observations

1. **`@km/board` depends on `@silvery/ag-react`**: The `grid-navigator.ts` imports `PositionRegistry` and `ScrollRect` from `@silvery/ag-react`. This means the BOARD layer reaches into the rendering framework directly, which is unusual for a "no UI rendering" package (as its own description states). The dependency is for spatial navigation, which arguably belongs at the board level, but it creates a coupling between the board domain package and the rendering framework.

2. **`@km/board` dependency on `@km/markdown` -- FIXED**: The board layer no longer depends on `@km/markdown`. `SectionRules` was unified with the identical `NodeRules` type already in `@km/core`, and `parseHeadingRules`/`extractKVProperties`/`PROP_REGEX` were moved to `@km/core/heading-rules.ts`. This also fixed `@km/tree`'s undeclared import of `PROP_REGEX` from `@km/markdown`.

### Classes in the codebase

The docs say "No classes, no `new`, no `this`" but there are classes in the codebase. Most fall under the documented "Infrastructure Class Exception":
- `BaseStore`, `MemoryStore` (km-storage) -- abstract base + implementation for node store
- `WriteQueue` (km-storage) -- extends EventEmitter
- `FileSystemWatcher`, `WorkerWatcher` (km-storage) -- extend EventEmitter
- `ChangeHandlers`, `WriteTokenMap` (km-storage) -- infrastructure
- `DisposableStore` (km-core) -- resource management
- `KmDaemon` (km-cli) -- extends EventEmitter
- `AsanaClient` (km-cli) -- external API client
- `SelectionInvariantError`, `InvariantViolationError`, `IncompleteDatabase`, `CliError`, `ExitSignal` -- Error subclasses (acceptable)

Most are legitimate under the exception, but `ChangeHandlers` (km-storage) and `AsanaClient` (km-cli) are not EventEmitter subclasses -- they could be factory functions.

### Documentation vs code state

1. **`docs/packages.md` silvery dependency chain**: Shows `@silvery/create` depending on `@silvery/headless` and `@silvery/commands`. This appears to be the logical dependency rather than the actual npm dependency chain, since the chain goes from `@silvery/color` (zero deps) up to the barrel.

2. **Test file count**: CLAUDE.md says `test:fast` is "~190 files" and `test:all` is "~393 files", while the earlier CLAUDE.md version says "~124 files" and "~240 files" respectively. The actual count of test files in the repo is 3661 (though many are in node_modules). The numbers are likely approximate and change frequently.

3. **`docs/architecture.md` BoardState**: Shows `// cursor: sel.node.cursor() -- sole authority, not stored in BoardState` but this is the target architecture -- the actual current state may still have cursor-related fields in BoardState during the ongoing selection migration.

4. **Layer diagram inconsistency**: RESOLVED 2026-04-12. All three sources (CLAUDE.md, docs/architecture.md, arch-knowledge.md) now show the same 7-row diagram. `docs/design/architecture-layers.md` deleted.

5. **`docs/glossary.md` mentions `@silvery/tea`**: The entry for "Zustand" says "Used by silvery's `@silvery/tea` store" but `@silvery/tea` is a stale empty package -- the TEA functionality is now in `@silvery/create`.
