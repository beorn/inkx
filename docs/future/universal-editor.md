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

## Architecture: Five Packages, Two Systems

The architecture is organized as **five independent packages** forming **two parallel systems** plus a shared runtime:

```
                    ┌─────────────────────────────────┐
                    │           km app                 │
                    │  (views, node types, keybinds)   │
                    └───────┬─────────────┬───────────┘
                            │             │
              ┌─────────────┘             └──────────────┐
              │                                          │
    ┌─────────▼──────────┐                 ┌─────────────▼──────────┐
    │  System 1:         │                 │  System 2:             │
    │  Terminal Rendering │                 │  Editing Framework     │
    │                    │                 │                        │
    │  ┌──────────────┐  │                 │  ┌──────────────────┐  │
    │  │   termily    │  │                 │  │     docily       │  │
    │  │  React term  │  │                 │  │  app foundation  │  │
    │  │  renderer +  │  │                 │  │  commands, undo  │  │
    │  │  components  │  │                 │  │  plugins, tree   │  │
    │  └──────┬───────┘  │                 │  └────────┬─────────┘  │
    │         │          │                 │           │            │
    │  ┌──────▼───────┐  │                 │  ┌────────▼─────────┐  │
    │  │   flexily    │  │                 │  │    textily       │  │
    │  │  standalone  │  │                 │  │  rich text model │  │
    │  │  flexbox     │  │                 │  │  zero deps       │  │
    │  └──────────────┘  │                 │  └──────────────────┘  │
    └────────────────────┘                 └────────────────────────┘
              │                                          │
              └──────────────┬───────────────────────────┘
                             │
                    ┌────────▼─────────┐
                    │      runly       │
                    │  Elm runtime     │
                    │  (shared by      │
                    │   both systems)  │
                    └──────────────────┘
```

### The Five Packages

| Package | Role | Dependencies | Platform-specific? |
|---------|------|-------------|-------------------|
| **runly** | Elm-style functional reactive runtime | None | No — shared |
| **docily** | App foundation: document model, command system, undo/CRDT, plugin composition | runly | No — shared |
| **textily** | Rich text model: cursor, selection, formatting | None (zero deps) | No — shared |
| **termily** | Terminal: React renderer + components + cell buffer + ANSI diff | runly, flexily | Yes — terminal only |
| **flexily** | Standalone flexbox layout engine | None | No — but only terminal needs it |

### Two Independent Systems

**System 1: Terminal Rendering** (termily + flexily)
Everything needed to put pixels on a terminal screen. React reconciler, Box/Text/VirtualList components, cell buffer, dirty tracking, ANSI diff output, stdin input parsing, terminal detection. Flexily provides the layout algorithm since terminals have no native layout engine.

**System 2: Editing Framework** (docily + textily)
Everything needed to build a rich keyboard-driven application on any platform. Document tree with operations, command system with keybindings, undo/redo, plugin composition, CRDT-ready mutations. Textily handles the text model (cursor, selection, wrap-aware navigation) with zero dependencies.

**runly** bridges both — it's the Elm-style runtime that powers both docily's event processing and termily's render loop.

### Platform Composition

| Platform | Rendering | Editing | Runtime |
|----------|-----------|---------|---------|
| **Terminal** | termily + flexily | docily + textily | runly |
| **Browser** | react-dom + CSS | docily + textily | runly |
| **Native** | SwiftUI / Compose | docily + textily | runly (or native equivalent) |

The swap is clean: replace **termily** with **react-dom + CSS**. Everything else — runly, docily, textily — is shared across platforms. The browser doesn't need flexily because CSS handles layout natively.

---

## What's Portable in inkx

Analysis of the current inkx codebase reveals a **60/40 split** between portable and terminal-specific code:

### Portable (~60%) → runly + docily

| Module | What it does | Destination |
|--------|-------------|-------------|
| Elm runtime | Functional reactive: init/update/view cycle | runly |
| React reconciler | Fiber-based custom renderer | runly (abstract) or termily |
| Command system | Registry, keybindings, executor, chord state | docily |
| Plugin composition | withCommands, withScroll, withHistory | docily |
| Event streams | AsyncIterable event processing | runly |
| Unicode handling | grapheme segmentation, East Asian width | textily or shared util |
| Virtual scroll | Viewport-aware lazy rendering | docily (logic) + termily (impl) |

### Terminal-specific (~40%) → termily

| Module | What it does | Why not portable |
|--------|-------------|-----------------|
| Cell buffer | 2D grid of styled characters | Terminal concept — browsers use DOM |
| ANSI diff | Compute minimal escape sequences | Terminal output format |
| Dirty flag system | Track which cells changed | Terminal optimization |
| Stdin parser | Raw mode + ANSI sequence parsing | Terminal input format |
| Terminal detection | Capabilities, color depth, size | Terminal-specific queries |
| Scroll tiers | Container-aware scroll regions | Terminal rendering strategy |
| Sticky children | Position:sticky for cell buffers | Terminal layout extension |

### Key insight

The cell buffer, diff algorithm, and dirty tracking are **terminal-specific**, not core. On web, the browser handles layout, painting, and diffing. The core is the component model + event system + command dispatch + virtual scroll logic.

---

## The Elm Runtime (runly)

runly provides an Elm-style functional reactive runtime: init/update/view cycle, AsyncIterable event streams, and multiple run modes. It's not an all-or-nothing commitment — **an app chooses its primary runtime style** (React, imperative, etc.) and can **drop into Elm-style for specific subsystems or tests**.

### Three Layers

```typescript
// Layer 1: Elm — pure functional, event-sourced
interface ElmApp<Model, Msg> {
  init: () => [Model, Cmd<Msg>]
  update: (msg: Msg, model: Model) => [Model, Cmd<Msg>]
  view: (model: Model) => View
  subscriptions: (model: Model) => Sub<Msg>
}

// Layer 2: React — component rendering (pluggable)
// termily: custom fiber reconciler → cell buffer
// browser: react-dom → DOM
// test: virtual buffer → assertions

// Layer 3: Zustand — mutable store for performance-critical paths
// Layout cache, scroll position, cursor blink state
// Derived from Elm model, but mutable for 60fps
```

**Zustand boundary rule**: The mutable store is strictly for **read-only derived caches** (layout measurements, scroll position, cursor blink) that don't initiate logic. All state transitions flow through Elm's update function. If Zustand state starts driving logic, the architecture's predictability guarantees erode.

### Run Modes

runly supports multiple execution contexts:

| Mode | Rendering | Use case |
|------|-----------|----------|
| **Terminal** | termily → stdout | Production CLI app |
| **Headless** | Virtual buffer | Testing, CI |
| **Browser** | react-dom → DOM | Web app (future) |
| **Worker** | No rendering | Background processing |

An app that primarily uses React can still use Elm-style init/update/view for **testing** — pure functions are trivially testable without mocking or setup. The Elm runtime is a tool in the box, not a religion.

### Why Elm-Style Matters

The Elm architecture is valuable for any event-driven application with complex state:

- **Predictable state**: Every state transition is a pure function. No hidden mutations, no race conditions.
- **Time-travel debugging**: The message log IS the debug history. Replay any sequence.
- **Explicit data flow**: All events — keyboard, mouse, network, timers — funnel through the same update pipeline. The entire input→state→view flow is traceable.
- **Testability**: Pure functions are trivially testable. No mocking, no setup.

These benefits apply equally to a terminal TUI, a web SPA, a real-time collaboration server, or a background data processor. The Elm runtime is not tied to any UI paradigm.

---

## docily: App Foundation

docily is more than a "document editor" — it's the **foundation for rich keyboard-driven applications**. Any app with a tree of editable items, a command palette, keybindings, and undo/redo can build on docily.

### What docily provides

- **Document model**: ID-based tree with typed nodes, lazy loading, dual paths (id + name)
- **Command system**: Registry, keybindings, chord state, command palette
- **Plugin composition**: `withCommands()`, `withScroll()`, `withHistory()` — composable behaviors
- **Undo/redo**: Operations-based, invertible, CRDT-compatible
- **Tree operations**: move, indent, outdent, fold, delete, reparent
- **Schema validation** (optional plugin): Rules for valid parent/child relationships (e.g., list items only inside lists, headings only at top level). Not baked into the core — apps opt in. Without it, the document model is free-form like Slate; with it, invalid states are prevented like ProseMirror. Especially valuable for collaborative editing where remote ops could create inconsistent structures.
- **Cross-block navigation**: Tree-aware cursor movement across nodes
- **Selection model**: Single node, multi-node, range — all ID-based

### Document Model — ID-Based, Lazy-Loaded, Dual Paths

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

### Cursor & Selection

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

### Undo/Redo — Operations All The Way Down

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

**CRDT integration**: The operations are designed to map cleanly to **Yjs or Automerge** — we use an existing CRDT library rather than building our own:
- `text.insert/delete` → Yjs Y.Text or Automerge.Text operations
- `node.insert/delete/move` → tree CRDT operations (Automerge nested maps)
- `node.update` → field-level CRDT merge

CRDT is **easy but not required**. The DocumentStore interface has a CRDT-backed implementation as one option alongside SQLite, IndexedDB, etc. Apps that don't need collaboration never import the CRDT adapter.

**Important**: The ops as defined above lack the unique identifiers and timestamps needed for multi-user conflict resolution. The CRDT library (Yjs/Automerge) provides those — our ops translate to CRDT ops at the adapter boundary, not the other way around. See [Velt's analysis of CRDT implementation challenges](https://velt.dev/blog/implementing-crdts-why-developers-give-up-real-time-editing) for why rolling your own is inadvisable.

**Scale**: For a drive with 1M nodes, undo only stores the operations performed this session. Old operations can be compacted/pruned — the document store is the source of truth.

### Cross-Block & Cross-Node Navigation

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

## textily: Rich Text Model

textily handles everything about text within a single block — cursor position, selection, visual line wrapping, formatting. It has **zero dependencies** and is completely standalone.

### What textily provides

- **Cursor math**: offset ↔ row/col conversion, visual line awareness
- **Selection**: single cursor, range selection, word/line selection
- **Wrap-aware navigation**: up/down moves between visual lines, not logical lines
- **Sticky X**: cursor remembers horizontal position across vertical moves
- **Text operations**: insert, delete, replace — all invertible
- **EditContext implementations**: Terminal (our TerminalEditContext) and browser (W3C EditContext wrapper)

### EditContext Bridge

textily implements the W3C EditContext API pattern for both terminal and browser:

```typescript
// Terminal — our implementation using text-cursor math
const ctx = new TerminalEditContext({ text, selectionStart: 0, selectionEnd: 0 })
terminalElement.editContext = ctx

// Browser — wraps the native W3C EditContext
const ctx = new BrowserEditContext({ text, selectionStart, selectionEnd })
canvasOrDiv.editContext = ctx

// Factory — picks the right one
function createEditContext(options: EditContextInit): EditContextLike {
  if (typeof window !== "undefined" && "EditContext" in window) {
    return new BrowserEditContext(options)       // Chrome/Edge native
  }
  if (typeof window !== "undefined") {
    return new SlateEditContextAdapter(options)  // Firefox/Safari fallback
  }
  return new TerminalEditContext(options)         // Terminal
}
```

**Boundary**: textily knows about text, cursor, selection, visual lines. It does NOT know about documents, trees, nodes, or navigation between blocks. That's docily's job.

---

## termily: Terminal Rendering

termily is the complete terminal platform — everything needed to render a React component tree to a terminal. It's what inkx becomes after the portable parts (runtime, commands, plugins) move to runly and docily.

### What termily contains

- **React reconciler**: Custom fiber renderer targeting cell buffers (not DOM)
- **Components**: Box, Text, VirtualList, ScrollView, TextArea
- **Cell buffer**: 2D grid of styled Unicode characters
- **ANSI diff**: Compute minimal escape sequence to update the screen
- **Dirty tracking**: Only re-render what changed
- **Stdin parser**: Raw mode, ANSI sequences, Kitty keyboard protocol
- **Terminal detection**: Capabilities, color depth, size, mouse support
- **Scroll tiers**: Container-aware nested scroll regions
- **Sticky children**: position:sticky equivalent for cell buffers

### StyleSheet pattern (like React Native)

```typescript
// termily components mirror React Native patterns:
import { Box, Text, ScrollView, StyleSheet } from "termily"

const styles = StyleSheet.create({
  container: { flexDirection: "row", padding: 1 },
  title: { bold: true, color: "cyan" },
})

function Card({ title, children }) {
  return (
    <Box style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {children}
    </Box>
  )
}
```

termily is to the terminal what `react-dom` + `react-native` is to their respective platforms — a host renderer with platform-specific components.

---

## flexily: Standalone Flexbox

flexily is a pure JavaScript flexbox layout engine. It already exists as beorn-flexx. Independent of all other packages — useful anywhere you need flexbox math without a browser.

- Zero-allocation layout algorithm
- W3C Flexbox spec compliance
- Used by termily for terminal layout
- Not needed on web (CSS handles it) or native (platform layout engines)

---

## The Web Story

The web platform story is clean: **share runly + docily + textily, swap termily for react-dom + CSS**.

```
Terminal app                          Web app
─────────────────                     ─────────────────
km-tui                                km-web
├── termily (React → cells → ANSI)    ├── react-dom (React → DOM)
│   └── flexily (layout)              │   └── CSS (layout)
├── docily (commands, tree, undo)     ├── docily ← SAME
├── textily (cursor, selection)       ├── textily ← SAME
└── runly (Elm runtime)               └── runly ← SAME
```

What changes:
- **Rendering**: termily → react-dom. Box → div, Text → span. CSS handles layout, painting, diffing.
- **Input**: termily's stdin parser → browser's KeyboardEvent + PointerEvent.
- **EditContext**: termily's TerminalEditContext → Chrome's native EditContext (or Slate+contentEditable fallback).

What stays the same:
- **Document model** (docily): Same tree, same operations, same undo.
- **Command system** (docily): Same keybindings, same command palette.
- **Text model** (textily): Same cursor math, same selection logic.
- **Runtime** (runly): Same Elm architecture, same event processing.
- **Views**: Board, Outline, List — same layout logic, different platform components.

### Web-Specific Challenges

"Swap the renderer" is a one-line phrase that hides real work. Known pain points:

- **DOM selection/cursor**: Pure re-rendering can reset the browser caret position. After each state update, must use the browser Selection API to restore the cursor. React's controlled/uncontrolled input distinction matters here — typing must not trigger full re-renders that clobber the caret. See [Lexical's approach](https://news.ycombinator.com/item?id=31018746) — they treat the DOM as derived state from the editor model, diffed carefully to preserve selection.

- **IME/EditContext**: The W3C [EditContext API](https://developer.mozilla.org/en-US/docs/Web/API/EditContext) is still experimental (Chrome/Edge only as of 2026). Firefox and Safari need a fallback — either hidden `<textarea>` or Slate+contentEditable. textily's EditContext bridge handles this, but expect platform-specific edge cases (composition events, dead keys, CJK input).

- **Focus management**: termily should provide a focus system equivalent to the browser's (focusable elements, tab order, focus/blur events). The web gets this for free from the DOM; the terminal must implement it. Both platforms should expose the same abstract focus API to docily and views.

- **Mouse/touch**: Terminal is keyboard-first; web users expect clicking to place cursor, drag to select, scroll wheels. The command system needs pointer interaction handlers, not just key handlers. These are web-specific commands registered by the app layer, not baked into docily.

- **Accessibility**: The terminal gets a pass (screen readers read terminal text line-by-line). The web does not. Needs ARIA roles (`role="textbox"`, `aria-multiline`), focus management for screen readers, live regions for announcing state changes, and keyboard navigation that doesn't fight the browser's own. See [Lexical's accessibility improvements](https://news.ycombinator.com/item?id=31018746) — they avoided `contentEditable=false` islands that break screen readers.

- **Virtual scroll on web**: Terminal viewport is fixed-height (terminal rows). Web viewport is variable-height with proportional fonts. Measuring element heights requires DOM access. The virtual scroll plugin needs a platform-specific measurement strategy — termily can compute wrap from column width, web must measure via `getBoundingClientRect`.

- **runly ↔ React DOM integration**: How does runly's event loop coexist with React's scheduler? Options: (a) runly drives everything, calling `ReactDOM.render` on each view cycle; (b) React drives rendering, runly is a state store subscribed to via hooks; (c) hybrid. Needs prototyping to find the right integration point.

### Terminal-in-Browser (hybrid)

xterm.js as rendering surface. termily renders to xterm.js buffer instead of stdout. Zero app code changes — just a different terminal backend. Useful for web-based terminal access, demos, embedding.

---

## View Layer

Platform-specific visual representation. Thin — reads editor state, renders, dispatches commands.

| View | What it shows | How it maps to the document tree |
|------|--------------|----------------------------------|
| **Board** | Kanban columns + cards | L1 children = columns, L2 children = cards |
| **Outline** | Indented tree | Direct tree rendering with depth |
| **List** | Flat list + detail pane | Filtered/sorted flat view of subtree |
| **Calendar** | Time-based layout | Nodes with date fields |
| **Table** | Spreadsheet grid | Nodes as rows, metadata fields as columns |

**Views share the same docily DocumentEditor instance.** Switching views changes rendering, not state. Cursor, selection, and undo history persist across view switches.

---

## Package Boundaries: Dependency Graph

```
km-tui ──→ termily ──→ flexily
  │            │
  │            └──→ runly
  │
  ├──→ docily ──→ runly
  │
  └──→ textily (zero deps)

km-storage ──→ docily (implements DocumentStore)
km-web (future) ──→ react-dom + docily + textily + runly
```

**Key constraints:**
- textily has **zero dependencies** — standalone, usable anywhere
- docily depends on runly but NOT on termily — platform-agnostic
- termily depends on runly and flexily but NOT on docily — rendering is independent of editing
- The app (km-tui, km-web) wires the two systems together

**The rule**: If another app could use it, it goes in a named package. If it's km-specific, it stays in `km-*`.

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

For detailed comparisons of browser-only editors, see [Lexical vs Slate vs ProseMirror: Architecture](https://jkrsp.com/blog/lexical-vs-slate-vs-prosemirror-architecture/) — all three are tightly coupled to the browser DOM, which is exactly what this architecture avoids.

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
| **Lightweight core** | docily + textily are pure TS with zero heavy deps. No Chromium (300MB), no Skia (30MB). |
| **Text editing done right** | EditContext alignment means native input system per platform. |
| **CRDT-native** | Operations-based model means collaboration is built in, not bolted on. |
| **Lazy loading at core** | ID + parentId model with lazy DocumentStore. Handles drive-scale. |
| **Incremental adoption** | Each package independently useful. Mix and match. |
| **Elm runtime on web too** | Functional reactive programming benefits aren't terminal-specific. |

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

## Current Codebase: What Exists

### Already Built (extraction candidates)

| Component | Location | Lines | Destination |
|-----------|----------|-------|-------------|
| `text-cursor.ts` | `vendor/beorn-inkx/src/text-cursor.ts` | 196 | textily (pure functions) |
| `TextArea` | `vendor/beorn-inkx/src/components/TextArea.tsx` | 412 | textily + termily |
| Elm runtime | `vendor/beorn-inkx/src/runtime/` | ~1500 | runly |
| React reconciler | `vendor/beorn-inkx/src/reconciler/` | ~2000 | termily |
| Cell buffer + diff | `vendor/beorn-inkx/src/output/` | ~1200 | termily |
| Command system | `packages/km-commands/src/` | ~22K | docily |
| `KNode` | `packages/km-core/src/types.ts` | 474 | docily (11 node types, ID+parentId) |
| `Repo` | `packages/km-storage/src/` | 40+ files | km-storage (DocumentStore adapter) |
| `board-actions.ts` | `apps/km-tui/src/board/board-actions.ts` | 1,380 | docily (111-case dispatch) |
| Board actions (edit) | `apps/km-tui/src/board/board-actions-edit.ts` | 580 | docily |
| Board actions (nav) | `apps/km-tui/src/board/board-actions-nav.ts` | 285 | docily |
| Board actions (selection) | `apps/km-tui/src/board/board-actions-selection.ts` | 142 | docily |
| Board actions (zoom) | `apps/km-tui/src/board/board-actions-zoom.ts` | 325 | docily |
| Flexx layout | `vendor/beorn-flexx/` | ~3000 | flexily (standalone) |

### Key Finding: No Slate.js

The codebase has **no Slate.js dependency**. Text editing is entirely custom via the command-dispatch pattern and `blockEditTargetRef`. This simplifies the extraction — there's no Slate to remove.

---

## What This Replaces

| Current | Future | Why better |
|---------|--------|-----------|
| Custom text editing (blockEditTargetRef) | textily EditContext + factory | W3C-aligned, swappable implementations |
| `KNode.children[]` arrays (in-memory tree) | docily ID + `parentId/parentIdx` queries | Lazy loading, CRDT-friendly, matches storage |
| `board-actions.ts` (1,380-line switch) | docily DocumentEditor | Pure logic, testable without rendering |
| inkx monolith (runtime + rendering + commands) | runly + termily + docily | Clean separation, web-portable |
| inkx-only rendering | termily (terminal) or react-dom (web) | Same app on terminal + web + native |
| Custom `wrapSegment` etc. | textily text-cursor (done!) | Standalone, tested, reusable |
| Eager tree loading | docily DocumentStore lazy queries | Handles 100K+ node vaults |

---

## Portability Roadmap

### Phase A — Terminal (current state)
- inkx + custom text editing + SQLite + Board/Outline/List views
- This is km today, progressively refactored
- Operations-based undo via event log

### Phase B — Extract packages
- Split inkx into runly (runtime) + termily (terminal rendering)
- Extract command system and document logic into docily
- Extract text-cursor and EditContext into textily
- Flexx → flexily (rename, already standalone)
- Make km-tui import from the new packages instead of inline logic
- **CRDT-ready from day one**: DocOperations as invertible ops mapping to Automerge/Yjs

### Phase C — Browser Proof-of-Concept
- React DOM rendering of Board view using docily
- textily with browser EditContext (Chrome) or Slate+contentEditable fallback
- IndexedDB storage via DocumentStore adapter
- Same docily + textily + runly, different rendering

### Phase D — Collaboration (enabled by ops model)
- CRDT-backed DocumentStore (Automerge/Yjs)
- DocOperations translate directly to CRDT operations
- ID-based cursors survive concurrent edits
- Subtree-scoped sync
- Real-time multiplayer editing

### Phase E — Terminal in Browser
- termily rendering to xterm.js canvas (not stdout)
- Terminal version runs in browser with zero app code changes
- Useful for web-based terminal access, demos, embedding

### Phase F — Native
- SwiftUI (macOS/iOS) + Jetpack Compose (Android)
- Same docily + textily, native rendering and input
- Platform storage (CloudKit, Room)

---

## MVP Steps (when implementing)

### MVP-1: textily — Rich Text Package
- Extract `text-cursor.ts` from inkx into textily (or re-export)
- Implement `TerminalEditContext` class using text-cursor.ts
- Implement `TextOp` (insert/delete/replace) with `invertOp()`
- Wire into termily DOM: `element.editContext = ctx`
- Hook: `useEditContext()` for React components
- Refactor TextArea to use EditContext internally
- Tests: 50+ covering EditContext methods + events + text operations

### MVP-2: runly — Elm Runtime Package
- Extract Elm runtime (init/update/view cycle) from inkx
- Extract AsyncIterable event stream processing
- Define run modes: terminal, headless, browser, worker
- Extract React reconciler abstraction (renderer-agnostic parts)
- Tests: Elm cycle, event streams, run modes

### MVP-3: docily — App Foundation Package
- Extract command system from km-commands into docily
- Define `DocNode`, `DocumentStore`, `DocCursor`, `DocSelection` interfaces
- Implement `DocOperation` types with invertibility
- Implement `UndoManager` (operation-based, merge consecutive typing)
- Implement `DocumentEditor` class (cursor, navigation, structural ops)
- Extract plugin composition (withCommands, withScroll, withHistory)
- Adapter: `DocumentStore` over existing km `Repo`
- Tests: Full CRUD + undo/redo + cross-block navigation + commands, all without rendering

### MVP-4: termily — Terminal Rendering Package
- Everything that remains in inkx after extracting runly/docily/textily
- Cell buffer, ANSI diff, dirty tracking, stdin parser, terminal detection
- Components: Box, Text, VirtualList, ScrollView
- flexily integration for layout
- Tests: Existing inkx rendering tests

### MVP-5: Wire km-tui to new packages
- Replace inkx imports with termily/docily/textily/runly
- Replace `board-actions.ts` switch with docily DocumentEditor commands
- Replace blockEditTargetRef with textily `useEditContext`
- Keep view-specific code (Board, Outline) in km-tui
- Tests: Existing km-tui tests pass with new engine

### MVP-6: Browser POC
- React DOM rendering of Board view using docily
- textily with browser EditContext (Chrome) or Slate+contentEditable fallback
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

## Extraction Risks

Extracting five packages from an ~80K-line monolith has specific risks beyond normal refactoring:

- **Hidden coupling**: Monolith code may have cross-boundary shortcuts — a terminal component directly mutating document state, or a command that assumes terminal-specific rendering. These only surface when you try to import docily without termily. Mitigation: enforce import rules via lint (e.g., docily cannot import from termily).

- **Undo breakage**: Any mutation path that bypasses the operation log will silently break undo/redo. If something directly sets `node.content = "..."` instead of going through `DocumentStore.updateNode()`, it won't be recorded. Mitigation: make DocumentStore the only way to mutate — freeze node objects, use TypeScript readonly.

- **Performance regression**: New abstraction layers add indirection. If a hot path previously inlined a function and now crosses a package boundary, V8 may not optimize it the same way. Watch for O(1) → O(n) regressions at million-node scale. Mitigation: benchmark before and after extraction, especially for typing latency and scroll performance.

- **Integration points**: Features that cross boundaries are easy to miss during extraction. Cursor rendering, scroll sync, focus management, clipboard — these all involve coordination between the editing system and the rendering system. Mitigation: list all user-facing features and trace their data flow through the new architecture before splitting.

- **Extract incrementally**: textily first (lowest risk, self-contained, zero deps), then runly, then docily, then termily. Test at each step. Don't do it all at once.

---

## References

- [Lexical vs Slate vs ProseMirror: Architecture](https://jkrsp.com/blog/lexical-vs-slate-vs-prosemirror-architecture/) — detailed comparison of browser-only editor architectures, plugin systems, and React integration approaches
- [Lexical design discussion (Hacker News)](https://news.ycombinator.com/item?id=31018746) — Lexical team on DOM reconciliation, selection management, and accessibility decisions
- [Why developers give up on CRDT (Velt)](https://velt.dev/blog/implementing-crdts-why-developers-give-up-real-time-editing) — practical challenges: tombstone bloat, sequence identifiers, cursor syncing, exactly-once delivery
- [The Elm Architecture: strengths and pitfalls](https://gist.github.com/chexxor/23ccf35add7dbdd33ecdd26888663140) — benefits of pure update/view and issues with DOM inputs in purely controlled architectures
- [W3C EditContext API](https://developer.mozilla.org/en-US/docs/Web/API/EditContext) — the emerging standard for custom text editing surfaces without contentEditable
- [Ink: React for CLI](https://github.com/vadimdemedes/ink) — prior art for React-style components and flex layout in terminals (termily's spiritual ancestor)

---

## Open Questions

1. **EditContext granularity**: One per block (current model) or one per visible region?
2. **Inline formatting**: Where do marks (bold, italic) live — document model, EditContext extension, or separate? Current: inline markdown. Future: structured marks?
3. **Performance budget**: Interaction model between lazy loading, virtual scroll, and incremental rendering caching layers?
4. **Extension model**: How do plugins extend the document editor across platforms? Particularly: scroll plugins may differ between terminal (manual scroll) and web (native scrollbars/CSS overflow).
5. **Operation compaction**: How aggressively to compact the operation log?
6. **Conflict resolution UI**: When CRDT operations conflict, auto-merge vs manual?
7. **runly abstraction boundary**: How much of the React reconciler is shared vs platform-specific? The fiber tree is universal but the host config is per-platform.
8. **runly ↔ React DOM integration**: On web, does runly drive rendering (calling `ReactDOM.render`) or does React drive rendering (subscribing to runly state via hooks)? Needs prototyping.
9. **docily vs km-commands**: How much of the existing command system is reusable vs km-specific? Keybindings are reusable, but command implementations may reference km types.
10. **Focus abstraction**: termily needs a focus management system (focusable elements, tab order, focus/blur events) that mirrors the browser's DOM focus model, so docily and views can use a unified focus API across platforms.
11. **Schema validation scope**: How much structure to enforce? Minimal (parent/child type rules) or rich (ProseMirror-style content expressions)? Plugin or core?
12. **Package naming finality**: runly/docily/textily/termily/flexily are tentative — all available on npm. Final decision tracked in `km-infra.vendor-rename`.
