# TEA State Machines

> Every interactive subsystem is a pure state machine: `(state, op) → [state, effects]`.

**Bead:** km-all.tea-machines
**Status:** Design

## The Principle

Operations are data (serializable). Effects are data (serializable). State transitions are pure functions. The runtime applies effects. Machines compose via effects.

This holds at every scale — each machine is a **noun-singleton** (type + namespace of pure functions, inspired by SlateJS's `Editor`, `Node`, `Path` pattern):

```
character editing    PlainText.apply(state, op)    → [state, effects]
body editing         SlateJS (per-node body editor, Phase 3)
document tree        Editor.apply(editor, op)      → [editor, effects]       (Phase 4)
app coordination     Board.apply(state, op)        → [state, effects]
                     Dialog.apply(state, op)       → [state, effects]
                     Search.apply(state, op)       → [state, effects]
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
| Phase 1 character ops | **PlainTextOp** | ~16 high-level ops (cursor_left, yank, kill_to_end) |
| Phase 4 structural ops | **EditorOp** | 9 SlateJS-compatible tree ops (insert_node, split_node) |

**Note**: inkx's `createStore` predates this design and uses `(msg, model) → [Model, Effect[]]`. Conceptually `msg` = operation and `model` = state. We don't rename createStore — it's a general-purpose TEA container, not a noun-singleton.

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
| **Board navigation** | `board-actions.ts`, `useBoard.ts` | `dispatchBoard()` — already reducer-shaped | `Board.apply()` (Phase 2) |
| **UI / Dialogs** | `useBoard.ts` `setUI()` | Imperative Zustand mutations | `Dialog.apply()` (Phase 2) |
| **Text editing** | `board-actions-edit.ts`, `useEditContext` | Ref-based, imperative | `PlainText.apply()` dispatch (Phase 1) |
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
| **readline editing** | `readline-ops.ts`, `useReadline.ts` | `handleReadlineKey` — pure function, returns result | `PlainText.apply()` (Phase 1) |
| **TextArea** | `TextArea.tsx` | Stateful hooks + `handleReadlineKey` | Driven mode via `PlainText.apply()` (Phase 1) |
| **TextInput** | `TextInput.tsx`, `useReadline.ts` | `useReadline` hook | Driven mode via `PlainText.apply()` (Phase 1) |
| **VirtualList** | `VirtualList.tsx` | Internal scroll state, useInput | Could be TEA (low priority) |
| **Input layers** | `InputLayerContext.tsx` | LIFO stack, imperative | Unchanged (routing, not state) |

### Key observations

- **Board navigation is closest to TEA**: `dispatchBoard()` already takes operation objects and returns state changes. Extracting the pure function is straightforward.
- **Text editing has the most duplication**: readline-ops (inkx) and board-actions-edit (km-tui) both handle text operations. `PlainText.apply()` unifies them.
- **Command system is already correct**: It translates keys → semantic operations. It just needs to dispatch to TEA machines instead of imperative handlers.
- **createStore already works**: inkx's runtime is fully TEA. The app machines (Phase 2) can use it directly.

## The Architecture

### PlainText (character-level, Phase 1)

Pure readline-style editing. No framework dependency. The `PlainText` namespace is both a type and a set of pure functions:

```ts
// inkx/core — zero dependencies

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
```

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
// On terminal: slate headless + inkx rendering adapter

// SlateJS provides its own Editor/Transforms/Node singletons:
Transforms.insertText(editor, "hello")
Transforms.toggleMark(editor, "bold")
Transforms.splitNodes(editor, { at: point })
```

km doesn't build its own rich text engine. SlateJS is the engine. km provides:
- An **inkx rendering adapter** for terminal display (translates Slate's element/leaf tree to inkx components)
- **ID-based node addressing** at the Editor level (SlateJS uses paths internally within a body, which is fine — bodies are small, path instability doesn't matter within a single node)
- **Kill ring integration** via the same effect pattern as PlainText

### Editor (document tree, Phase 4)

The `Editor` manages the **full document tree** — the km node hierarchy (boards, columns, items, sub-items). It does NOT manage body content within individual nodes (that's SlateJS). Editor handles navigation, tree structure, lazy loading, and CRDT operations.

```ts
namespace Editor {
  // State transition (the core)
  function apply(editor: EditorState, op: EditorOp): [EditorState, EditorEffect[]]

  // Queries (pure, static — same surface as SlateJS)
  function nodes<T>(editor: EditorState, options?: QueryOptions<T>): Generator<NodeEntry<T>>
  function above<T>(editor: EditorState, options?: QueryOptions<T>): NodeEntry<T> | undefined
  function string(editor: EditorState, at: Location): string
  function marks(editor: EditorState): EditorMarks | null
  // ... same query surface as SlateJS
}
```

**Scope**: Editor operates on the document tree (thousands of nodes, lazy-loaded). It knows about node types (item, column, board, heading) but not about the rich text content within node bodies. When a user edits a node's body, Editor delegates to SlateJS. When a user moves/creates/deletes nodes, Editor handles it directly.

### App Machines (km-tui, Phase 2)

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
| `Editor` | `Editor` | Pure: `Editor.apply(editor, op) → [Editor, Effect[]]` instead of `editor.apply(op)` |
| `Node` | `Node` | ID-based: `Node.parent(root, id)` instead of `Node.parent(root, path)` |
| `Element` | `Element` | Same — type guard + queries |
| `Text` | `PlainText` | Character-level `.apply()` for readline editing (Phase 1) |
| `Path` | `Path` | Retained for local tree navigation, but not for addressing |
| `Point` | `Point` | `{ nodeId, offset }` instead of `{ path, offset }` |
| `Range` | `Range` | `{ anchor: Point, focus: Point }` — same shape, ID-based Points |
| `Operation` | `EditorOp` | Same 9 types, `nodeId` replaces `path` |
| `Transforms` | `Transforms` | Same API, pure: `Transforms.insertText(editor, text) → [Editor, Effect[]]` |

### `.apply()` — The Universal Verb

Every machine uses `.apply()` as the single state transition entry point:

```ts
// SlateJS (mutable):
editor.apply(op)                                  // mutates editor in place

// km (pure, every layer):
PlainText.apply(state, op)  → [PlainTextState, Effect[]]   // character editing
Editor.apply(editor, op)    → [EditorState, Effect[]]       // document tree
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

### EditorOps — 9 Structural Types, ID-Based

The 9 structural operation types at the Editor level (Phase 4). These are distinct from PlainTextOps (Phase 1) — different abstraction levels, different scope.

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

type EditorOp = InsertTextOp | RemoveTextOp | InsertNodeOp | RemoveNodeOp |
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

// Selection queries on Editor
Editor.selection(editor)                    // → Selection | null
Editor.isTextSelection(sel): sel is TextSelection
Editor.isNodeSelection(sel): sel is NodeSelection
Editor.isGapSelection(sel): sel is GapSelection
Editor.selectedNodes(editor)               // → NodeId[]  (works for all types)
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

Same pattern as SlateJS — run normalizers after each operation batch until no dirty nodes remain. Normalizers are **configuration**, not mutation:

```ts
// Normalization rules are passed as config, not assigned to a mutable property:
const editor = Editor.create({
  normalizers: [
    paragraphNormalizer,      // enforce paragraph rules
    listNormalizer,           // enforce list structure
    emptyNodeNormalizer,      // handle empty nodes
  ],
})

// Each normalizer is a pure function:
type Normalizer = (editor: EditorState, entry: NodeEntry) => EditorOp[] | null
// Returns ops to fix violations, or null if valid

// Batch transforms without intermediate normalization:
Editor.withoutNormalizing(editor, (editor) => {
  Transforms.unwrapNodes(editor, { at: path })
  Transforms.wrapNodes(editor, { type: "quote", children: [] }, { at: path })
})
```

### Two-Level Editing Architecture

km has two editing levels with clear scope boundaries:

```
┌─────────────────────────────────────────────┐
│  Editor.apply()  — document tree            │
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

- **Editor.apply()** handles tree operations: insert_node, remove_node, move_node, set_node, set_selection, load_children. Delegates body editing to SlateJS.
- **SlateJS** handles body content: paragraphs, inline formatting, lists, code blocks. On web: slate + slate-react. On terminal: slate headless + inkx rendering adapter. Path-based addressing within a body is fine — bodies are small and path instability doesn't matter at that scope.
- **PlainText.apply()** handles simple single-line inputs: search bars, dialog text fields, inline title editing. No rich text, no marks — just cursor + readline shortcuts.

SlateJS-compatibility means:
- Same operation names (`insert_text`, `split_node`, etc.)
- Same query patterns (`Editor.nodes()`, `Editor.above()`)
- SlateJS serves as the body editor engine on both web and terminal
- But the **document tree** (node navigation, lazy loading, CRDT) is always km's `Editor.apply()`

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

### Phase 1: PlainText (inkx/core) — character-level TEA

Extract from `handleReadlineKey`. Pure noun-singleton, zero dependencies, no React.

```ts
PlainText.apply(state, op)       → [PlainTextState, PlainTextEffect[]]
PlainText.opFromKey(input, key)  → PlainTextOp | null
PlainText.create(value?)         → PlainTextState
```

- `usePlainText()` hook wraps in React state
- TextInput/TextArea gain driven mode (`state` + `onOp`)
- km-tui command system dispatches `PlainTextOp` via command bridge
- Kill ring managed via effects: `kill_ring_push` effect → app-level state; yank key → command layer resolves to `{ type: "yank", text }` before reaching PlainText.apply
- **Seed of Phase 3** — same .apply() pattern, minimal scope

### Phase 2: App machines (km-tui) — extract pure noun-singletons

Each domain becomes a namespace with `.apply()`:

- `Board.apply()` — cursor, navigation, fold/unfold, multi-select
- `Dialog.apply()` — open/close/confirm dialogs
- `Search.apply()` — query, results, selection

Replace Zustand's imperative `setUI()` with composed pure machines. Machines communicate via effects (`{ type: "dispatch", target: "board", op: ... }`).

### Phase 3: SlateJS integration — per-node body editing

Integrate SlateJS as the body editor for individual nodes:

- **Terminal adapter**: Translate SlateJS element/leaf tree to inkx components for rendering
- **Shared operations**: Same op names as km's EditorOps where applicable (`insert_text`, `split_node`)
- **Kill ring integration**: Same effect pattern as PlainText
- **Selection bridge**: When editing a body, the global selection is `TextSelection` with the body node's ID; SlateJS manages the internal cursor

```ts
// Body editing flow:
// 1. User presses Enter on a node → Board dispatches "enter edit mode"
// 2. SlateJS editor created/focused for that node's body
// 3. Keys route to SlateJS (via inkx adapter on terminal)
// 4. Escape → Board dispatches "exit edit mode" → NodeSelection
```

PlainText.apply() continues to serve simple inputs (search bars, dialogs). SlateJS handles rich body editing.

### Phase 4: Editor (km) — document tree model

Full document tree with undo, CRDT, plugins. The `Editor` singleton manages the node hierarchy:

```ts
interface EditorState {
  nodes: Map<NodeId, DocNode>          // ID-addressed tree
  children: NodeId[]                   // root-level children (ordered)
  selection: Selection | null          // TextSelection | NodeSelection | GapSelection
  history: HistoryState                // undo/redo stack
  operations: EditorOp[]              // ops since last onChange flush
}

// Noun-singleton — mirrors SlateJS's Editor interface
Editor.apply(editor, op) → [EditorState, EditorEffect[]]

// Queries (pure, static — same as SlateJS)
Editor.nodes(editor, { match, mode })  → Generator<NodeEntry>
Editor.above(editor, { match })        → NodeEntry | undefined
Editor.string(editor, at)              → string
Editor.marks(editor)                   → EditorMarks | null
Editor.isStart(editor, point, at)      → boolean
```

EditorOps — the 9 SlateJS structural types with `nodeId` instead of `path`:
- `insert_text`, `remove_text` — character ops (pass through to SlateJS for body editing)
- `insert_node`, `remove_node`, `move_node` — tree structure
- `split_node`, `merge_node` — block boundary ops
- `set_node` — change node properties (type, marks, etc.)
- `set_selection` — update cursor/selection (any of the three types)

Additional km operations:
- `indent`, `outdent` — change nesting level (sugar over `move_node`)
- `load_children` — lazy content materialization (**excluded from undo stack** — not a user edit)
- `undo`, `redo` — history navigation

Plugin composition: `compose(withHistory, withVim, withCollaboration)(Editor.apply)`

**Undo filtering**: The `withHistory` plugin records only user-intent operations. Background ops like `load_children` are tagged `{ meta: { local: true } }` and excluded from the undo stack and CRDT broadcast.

### Phase progression

```
Phase 1 (now)     PlainText.apply()    single plain text, cursor, readline
Phase 2 (next)    Board/Dialog/Search  app machines as pure noun-singletons
Phase 3 (future)  SlateJS integration  per-node body editing (rich text)
Phase 4 (future)  Editor.apply()       document tree, undo, CRDT
```

Each phase is independently useful. Phase 1 improves inkx today. Phase 2 improves km-tui testability. Phase 3 enables rich text editing. Phase 4 enables the full document model with collaboration.

## See Also

- [universal-editor.md](../future/universal-editor.md) — The full vision (docily/textily/runly)
- [focus-routing.md](../../vendor/beorn-inkx/docs/deep-dives/focus-routing.md) — Command-system input routing
- [architecture.md](../architecture.md) — Five-layer architecture
- [principles.md](../principles.md) — Composable domain objects
