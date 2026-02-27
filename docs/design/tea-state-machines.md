# TEA State Machines

> Every interactive subsystem is a pure state machine: `(action, state) → [state, effects]`.

**Bead:** km-all.tea-machines
**Status:** Design

## The Principle

Actions are data (serializable). Effects are data (serializable). State transitions are pure functions. The runtime applies effects. Machines compose via effects.

This holds at every scale:

```
character editing    textEditUpdate(action, state, killRing) → [state, effects]
rich text editing    textily.apply(op, state) → [state, effects]        (future)
document operations  docily.apply(op, state) → [state, effects]         (future)
app coordination     boardUpdate(action, state) → [state, effects]
                     dialogUpdate(action, state) → [state, effects]
                     searchUpdate(action, state) → [state, effects]
```

## Why This Shape

```ts
type Update<Action, State, Eff> = (action: Action, state: State) → [State, Eff[]]
```

- **Testable**: Call the function, assert the result. No mocks needed.
- **Replayable**: Serialize actions → time-travel debugging, undo/redo.
- **Portable**: Same machines work in terminal, browser, tests, AI automation.
- **Composable**: Plugins wrap update functions: `compose(withHistory, withVim)(update)`.
- **Discoverable**: Actions are introspectable (help display, AI tool descriptions).
- **Collaborative**: Serializable actions can be sent over the network (CRDT/OT).

## Current State Audit

Every interactive subsystem mapped to its current state management approach:

### km-tui (application)

| Domain | Files | Current Approach | Target |
|---|---|---|---|
| **Board navigation** | `board-actions.ts`, `useBoard.ts` | `dispatchBoard()` — already reducer-shaped | `boardUpdate` (Phase 2) |
| **UI / Dialogs** | `useBoard.ts` `setUI()` | Imperative Zustand mutations | `dialogUpdate` (Phase 2) |
| **Text editing** | `board-actions-edit.ts`, `useEditContext` | Ref-based, imperative | `textEditUpdate` dispatch (Phase 1) |
| **Search** | `SearchDialog.tsx`, `Omnibox.tsx` | Imperative handlers, local state | `searchUpdate` (Phase 2) |
| **Selection** | `board-actions.ts` | Implicit in board state | Part of `boardUpdate` (Phase 2) |
| **Undo** | `useBoard.ts` | Partial history stack | `withHistory` plugin (Phase 2) |
| **Navigation history** | `useBoard.ts` | Data-only back/forward stack | Part of `boardUpdate` (Phase 2) |
| **Command system** | `command-bridge.ts`, `keybindings.ts` | Key → command → action (already data-driven) | Unchanged (routes to TEA machines) |

### inkx (framework)

| Domain | Files | Current Approach | Target |
|---|---|---|---|
| **createStore** | `src/store/` | Already TEA: `(msg, model) → [Model, Effect[]]` | Unchanged |
| **Focus** | `focus-manager.ts` | Tree-based, pure-ish (focusNext/Prev return new state) | Already TEA-compatible |
| **readline editing** | `readline-ops.ts`, `useReadline.ts` | `handleReadlineKey` — pure function, returns result | `textEditUpdate` (Phase 1) |
| **TextArea** | `TextArea.tsx` | Stateful hooks + `handleReadlineKey` | Driven mode via `textEditUpdate` (Phase 1) |
| **TextInput** | `TextInput.tsx`, `useReadline.ts` | `useReadline` hook | Driven mode via `textEditUpdate` (Phase 1) |
| **VirtualList** | `VirtualList.tsx` | Internal scroll state, useInput | Could be TEA (low priority) |
| **Input layers** | `InputLayerContext.tsx` | LIFO stack, imperative | Unchanged (routing, not state) |

### Key observations

- **Board navigation is closest to TEA**: `dispatchBoard()` already takes action objects and returns state changes. Extracting the pure function is straightforward.
- **Text editing has the most duplication**: readline-ops (inkx) and board-actions-edit (km-tui) both handle text operations. `textEditUpdate` unifies them.
- **Command system is already correct**: It translates keys → semantic actions. It just needs to dispatch to TEA machines instead of imperative handlers.
- **createStore already works**: inkx's Layer 1.5 runtime is fully TEA. The app machines (Phase 2) can use it directly.

## The Stack

### Layer 0: textEditUpdate (character-level, inkx/core)

Pure readline-style editing. No framework dependency.

```ts
// inkx/core — zero dependencies

type TextEditAction =
  | { type: "insert"; text: string }
  | { type: "delete_backward" }
  | { type: "cursor_left" }
  | { type: "cursor_word_back" }
  | { type: "yank" }
  | { type: "kill_to_end" }
  // ... ~16 total actions

interface TextEditState {
  value: string
  cursor: number
  yankState: YankState | null
}

type TextEditEffect =
  | { type: "kill_ring_push"; text: string }
  | { type: "none" }

// THE core primitive — pure function
function textEditUpdate(
  action: TextEditAction,
  state: TextEditState,
  killRing: readonly string[],
): [TextEditState, TextEditEffect[]]

// Key → action mapper (also pure, separate concern)
function keyToTextEditAction(input: string, key: Key): TextEditAction | null
```

**Consumers:**
- **React (standalone)**: `useTextEdit()` wraps in useState + optional useInput
- **React (driven)**: `<TextInput state={s} onAction={dispatch} />`
- **TEA store**: Call directly in update function
- **Command system**: Dispatch TextEditAction from keybinding resolution

### Layer 1: textily (rich text, future)

Extends textEditUpdate with selection ranges, formatting, block boundaries. See [universal-editor.md](../future/universal-editor.md).

### Layer 2: docily (document, future)

Tree operations, command system, undo/CRDT. See [universal-editor.md](../future/universal-editor.md).

### Layer 3: App machines (km-tui)

Each domain becomes a pure update function:

```ts
// Board navigation
function boardUpdate(action: BoardAction, state: BoardState): [BoardState, BoardEffect[]]

// Dialogs
function dialogUpdate(action: DialogAction, state: DialogState): [DialogState, DialogEffect[]]

// Search
function searchUpdate(action: SearchAction, state: SearchState): [SearchState, SearchEffect[]]
```

Machines communicate via effects:

```ts
// Text editing reaches start of block → dispatch to board
textEditUpdate({ type: "delete_backward" }, state, killRing)
// → [state, [{ type: "dispatch", action: { type: "MERGE_WITH_PREVIOUS" } }]]

// Dialog confirm → dispatch to board
dialogUpdate({ type: "confirm", value: "New task" }, state)
// → [state, [{ type: "dispatch", action: { type: "CREATE_NODE", title: "New task" } }]]
```

## Comparison with SlateJS

SlateJS operates at **every level of text and document editing**, not just blocks:

- **Text**: `insert_text(path, offset, text)`, `remove_text` — character-level within text nodes
- **Positions**: `Point { path, offset }` — a cursor position in a text node. `Range { anchor, focus }` — a selection spanning text. `Path` — location in the document tree.
- **Nodes**: `insert_node`, `split_node`, `merge_node`, `move_node` — tree structure
- **Marks**: Properties on text nodes (bold, italic) — inline formatting
- **Selection**: `set_selection(range)` — the editor's current selection range

km's layered approach maps directly onto SlateJS's unified model:

| SlateJS | km layer | What it handles |
|---|---|---|
| Text operations (`insert_text`, `remove_text`) | **textEditUpdate** (Phase 1) | Character editing, cursor, kill ring |
| Points, Ranges, Marks, Selection | **textily** (Phase 3) | Selection ranges, formatting, marks |
| Node operations, Transforms, Editor | **docily** (Phase 4) | Tree ops, commands, undo/CRDT, plugins |
| `@slate-react` | React hooks + thin views | Rendering, input capture |

| Concept | SlateJS | km (current) | km (target) |
|---|---|---|---|
| **Operations** | `InsertTextOp`, `SplitNodeOp` (data) | Implicit (state mutation) | `TextEditAction`, `BoardAction` (data) |
| **Apply** | `editor.apply(op)` (state transition) | `dispatchBoard()` (partial) | `textEditUpdate()`, `boardUpdate()` (pure) |
| **Transforms** | `editor.insertText()` (high-level) | Command system (intent) | Same + pure transforms |
| **Plugins** | `withHistory(editor)` (middleware) | `compose(withFocusManagement)` (partial) | `compose(withHistory, withVim)` (full) |
| **Positions** | `Point { path, offset }`, `Range { anchor, focus }` | Single `cursor: number` | textily: `Selection { anchor, focus }` |
| **Marks** | `Text.marks` (bold, italic, etc.) | None (plain text) | textily: `Mark[]` on ranges |
| **Framework** | `@slate` (pure) + `@slate-react` (binding) | Mixed in inkx + km-tui | `inkx/core` (pure) + hooks (binding) |

Key difference: SlateJS combines all levels into one mutable `Editor` object. km separates them into **composable layers** — you can use textEditUpdate without textily, textily without docily. Each layer is a pure `(action, state) → [state, effects]` function.

SlateJS plugins **mutate** the editor object. TEA plugins **wrap** the update function:

```ts
// SlateJS: mutation-based plugins
const withHistory = (editor) => {
  const { apply } = editor
  editor.apply = (op) => { recordHistory(op); apply(op) }
  return editor
}

// TEA: composition-based plugins
const withHistory: Plugin<Model, Msg> = (inner) => (msg, model) => {
  const [next, effects] = inner(msg, model)
  return [{ ...next, history: recordHistory(msg, model.history) }, effects]
}
```

## Design Choices vs SlateJS

### SlateJS compatibility

textily and docily should be **SlateJS-compatible in API shape**: same operation names, similar transform signatures, familiar mental model. SlateJS knowledge should transfer directly. This means slate-react could potentially serve as a web rendering layer with an adapter.

But we depart where SlateJS made compromises:

### IDs instead of positions

SlateJS addresses nodes by `Path` — an array of indices like `[0, 1, 2]`. This is positional: insert a node before index 1 and all paths shift. This is SlateJS's biggest weakness for collaborative editing — Yjs and Automerge have to bolt on ID-based addressing from the outside.

km builds IDs in from the start:

```ts
// SlateJS: positional (fragile under concurrent edits)
Point = { path: [0, 1, 2], offset: 5 }

// km: ID-based (CRDT-native)
Point = { nodeId: "abc123", offset: 5 }
```

Benefits:
- **CRDT-native**: No path transforms needed for collaborative editing
- **Undo-stable**: IDs survive structural changes (reorder, indent, merge)
- **Debuggable**: IDs are meaningful across time (logs, replays, history)
- **Already in km**: Every node already has a stable ID in the storage layer

### Pure functions instead of mutation

SlateJS's `editor.apply(op)` mutates the editor object in place. TEA returns `[newState, effects]`. This makes every transition testable, replayable, and composable without mocks.

## Components as Thin Views

TextInput/TextArea become rendering shells with two modes:

```tsx
// Standalone (manages own state + keys):
<TextInput value={v} onChange={setV} />

// Driven (parent owns state + actions):
<TextInput state={editState} onAction={dispatch} />
```

When `state` + `onAction` are provided, the component:
1. Skips internal useTextEdit (no key capture)
2. Renders from provided state (value, cursor, isActive)
3. Reports key events as actions via onAction (parent decides routing)

Both modes share the same rendering code. The only difference is who drives the state machine.

## Phased Plan

### Phase 1: textEditUpdate (inkx/core) — character-level TEA

Extract from `handleReadlineKey`. Pure function, zero dependencies, no React.

```ts
textEditUpdate(action: TextEditAction, state: TextEditState, killRing) → [TextEditState, TextEditEffect[]]
keyToTextEditAction(input, key) → TextEditAction | null
```

- `useTextEdit()` hook wraps in React state
- TextInput/TextArea gain driven mode (`state` + `onAction`)
- km-tui command system dispatches `TextEditAction` via command bridge
- **Seed of textily** — same shape, minimal scope

### Phase 2: App machines (km-tui) — extract pure update functions

Each domain becomes `(action, state) → [state, effects]`:

- `boardUpdate` — cursor, navigation, fold/unfold, multi-select
- `dialogUpdate` — open/close/confirm dialogs
- `searchUpdate` — query, results, selection

Replace Zustand's imperative `setUI()` with composed pure machines. Machines communicate via effects (`{ type: "dispatch", target: "board", action: ... }`).

### Phase 3: textily (inkx/core) — rich text editing

SlateJS-compatible text model with ID-based addressing:

```ts
interface TextilyState {
  nodes: Map<NodeId, TextNode>        // ID-addressed text nodes
  selection: Selection | null          // { anchor: Point, focus: Point }
  marks: Mark[]                        // active formatting marks
}

type Point = { nodeId: NodeId; offset: number }
type Selection = { anchor: Point; focus: Point }

// Same TEA shape
textilyUpdate(op: TextilyOp, state: TextilyState) → [TextilyState, TextilyEffect[]]
```

Operations (SlateJS-compatible names):
- `insert_text`, `remove_text` — character ops within a text node
- `set_selection` — move/expand selection
- `add_mark`, `remove_mark` — inline formatting (bold, italic, etc.)
- `split_node`, `merge_node` — block boundary ops (split paragraph at cursor)

textEditUpdate actions map 1:1 to textily operations (textEditUpdate is textily for a single plain-text node with cursor-only selection).

### Phase 4: docily (km) — document model

Full document tree with commands, undo, CRDT, plugins:

```ts
interface DocilyState {
  nodes: Map<NodeId, DocNode>          // ID-addressed tree
  textily: Map<NodeId, TextilyState>   // rich text per node
  history: HistoryState                // undo/redo stack
  selection: DocSelection              // which node + text selection
}

// Same TEA shape
docilyUpdate(op: DocilyOp, state: DocilyState) → [DocilyState, DocilyEffect[]]
```

Operations:
- `insert_node`, `remove_node`, `move_node` — tree structure
- `indent`, `outdent` — change nesting level
- `set_node_type` — heading ↔ paragraph ↔ list item
- `undo`, `redo` — history navigation
- All textily operations pass through (editing text within a node)

Plugin composition: `compose(withHistory, withVim, withCollaboration)(docilyUpdate)`

### Phase progression

```
Phase 1 (now)     textEditUpdate    single plain text, cursor only
Phase 2 (next)    app machines      board/dialog/search as pure TEA
Phase 3 (future)  textily           selection ranges, marks, ID-based
Phase 4 (future)  docily            document tree, commands, undo/CRDT
```

Each phase is independently useful. Phase 1 improves inkx today. Phase 2 improves km-tui testability. Phase 3 enables rich text editing. Phase 4 enables the full universal editor vision.

## See Also

- [universal-editor.md](../future/universal-editor.md) — The full vision (docily/textily/runly)
- [focus-routing.md](../../vendor/beorn-inkx/docs/deep-dives/focus-routing.md) — Command-system input routing
- [architecture.md](../architecture.md) — Five-layer architecture
- [principles.md](../principles.md) — Composable domain objects
