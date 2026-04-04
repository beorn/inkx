# TEA State Machines

> Every interactive subsystem is a pure state machine: `(state, op) → [state, effects]`.

**Bead:** km-all.tea-machines
**Status:** Partially implemented (Phase 2a navigation reducer shipped; see [phases.md](phases.md) for roadmap)

## The Principle

Operations are data (serializable). Effects are data (serializable). State transitions are pure functions. The runtime applies effects. Machines compose via effects.

This holds at every scale — each machine is a **domain interface** (type + namespace of pure functions, inspired by SlateJS's `Editor`, `Node`, `Path` pattern):

```
character editing    PlainText.apply(state, op)  → [state, effects]
body editing         SlateJS (per-node body editor, Phase 3)
document tree        Tree.apply(tree, op)        → [tree, effects]        (Phase 4)
app coordination     Board.apply(state, op)      → [state, effects]
                     Dialog.apply(state, op)     → [state, effects]
                     Search.apply(state, op)     → [state, effects]
```

### Terminology

See [glossary.md](../glossary.md) for full definitions. Consistent naming across all layers:

| Concept | Term | Not |
|---|---|---|
| Something that happened | **event** | — |
| Named, registered event handler | **command** | ~~action~~ |
| Data passed to `.apply()` | **op** | ~~action~~, ~~message~~ |
| Pure function implementing one op type | **op handler** | ~~reducer~~, ~~case~~ |
| Handler map + typed apply dispatcher | **createSlice()** | — |
| Ergonomic proxy routing calls through apply | **op() proxy** | — |
| Read-only derivation from state | **selector** | ~~getter~~ |
| Creates initial state | **constructor** | — |
| Result side channel | **effect** | ~~side effect~~, ~~cmd~~ |
| Persisted record of what changed | **change** | ~~committed event~~ |
| Type + function namespace | **domain interface** | ~~noun-singleton~~, ~~class~~ |
| State transition dispatcher | **`.apply()`** | ~~`.update()`~~, ~~`.reduce()`~~ |

**Ban**: `Action` as a type name. Use `*Op` for dispatch types (`BoardOp`, `TreeOp`, `PlainTextOp`).

### Domain interface anatomy

A domain interface groups everything for one domain concept:

```ts
const Board = {
  // Constructor — creates initial state
  create(rootId):            BoardState

  // Selectors — read-only derivations from state
  visibleNodes(state):       ID[]
  cursorColumn(state):       number
  canZoomOut(state):         boolean

  // Apply — dispatches ops to their handlers
  apply(state, op: BoardOp): [BoardState, Effect[]]
}
```

### Op handlers: createSlice() + op() proxy

Two layers work together to make state machines ergonomic:

**`createSlice()`** is the foundation (shipped in `@silvery/create`). It takes a handler map, infers the op union, and produces a typed `apply()` dispatcher:

```ts
// createSlice: define handlers, get typed apply()
const Selection = createSlice(() => initialState, {
  toggle(state: SelectionState, { id }: { id: ID }) {
    // pure implementation — returns next state
  },
  clear(state: SelectionState) {
    return { ...state, nodes: [] }
  },
})

// Each handler name becomes an op variant:
Selection.apply(state, { op: "toggle", id: "abc" })
Selection.apply(state, { op: "clear" })

// Handlers are also directly accessible for unit testing:
Selection.toggle(state, { id: "abc" })
```

See `vendor/silvery/packages/create/src/core/slice.ts` for the implementation.

**`op()` proxy** is the ergonomic layer on top. A JavaScript Proxy intercepts method calls and routes them through `apply()` as serializable `{ path, args }` data:

```ts
// Direct call — not intercepted, fast, but invisible to plugins
model.chat.submit({ text: "hello" })

// op() proxy — same call, but routed through apply() pipeline
op(model).chat.submit({ text: "hello" })
// Captured as: { type: "model-op", path: ["chat", "submit"], args: [{ text: "hello" }] }
```

The method name IS the op type. The arguments ARE the op data. Plugins (undo, tracing, recording) intercept via `apply()` without the caller changing anything — just wrap the target in `op()`.

**When to use which:**
- `createSlice()` — always, for defining state machines with typed handlers and apply
- `op()` proxy — when mutations need interception (undo, recording, collaboration). The caller decides per-call whether to use `op(model).method()` (intercepted) or `model.method()` (direct)

See `vendor/internal/silvery/design/v15-tea/app.md` § `op() Proxy` for the full design. Bead: km-all.1.

### Unified pipeline

```
event → command/handler → op → apply(state, op) → [state, effects]
                                      ↕                    ↓
                                    state              changes
                                      ↑                    ↓
                                signals update ◄── persist + notify
```

**Providers** create events (keyboard, mouse, FS watcher, sync, timer). **Event handlers** process events into ops. **Commands** are event handlers that are registered — they get an ID, keybinding, and appear in the palette. Other handlers (reconciler, sync, heartbeat) produce ops too but aren't user-invocable.

**Op types are named after the consuming machine**, not the producing source:
- `BoardOp` — consumed by `Board.apply()`
- `TreeOp` — consumed by `Tree.apply()` (invertible, atomic, serializable)
- `PlainTextOp` — consumed by `PlainText.apply()`
- `KmOp` — union of all domain ops, consumed by the root machine

**Note**: silvery's `createStore` predates this design and uses `(msg, model) → [Model, Effect[]]`. Conceptually `msg` = op and `model` = state.

## Why This Shape

```ts
// The universal signature — every .apply() follows this shape:
type Apply<State, Op, Eff> = (state: State, op: Op) → [State, Eff[]]
```

- **Testable**: Call the function, assert the result. No mocks needed.
- **Replayable**: Serialize operations → time-travel debugging, undo/redo.
- **Portable**: Same machines work in terminal, browser, tests, AI automation.
- **Composable**: Plugins wrap `.apply()`: `compose(withHistory, withVim)(Machine.apply)`.
- **Discoverable**: Operations are introspectable (help display, AI tool descriptions).
- **Collaborative**: Serializable operations can be sent over the network (CRDT/OT).
- **Lazy-friendly**: Components render from state snapshots — content loads asynchronously. Loading is just an operation: `{ type: "load_children", nodeId, children }`.

## Current State Audit

Every interactive subsystem mapped to its current state management approach:

### km-tui (application)

| Domain | Files | Current Approach | Target |
|---|---|---|---|
| **Board navigation** | `board-reducer.ts`, `board-actions-nav.ts` | `applyBoard()` — **pure reducer + edit ops, shipped** (Phase 2a). `board-effect-runner.ts` centralizes effect interpretation | Full `Board.apply()` (Phase 2) |
| **UI / Dialogs** | `board-app-store.ts`, `ui-reducer.ts` | Imperative Zustand `setUI()` mutations | `Dialog.apply()` (Phase 2) |
| **Text editing** | `board-actions-edit.ts`, `useEditContext` | Ref-based, imperative | `PlainText.apply()` dispatch (Phase 1) |
| **Search** | `SearchDialog.tsx`, `Omnibox.tsx` | Imperative handlers, local state | `Search.apply()` (Phase 2) |
| **Selection** | `board-actions-selection.ts` | Implicit in board state | Part of `Board.apply()` (Phase 2) |
| **Undo** | `undo-stack.ts`, `undoable-repo.ts` | Imperative UndoStack + UndoableRepo (active system) | TEA undo middleware (Phase 2) |
| **Navigation history** | `board-app-store.ts` | Data-only back/forward stack | Part of `Board.apply()` (Phase 2) |
| **Command system** | `command-bridge.ts`, `board-app.ts` | Key → command → operation (already data-driven) | Unchanged (routes to TEA machines) |

### silvery (framework)

| Domain | Files | Current Approach | Target |
|---|---|---|---|
| **tea middleware** | `packages/create/src/tea/` | **Shipped**: `tea()` Zustand middleware, `collect()` test helper | Unchanged |
| **Focus** | `focus-manager.ts` | Tree-based, pure-ish (focusNext/Prev return new state) | Already TEA-compatible |
| **readline editing** | `readline-ops.ts`, `useReadline.ts` | `handleReadlineKey` — pure function, returns result | `PlainText.apply()` (Phase 1) |
| **TextArea** | `TextArea.tsx` | Stateful hooks + `handleReadlineKey` | Driven mode via `PlainText.apply()` (Phase 1) |
| **TextInput** | `TextInput.tsx`, `useReadline.ts` | `useReadline` hook | Driven mode via `PlainText.apply()` (Phase 1) |
| **VirtualList** | `VirtualList.tsx` | Internal scroll state, useInput | Could be TEA (low priority) |
| **Input layers** | `InputLayerContext.tsx` | LIFO stack, imperative | Unchanged (routing, not state) |

### Key observations

- **Board reducer is shipped**: `board-reducer.ts` contains `applyBoard(state, op)` — a pure function following the TEA shape covering navigation + edit operations. `board-effect-runner.ts` provides centralized effect interpretation via `runBoardEffects(ctx, result)`. ~15% of board-actions.ts handlers now route through the reducer.
- **Text editing has the most duplication**: readline-ops (silvery) and board-actions-edit (km-tui) both handle text operations. `PlainText.apply()` unifies them.
- **Command system is already correct**: It translates keys → semantic operations. It just needs to dispatch to TEA machines instead of imperative handlers.
- **silvery/tea middleware is shipped**: `@silvery/create` exports `tea()` and `collect()` for wiring TEA reducers into Zustand stores.

## The Architecture

### PlainText (character-level, Phase 1)

Pure readline-style editing. No framework dependency. The `PlainText` namespace is both a type and a set of pure functions:

```ts
// Silvery/core — zero dependencies

namespace PlainText {
  // The state machine — universal 2-param signature
  function apply(
    state: PlainTextState,
    op: PlainTextOp,
  ): [PlainTextState, PlainTextEffect[]]

  // Key → operation mapper (pure, separate concern)
  function opFromKey(input: string, key: Key): PlainTextOp | null

  // State constructor
  function create(value?: string): PlainTextState

  // Type guards
  function isPlainText(value: any): value is PlainTextState
}

type PlainTextOp =
  | { type: "insert_text"; text: string }
  | { type: "delete_backward" }
  | { type: "cursor_left" }
  | { type: "cursor_word_back" }
  | { type: "yank"; text: string }        // text resolved by command layer from kill ring
  | { type: "kill_to_end" }
  // ... ~16 total operations

interface PlainTextState {
  value: string
  cursor: number
  yankState: YankState | null
}

type PlainTextEffect =
  | { type: "kill_ring_push"; text: string }  // runtime updates global kill ring
  | { type: "none" }

// Future: extensible effect types for async operations
type TreeEffect =
  | PlainTextEffect
  | { type: "dispatch"; target?: string; op: TreeOp }
  | { type: "load"; nodeId: NodeId }                     // trigger async content load
  | { type: "persist"; ops: TreeOp[] }                    // flush to storage/CRDT
```

**Effect extensibility**: Effects are an open discriminated union. New effect types can be added without changing `.apply()` — only the effect handler registry needs updating. This keeps machines pure while supporting future needs (search indexing, AI completions, network sync). An unrecognized effect type is a no-op, not an error.

**Kill ring architecture**: The kill ring is a global resource managed at the app level (BoardState or a dedicated store). PlainText.apply never reads the kill ring — it only emits `kill_ring_push` effects when text is killed. For yank operations, the command layer resolves the kill ring content and produces `{ type: "yank", text: killRing[0] }` ops before they reach PlainText.apply. This keeps the universal `(state, op) → [state, effects]` signature with no exceptions.

**Consumers:**
- **React (standalone)**: `usePlainText()` wraps in useState + optional useInput
- **React (driven)**: `<TextInput state={s} onOp={dispatch} />`
- **TEA store**: Call `PlainText.apply()` directly in update function
- **Command system**: Dispatch `PlainTextOp` from keybinding resolution

### SlateJS (per-node body editing, Phase 3)

Each node's rich text body is edited by SlateJS — the mature React-based editor framework. SlateJS handles inline formatting (bold, italic), block structure (paragraphs, lists, code blocks), and selection within body content.

```ts
// km uses SlateJS directly for body editing
// On web: slate + slate-react (full DOM rendering)
// On terminal: slate headless + silvery rendering adapter

// SlateJS provides its own Editor/Transforms/Node singletons:
Transforms.insertText(editor, "hello")
Transforms.toggleMark(editor, "bold")
Transforms.splitNodes(editor, { at: point })
```

km doesn't build its own rich text engine. SlateJS is the engine. km provides:
- A **silvery rendering adapter** for terminal display (translates Slate's element/leaf tree to silvery components)
- **ID-based node addressing** at the Tree level (SlateJS uses paths internally within a body, which is fine — bodies are small, path instability doesn't matter within a single node)
- **Kill ring integration** via the same effect pattern as PlainText

### Tree (document tree, Phase 4)

The `Tree` manages the **full document tree** — the km node hierarchy (boards, columns, items, sub-items). It does NOT manage body content within individual nodes (that's SlateJS). Tree handles navigation, tree structure, lazy loading, and CRDT operations.

```ts
namespace Tree {
  // State transition (the core)
  function apply(tree: TreeState, op: TreeOp): [TreeState, TreeEffect[]]

  // Queries (pure, static — same surface as SlateJS)
  function nodes<T>(tree: TreeState, options?: QueryOptions<T>): Generator<NodeEntry<T>>
  function above<T>(tree: TreeState, options?: QueryOptions<T>): NodeEntry<T> | undefined
  function string(tree: TreeState, at: Location): string
  function marks(tree: TreeState): TreeMarks | null
  // ... same query surface as SlateJS
}
```

**Scope**: Tree operates on the document tree (thousands of nodes, lazy-loaded). It knows about node types (item, column, board, heading) but not about the rich text content within node bodies. When a user edits a node's body, Tree delegates to SlateJS. When a user moves/creates/deletes nodes, Tree handles it directly.

### App Machines (km-tui, Phase 2)

Each domain becomes a domain interface with `.apply()`:

```ts
namespace Board {
  function apply(state: BoardState, op: BoardOp): [BoardState, BoardEffect[]]
}

namespace Dialog {
  function apply(state: DialogState, op: DialogOp): [DialogState, DialogEffect[]]
}

namespace Search {
  function apply(state: SearchState, op: SearchOp): [SearchState, SearchEffect[]]
}
```

Machines communicate via effects:

```ts
// PlainText editing reaches start of block → dispatch to board
PlainText.apply(state, { type: "delete_backward" })
// → [state, [{ type: "dispatch", op: { type: "MERGE_WITH_PREVIOUS" } }]]

// Dialog confirm → dispatch to board
Dialog.apply(state, { type: "confirm", value: "New task" })
// → [state, [{ type: "dispatch", op: { type: "CREATE_NODE", title: "New task" } }]]
```

## SlateJS++ — The Design Foundation

> "Let's assume that we'll have a system that is basically SlateJS ++"

km's editing system mirrors SlateJS's API shape but improves on it: **IDs instead of paths**, **pure functions instead of mutation**, **composable layers instead of monolith**, **lazy content loading**, **triple selection model**. SlateJS knowledge should transfer directly. SlateJS itself serves as the body editor engine.

### Interface Singletons (Noun = Type + Namespace)

SlateJS's best pattern: each core concept is both a TypeScript **interface** and a **namespace of pure functions**. The noun is the type, the methods are transforms and queries on that type.

km adopts this pattern with ID-based addressing:

| SlateJS Singleton | km Equivalent | Adaptation |
|---|---|---|
| `Editor` | `Tree` | Pure: `Tree.apply(tree, op) → [TreeState, TreeEffect[]]` instead of `editor.apply(op)` |
| `Node` | `Node` | ID-based: `Node.parent(root, id)` instead of `Node.parent(root, path)` |
| `Element` | `Element` | Same — type guard + queries |
| `Text` | `PlainText` | Character-level `.apply()` for readline editing (Phase 1) |
| `Path` | `Path` | Retained for local tree navigation, but not for addressing |
| `Point` | `Point` | `{ nodeId, offset }` instead of `{ path, offset }` |
| `Range` | `Range` | `{ anchor: Point, focus: Point }` — same shape, ID-based Points |
| `TreeOp` | `TreeOp` | Same 8 types, `nodeId` replaces `path` |
| `Transforms` | `Transforms` | Same API, pure: `Transforms.insertText(tree, text) → [TreeState, TreeEffect[]]` |

### `.apply()` — The Universal Verb

Every machine uses `.apply()` as the single state transition entry point:

```ts
// SlateJS (mutable):
editor.apply(op)                                  // mutates editor in place

// km (pure, every layer):
PlainText.apply(state, op)  → [PlainTextState, Effect[]]   // character editing
Tree.apply(tree, op)        → [TreeState, Effect[]]         // document tree
Board.apply(state, op)      → [BoardState, Effect[]]        // app coordination
```

`.apply()` is always a pure function taking exactly two arguments and returning `[newState, effects]`. No exceptions. No extra parameters. Effects are data. The runtime applies them.

### ID-Based Addressing (the "++" in SlateJS++)

SlateJS addresses nodes by `Path` — an array of indices like `[0, 1, 2]`. Positional: insert a node before index 1 and all paths shift. This is SlateJS's biggest weakness for collaborative editing — Yjs and Automerge bolt on ID-based addressing from outside.

km builds IDs in from the start:

```ts
// SlateJS: positional (fragile under concurrent edits)
type Point = { path: number[]; offset: number }

// km: ID-based (CRDT-native, undo-stable)
type Point = { nodeId: NodeId; offset: number }
```

Benefits:
- **CRDT-native**: No path transforms needed for collaborative editing
- **Undo-stable**: IDs survive structural changes (reorder, indent, merge)
- **Debuggable**: IDs are meaningful across time (logs, replays, history)
- **Already in km**: Every node already has a stable ID in the storage layer

**Performance note**: `Node.parent(root, id)` is O(1) via parentId. `Node.next(root, id)` requires finding the node in the parent's child array — O(n) in siblings. For km's typical tree shapes (< 100 siblings), this is negligible. If needed, a sibling-index cache can provide O(1) next/prev.

### Tree Navigation with IDs

SlateJS's `Path.parent()`, `Path.next()`, etc. are elegant tree navigation helpers. km keeps the same convenience with ID-based lookups:

```ts
// SlateJS (positional):
Path.parent([0, 1, 2])     // → [0, 1]
Path.next([0, 1, 2])       // → [0, 1, 3]
Path.previous([0, 1, 2])   // → [0, 1, 1]
Path.ancestors([0, 1, 2])  // → [[0, 1], [0], []]

// km (ID-based):
Node.parent(root, id)      // → NodeEntry | undefined     (O(1) via parentId)
Node.next(root, id)        // → NodeEntry | undefined     (sibling after)
Node.previous(root, id)    // → NodeEntry | undefined     (sibling before)
Node.ancestors(root, id)   // → Generator<NodeEntry>      (walk up parentId chain)
Node.children(root, id)    // → Generator<NodeEntry>      (ordered children)
Node.descendants(root, id) // → Generator<NodeEntry>      (DFS)
Node.first(root, id)       // → NodeEntry                 (first child)
Node.last(root, id)        // → NodeEntry                 (last child)
Node.get(root, id)         // → Node                      (O(1) Map lookup)
```

`Node.parent(root, id)` is O(1) because every node stores `parentId`. Child ordering uses the existing children array. `Path` still exists for local tree math (e.g., computing relative positions) but is never used as an address.

### Tree — 9 Structural Types, ID-Based

The 9 structural operation types at the Tree level (Phase 4). These are distinct from PlainTextOps (Phase 1) — different abstraction levels, different scope.

```ts
// Text operations (pass through to SlateJS for body editing)
type InsertTextOp = { type: "insert_text"; nodeId: NodeId; offset: number; text: string }
type RemoveTextOp = { type: "remove_text"; nodeId: NodeId; offset: number; text: string }

// Node operations (tree structure)
type InsertNodeOp = { type: "insert_node"; parentId: NodeId; index: number; node: Node }
type RemoveNodeOp = { type: "remove_node"; nodeId: NodeId; node: Node }  // stores full node for undo
type SetNodeOp    = { type: "set_node"; nodeId: NodeId; properties: Partial<Node>; newProperties: Partial<Node> }
type SplitNodeOp  = { type: "split_node"; nodeId: NodeId; position: number; properties: Partial<Node> }
type MergeNodeOp  = { type: "merge_node"; nodeId: NodeId; position: number; properties: Partial<Node> }
type MoveNodeOp   = { type: "move_node"; nodeId: NodeId; newParentId: NodeId; newIndex: number }

// Selection operation
type SetSelectionOp = { type: "set_selection"; properties: Selection | null; newProperties: Selection | null }

type TreeOp = InsertTextOp | RemoveTextOp | InsertNodeOp | RemoveNodeOp |
                SetNodeOp | SplitNodeOp | MergeNodeOp | MoveNodeOp | SetSelectionOp
```

Every operation is **invertible** — carries enough data to compute its inverse without referencing external state (same as SlateJS). This is what makes undo/redo work without snapshots.

### Lazy Content Loading

Documents can load content lazily (e.g., expanding a tree node loads children from storage). The state machine handles this via operations — no special loading infrastructure needed:

```ts
// Node with unloaded children
interface Element {
  id: NodeId
  children: NodeId[] | "unloaded"   // sentinel value = not yet loaded
  childCount?: number                // known count even when unloaded
}

// Loading is just an operation
type LoadChildrenOp = { type: "load_children"; nodeId: NodeId; children: Node[] }

// Components render from state — unloaded children show a placeholder
function NodeView({ node }: { node: Element }) {
  if (node.children === "unloaded") return <Text dimColor>Loading...</Text>
  return <>{node.children.map(id => <NodeView key={id} node={Node.get(root, id)} />)}</>
}

// Navigation to an unloaded node triggers a load effect
Tree.apply(tree, { type: "expand_node", nodeId: id })
// → [tree, [{ type: "load_children", nodeId: id }]]
// Runtime handles the effect → fetches from storage → dispatches LoadChildrenOp
```

Benefits:
- **No loading state in the component** — components are pure renderers of state snapshots
- **Deterministic** — the state machine always knows what's loaded and what's not
- **Testable** — inject loaded/unloaded states directly in tests
- **Cancelable** — if user navigates away before load completes, the effect is simply dropped

**Undo filtering**: `load_children` is NOT a user edit — it reveals existing content. The `withHistory` plugin excludes it from the undo stack by checking `op.meta?.local`. Similarly, `load_children` ops are not broadcast in collaborative mode (each peer loads independently).

### Triple Selection Model (Text + Node + Gap)

km supports three first-class selection types, inspired by ProseMirror's selection hierarchy (`TextSelection`, `NodeSelection`, `GapCursor`):

```ts
// Every selection is one of these
type Selection =
  | TextSelection      // cursor/range within text content
  | NodeSelection      // one or more whole nodes selected
  | GapSelection       // cursor between blocks with no text focus

// Text selection: position(s) within text
interface TextSelection {
  type: "text"
  anchor: Point         // { nodeId, offset } — where selection started
  focus: Point          // { nodeId, offset } — where selection extends to
}

// Node selection: whole nodes (cards, columns, blocks)
interface NodeSelection {
  type: "node"
  nodeIds: NodeId[]     // one or more selected nodes (multi-select)
  anchor?: NodeId       // selection anchor for shift-extend
}

// Gap selection: cursor between blocks where no text exists
interface GapSelection {
  type: "gap"
  nodeId: NodeId        // the node adjacent to the gap
  position: "before" | "after"  // gap is before or after the referenced node
}
```

**How they interplay:**
- **Board mode** (navigating cards): `NodeSelection` — cursor highlights a card, shift+arrow extends to multi-select
- **Edit mode** (typing in a card): `TextSelection` — cursor is inside the text, shift+arrow selects text ranges
- **Gap mode** (between blocks): `GapSelection` — cursor sits between two block-level nodes where no text exists (e.g., between two collapsed sections, at the end of an empty column, between non-editable block types)
- **Transition**: Enter on node selection → text selection at start of that node's text. Escape from text selection → node selection of the containing node. Arrow into a non-editable gap → gap selection.

**Why GapSelection**: ProseMirror provides GapCursor via a plugin for positions where no block can receive text focus. In km, this arises when navigating between items that have no editable text at a given position — the cursor needs somewhere to "be" between blocks. Without GapSelection, the cursor jumps unpredictably over non-editable regions. It also enables inserting new nodes at specific positions by typing at a gap.

**Copy/cut behavior**:
- TextSelection → copies text content (plain/rich text)
- NodeSelection → copies whole nodes (structured data)
- GapSelection → no-op (nothing to copy)

```ts
// Selection operations
type SelectionOp =
  | { type: "set_selection"; selection: Selection | null }
  | { type: "select_node"; nodeId: NodeId; extend?: boolean }     // select (or extend to) a node
  | { type: "select_text"; anchor: Point; focus?: Point }          // text cursor or range
  | { type: "select_gap"; nodeId: NodeId; position: "before" | "after" }
  | { type: "extend_selection"; direction: "up" | "down" | "left" | "right" }
  | { type: "collapse_selection"; edge?: "anchor" | "focus" | "start" | "end" }

// Selection queries on Tree
Tree.selection(tree)                      // → Selection | null
Tree.isTextSelection(sel): sel is TextSelection
Tree.isNodeSelection(sel): sel is NodeSelection
Tree.isGapSelection(sel): sel is GapSelection
Tree.selectedNodes(tree)                  // → NodeId[]  (works for all types)
```

**Why not just SlateJS's Range?** Because:
1. SlateJS can't represent "column 2 is selected" — it has no concept of selecting a non-text node
2. Multi-node selection (shift+click multiple cards) has no SlateJS equivalent
3. Gap positions between non-editable blocks have no SlateJS representation

**Why not ProseMirror's exact model?** ProseMirror's `NodeSelection` selects exactly one node and requires DOM position mapping. km's `NodeSelection` supports multiple nodes (already needed for multi-select in board view) and is ID-based (no DOM dependency). km's `GapSelection` is simpler than ProseMirror's `GapCursor` (which uses resolved document positions).

### Pure Functions Instead of Mutation

```ts
// SlateJS: mutation-based plugins
const withHistory = (editor) => {
  const { apply } = editor
  editor.apply = (op) => { recordHistory(op); apply(op) }
  return editor
}

// km: composition-based plugins (pure, state type grows via intersection)
const withHistory = (inner) => (tree, op) => {
  const [next, effects] = inner(tree, op)
  return [{ ...next, history: recordHistory(op, tree.history) }, effects]
}

// Composition:
const apply = compose(withHistory, withVim, withCollaboration)(baseApply)
```

### Plugin State via Type Extension

Following SlateJS's pattern: plugins extend the **state type itself**, not a generic bag. Each plugin adds named fields; TypeScript intersection types track which plugins are active:

```ts
// SlateJS (mutable): plugins extend the Editor interface
interface HistoryEditor extends Editor {
  history: { undos: TreeOp[][]; redos: TreeOp[][] }
}
const withHistory = (editor: Editor): HistoryEditor => { ... }

// km (pure): plugins extend the state type via intersection
interface HistoryFields { history: { undos: TreeOp[][]; redos: TreeOp[][] } }

const withHistory: Plugin<TreeState, TreeState & HistoryFields, TreeOp> =
  (inner) => (tree, op) => {
    const [next, effects] = inner(tree, op)
    return [{ ...next, history: pushHistory(tree.history, op) }, effects]
  }

// Composition produces the full app state type:
const apply = compose(withHistory, withVim)(Tree.apply)
// Type: (state: TreeState & HistoryFields & VimFields, op: TreeOp)
//       → [TreeState & HistoryFields & VimFields, TreeEffect[]]
```

No generic `extensions` bag, no type casts. The app's state type is the **composition of its plugins** — exactly what SlateJS does, but pure.

**App = Core + Plugins**: Different apps compose different plugin sets. The state type reflects exactly what's available:

```ts
// km-tui: full app with history, vim, search
const kmApply = compose(withHistory, withVim, withSearch)(Tree.apply)
// State: TreeState & HistoryFields & VimFields & SearchFields

// A simpler app: just history
const simpleApply = compose(withHistory)(Tree.apply)
// State: TreeState & HistoryFields

// Tests: bare core, no plugins
Tree.apply(bareState, op)
// State: TreeState
```

This is the pure equivalent of SlateJS's `withHistory(withReact(createEditor()))` — but instead of monkey-patching a mutable object, each plugin contributes state fields and wraps the apply function. The compiler enforces that you can only access `state.history` if `withHistory` is in the composition chain.

> **Implementation status**: `withHistory` was removed (dead code — never wired into the live app). The active undo system is the imperative `UndoStack` + `UndoableRepo`. `Board.apply` with effect runner has landed (`board-reducer.ts`). `withVim` and `withCollaboration` are designed but not yet implemented. The plugin composition pattern is proven by `silvery/tea` (shipped Zustand middleware). See [phases.md](phases.md) for what has shipped and what is planned.

### Transforms (High-Level API)

Same as SlateJS but pure — each returns `[TreeState, TreeEffect[]]`:

```ts
// SlateJS (mutates):
Transforms.insertText(editor, "hello")           // void, mutates editor
Editor.insertText(editor, "hello")                // same via Editor interface

// km (pure):
Transforms.insertText(tree, "hello")              // → [TreeState, TreeEffect[]]
Transforms.splitNodes(tree, { at: point })        // → [TreeState, TreeEffect[]]
Transforms.wrapNodes(tree, element, { at })       // → [TreeState, TreeEffect[]]
Transforms.moveNodes(tree, { to: target })        // → [TreeState, TreeEffect[]]
```

### Tree Query Methods (Pure)

```ts
// Same as SlateJS — queries are already pure, just made static:
Tree.nodes(tree, { match: Element.isElement, mode: "lowest" })    // → Generator<NodeEntry>
Tree.above(tree, { match: (n) => n.type === "paragraph" })        // → NodeEntry | undefined
Tree.string(tree, { at: range })                                   // → string
Tree.isStart(tree, point, at)                                      // → boolean
Tree.marks(tree)                                                   // → TreeMarks | null
```

### Normalization (Fixpoint Loop)

Same pattern as SlateJS — run normalizers after each operation batch until no dirty nodes remain. Normalizers are **configuration**, not mutation:

```ts
// Normalization rules are passed as config, not assigned to a mutable property:
const tree = Tree.create({
  normalizers: [
    paragraphNormalizer,      // enforce paragraph rules
    listNormalizer,           // enforce list structure
    emptyNodeNormalizer,      // handle empty nodes
  ],
})

// Each normalizer is a pure function:
type Normalizer = (tree: TreeState, entry: NodeEntry) => TreeOp[] | null
// Returns ops to fix violations, or null if valid
```

### Transactions (Batched Operations)

Multiple operations that should be treated as a single atomic unit — normalized once, recorded as one undo step, broadcast as one CRDT change:

```ts
// Declarative batch — runs all ops, normalizes once at end:
Tree.batch(tree, [
  { type: "remove_node", nodeId: id1, node: removedNode },
  { type: "insert_node", parentId: id2, index: 0, node: newNode },
])
// → [TreeState, TreeEffect[]]  — one undo entry, one normalization pass

// For transforms that produce multiple ops:
Tree.batch(tree, [
  ...Transforms.unwrapNodes(tree, { at: path }),
  ...Transforms.wrapNodes(tree, { type: "quote", children: [] }, { at: path }),
])
```

Why `batch()` over a callback pattern (SlateJS's `withoutNormalizing`):
- **Serializable** — the operation list is data, can be sent over the network or logged
- **Composable** — batches can be nested or concatenated
- **CRDT-friendly** — maps directly to an Automerge `change()` call
- **No closure footguns** — no mutable `tree` reference inside a callback

### Two-Level Editing Architecture

km has two editing levels with clear scope boundaries:

```
┌─────────────────────────────────────────────┐
│  Tree.apply()  — document tree              │
│  Manages: nodes, tree structure, navigation │
│  Scope: entire km node hierarchy            │
│  Addressing: ID-based (CRDT-native)         │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  SlateJS  — per-node body editing   │    │
│  │  Manages: rich text, marks, blocks  │    │
│  │  Scope: single node's body content  │    │
│  │  Addressing: paths (fine for body)  │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  PlainText.apply()  — simple inputs         │
│  Manages: readline editing, cursor          │
│  Scope: search bars, dialog inputs, titles  │
│  Addressing: offset in string               │
└─────────────────────────────────────────────┘
```

- **Tree.apply()** handles tree operations: insert_node, remove_node, move_node, set_node, set_selection, load_children. Delegates body editing to SlateJS.
- **SlateJS** handles body content: paragraphs, inline formatting, lists, code blocks. On web: slate + slate-react. On terminal: slate headless + silvery rendering adapter. Path-based addressing within a body is fine — bodies are small and path instability doesn't matter at that scope.
- **PlainText.apply()** handles simple single-line inputs: search bars, dialog text fields, inline title editing. No rich text, no marks — just cursor + readline shortcuts.

SlateJS-compatibility means:
- Same operation names (`insert_text`, `split_node`, etc.)
- Same query patterns (`Tree.nodes()`, `Tree.above()`)
- SlateJS serves as the body editor engine on both web and terminal
- But the **document tree** (node navigation, lazy loading, CRDT) is always km's `Tree.apply()`

### CRDT-First Storage (Automerge)

The persistent layer uses **Automerge** (or Yjs) as the source of truth. `Tree.apply()` is a thin, typed veneer over CRDT document mutations — not a separate data model that syncs to storage.

**Document topology — two Automerge document types:**

```
┌─────────────────────────────────────────────┐
│  Hierarchy Doc (one per workspace)          │
│  Automerge Map of nodes + ordering          │
│  Tree.apply() translates Tree ops            │
│  → Automerge.change() calls                 │
├─────────────────────────────────────────────┤
│  Item Body Docs (one per item)              │
│  Automerge.Text for rich body content       │
│  SlateJS reads/writes via automerge-slate   │
│  or equivalent bridge                       │
└─────────────────────────────────────────────┘
```

**Why separate docs:**
- **Granular sync**: Load only the bodies the user is viewing — hierarchy is always loaded, bodies are lazy
- **Independent history**: Undo within a body doesn't undo tree structure changes
- **Conflict isolation**: Two users editing different items don't interfere
- **Memory**: Large workspaces with thousands of items don't load all body content

**How Tree.apply() maps to Automerge:**

```ts
// Tree.apply() becomes a typed API over Automerge.change():
function apply(tree: TreeState, op: TreeOp): [TreeState, TreeEffect[]] {
  // Each TreeOp maps to Automerge mutations:
  switch (op.type) {
    case "insert_node":
      // → doc.nodes[op.node.id] = op.node
      // → doc.children[op.parentId].insertAt(op.index, op.node.id)
    case "move_node":
      // → remove from old parent's children list
      // → insert into new parent's children list
    case "set_node":
      // → Object.assign(doc.nodes[op.nodeId], op.newProperties)
    // ... etc
  }
}
```

**What CRDT provides "for free":**
- **Collaboration** — Automerge sync protocol replaces `withCollaboration` plugin
- **Undo/redo** — Automerge change grouping + rollback replaces `withHistory` plugin (or the plugin becomes a thin wrapper over Automerge's undo)
- **Conflict resolution** — concurrent edits merge automatically (no OT transforms needed)
- **Offline-first** — changes accumulate locally, sync when connected
- **History** — full change history with timestamps and attribution

**What CRDT does NOT provide:**
- **Operation semantics** — Tree.apply() still defines what "indent a node" means (move to previous sibling's children)
- **Normalization** — tree invariants are still enforced by normalizers after each batch
- **Selection** — selection is local-only, not synced via CRDT
- **Effects** — side effects (load, persist, UI updates) are still managed by the effect system
- **Lazy loading** — which nodes are materialized is a per-client concern

**Undo grouping policy** (critical for UX): Character-level edits (typing text) should merge into a single undo step. Without grouping, every keystroke is a separate undo entry. Policy:
- Same operation type + same target node + within 500ms → merge into current group
- Different operation type or different node → start new group
- Explicit boundaries: Enter, Tab, paste, any structural op → always start new group
- This maps to Automerge's `change()` boundaries — each `change()` call is one undo step

**Impact on SlateJS integration (Phase 3):**
If body content lives in Automerge docs, SlateJS may serve as the **rendering and editing UI** while Automerge is the **data model**. Libraries like `slate-yjs` (for Yjs) or an Automerge equivalent bridge SlateJS's editor to CRDT documents. This means:
- SlateJS operations → Automerge text mutations (via bridge)
- Remote Automerge changes → SlateJS state updates (via bridge)
- No separate "Slate state vs km state" synchronization problem

## Components as Thin Views

TextInput/TextArea become rendering shells with two modes:

```tsx
// Standalone (manages own state + keys):
<TextInput value={v} onChange={setV} />

// Driven (parent owns state + operations):
<TextInput state={editState} onOp={dispatch} />
```

When `state` + `onOp` are provided, the component:
1. Skips internal state management (no key capture)
2. Renders from provided state (value, cursor, isActive)
3. Reports key events as operations via `onOp` (parent calls `PlainText.apply()`)

Both modes share the same rendering code. The only difference is who drives the state machine. Components are pure renderers of state snapshots — they work identically whether content was loaded synchronously or lazily.

## Phased Plan

> See [phases.md](phases.md) for the consolidated roadmap with current status and key files.

### Phase 1: PlainText (Silvery/core) — character-level TEA

Extract from `handleReadlineKey`. Pure domain interface, zero dependencies, no React.

```ts
PlainText.apply(state, op)       → [PlainTextState, PlainTextEffect[]]
PlainText.opFromKey(input, key)  → PlainTextOp | null
PlainText.create(value?)         → PlainTextState
```

- `usePlainText()` hook wraps in React state
- TextInput/TextArea gain driven mode (`state` + `onOp`)
- km-tui command system dispatches `PlainTextOp` via command bridge
- Kill ring managed via effects: `kill_ring_push` effect → app-level state; yank key → command layer resolves to `{ type: "yank", text }` before reaching PlainText.apply
- Establishes the `.apply()` pattern that all subsequent phases follow

### Phase 2: App machines (km-tui) — extract pure domain interfaces

Each domain becomes a namespace with `.apply()`:

- `Board.apply()` — cursor, navigation, fold/unfold, multi-select
- `Dialog.apply()` — open/close/confirm dialogs
- `Search.apply()` — query, results, selection

Replace Zustand's imperative `setUI()` with composed pure machines. Machines communicate via effects (`{ type: "dispatch", target: "board", op: ... }`).

### Phase 3: SlateJS integration — per-node body editing

Integrate SlateJS as the body editor for individual nodes:

- **Terminal adapter**: Translate SlateJS element/leaf tree to silvery components for rendering
- **Shared operations**: Same op names as km's Tree where applicable (`insert_text`, `split_node`)
- **Kill ring integration**: Same effect pattern as PlainText
- **Selection bridge**: When editing a body, the global selection is `TextSelection` with the body node's ID; SlateJS manages the internal cursor

```ts
// Body editing flow:
// 1. User presses Enter on a node → Board dispatches "enter edit mode"
// 2. SlateJS editor created/focused for that node's body
// 3. Keys route to SlateJS (via silvery adapter on terminal)
// 4. Escape → Board dispatches "exit edit mode" → NodeSelection
```

PlainText.apply() continues to serve simple inputs (search bars, dialogs). SlateJS handles rich body editing.

### Phase 4: Tree (km) — document tree model

Full document tree with undo, CRDT, plugins. See [Tree (document tree, Phase 4)](#tree-document-tree-phase-4) for the `Tree` namespace API and [Tree — 9 Structural Types](#tree--9-structural-types-id-based) for the operation types.

TreeState adds undo and flush tracking:

```ts
interface TreeState {
  nodes: Map<NodeId, DocNode>          // ID-addressed tree
  children: NodeId[]                   // root-level children (ordered)
  selection: Selection | null          // TextSelection | NodeSelection | GapSelection
  history: HistoryState                // undo/redo stack
  operations: TreeOp[]                // ops since last onChange flush
}
```

Additional km operations beyond the 9 SlateJS types:
- `indent`, `outdent` — change nesting level (sugar over `move_node`)
- `load_children` — lazy content materialization (**excluded from undo stack** — not a user edit)
- `undo`, `redo` — history navigation

Plugin composition: `compose(withHistory, withVim)(Tree.apply)` — collaboration is handled by the Automerge layer, not a plugin.

**Undo**: With CRDT-first storage, undo/redo delegates to Automerge's change history. The `withHistory` plugin becomes a thin wrapper that groups changes (see [undo grouping policy](#crdt-first-storage-automerge)) and calls Automerge's rollback. Background ops like `load_children` are tagged `{ meta: { local: true } }` and excluded from both the undo stack and CRDT broadcast.

### Phase progression

```
Phase 1 (planned)    PlainText.apply()      single plain text, cursor, readline
Phase 2 (started)    Board/Dialog/Search    app machines as pure domain interfaces
Phase 3 (planned)    SlateJS integration    per-node body editing (rich text)
Phase 4 (planned)    Tree.apply()           document tree, undo, CRDT
```

Each phase is independently useful. Phase 1 improves silvery components. Phase 2 improves km-tui testability. Phase 3 enables rich text editing. Phase 4 enables the full document model with collaboration. See [phases.md](phases.md) for detailed status.

## Reactivity Integration

### The Problem

TEA produces **one new state object per operation**. React performance requires **per-node granular subscriptions** — when the cursor moves, only 2 nodes should re-render (old and new), not 1000+.

### The Solution: Reactive\<T\> Signals

km uses `Reactive<T>` — a lightweight signal primitive (value holder + subscriber set, `Object.is` comparison) — for per-node reactive state. Each node has independent signals for fold, edit, multi-selection, and excluded sigils. Cursor position uses board-level signals.

The `ReactiveNodeStore` manages per-node signal lifecycle with delta-based sync methods:

```
┌──────────────────────────────────────────────────────┐
│  Zustand Store (board-app-store.ts)                  │
│  Board state: columns, cursor, foldDepths, etc.      │
└──────────────┬───────────────────────────────────────┘
               │ useEffect syncs on change
               ▼
┌──────────────────────────────────────────────────────┐
│  ReactiveNodeStore (reactive.ts)                     │
│  syncCursor(), syncFoldDepths(), syncMultiSelected() │
│  syncEdit() — delta-based, only update changed keys  │
└──────────────┬───────────────────────────────────────┘
               │ only changed signals notify
               ▼
┌──────────────────────────────────────────────────────┐
│  Per-Node Reactive<T> Signals                        │
│  cursorNodeId, foldOverride(id), edit(id), etc.      │
│  useReactive() hook → useSyncExternalStore           │
│  Only subscribed components re-render                │
└──────────────────────────────────────────────────────┘
```

**Performance**: O(affected) per operation. Cursor move touches 1 signal (~0.1ms). Fold toggle touches 1 signal. Sync methods compare previous vs current and skip unchanged nodes.

### What Was Replaced

| Before | After |
|---|---|
| Jotai atoms + atomFamily (9 atom families, 5 cursor globals) | `Reactive<T>` signals in `ReactiveNodeStore` |
| `node-atoms-hydrate.ts` — 5 manual sync functions (216 LOC) | `ReactiveNodeStore.hydrate()` + delta sync methods |
| `node-atoms.ts` — atom definitions (135 LOC) | Deleted — signals created on-demand via `getOrCreate()` |
| Jotai `useAtomValue()` in 10+ component files | `useReactive()` hook (thin wrapper around `useSyncExternalStore`) |
| Jotai + jotai-family npm dependencies | Zero external deps — `Reactive<T>` is 27 lines |

### Future: Operation-Targeted Updates

When TEA machines replace the Zustand store, the dispatch bridge will update signals directly from operation targets — no sync functions needed:

```ts
function dispatch(state: BoardState, op: BoardOp): BoardState {
  const [next, effects] = Board.apply(state, op)
  // Operation carries affected IDs → targeted signal.value = ...
  return next
}
```

### How Editors Solve This

| Editor | State Model | UI Update Strategy |
|---|---|---|
| **CodeMirror 6** | Immutable EditorState | Changeset diff — computes minimal DOM mutations, bypasses React entirely |
| **ProseMirror** | Transaction steps | Steps describe affected document range → targeted DOM reconciliation |
| **Lexical** | Immutable tree + React | Dirty node tracking — only re-renders nodes whose data changed |
| **Elm** | Single model + VDOM | `Html.lazy` memoizes subtrees; VDOM diff handles the rest |
| **km** | Zustand + Reactive\<T\> signals | Delta sync from store → per-node signals → React re-renders |

The common pattern: **the state transition function produces enough information to compute the minimal UI update**.

## Silvery/tea — Zustand Middleware

The TEA effects-as-data pattern now has a concrete runtime in silvery: a ~30-line Zustand `StateCreator` middleware exported from `@silvery/create`.

### Shape

```ts
import { tea, collect } from "@silvery/create"

const store = createStore(
  tea(initialState, reducer, { runners })
)
```

`tea(initialState, reducer, options?)` returns a Zustand `StateCreator`. The `reducer` is a domain interface `.apply()` — it receives `(state, op)` and returns either:

- **Level 3** (pure state): `state` — no effects, just a state transition.
- **Level 4** (state + effects): `[state, effects]` — the full TEA tuple.

Detection is automatic via `Array.isArray`: a reducer can return bare state for simple cases and upgrade to the tuple form per-case, within the same function. No mode flag, no wrapper type.

### Connection to km

km's domain interfaces produce the right shape. `applyNavigation(state, op)` (the board navigation reducer) already returns `{ state, effects }`. As more domains are extracted to `.apply()`, the `tea()` middleware wraps them so Zustand dispatches through them — the store gains a `dispatch(op)` method that calls `.apply()`, replaces state, and runs effects.

On the app side, `EventHandlerContext` now has a `dispatch` property. When the backing store uses `tea()`, command handlers call `ctx.dispatch(op)` instead of imperative `ctx.set()` mutations. This is the bridge between the command system (user intent) and the state machine (pure transitions).

### Testing

`collect()` normalizes a reducer result into a `[state, effects]` tuple regardless of whether the reducer returned bare state or the tuple form. Tests assert against pure data without touching Zustand:

```ts
const [state, effects] = collect(Board.apply(initialState, { type: "fold_node", nodeId }))
expect(state.folds.get(nodeId)).toBe(true)
expect(effects).toContainEqual({ type: "persist", nodeId })
```

Effect runners are injected via `options.runners`, making them swappable: production runners persist to SQLite and dispatch cross-machine effects; test runners collect effects into an array for assertion.

### Status

Shipped in silvery, export path `@silvery/create`. Next step: wire km's command system to dispatch Board and Dialog operations through a `tea()` store, replacing imperative `setUI()` calls in `board-app-store.ts`.

## See Also

- [phases.md](phases.md) — Phase roadmap with current status and key files
- [universal-editor.md](../future/universal-editor.md) — The full vision (PlainText/SlateJS/Tree)
- [architecture.md](../architecture.md) — Five-layer architecture
- [principles.md](../principles.md) — Composable domain objects

## References

Architecture comparisons and design influences:

- **CodeMirror 6** — Immutable EditorState + transactions, modular extension/facet system. Validates the pure-state approach. ([System Guide](https://codemirror.net/docs/guide/))
- **ProseMirror** — Invertible steps, plugin state, proven OT-based collaboration. Inspiration for transaction batching and the triple selection model. ([Guide](https://prosemirror.net/docs/guide/))
- **Lexical** — Facebook's React editor: immutable state via `editor.update()` closures, command-based plugin system. Shows React-native TEA is viable. ([Architecture comparison](https://jkrsp.com/blog/lexical-vs-slate-vs-prosemirror-architecture/))
- **SlateJS** — Noun-singleton API pattern (`Editor`, `Node`, `Transforms`), 9 operation types, `withX` plugins. Direct inspiration for km's API shape. Mutable core is the key difference. ([Docs](https://docs.slatejs.org/))
- **Zed** — Layered Buffer → MultiBuffer → DisplayMap architecture, CRDT-based text buffer. Shows that layered pure transforms scale to production editors. ([Architecture](https://deepwiki.com/zed-industries/zed/2-core-architecture))
- **Automerge** — CRDT library for conflict-free collaborative data. Planned as km's persistent layer for both tree hierarchy and item body content. ([Docs](https://automerge.org/docs/))
- **Elm Architecture** — The original `(msg, model) → (model, cmd)` pattern. Foundational influence on the `.apply()` signature and effect system.
