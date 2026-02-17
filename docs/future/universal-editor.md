# Universal Structured Document Editor - Spec

**Status:** Design
**Bead:** km-all.universal-editor
**Last Updated:** 2026-02-17

## Vision

A platform-agnostic structured document editor where the editing logic, document model, and command system are pure TypeScript with zero platform dependencies. Rendering, input, and text editing surfaces are swappable adapters. The same app runs in a terminal, a browser, or a native app — not by emulating one in another, but by sharing the core and swapping the platform layer.

km already has the seed: an id-based tree model, a command system decoupled from rendering, lazy-loadable SQLite storage, and multiple views (board, outline, list). The gap is that these layers aren't cleanly separated — editing is coupled to inkx (terminal), and the board logic is tangled with view code. This design untangles them.

### Why This Matters Beyond km

A clean platform-agnostic editor core could become a foundation that other tools build on. Think of how ProseMirror became the basis for Notion, Atlassian, and dozens of other editors — but ProseMirror is browser-only. A truly platform-agnostic equivalent doesn't exist yet. The W3C EditContext API is the attempt to decouple text editing from the browser DOM; we extend that idea to decouple the *entire* structured editing stack from any platform.

---

## Architecture: Five Layers

```
┌─────────────────────────────────────────────────────────────┐
│  5. View Layer            Board, Outline, List, Calendar    │
│     Same layout logic, platform-specific components         │
├─────────────────────────────────────────────────────────────┤
│  4. Document Editor       @km/editor (pure TypeScript)      │
│     Tree cursor, commands, selection, undo/redo, lazy load  │
│     ZERO platform dependencies — this is the shared core    │
├─────────────────────────────────────────────────────────────┤
│  3. Edit Context          Per-block text editing bridge      │
│     Swappable: TerminalEditContext / browser EditContext     │
│     / Slate+contentEditable fallback                        │
├─────────────────────────────────────────────────────────────┤
│  2. Rendering Adapter     How the document appears           │
│     Swappable: inkx (ANSI) / React DOM / native views       │
├─────────────────────────────────────────────────────────────┤
│  1. Input Adapter         How user intent arrives            │
│     Swappable: terminal stdin / browser events / native      │
└─────────────────────────────────────────────────────────────┘
```

### Platform Composition

| Layer | Terminal | Browser (modern) | Browser (legacy) | Native (future) |
|-------|----------|-------------------|-------------------|-----------------|
| **5. View** | inkx (Box, Text, VirtualList) | React DOM (div, span, virtual scroll) | React DOM | SwiftUI / Compose |
| **4. Editor** | `@km/editor` | `@km/editor` | `@km/editor` | `@km/editor` |
| **3. EditContext** | `TerminalEditContext` (ours) | Chrome native `EditContext` | Slate + `contentEditable` | Platform IME |
| **2. Renderer** | inkx → ANSI buffer → terminal | React DOM → browser DOM | React DOM | Platform views |
| **1. Input** | stdin raw mode / kitty protocol | `KeyboardEvent` + mouse + touch | `KeyboardEvent` | Platform events |

Layer 4 is **identical everywhere**. Layers 1-3 and 5 are platform adapters.

---

## Layer 1: Input Adapter

**Purpose**: Translate platform-specific input into universal events.

```typescript
// @km/editor — universal input event (platform-agnostic)
interface EditorInputEvent {
  key: string              // "j", "ArrowDown", "Enter", "Backspace"
  text?: string            // printable text (undefined for control keys)
  shift: boolean
  ctrl: boolean
  alt: boolean
  meta: boolean
  pointer?: { x: number; y: number; button: number; type: "down" | "up" | "move" }
}

interface InputAdapter {
  subscribe(handler: (event: EditorInputEvent) => boolean): Disposable
  capabilities: {
    mouse: boolean
    touch: boolean
    clipboard: boolean
    ime: boolean
    kittyProtocol: boolean
  }
}
```

**Swappability**: The command system already takes `(input: string, key: Key)`. The InputAdapter standardizes this so the same keybindings work on every platform. Platform-specific capabilities are feature-detected, not assumed.

### Terminal Input
- Raw stdin → ANSI sequence parser → `EditorInputEvent`
- Kitty keyboard protocol for disambiguated keys (Ctrl+i vs Tab)
- Mouse: SGR mouse reporting (clicks, scroll, drag)
- No IME composition (terminal emulator handles it)

### Browser Input
- `KeyboardEvent` → `EditorInputEvent` (almost 1:1 mapping)
- `PointerEvent` for mouse/touch (unified)
- `CompositionEvent` forwarded to EditContext
- Clipboard via `navigator.clipboard` API

---

## Layer 2: Rendering Adapter

**Purpose**: Map document structure to platform-specific visual elements.

NOT a virtual DOM or cross-platform UI framework. Each platform uses its native component system. The adapter is an **interface contract** that views program against:

```typescript
interface RenderingCapabilities {
  getContentRect(element: PlatformElement): Rect
  getScreenRect(element: PlatformElement): Rect
  onLayoutChange(element: PlatformElement, callback: (rect: Rect) => void): Disposable
  createVirtualList(props: VirtualListProps): PlatformElement
  measureText(text: string, style: TextStyle): { width: number; height: number }
  getWrapWidth(element: PlatformElement): number
  viewport: { width: number; height: number }
  colorDepth: number  // 1 (mono), 8 (256-color), 24 (true color), Infinity (web)
}
```

### Terminal Rendering (inkx)
- Components: `Box`, `Text`, `VirtualList`
- Layout: Flexx (zero-allocation flexbox)
- Output: ANSI escape sequences to terminal buffer
- Incremental updates: dirty flag system, diff & patch

### Browser Rendering (React DOM)
- Standard DOM elements with CSS flexbox/grid
- Browser layout engine
- DOM mutations
- Virtual scroll: intersection observer or custom

### Hybrid: Terminal-in-Browser
- xterm.js as rendering surface
- inkx renders to xterm.js buffer instead of stdout
- Zero changes to app code — just a different terminal backend

---

## Layer 3: Edit Context

**Purpose**: Bridge text editing between the document editor and the platform's text input system.

Implements the W3C EditContext API for terminals, uses it natively on Chrome, falls back to Slate+contentEditable elsewhere. **One interface, three implementations.**

### The EditContext Interface (W3C-aligned)

```typescript
interface EditContextLike extends EventTarget {
  // Text model
  readonly text: string
  readonly selectionStart: number
  readonly selectionEnd: number

  // App → platform
  updateText(rangeStart: number, rangeEnd: number, newText: string): void
  updateSelection(start: number, end?: number): void
  updateControlBounds(rect: Rect): void
  updateSelectionBounds(rect: Rect): void
  updateCharacterBounds(rangeStart: number, bounds: Rect[]): void
  readonly characterBoundsRangeStart: number

  // Platform → app (events)
  // "textupdate"              — text content changed
  // "selectionchange"         — selection changed
  // "characterboundsupdate"   — platform needs character positions
  // "textformatupdate"        — IME formatting request
  // "compositionstart/end"    — IME composition lifecycle
}
```

### 3a. TerminalEditContext (inkx — our implementation)

```typescript
class TerminalEditContext extends EventTarget implements EditContextLike {
  // Uses text-cursor.ts for cursor ↔ visual position math
  // wrapText() guarantees cursor positions match rendered line breaks

  // Terminal-specific extensions:
  readonly wrapWidth: number
  readonly stickyX: number | null
  moveCursor(direction: "up" | "down" | "left" | "right"): boolean
  atBoundary(direction: "up" | "down"): boolean
}

// Association with inkx DOM element
inkxElement.editContext = new TerminalEditContext({ text, selectionStart: 0, selectionEnd: 0 })
```

**Input flow**: Terminal keystroke → InputAdapter → if EditContext is active, route to it → EditContext fires `textupdate` → Document Editor handles it.

### 3b. Browser Native EditContext (Chrome/Edge 121+)

```typescript
// Direct browser API — no wrapper needed
const ctx = new EditContext({ text, selectionStart, selectionEnd })
canvasOrDiv.editContext = ctx
ctx.addEventListener("textupdate", (e) => {
  documentEditor.handleTextUpdate(e.updateRangeStart, e.updateRangeEnd, e.text)
})
```

### 3c. Slate + contentEditable Fallback (Firefox/Safari)

```typescript
class SlateEditContextAdapter extends EventTarget implements EditContextLike {
  private editor: BaseEditor
  private element: HTMLElement  // contentEditable div

  constructor(options: EditContextInit) {
    this.editor = createEditor()
    this.element = document.createElement("div")
    this.element.contentEditable = "true"
  }

  get text() { return Editor.string(this.editor, []) }
  get selectionStart() { return getCursorOffset(this.editor) }
  updateText(...) { /* Slate transforms + fire textupdate */ }
  updateSelection(...) { /* Slate selection */ }
}
```

### EditContext Factory

```typescript
function createEditContext(options: EditContextInit): EditContextLike {
  if (typeof window !== "undefined" && "EditContext" in window) {
    return new window.EditContext(options)           // Chrome/Edge native
  }
  if (typeof window !== "undefined") {
    return new SlateEditContextAdapter(options)      // Firefox/Safari fallback
  }
  return new TerminalEditContext(options)             // Terminal
}
```

---

## Layer 4: Document Editor (`@km/editor`)

**Purpose**: The platform-agnostic heart. Pure TypeScript, zero dependencies on DOM/terminal/native.

### The Board IS the Editor

A kanban board is a structured document. Columns are sections, cards are items. Navigation, editing, and structural manipulation are all operations on a tree. The "board" isn't a separate concept from the "editor" — it's a view of the editor.

`@km/editor` handles:
- **Tree operations**: move, indent, outdent, fold, delete, reparent
- **Text editing**: delegates to EditContext per block
- **Cursor navigation**: tree-aware, cross-block, cross-node
- **Selection**: single node, multi-node, range
- **Undo/redo**: spans both text and structural operations
- **Lazy loading**: only fetches what's visible + buffer

### 4a. Document Model — ID-Based, Lazy-Loaded, Dual Paths

```typescript
interface DocNode {
  id: string
  parentId: string | null
  parentIdx: number              // sort order
  name?: string                  // human-readable slug (for file paths)
  type: NodeType                 // oi, li, h, p, code, quote, hr, etc.
  content: string                // text content (may include inline markdown)
  data?: Record<string, unknown> // extensible metadata (dates, tags, status)
}

// PATH DUALITY: Nodes are addressable by both id and name:
//   - ID path:   "abc123"          → stable, CRDT-safe, used by editor internals
//   - Name path: "projects/km/tui" → human-readable, used by filesystem, URLs, CLI
// The DocumentStore resolves both. ID paths never change (insert-safe).
// Name paths may change on rename but are human-friendly for display/linking.

interface DocumentStore {
  // Queries (lazy — only fetch what's needed)
  getNode(id: string): DocNode | null
  getChildren(parentId: string | null): DocNode[]
  getChildCount(parentId: string | null): number
  getAncestors(id: string): DocNode[]
  search(query: string): DocNode[]

  // Mutations (atomic, undoable)
  updateNode(id: string, changes: Partial<DocNode>): void
  insertNode(parentId: string | null, node: DocNode, atIndex: number): void
  moveNode(id: string, toParentId: string, toIndex: number): void
  deleteNode(id: string): void

  // Subscription (for reactive rendering)
  subscribe(listener: () => void): Disposable
  getVersion(): number
}
```

**Platform storage implementations:**

| Platform | Implementation | Backing store |
|----------|---------------|---------------|
| Terminal | Adapter over `Repo` (existing) | SQLite + markdown files |
| Browser | IndexedDB wrapper | IndexedDB / OPFS |
| Native | Platform wrapper | CloudKit / Room / Core Data |
| Collaborative | CRDT adapter | Automerge / Yjs |

### 4b. Cursor & Selection

```typescript
interface DocCursor {
  nodeId: string         // which tree node
  blockIndex: number     // 0=title, 1+=body blocks
  offset: number         // character offset within block text
}

interface DocSelection {
  anchor: DocCursor
  focus: DocCursor
  mode: "text" | "node" | "block"
  selectedNodeIds: Set<string>
}
```

**ID-based paths**: Slate uses `[0, 2, 1]` (fragile — changes on insert). We use `nodeId` (stable). This makes collaboration trivial — remote operations don't invalidate local cursors.

### 4c. Undo/Redo — Operations All The Way Down

**No snapshots.** The document model can represent an entire drive — millions of nodes, gigabytes of content. Snapshots don't scale. Instead: **operations at every level**, designed for CRDT compatibility from day one.

**Design principle**: Every mutation produces an invertible operation. Undo = apply the inverse. This works at any scale because operations are proportional to the *change*, not the *document size*.

**Single operation log, two granularities:**

```typescript
type DocOperation =
  // Text operations (within a single node's content)
  | { type: "text.insert"; nodeId: string; offset: number; text: string }
  | { type: "text.delete"; nodeId: string; offset: number; text: string }
  | { type: "text.replace"; nodeId: string; offset: number; deleteCount: number; oldText: string; newText: string }
  // Structural operations (tree shape)
  | { type: "node.insert"; node: DocNode; parentId: string; atIndex: number }
  | { type: "node.delete"; node: DocNode; parentId: string; atIndex: number }
  | { type: "node.move"; id: string; from: { parentId: string; idx: number }; to: { parentId: string; idx: number } }
  | { type: "node.update"; id: string; field: string; before: unknown; after: unknown }
  // Selection operations (cursor state — not persisted, but part of undo)
  | { type: "select"; before: DocCursor; after: DocCursor }

function invertOp(op: DocOperation): DocOperation  // text.insert ↔ text.delete, etc.

interface UndoManager {
  record(op: DocOperation | DocOperation[]): void
  undo(): boolean
  redo(): boolean
  batch(fn: () => void): void     // group operations
  merge(op: DocOperation): boolean // merge consecutive typing into one undo step
}
```

**Undo grouping**: Consecutive `text.insert` operations merge into a single undo step (time-based: >500ms gap or non-text command breaks the group). Structural operations are always separate undo steps. `batch()` groups multiple operations.

**EditContext integration**: When typing in a block, each keystroke produces a `text.insert` or `text.delete` operation that goes directly into the undo manager. No separate "text-level undo" — all one log.

**CRDT readiness**: These operations map naturally to CRDT operations:
- `text.insert/delete` → Yjs Y.Text or Automerge.Text operations
- `node.insert/delete/move` → tree CRDT operations (Automerge nested maps)
- `node.update` → field-level CRDT merge
- The operation log IS the CRDT changelog — no translation layer needed

**Scale**: For a drive with 1M nodes, undo only stores the operations performed this session. Old operations can be compacted/pruned — the document store is the source of truth.

### 4d. Cross-Block & Cross-Node Navigation

```typescript
class DocumentEditor {
  cursor: DocCursor
  selection: DocSelection
  store: DocumentStore
  private activeEditContext: EditContextLike | null

  // Cursor movement
  moveUp(): void {
    if (this.activeEditContext?.atBoundary?.("up") !== false) {
      this.activeEditContext?.save()
      this.moveToPreviousBlock()
    }
  }
  moveDown(): void { /* symmetric */ }
  moveLeft(): void { /* within text, or to previous block at offset 0 */ }
  moveRight(): void { /* within text, or to next block at end */ }

  // Structural operations
  indent(nodeIds: string[]): void
  outdent(nodeIds: string[]): void
  moveNodes(nodeIds: string[], direction: "up" | "down"): void
  deleteNodes(nodeIds: string[]): void
  duplicateNodes(nodeIds: string[]): void
  foldNode(nodeId: string): void
  unfoldNode(nodeId: string): void

  // Text block operations (delegate to EditContext)
  enterEditMode(nodeId: string, blockIndex: number, cursorPos: "start" | "end"): void
  exitEditMode(): void
  splitBlock(atOffset: number): void
  mergeBlock(direction: "backward"): void
}
```

---

## Layer 5: View Layer

**Purpose**: Platform-specific visual representation. Thin — reads editor state, renders, dispatches commands.

| View | What it shows | How it maps to the document tree |
|------|--------------|----------------------------------|
| **Board** | Kanban columns + cards | L1 children = columns, L2 children = cards |
| **Outline** | Indented tree | Direct tree rendering with depth |
| **List** | Flat list + detail pane | Filtered/sorted flat view of subtree |
| **Calendar** | Time-based layout | Nodes with date fields |
| **Table** | Spreadsheet grid | Nodes as rows, metadata fields as columns |

**Views share the same DocumentEditor instance.** Switching views changes rendering, not state. Cursor, selection, and undo history persist across view switches.

### Column Derivation (Board View)

Currently in `use-columns.ts`, eagerly loading all children. Future: lazy derivation:

```typescript
function deriveColumns(editor: DocumentEditor, viewport: Rect): ColumnLayout {
  const rootChildren = editor.store.getChildren(editor.rootId)
  const { body, items: columnNodes } = extractBody(rootChildren)
  return columnNodes.map(colNode => ({
    node: colNode,
    cards: editor.getVisibleChildren(colNode.id, viewport),
    totalCardCount: editor.store.getChildCount(colNode.id),
  }))
}
```

---

## Package Boundaries: Reusable vs km-Specific

Three distinct editor levels, each a `vendor/beorn-*` package. km-specific code stays in `apps/km-tui` and `packages/km-*`.

```
vendor/beorn-inkx           ← exists: rendering, layout, components
vendor/beorn-editx          ← NEW: text editing (EditContext + text-cursor)
vendor/beorn-docx           ← NEW: structured document editor (tree + ops + undo)
apps/km-tui                 ← km-specific: board view, km node types, km commands
packages/km-storage         ← exists: SQLite + markdown DocumentStore adapter
```

### Level 1: `beorn-editx` — Single-Block Text Editor (reusable)

**What**: EditContext implementation + text cursor math + text operations. A single block of editable text with cursor, selection, wrap-aware navigation, IME support.

**Who uses it**: Anyone building text inputs in inkx or browser. Like a better `<textarea>` that works in terminals.

```typescript
import { TerminalEditContext } from "beorn-editx"
import { createEditContext } from "beorn-editx"
import { cursorToRowCol, cursorMoveUp } from "beorn-editx"
import { useEditContext } from "beorn-editx/react"
import type { TextOp } from "beorn-editx"
```

**Boundary**: Knows about text, cursor, selection, visual lines. Does NOT know about documents, trees, nodes, or navigation between blocks.

### Level 2: `beorn-docx` — Structured Document Editor (reusable)

**What**: Tree of typed nodes with operations, undo/redo, cross-block navigation, selection, lazy loading. Pure TypeScript, zero platform deps. The "ProseMirror for any platform."

**Who uses it**: Anyone building structured editors — outliners, wikis, notebooks, kanban boards.

```typescript
import { DocumentEditor, DocumentStore, UndoManager } from "beorn-docx"
import type { DocNode, DocCursor, DocSelection, DocOperation } from "beorn-docx"

const editor = new DocumentEditor(store)
editor.moveDown()
editor.indent(["node-123"])
editor.undo()

editor.registerNodeType("heading", { ... })
editor.registerNodeType("list-item", { ... })
```

**Boundary**: Knows about nodes, tree structure, operations, cursors, selection, undo. Does NOT know about boards, columns, kanban semantics, or rendering.

### Level 3: `km-*` — km-Specific (not reusable)

Board/outline/list views, km node types (oi, li, h, p, code, etc.), km keybindings, km-specific commands, km storage adapter, km markdown sync.

```typescript
import { DocumentEditor } from "beorn-docx"
import { TerminalEditContext } from "beorn-editx"

editor.registerNodeType("oi", { isContainer: true, defaultChildType: "li" })
editor.registerNodeType("li", { isContainer: true })

function BoardView({ editor }) {
  const columns = deriveColumns(editor)
  return <Board columns={columns} editor={editor} />
}
```

**The rule**: If another app could use it, it goes in `vendor/beorn-*`. If it's km-specific, it stays in `km-*`.

### Dependency Graph

```
km-tui → beorn-docx → beorn-editx → beorn-inkx
                    ↘ (pure TS, no inkx dep for browser use)
                     ↘ beorn-editx (text ops only, platform-agnostic)

km-storage → beorn-docx (implements DocumentStore)
km-web (future) → beorn-docx → beorn-editx (browser EditContext)
```

`beorn-docx` depends on `beorn-editx` for text operations but NOT on `beorn-inkx`. The inkx dependency is only in `beorn-editx`'s terminal implementation (TerminalEditContext), behind a factory.

---

## Prior Art & Differentiation

| System | Model | Platform | EditContext | Lazy loading | CRDT-native |
|--------|-------|----------|------------|--------------|-------------|
| **ProseMirror** | Schema-based, children[] | Browser only | No (contentEditable) | No | Via Yjs plugin |
| **Slate.js** | Children[], index paths | Browser only | No (contentEditable) | No | Via Yjs plugin |
| **Lexical** | Children[], keys | Browser only | No (contentEditable) | No | Partial |
| **CodeMirror** | Line-based | Browser only | Experimental | No | Via Yjs plugin |
| **Notion** | ID-based blocks | Browser only (Electron) | No | Yes (API-loaded) | Custom OT |
| **Obsidian** | File-based | Browser (Electron) | No | Partial | No |
| **Automerge** | CRDT document | Any | No | No | **Yes** |
| **Ours** | **ID-based, parentId/idx** | **Terminal + Browser + Native** | **Yes (aligned)** | **Yes (DocumentStore)** | **Yes (ops = CRDT ops)** |

The unique combination: ID-based model (like Notion's blocks) + EditContext alignment (like the W3C standard) + platform agnostic (no one else) + lazy loading + operations that are CRDT operations from day one.

---

## Comparison: Our Approach vs Alternatives

### The Alternatives

| Approach | Examples | How it works |
|----------|----------|--------------|
| **Shared rendering engine** | Flutter, Qt | Custom rendering engine draws identical pixels everywhere |
| **Bridge to native views** | React Native, KMP | Shared logic, native UI widgets via bridge |
| **Web in a shell** | Electron, Tauri | Web app running in native browser shell |
| **Terminal emulation** | SSH, tmux, xterm.js | Terminal app embedded in browser/native |
| **Ours: shared core + native adapters** | — | Pure TS editor core, platform-specific rendering/input/text-editing |

### Pros

| Advantage | Why |
|-----------|-----|
| **Terminal-first** | No alternative supports terminal as first-class. Flutter/RN/Electron can't render to ANSI. |
| **Truly native per platform** | Each platform uses its actual UI system. No uncanny valley. |
| **Lightweight core** | `beorn-docx` is pure TS with zero deps. No Chromium (300MB), no Skia (30MB). Core is ~10KB. |
| **Text editing done right** | EditContext alignment means native input system per platform. |
| **CRDT-native** | Operations-based model means collaboration is built in, not bolted on. |
| **Lazy loading at core** | ID + parentId model with lazy DocumentStore. Handles drive-scale. |
| **Incremental adoption** | Each `beorn-*` package independently useful. Mix and match. |

### Cons

| Disadvantage | Mitigation |
|--------------|------------|
| **N adapters to build** | Start with terminal (done) + browser (Phase C). Only native when demanded. |
| **Smaller ecosystem** | Scope is narrow (editor, not general UI). Manageable. |
| **More upfront work** | Clean interfaces pay for themselves in testability and flexibility. Extraction, not creation. |
| **Rendering inconsistency** | Feature, not bug — each platform looks native. Requires per-platform testing. |

### Why Not React Native?

1. **No terminal support** — km is terminal-first
2. **Text editing is RN's weakest point** — would still need custom editor
3. **RN is rendering-centric** — we share editing logic, the value is different
4. **RN assumes eager loading** — would need DocumentStore anyway
5. **RN is heavy** — Metro bundler, bridge overhead, Hermes VM

### Why Not Electron/Tauri?

1. **No terminal** — the primary use case
2. **Electron = ship a browser** — 300MB+ for a text editor
3. **Still contentEditable** — same web editor problems

### The Trade-Off

**React Native/Flutter**: Ship to many platforms quickly with acceptable quality. Great for UI-centric apps.

**Our approach**: Ship to terminal first with excellent quality, then expand. Great for apps where the *editing engine* is the product. We're building ProseMirror-for-any-platform, not Instagram-for-any-platform.

---

## The Swap Matrix

Each boundary is an interface. Replace any piece independently:

```
              @km/editor (pure logic — identical everywhere)
                    │
         ┌─────────┼──────────┐
         │         │          │
    DocumentStore  EditContext  Commands
         │         │          │
    ┌────┴───┐  ┌──┴──────────┴──────────────┐
    │SQLite  │  │TerminalEditContext (inkx)    │
    │IndexedDB│ │Chrome EditContext (native)   │
    │CloudKit │  │Slate+contentEditable (shim) │
    └────────┘  └─────────────────────────────┘
                          │
                   RenderingAdapter
                          │
              ┌───────────┼───────────┐
              │           │           │
         inkx (ANSI)  React DOM   Native Views
```

---

## Current Codebase: What Exists

### Already Built (extraction candidates)

| Component | Location | Lines | Status |
|-----------|----------|-------|--------|
| `text-cursor.ts` | `vendor/beorn-inkx/src/text-cursor.ts` | 196 | Layer 0, pure functions, ready to extract |
| `TextArea` | `vendor/beorn-inkx/src/components/TextArea.tsx` | 412 | Multi-line input with word wrapping |
| `KNode` | `packages/km-core/src/types.ts` | 474 | 11 node types, ID+parentId model |
| `Repo` | `packages/km-storage/src/` | 40+ files | Event-sourced, filesystem-synced |
| Command system | `packages/km-commands/src/` | ~22K | Registry, keybindings, executor, chord state |
| `board-actions.ts` | `apps/km-tui/src/board/board-actions.ts` | 1,380 | 111-case dispatch, delegates to specialized handlers |
| Board actions (edit) | `apps/km-tui/src/board/board-actions-edit.ts` | 580 | Node CRUD, status, shifting |
| Board actions (nav) | `apps/km-tui/src/board/board-actions-nav.ts` | 285 | Cursor movement, history |
| Board actions (selection) | `apps/km-tui/src/board/board-actions-selection.ts` | 142 | Multi-select |
| Board actions (zoom) | `apps/km-tui/src/board/board-actions-zoom.ts` | 325 | Zoom, follow links, drill-down |

### Key Finding: No Slate.js

The codebase has **no Slate.js dependency**. Text editing is entirely custom via the command-dispatch pattern and `blockEditTargetRef`. This simplifies the extraction — there's no Slate to remove.

### What Needs Creating

| Package | Purpose | Key types |
|---------|---------|-----------|
| `beorn-editx` | Single-block text editing | `EditContextLike`, `TerminalEditContext`, `TextOp`, `useEditContext` |
| `beorn-docx` | Structured document editor | `DocNode`, `DocumentStore`, `DocCursor`, `DocSelection`, `DocOperation`, `UndoManager`, `DocumentEditor` |

---

## What This Replaces

| Current | Future | Why better |
|---------|--------|-----------|
| Custom text editing (blockEditTargetRef) | `EditContext` + `useEditContext` hook | W3C-aligned, swappable implementations |
| `KNode.children[]` arrays (in-memory tree) | ID + `parentId/parentIdx` queries | Lazy loading, CRDT-friendly, matches storage |
| `board-actions.ts` (1,380-line switch) | `DocumentEditor` class | Pure logic, testable without rendering |
| inkx-only rendering | Rendering adapter interface | Same app on terminal + web + native |
| Custom `wrapSegment` etc. | `text-cursor.ts` in inkx (done!) | Layer 0 already built and tested |
| Eager tree loading | `DocumentStore` lazy queries | Handles 100K+ node vaults |

---

## Portability Roadmap

### Phase A — Terminal (current state)
- inkx + custom text editing + SQLite + Board/Outline/List views
- This is km today, progressively refactored
- Operations-based undo via event log

### Phase B — Extract `@km/editor`
- Separate pure editor logic from km-tui into reusable packages
- Define DocumentStore/EditContext/InputAdapter interfaces
- Operation log as the single source of mutation history
- Make km-tui import from beorn-docx/beorn-editx instead of inline logic
- **CRDT-ready from day one**: DocOperations as invertible ops mapping to Automerge/Yjs

### Phase C — Browser Proof-of-Concept
- React DOM rendering of Board view
- Native EditContext (Chrome) + Slate fallback (Firefox/Safari)
- IndexedDB storage via DocumentStore adapter
- Same `@km/editor`, different platform adapters

### Phase D — Collaboration (enabled by ops model)
- CRDT-backed DocumentStore (Automerge/Yjs)
- DocOperations translate directly to CRDT operations
- ID-based cursors survive concurrent edits
- Subtree-scoped sync
- Real-time multiplayer editing

### Phase E — Terminal in Browser
- inkx rendering to xterm.js canvas (not stdout)
- Terminal version runs in browser with zero app code changes
- Useful for web-based terminal access, demos, embedding

### Phase F — Native
- SwiftUI (macOS/iOS) + Jetpack Compose (Android)
- Same beorn-docx, native rendering and input
- Platform storage (CloudKit, Room)

---

## MVP Steps (when implementing)

### MVP-1: `beorn-editx` — Text Editing Package
- Extract `text-cursor.ts` from inkx into `beorn-editx` (or re-export)
- Implement `TerminalEditContext` class using text-cursor.ts
- Implement `TextOp` (insert/delete/replace) with `invertOp()`
- Wire into inkx DOM: `element.editContext = ctx`
- Hook: `useEditContext()` for React components
- Refactor TextArea to use EditContext internally
- Tests: 50+ covering EditContext methods + events + text operations

### MVP-2: `beorn-docx` — Document Editor Package
- Define `DocNode`, `DocumentStore`, `DocCursor`, `DocSelection` interfaces
- Implement `DocOperation` types with invertibility
- Implement `UndoManager` (operation-based, merge consecutive typing)
- Implement `DocumentEditor` class (cursor, navigation, structural ops)
- Adapter: `DocumentStore` over existing km `Repo`
- Tests: Full CRUD + undo/redo + cross-block navigation, all without rendering

### MVP-3: Wire km-tui to beorn-docx
- Replace `board-actions.ts` switch with `DocumentEditor` commands
- Replace blockEditTargetRef with `useEditContext` + `beorn-editx`
- Keep view-specific code (Board, Outline) in km-tui
- Tests: Existing km-tui tests pass with new engine

### MVP-4: Browser POC
- React DOM rendering of Board view using `beorn-docx`
- `beorn-editx` with browser EditContext (Chrome) or Slate+contentEditable fallback
- IndexedDB `DocumentStore` adapter
- Milestone: Same document, same commands, two platforms

---

## Scale Considerations

Targets **drive-scale** datasets — 100K+ nodes, GB+ of content:

- **No full-document snapshots**: Operations-only undo
- **No eager loading**: DocumentStore queries always lazy
- **No in-memory tree**: Always query by `parentId`, no materialized `children[]`
- **Streaming operations**: Append-only log, old operations pruned
- **Content-addressable storage**: Large content stored by hash
- **Partial sync**: CRDT sync is subtree-scoped

---

## Open Questions

1. **EditContext granularity**: One per block (current model) or one per visible region?
2. **Inline formatting**: Where do marks (bold, italic) live — document model, EditContext extension, or separate? Current: inline markdown. Future: structured marks?
3. **Performance budget**: Interaction model between lazy loading, virtual scroll, and incremental rendering caching layers?
4. **Extension model**: How do plugins extend the document editor across platforms?
5. **Operation compaction**: How aggressively to compact the operation log?
6. **Conflict resolution UI**: When CRDT operations conflict, auto-merge vs manual?
