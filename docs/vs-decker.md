---
mentions:
  - km
---

# KM vs Decker Architecture Comparison

Reference implementation: ~/Code/DZ/decker/apps/webapp/packages/decker-boardliner/

## Overview

AspectKM TUIDecker WebappFrameworkSilvery (React TUI)React (Web)EditorCustom tree navigationSlate.js rich textSyncFile-based (@km/storage)Yjs CRDT (real-time collab)StateuseReducer × 2 (ui + board)Zustand storesCommands@km/commands + TUI handlersDirect Cmd functions

## 1. Board View System

KM TUI

```
Board (fullscreen)
├── TopBar (path breadcrumb)
├── Main Area (view mode switch)
│   ├── CardsView → Column → Card → TreeNode
│   ├── ListView
│   ├── ColumnsView
│   └── TabsView
├── DetailPane (optional 40% split)
├── Modals (ItemPicker, NewItemDialog, Help)
└── CommandBox (mode pill, status indicators)
```

Decker Webapp

```
Board (scrollable container)
├── Board (horizontal scroll)
│   └── Column (vertical scroll, draggable)
│       └── Card (draggable, editable)
│           └── Section (nested groupings)
```

Key Differences:

- KM: Multiple view modes (cards/list/columns/tabs), fixed layout, terminal constraints

- Decker: Single flexible board view, drag-and-drop, inline rich text editing

## 2. State Management

KM TUI - Two Reducers:

```typescript
// UI State (dialogs, view mode, selection)
const [ui, dispatch] = useReducer(uiReducer, initialUIState);

// Board State (navigation, cursor, nodes)
const [boardState, dispatchBoard] = useReducer(boardReducer, initialTreeState);

// Derived layout (no state, computed each render)
const columnsLayout = deriveColumnsLayout(boardState);
```

Decker - Zustand Stores:

```typescript
// Global app state (composed slices)
type AppState = ContentState & ConfigState & AuthState

// Board-local state
type BoardState = {
  items: Map<ItemElement, ItemState>  // per-item UI state
  editor?: Editor                      // Slate editor
  dispatch(op: ApplyOp): void
}
```

Key Differences:

- KM: Reducers with explicit action dispatch, state derivation pattern

- Decker: Zustand with slices, direct store mutations, editor owns document structure

## 3. Data Structures

KM - TNode (Tree Node):

```typescript
interface TNode {
  id: string;
  type: string;           // "h", "p", "code", "quote", etc.
  parent_id: string | null;
  children: TNode[];
  name: string;
  title: string;
  item?: ItemData;        // { list?, task?: { marker, status } }
  data: Record<string, unknown>;  // frontmatter
}
```

Decker - ItemElement (Slate Node):

```typescript
type ItemElement = {
  type: "item"
  id: string
  children: [ItemContentElement, ...ItemElement[]]  // content + subitems
}

type ItemContentElement = {
  type: "content"
  children: ParagraphElement[]  // rich text paragraphs
}
```

Key Differences:

- KM: Tree with explicit parent refs, type-rich (task/section/etc), frontmatter metadata

- Decker: Slate's normalized tree, content-first structure, rich text embedded

## 4. Command/Action System

KM - Three-Layer Command Processing:

```
Keyboard Input
  ↓
[Dialog active?] → handleKeyboardWrapper (TUI-specific)
  ↓ No
[TUI key?] → handleKeyboardWrapper (n/q/p/1-9/Enter)
  ↓ No
processKeyWithBoardState() → @km/commands
  ↓
Route by sub-union (8-line router):
  ├─ VerbOp → handleVerbAction()
  ├─ NavOp → handleNavAction()
  ├─ EditOp/TextOp/BoardOp/DialogOp/PaneOp/ViewOp → focused handlers
```

Decker - Direct Command Dispatch:

```typescript
// Hotkey binding
const NODE_SHORTCUTS: Cmd[] = [
  ["arrowup", goUp],
  ["arrowdown", goDown],
  ["tab", shiftIn],
  ...
]

// Command receives full context
type Cmd = (ctx: CmdContext) => void
type CmdContext = {
  ev: React.KeyboardEvent
  ed: TheEditor           // Slate editor
  editMode: "node" | "text"
  selectedIds: string[]
  items: NodeEntry[]
}
```

Key Differences:

- KM: Action objects dispatched to reducers, explicit action types, separated concerns

- Decker: Commands directly mutate Slate editor, dual-mode (node/text), simpler flow

## 5. Navigation Model

KM - Path-Based Cursor:

```typescript
type TPath = number[];  // [colIndex, cardIndex, subIndex...]

// Movement directions
type Direction =
  | "up" | "down" | "left" | "right"  // visual
  | "prev" | "next" | "in" | "out"    // structural
  | "first" | "last";                  // jumps
```

Decker - DOM-Aware Navigation:

```typescript
// Navigation uses visual layout calculation
function getInVisualDirection(
  items: NodeEntry[],
  fromPath: Path,
  dir: "up" | "down" | "left" | "right"
): Path | null {
  // Uses getBoundingClientRect() to find nearest item
  // in the requested visual direction
}
```

Key Differences:

- KM: Tree-structural navigation, path arrays, respects folding

- Decker: Visual-spatial navigation using DOM rects, layout-aware

## 6. Collaboration/Sync

KM - File-Based:

```
User edit → @km/storage.updateNode() → Write to .md file
File change → Watch → Rebuild state → Re-render
```

Decker - Yjs CRDT:

```typescript
// Real-time sync via WebSocket
const editor = withYjs(
  withCursors(
    withYHistory(createCoreEditor())
  ),
  yDoc.getText("content")
);

// Providers
WebsocketProvider  // Live remote sync
IndexeddbPersistence  // Local fallback
```

Key Differences:

- KM: Single-user, file as source of truth, bidirectional sync

- Decker: Multi-user, CRDT as source of truth, real-time collaboration

## 7. Patterns Worth Adopting

### 7.1 Dual Edit Modes

```typescript
editMode: "node" | "text"
// Node mode: selecting/moving items
// Text mode: Slate text editing
```

Decker's clean separation between structural editing and text editing.

### 7.2 Visual Navigation

```typescript
// Uses DOM getBoundingClientRect() for movement
const nearestInDirection = findNearestRect(fromRect, candidateRects, direction);
```

Movement follows visual layout, not just tree structure.

### 7.3 Plugin Composition

```typescript
createCoreEditor() =>
  withValidation(withReact(withCore(withStore(withOutline(base)))))
```

Clean separation of concerns via composable plugins.

### 7.4 Command Context Pattern

```typescript
type Cmd = (ctx: CmdContext, ...args) => void
// All commands receive full context, reducing prop drilling
```

### 7.5 ID Tracking Map

```typescript
ed.$(id)  // O(1) node lookup by ID
ed.$maybe(id)  // Optional variant
// Maintains Map<id, Node> for fast lookups
```

## 8. KM Strengths to Preserve

1. View Mode Flexibility: Cards/list/columns/tabs views vs Decker's single board view

1. Task-First Model: Rich task status/metadata vs Decker's generic items

1. File-Based Portability: Markdown files are human-editable; Yjs binary is not

1. Action Type System: 8 focused sub-unions (VerbOp, NavOp, EditOp...) with router dispatch

1. Layered Architecture: Clear storage→tree→board→UI layers vs Decker's tighter coupling

## 9. Opportunities for KM

See bead km-decker for implementation tracking.

### O1: Command Context Consolidation

Current KM builds context per-call in multiple places. Decker passes a single CmdContext to all commands.

Current KM:

```typescript
// keyboard-handler.ts builds KeyboardContext
// command-bridge.ts builds CommandContext
// Both reconstruct similar data
```

Proposed:

```typescript
interface TUIContext {
  boardState: TreeBoardState;
  ui: UIState;
  layout: ColumnsLayout;
  selectedNode: TNode | null;
  dispatch: Dispatch<UIAction>;
  dispatchBoard: Dispatch<BoardReducerOp>;
}
// Built once per input, passed to all handlers
```

### O2: ID Lookup Map

Add O(1) node lookup to @km/tree or @km/board.

Current: Tree traversal to find node by ID
Proposed: Maintain Map<string, TNode> alongside tree, update on mutations

### O3: Visual-Aware Navigation in Outline Mode

Current outline navigation is purely structural. Could use character-cell positions for smarter movement.

### O4: Plugin Composition for Keyboard Handlers

Current monolithic handlers could be split into composable plugins:

```typescript
const keyboardPipeline = compose(
  withDialogHandling,
  withOutlineModeHandling,
  withCommandSystem,
  withTUISpecificKeys
);
```

### O5: Explicit Node/Text Mode

Current "outline mode" is implicit. Could make it explicit like Decker's editMode.

## 10. Implementation Status

OpportunityStatusNotesO1: Command Context✅ DoneTUIContext in tui-context.ts, processKeyWithContext()O2: ID Lookup Map✅ DonenodeMap.ts in @km/board, available on TUIContext.nodeMapO3: Visual Navigation📋 BacklogP3 - current nav works, enhancementO4: Plugin Composition📋 BacklogP3 - refactoring, not urgentO5: Node/Text Mode📋 BacklogP3 - foundational for future inline editing

## 11. Architectural Critique

As a systems architect, here's my honest assessment of these opportunities:

### What Worked Well

O1 (Context Consolidation) and O2 (ID Lookup) were good adoptions:

- O1 eliminates redundant work on every keypress - measurable efficiency gain

- O2 provides O(1) lookups where O(n) traversals existed - algorithmic improvement

- Both are low-risk, incremental improvements that don't change external behavior

### What Should Be Deprioritized

O3 (Visual Navigation) sounds appealing but has hidden costs:

- Terminal cells aren't DOM rects - we'd need to track rendered positions manually

- Multi-line items make this complex (where does an item "end"?)

- Current structural navigation is predictable and learnable

- Verdict: Nice-to-have, but high complexity for marginal UX gain

O4 (Plugin Composition) is premature:

- Current handlers are ~300 lines each, not unmanageable

- Composition patterns add indirection and debugging complexity

- Only valuable if we need to swap handlers (we don't)

- Verdict: Refactor when pain is real, not preemptively

O5 (Explicit Node/Text Mode) depends on a feature we don't have:

- KM TUI doesn't have inline text editing (uses detail pane)

- Adding explicit mode without the feature adds complexity for no benefit

- Verdict: Implement alongside actual text editing feature, not before

### Patterns NOT to Adopt

Decker's Zustand-everywhere approach - KM's dual-reducer pattern is cleaner:

- Explicit action types make debugging easier

- Reducer composition is well-understood in React

- Zustand's direct mutation can lead to subtle bugs

Decker's tightly-coupled editor - KM's layered architecture is better:

- storage → tree → board → UI layers have clear contracts

- Decker's Slate integration makes testing harder

- KM can swap storage backends; Decker is locked to Yjs

DOM-rect navigation - terminal constraints differ:

- Web has precise sub-pixel positioning

- Terminal has fixed character cells

- Trying to emulate DOM behavior in a terminal is fighting the medium

### The Real Opportunity

The most valuable thing from Decker isn't any specific pattern—it's the rapid iteration cycle enabled by:

1. Hot module replacement in web dev

1. Visual feedback loop (see changes instantly)

1. Rich debugging tools (React DevTools, network tab)

KM TUI's biggest friction is the terminal development experience. Consider:

- Better snapshot testing for TUI output

- A web-based preview/debug mode

- Storybook-like component isolation for Ink components

These would provide more value than adopting Decker's patterns wholesale.

