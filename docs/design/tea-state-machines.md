# TEA State Machines

> Every interactive subsystem is a pure state machine: `(state, op) → [state, effects]`.

**Bead:** km-all.tea-machines
**Status:** Design

## The Principle

Operations are data (serializable). Effects are data (serializable). State transitions are pure functions. The runtime applies effects. Machines compose via effects.

This holds at every scale — each machine is a **noun-singleton** (type + namespace of pure functions, inspired by SlateJS's `Editor`, `Node`, `Path` pattern):

```
character editing    Text.apply(state, op, killRing) → [state, effects]
rich text editing    Text.apply(state, op) → [state, effects]           (Phase 3: + selection, marks)
document operations  Editor.apply(editor, op) → [editor, effects]       (Phase 4: tree, undo, CRDT)
app coordination     Board.apply(state, op) → [state, effects]
                     Dialog.apply(state, op) → [state, effects]
                     Search.apply(state, op) → [state, effects]
```

### Terminology

Consistent naming across all layers — no mixing of synonyms:

| Concept | Term | Not |
|---|---|---|
| Data passed to `.apply()` | **operation** (`op`) | ~~action~~, ~~message~~, ~~command~~ |
| Result side channel | **effect** | ~~side effect~~, ~~cmd~~ |
| Type + function namespace | **noun-singleton** | ~~module~~, ~~class~~ |
| State transition function | **`.apply()`** | ~~`.update()`~~, ~~`.reduce()`~~ |
| High-level compound operations | **transform** | ~~command~~ (reserved for user intent) |

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
- **Lazy-friendly**: Components render from state snapshots — content can load asynchronously without breaking the state machine. Loading states are just operations: `{ type: "children_loaded", nodeId, children }`.

## Current State Audit

Every interactive subsystem mapped to its current state management approach:

### km-tui (application)

| Domain | Files | Current Approach | Target |
|---|---|---|---|
| **Board navigation** | `board-actions.ts`, `useBoard.ts` | `dispatchBoard()` — already reducer-shaped | `Board.apply()` (Phase 2) |
| **UI / Dialogs** | `useBoard.ts` `setUI()` | Imperative Zustand mutations | `Dialog.apply()` (Phase 2) |
| **Text editing** | `board-actions-edit.ts`, `useEditContext` | Ref-based, imperative | `Text.apply()` dispatch (Phase 1) |
| **Search** | `SearchDialog.tsx`, `Omnibox.tsx` | Imperative handlers, local state | `Search.apply()` (Phase 2) |
| **Selection** | `board-actions.ts` | Implicit in board state | Part of `Board.apply()` (Phase 2) |
| **Undo** | `useBoard.ts` | Partial history stack | `withHistory` plugin (Phase 2) |
| **Navigation history** | `useBoard.ts` | Data-only back/forward stack | Part of `Board.apply()` (Phase 2) |
| **Command system** | `command-bridge.ts`, `keybindings.ts` | Key → command → operation (already data-driven) | Unchanged (routes to TEA machines) |

### inkx (framework)

| Domain | Files | Current Approach | Target |
|---|---|---|---|
| **createStore** | `src/store/` | Already TEA: `(msg, model) → [Model, Effect[]]` | Unchanged |
| **Focus** | `focus-manager.ts` | Tree-based, pure-ish (focusNext/Prev return new state) | Already TEA-compatible |
| **readline editing** | `readline-ops.ts`, `useReadline.ts` | `handleReadlineKey` — pure function, returns result | `Text.apply()` (Phase 1) |
| **TextArea** | `TextArea.tsx` | Stateful hooks + `handleReadlineKey` | Driven mode via `Text.apply()` (Phase 1) |
| **TextInput** | `TextInput.tsx`, `useReadline.ts` | `useReadline` hook | Driven mode via `Text.apply()` (Phase 1) |
| **VirtualList** | `VirtualList.tsx` | Internal scroll state, useInput | Could be TEA (low priority) |
| **Input layers** | `InputLayerContext.tsx` | LIFO stack, imperative | Unchanged (routing, not state) |

### Key observations

- **Board navigation is closest to TEA**: `dispatchBoard()` already takes operation objects and returns state changes. Extracting the pure function is straightforward.
- **Text editing has the most duplication**: readline-ops (inkx) and board-actions-edit (km-tui) both handle text operations. `Text.apply()` unifies them.
- **Command system is already correct**: It translates keys → semantic operations. It just needs to dispatch to TEA machines instead of imperative handlers.
- **createStore already works**: inkx's Layer 1.5 runtime is fully TEA. The app machines (Phase 2) can use it directly.

## The Stack

### Layer 0: Text (character-level, inkx/core)

Pure readline-style editing. No framework dependency. The `Text` namespace is both a type and a set of pure functions:

```ts
// inkx/core — zero dependencies

// Text as noun-singleton (type + namespace)
namespace Text {
  // The state machine
  function apply(
    state: TextState,
    op: TextOp,
    killRing: readonly string[],
  ): [TextState, TextEffect[]]

  // Key → operation mapper (pure, separate concern)
  function opFromKey(input: string, key: Key): TextOp | null

  // State constructor
  function create(value?: string): TextState

  // Type guards (SlateJS-compatible)
  function isText(value: any): value is TextState
}

type TextOp =
  | { type: "insert_text"; text: string }
  | { type: "delete_backward" }
  | { type: "cursor_left" }
  | { type: "cursor_word_back" }
  | { type: "yank" }
  | { type: "kill_to_end" }
  // ... ~16 total operations

interface TextState {
  value: string
  cursor: number
  yankState: YankState | null
}

type TextEffect =
  | { type: "kill_ring_push"; text: string }
  | { type: "none" }
```

**Consumers:**
- **React (standalone)**: `useText()` wraps in useState + optional useInput
- **React (driven)**: `<TextInput state={s} onOp={dispatch} />`
- **TEA store**: Call `Text.apply()` directly in update function
- **Command system**: Dispatch `TextOp` from keybinding resolution

### Layer 1: Text (rich text, Phase 3)

`Text.apply()` evolves to handle selection ranges, formatting, marks — the `Text` singleton grows across phases:

```ts
// Phase 3 additions to Text namespace:
namespace Text {
  function apply(state: TextState, op: TextOp): [TextState, TextEffect[]]
  function create(): TextState
  // New query methods:
  function string(state: TextState, at?: Range): string
  function marks(state: TextState): Mark[] | null
}
```

See [universal-editor.md](../future/universal-editor.md).

### Layer 2: Editor (document, Phase 4)

Full document tree with commands, undo, CRDT, plugins. The `Editor` singleton mirrors SlateJS:

```ts
namespace Editor {
  // State transition (the core)
  function apply(editor: EditorState, op: Operation): [EditorState, Effect[]]

  // Queries (same as SlateJS, but pure + ID-based)
  function nodes<T>(editor: EditorState, options?: QueryOptions<T>): Generator<NodeEntry<T>>
  function above<T>(editor: EditorState, options?: QueryOptions<T>): NodeEntry<T> | undefined
  function string(editor: EditorState, at: Location): string
  function marks(editor: EditorState): EditorMarks | null
  // ... same query surface as SlateJS
}
```

See [universal-editor.md](../future/universal-editor.md).

### Layer 3: App machines (km-tui)

Each domain becomes a noun-singleton with `.apply()`:

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
// Text editing reaches start of block → dispatch to board
Text.apply(state, { type: "delete_backward" }, killRing)
// → [state, [{ type: "dispatch", op: { type: "MERGE_WITH_PREVIOUS" } }]]

// Dialog confirm → dispatch to board
Dialog.apply(state, { type: "confirm", value: "New task" })
// → [state, [{ type: "dispatch", op: { type: "CREATE_NODE", title: "New task" } }]]
```

## SlateJS++ — The Design Foundation

> "Let's assume that we'll have a system that is basically SlateJS ++"

km's editing system mirrors SlateJS's API shape but improves on it: **IDs instead of paths**, **pure functions instead of mutation**, **composable layers instead of monolith**, **lazy content loading**. SlateJS knowledge should transfer directly. slate-react could serve as a web rendering layer via an adapter.

### Interface Singletons (Noun = Type + Namespace)

SlateJS's best pattern: each core concept is both a TypeScript **interface** and a **namespace of pure functions**. The noun is the type, the methods are transforms and queries on that type.

km adopts this pattern with ID-based addressing:

| SlateJS Singleton | km Equivalent | Adaptation |
|---|---|---|
| `Editor` | `Editor` | Pure: `Editor.apply(editor, op) → [Editor, Effect[]]` instead of `editor.apply(op)` |
| `Node` | `Node` | ID-based: `Node.parent(root, id)` instead of `Node.parent(root, path)` |
| `Element` | `Element` | Same — type guard + queries |
| `Text` | `Text` | Extended: character-level `.apply()` (Phase 1), then rich text (Phase 3) |
| `Path` | `Path` | Retained for local tree navigation, but not for addressing |
| `Point` | `Point` | `{ nodeId, offset }` instead of `{ path, offset }` |
| `Range` | `Range` | `{ anchor: Point, focus: Point }` — same shape, ID-based Points |
| `Operation` | `Operation` | Same 9 types, `nodeId` replaces `path` |
| `Transforms` | `Transforms` | Same API, pure: `Transforms.insertText(editor, text) → [Editor, Effect[]]` |

### `.apply()` — The Universal Verb

Every machine uses `.apply()` as the single state transition entry point:

```ts
// SlateJS (mutable):
editor.apply(op)                          // mutates editor in place

// km (pure, every layer):
Editor.apply(editor, op)    → [Editor, Effect[]]       // document
Text.apply(state, op)       → [TextState, Effect[]]     // text editing
Board.apply(state, op)      → [BoardState, Effect[]]    // app navigation
```

`.apply()` is always a pure function returning `[newState, effects]`. Effects are data. The runtime applies them.

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

### Operations — 9 Types, ID-Based

Same operation types as SlateJS, but with `nodeId` instead of `path`:

```ts
// Text operations
type InsertTextOp = { type: "insert_text"; nodeId: NodeId; offset: number; text: string }
type RemoveTextOp = { type: "remove_text"; nodeId: NodeId; offset: number; text: string }

// Node operations
type InsertNodeOp = { type: "insert_node"; parentId: NodeId; index: number; node: Node }
type RemoveNodeOp = { type: "remove_node"; nodeId: NodeId; node: Node }  // stores full node for undo
type SetNodeOp    = { type: "set_node"; nodeId: NodeId; properties: Partial<Node>; newProperties: Partial<Node> }
type SplitNodeOp  = { type: "split_node"; nodeId: NodeId; position: number; properties: Partial<Node> }
type MergeNodeOp  = { type: "merge_node"; nodeId: NodeId; position: number; properties: Partial<Node> }
type MoveNodeOp   = { type: "move_node"; nodeId: NodeId; newParentId: NodeId; newIndex: number }

// Selection operation
type SetSelectionOp = { type: "set_selection"; properties: Selection | null; newProperties: Selection | null }

type Operation = InsertTextOp | RemoveTextOp | InsertNodeOp | RemoveNodeOp |
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
Editor.apply(editor, { type: "expand_node", nodeId: id })
// → [editor, [{ type: "load_children", nodeId: id }]]
// Runtime handles the effect → fetches from storage → dispatches LoadChildrenOp
```

Benefits:
- **No loading state in the component** — components are pure renderers of state snapshots
- **Deterministic** — the state machine always knows what's loaded and what's not
- **Testable** — inject loaded/unloaded states directly in tests
- **Cancelable** — if user navigates away before load completes, the effect is simply dropped

### Dual Selection Model (Text + Node)

SlateJS only supports text selection (`Range { anchor: Point, focus: Point }` where Point = position in text). This is its biggest limitation for structured editors — you can't "select a card" or "select a column" in SlateJS's model without hacks.

ProseMirror solves this with a **Selection base class** and multiple subtypes (`TextSelection`, `NodeSelection`, `AllSelection`, `GapCursor`). km adopts a similar approach with two first-class selection types:

```ts
// Base selection — every selection is one of these
type Selection =
  | TextSelection    // cursor/range within text content
  | NodeSelection    // one or more whole nodes selected

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
```

**How they interplay:**
- **Board mode** (navigating cards): `NodeSelection` — cursor highlights a card, shift+arrow extends to multi-select
- **Edit mode** (typing in a card): `TextSelection` — cursor is inside the text, shift+arrow selects text ranges
- **Transition**: pressing Enter on a node selection → text selection at start of that node's text. Pressing Escape from text selection → node selection of the containing node.
- **Copy/cut**: Node selection copies whole nodes (as structured data). Text selection copies text content (as plain/rich text).

```ts
// Selection operations
type SelectionOp =
  | { type: "set_selection"; selection: Selection | null }
  | { type: "select_node"; nodeId: NodeId; extend?: boolean }     // select (or extend to) a node
  | { type: "select_text"; anchor: Point; focus?: Point }          // text cursor or range
  | { type: "extend_selection"; direction: "up" | "down" | "left" | "right" }
  | { type: "collapse_selection"; edge?: "anchor" | "focus" | "start" | "end" }

// Selection queries on Editor
Editor.selection(editor)                    // → Selection | null
Editor.isTextSelection(sel): sel is TextSelection
Editor.isNodeSelection(sel): sel is NodeSelection
Editor.selectedNodes(editor)               // → NodeId[]  (works for both types)
```

**Why not just use SlateJS's Range?** Because:
1. SlateJS can't represent "column 2 is selected" — it has no concept of selecting a non-text node
2. Multi-node selection (shift+click multiple cards) has no SlateJS equivalent
3. km already has this duality (board mode vs edit mode) — it just needs formalization

**Why not ProseMirror's exact model?** ProseMirror's `NodeSelection` selects exactly one node and requires DOM position mapping. km's `NodeSelection` supports multiple nodes (already needed for multi-select in board view) and is ID-based (no DOM dependency).

### Pure Functions Instead of Mutation

```ts
// SlateJS: mutation-based plugins
const withHistory = (editor) => {
  const { apply } = editor
  editor.apply = (op) => { recordHistory(op); apply(op) }
  return editor
}

// km: composition-based plugins (pure)
const withHistory: Plugin<Editor, Op> = (inner) => (editor, op) => {
  const [next, effects] = inner(editor, op)
  return [{ ...next, history: recordHistory(op, editor.history) }, effects]
}

// Composition:
const apply = compose(withHistory, withVim, withCollaboration)(baseApply)
```

### Transforms (High-Level API)

Same as SlateJS but pure — each returns `[Editor, Effect[]]`:

```ts
// SlateJS (mutates):
Transforms.insertText(editor, "hello")           // void, mutates editor
Editor.insertText(editor, "hello")                // same via Editor interface

// km (pure):
Transforms.insertText(editor, "hello")            // → [Editor, Effect[]]
Transforms.splitNodes(editor, { at: point })      // → [Editor, Effect[]]
Transforms.wrapNodes(editor, element, { at })     // → [Editor, Effect[]]
Transforms.moveNodes(editor, { to: target })      // → [Editor, Effect[]]
```

### Editor Query Methods (Pure)

```ts
// Same as SlateJS — queries are already pure, just made static:
Editor.nodes(editor, { match: Element.isElement, mode: "lowest" })  // → Generator<NodeEntry>
Editor.above(editor, { match: (n) => n.type === "paragraph" })      // → NodeEntry | undefined
Editor.string(editor, { at: range })                                 // → string
Editor.isStart(editor, point, at)                                    // → boolean
Editor.marks(editor)                                                 // → EditorMarks | null
```

### Normalization (Fixpoint Loop)

Same pattern as SlateJS — run normalizers after each operation batch until no dirty nodes remain:

```ts
// Override normalizeNode to enforce schema constraints
Editor.normalizeNode = (editor, [node, path]) => {
  if (Element.isElement(node) && node.type === "paragraph") {
    // Check one condition, fix it, return early
    // Normalization will re-run from dirty paths
  }
}

// Batch transforms without intermediate normalization:
Editor.withoutNormalizing(editor, () => {
  Transforms.unwrapNodes(editor, { at: path })
  Transforms.wrapNodes(editor, { type: "quote", children: [] }, { at: path })
})
```

### SlateJS as Pluggable Engine

The web rendering layer can literally use `slate` + `slate-react` via an adapter:

```ts
// Terminal: km's own pure Editor
const [editor, effects] = Editor.apply(editor, op)

// Web: delegate to SlateJS (which handles DOM ↔ model translation)
const slateAdapter = createSlateAdapter(slateEditor)
slateAdapter.apply(op)  // translates nodeId → path, calls slateEditor.apply()
```

This works because km's operations are a superset of SlateJS's — the only translation needed is `nodeId → path` (a Map lookup).

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
3. Reports key events as operations via `onOp` (parent calls `Text.apply()`)

Both modes share the same rendering code. The only difference is who drives the state machine. Components are pure renderers of state snapshots — they work identically whether content was loaded synchronously or lazily.

## Phased Plan

### Phase 1: Text (inkx/core) — character-level TEA

Extract from `handleReadlineKey`. Pure noun-singleton, zero dependencies, no React.

```ts
Text.apply(state, op, killRing) → [TextState, TextEffect[]]
Text.opFromKey(input, key)      → TextOp | null
Text.create(value?)             → TextState
```

- `useText()` hook wraps in React state
- TextInput/TextArea gain driven mode (`state` + `onOp`)
- km-tui command system dispatches `TextOp` via command bridge
- **Seed of Phase 3** — same shape, minimal scope

### Phase 2: App machines (km-tui) — extract pure noun-singletons

Each domain becomes a namespace with `.apply()`:

- `Board.apply()` — cursor, navigation, fold/unfold, multi-select
- `Dialog.apply()` — open/close/confirm dialogs
- `Search.apply()` — query, results, selection

Replace Zustand's imperative `setUI()` with composed pure machines. Machines communicate via effects (`{ type: "dispatch", target: "board", op: ... }`).

### Phase 3: Text (inkx/core) — rich text editing

`Text.apply()` grows to handle selection ranges, formatting, marks. SlateJS-compatible text model with ID-based addressing:

```ts
interface TextState {
  nodes: Map<NodeId, TextNode>        // ID-addressed text nodes
  selection: Selection | null          // { anchor: Point, focus: Point }
  marks: Mark[]                        // active formatting marks
}

type Point = { nodeId: NodeId; offset: number }
type Selection = { anchor: Point; focus: Point }

// Same noun-singleton, expanded operations
Text.apply(state, op) → [TextState, TextEffect[]]
```

Operations (SlateJS-compatible names):
- `insert_text`, `remove_text` — character ops within a text node
- `set_selection` — move/expand selection
- `add_mark`, `remove_mark` — inline formatting (bold, italic, etc.)
- `split_node`, `merge_node` — block boundary ops (split paragraph at cursor)

Phase 1 operations map 1:1 to Phase 3 operations (Phase 1 is Phase 3 for a single plain-text node with cursor-only selection).

### Phase 4: Editor (km) — document model

Full document tree with commands, undo, CRDT, plugins. The `Editor` singleton mirrors SlateJS:

```ts
interface EditorState {
  nodes: Map<NodeId, DocNode>          // ID-addressed tree
  children: NodeId[]                   // root-level children (ordered)
  selection: Selection | null          // which node + text selection
  marks: EditorMarks | null            // pending marks for next insert
  history: HistoryState                // undo/redo stack
  operations: Operation[]              // ops since last onChange flush
}

// Noun-singleton — mirrors SlateJS's Editor interface
Editor.apply(editor, op) → [EditorState, Effect[]]

// Queries (pure, static — same as SlateJS)
Editor.nodes(editor, { match, mode })  → Generator<NodeEntry>
Editor.above(editor, { match })        → NodeEntry | undefined
Editor.string(editor, at)              → string
Editor.marks(editor)                   → EditorMarks | null
Editor.isStart(editor, point, at)      → boolean
```

Operations — the 9 SlateJS types with `nodeId` instead of `path`:
- `insert_text`, `remove_text` — character ops (pass through to `Text.apply()`)
- `insert_node`, `remove_node`, `move_node` — tree structure
- `split_node`, `merge_node` — block boundary ops
- `set_node` — change node properties (type, marks, etc.)
- `set_selection` — update cursor/selection

Additional km operations:
- `indent`, `outdent` — change nesting level (sugar over `move_node`)
- `load_children` — lazy content materialization
- `undo`, `redo` — history navigation

Plugin composition: `compose(withHistory, withVim, withCollaboration)(Editor.apply)`

### Phase progression

```
Phase 1 (now)     Text.apply()       single plain text, cursor only
Phase 2 (next)    Board/Dialog/Search app machines as pure noun-singletons
Phase 3 (future)  Text.apply()       + selection ranges, marks, ID-based
Phase 4 (future)  Editor.apply()     document tree, commands, undo/CRDT
```

Each phase is independently useful. Phase 1 improves inkx today. Phase 2 improves km-tui testability. Phase 3 enables rich text editing. Phase 4 enables the full universal editor vision.

## See Also

- [universal-editor.md](../future/universal-editor.md) — The full vision (docily/textily/runly)
- [focus-routing.md](../../vendor/beorn-inkx/docs/deep-dives/focus-routing.md) — Command-system input routing
- [architecture.md](../architecture.md) — Five-layer architecture
- [principles.md](../principles.md) — Composable domain objects
